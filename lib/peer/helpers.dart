// Port of src/peer/helpers.js — peer id normalization + PeerJS error mapping.
//
// Keep behavior identical to the JS module; the UI relies on these exact
// strings and on the set of accepted id shapes.

import 'package:shared_preferences/shared_preferences.dart';

/// Mirror of the `STORAGE` object literal in `src/peer/helpers.js`. Keys used
/// by the React build against `localStorage`; on Flutter they map to
/// `SharedPreferences` entries. Keep these byte-identical with the JS source
/// so a web/native dual-deploy can share the same keyspace without surprise
/// namespace drift.
abstract class StorageKeys {
  static const String peerId = 'orbits_peer_id';
  static const String knownPeers = 'orbits_known_peers';
  static const String messages = 'orbits_messages_v1';
  static const String blockedPeers = 'orbits_blocked_peers';
  static const String profiles = 'orbits_profiles_v1';
  static const String micSettings = 'orbits_mic_settings_v1';
  static const String powerSaver = 'orbits_power_saver';
  static const String peerLockPrefix = 'orbits_peer_lock:';
  static const String relayOnly = 'orbits_relay_only';
}

/// Normalize a raw peer id to the canonical form used everywhere in the
/// codebase — trimmed + **upper-case**. JS uses `toUpperCase()`; using
/// `toLowerCase()` here would quietly break peer discovery because the same
/// peerId would hash to a different string on the wire than in storage.
String normalizePeerId(String? raw) {
  if (raw == null) return '';
  return raw.trim().toUpperCase();
}

/// Accept `ORBIT-XXXXXX` where X is hex (0-9 A-F). Same regex the JS build
/// uses — changing it would fork the id space between web and native clients.
final RegExp _validPeerIdPattern = RegExp(r'^ORBIT-[0-9A-F]{6}$');

bool isValidPeerId(String? raw) {
  if (raw == null) return false;
  return _validPeerIdPattern.hasMatch(normalizePeerId(raw));
}

/// Canonical connection-map key. The JS source uses the same shape so a
/// cross-build shared storage layer (SharedPreferences / IndexedDB) hashes
/// to the same bucket.
String connKey(String remoteId, String channel) {
  final ch = channel == 'ephemeral' ? 'ephemeral' : 'reliable';
  return '${normalizePeerId(remoteId)}|$ch';
}

/// Millisecond epoch. Port of `src/peer/helpers.js::now()` — purely for
/// call-site parity; anyone new should just call `DateTime.now()`.
int now() => DateTime.now().millisecondsSinceEpoch;

/// Map a PeerJS error type into a user-facing Russian string. Mirrors
/// mapPeerError in helpers.js.
String mapPeerError(Object err) {
  final type = err is Map ? err['type'] : null;
  switch (type) {
    case 'unavailable-id':
      return 'Этот ID уже занят';
    case 'peer-unavailable':
      return 'Собеседник недоступен';
    case 'invalid-id':
      return 'Недопустимый ID';
    case 'network':
      return 'Проблема с сетью';
    case 'server-error':
    case 'socket-error':
      return 'Ошибка сервера — переподключаемся…';
    case 'ssl-unavailable':
      return 'SSL недоступен';
    case 'browser-incompatible':
      return 'Ваш браузер не поддерживается';
    default:
      return 'Ошибка подключения';
  }
}

/// Paranoid mode setting — when true, WebRTC only accepts TURN-relay
/// candidates so the remote never sees our IP. Stored as `'1'`/`'0'` under
/// [StorageKeys.relayOnly] to stay byte-compatible with the React build's
/// localStorage entries.
Future<bool> isRelayOnlyEnabled() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(StorageKeys.relayOnly) == '1';
}

Future<void> setRelayOnlyEnabled(bool value) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(StorageKeys.relayOnly, value ? '1' : '0');
}
