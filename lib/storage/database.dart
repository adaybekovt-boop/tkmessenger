// Drift database aggregator.
//
// Generates `database.g.dart` via build_runner:
//   dart run build_runner build --delete-conflicting-outputs
//
// Until codegen has run at least once the `_$OrbitsDatabase` base class
// below is undefined — that's expected, not a typo. Drift docs:
// https://drift.simonbinder.eu/setup/.

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'tables.dart';

part 'database.g.dart';

/// Single SQLite file under the app-support directory. Holds every piece
/// of on-disk state — crypto (identity / prekeys / ratchets) + contacts /
/// chats / messages / media / auth kv.
@DriftDatabase(tables: [
  KeysTable,
  PrekeysTable,
  RatchetsTable,
  PeersTable,
  AvatarsTable,
  SessionKeysTable,
  MessagesTable,
  StickerPacksTable,
  RecentStickersTable,
  VoiceBlobsTable,
  FileBlobsTable,
  KvTable,
])
class OrbitsDatabase extends _$OrbitsDatabase {
  OrbitsDatabase() : super(_open());

  /// Escape hatch for tests — pass `NativeDatabase.memory()` to stay
  /// off-disk.
  OrbitsDatabase.forTesting(super.e);

  // Schema history:
  //   v1 — initial port of the JS IndexedDB shape.
  //   v2 — Day 2: promoted `blocked` + `lastReadAt` to their own columns on
  //        the peers table so the chat list can JOIN for unread counts and
  //        block-filtering instead of cracking every `data` blob.
  //   v3 — Day 3: heal-pass for the `peers` table. Some early-port installs
  //        ended up with a `peers` row that's missing columns the current
  //        schema expects (`lastSeenAt` in particular — its index creation
  //        in onCreate raised "no such column" and bricked add-contact).
  //        v3 introspects the on-disk shape and ALTER TABLEs in whatever's
  //        absent, then re-runs the index DDL idempotently.
  @override
  int get schemaVersion => 3;

  /// Indexes we need on top of the primary key. Drift generates the
  /// primary-key B-tree automatically; everything else goes here so the
  /// schema stays explicit.
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) async {
          await m.createAll();

          // Prekey pool: OPK consumers scan `kind='opk' AND used=0`.
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_prekeys_kind_used '
            'ON prekeys(kind, used)',
          );

          // Heal pass also lands the peers indexes — see _healPeersSchema.
          // We run it here too in case the on-disk `peers` table somehow
          // pre-existed in a partial shape when Drift considered the DB
          // fresh; `createAll` uses `CREATE TABLE IF NOT EXISTS` and
          // wouldn't repair such a row.
          await _healPeersSchema();

          // Chat paging: `WHERE peerId=? ORDER BY timestamp DESC`.
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_messages_peer_ts '
            'ON messages(peerId, timestamp)',
          );

          // Pending queue per peer: `WHERE peerId=? AND status='pending'`.
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_messages_peer_status_ts '
            'ON messages(peerId, status, timestamp)',
          );

          // Global pending queue.
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_messages_status_ts '
            'ON messages(status, timestamp)',
          );

          // Sticker pack list ordering.
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_sticker_packs_installed '
            'ON sticker_packs(installedAt)',
          );
          await customStatement(
            'CREATE INDEX IF NOT EXISTS idx_recent_stickers_used '
            'ON recent_stickers(usedAt)',
          );
        },
        onUpgrade: (Migrator m, int from, int to) async {
          if (from < 2) {
            // Day 2: add `blocked` + `lastReadAt` to the peers table. Drift's
            // `addColumn` emits `ALTER TABLE peers ADD COLUMN …` with the
            // default from the schema definition, so existing rows land with
            // `blocked=0` + `lastReadAt=0` — i.e. everyone starts unblocked
            // and "everything is unread" the first time the app boots on v2.
            // The first `markChatRead` the user triggers by opening a chat
            // will pin that peer's watermark.
            await m.addColumn(peersTable, peersTable.blocked);
            await m.addColumn(peersTable, peersTable.lastReadAt);
          }
          if (from < 3) {
            await _healPeersSchema();
          }
        },
        beforeOpen: (details) async {
          // Foreign-key enforcement defaults to OFF in SQLite; turn on
          // so future `REFERENCES` columns behave as declared.
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );

  /// Bring the on-disk `peers` table back in line with `PeersTable` in
  /// `tables.dart`. Diagnosed from a wild report where add-contact threw
  /// `SqliteException(1): no such column: lastSeenAt` — some early-port
  /// installs ended up with a `peers` row whose columns lagged behind
  /// the schema definition (likely the original v1 onCreate raced an
  /// `ALTER TABLE` rename and never re-built the indexes on top).
  ///
  /// Strategy: introspect with `PRAGMA table_info(peers)` and
  /// `ALTER TABLE … ADD COLUMN` in anything that's missing — SQLite
  /// allows ADD COLUMN with a DEFAULT, which back-fills existing rows.
  /// Re-running the indexes at the end is idempotent thanks to
  /// `IF NOT EXISTS`.
  ///
  /// `id` and `data` are intentionally NOT in this list because they
  /// were on the v1 schema since day one — if they're somehow missing,
  /// we'd need a destructive rebuild that's out of scope for an
  /// in-place heal.
  Future<void> _healPeersSchema() async {
    final info = await customSelect('PRAGMA table_info(peers)').get();
    final existing = info.map((row) => row.read<String>('name')).toSet();

    const additions = <String, String>{
      'displayName': "TEXT NOT NULL DEFAULT ''",
      'lastSeenAt': 'INTEGER NOT NULL DEFAULT 0',
      'trusted': 'INTEGER NOT NULL DEFAULT 0',
      'trustLevel': 'INTEGER NOT NULL DEFAULT 0',
      'addedAt': 'INTEGER NOT NULL DEFAULT 0',
      'blocked': 'INTEGER NOT NULL DEFAULT 0',
      'lastReadAt': 'INTEGER NOT NULL DEFAULT 0',
    };

    for (final col in additions.entries) {
      if (!existing.contains(col.key)) {
        await customStatement(
          'ALTER TABLE peers ADD COLUMN ${col.key} ${col.value}',
        );
      }
    }

    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_peers_last_seen '
      'ON peers(lastSeenAt)',
    );
    await customStatement(
      'CREATE INDEX IF NOT EXISTS idx_peers_trusted '
      'ON peers(trusted)',
    );
  }
}

/// Pick up the bundled sqlite3 via `sqlite3_flutter_libs` and open
/// `<appSupportDir>/orbits.sqlite`. Runs I/O on a shared background
/// isolate so bulk inserts don't jank the UI.
QueryExecutor _open() => driftDatabase(
      name: 'orbits',
      native: const DriftNativeOptions(
        shareAcrossIsolates: true,
      ),
      web: DriftWebOptions(
        sqlite3Wasm: Uri.parse('sqlite3.wasm'),
        driftWorker: Uri.parse('drift_worker.js'),
      ),
    );

// ─── Process-wide handle ────────────────────────────────────────────

OrbitsDatabase? _singleton;

/// Returns the app-wide database instance, lazily opening it on first
/// access. Tests can override via [setOrbitsDatabase].
OrbitsDatabase orbitsDb() => _singleton ??= OrbitsDatabase();

void setOrbitsDatabase(OrbitsDatabase db) {
  _singleton = db;
}

Future<void> closeOrbitsDatabase() async {
  final db = _singleton;
  _singleton = null;
  await db?.close();
}
