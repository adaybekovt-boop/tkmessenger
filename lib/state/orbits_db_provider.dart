// Riverpod handle on the process-wide `OrbitsDatabase`. The singleton is
// still managed by `storage/database.dart` (so non-Riverpod crypto code keeps
// working with `orbitsDb()`), this provider just gives the Riverpod graph a
// typed entry point so other providers can express dependencies cleanly.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/database.dart';

final orbitsDbProvider = Provider<OrbitsDatabase>((ref) {
  // `orbitsDb()` lazily opens the SQLite file on first access. It is NOT
  // closed on ref dispose — the DB lives for the lifetime of the app.
  return orbitsDb();
});
