// Port of src/core/notifications.js — local notification API.
//
// The JS module uses the browser's Notification API (no Push Server — the
// messenger is P2P). Notifications only show when the tab is not in focus.
// In Flutter the native equivalent is `flutter_local_notifications`, which
// is NOT in the pubspec yet, so the show-notification calls are stubbed and
// only the settings-storage half is fully wired (over SharedPreferences).
//
// TODO(port): add `flutter_local_notifications` to pubspec.yaml and replace
// the stubs in [notifyNewMessage], [notifyIncomingCall], [canShowNotifications]
// and [requestPermission] with real plugin calls. The settings API is done.

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const String _storageKey = 'orbits_notif_settings_v1';

/// Notification settings shape — mirrors the JS object {enabled, sound}.
class NotifSettings {
  const NotifSettings({this.enabled = true, this.sound = true});

  final bool enabled;
  final bool sound;

  Map<String, Object?> toJson() => {'enabled': enabled, 'sound': sound};

  factory NotifSettings.fromJson(Map<String, Object?> raw) => NotifSettings(
        enabled: raw['enabled'] is bool ? raw['enabled'] as bool : true,
        sound: raw['sound'] is bool ? raw['sound'] as bool : true,
      );

  NotifSettings copyWith({bool? enabled, bool? sound}) => NotifSettings(
        enabled: enabled ?? this.enabled,
        sound: sound ?? this.sound,
      );
}

/// In-memory cache of the settings. The JS version reads synchronously from
/// localStorage every call; SharedPreferences is async on first access but
/// synchronous once loaded. We keep a synchronous getter for parity with the
/// JS `getNotifSettings()` — callers should `await loadNotifSettings()` once
/// at startup.
NotifSettings _cached = const NotifSettings();
bool _loaded = false;

/// Hydrate [getNotifSettings] from disk. Call once during app init.
Future<NotifSettings> loadNotifSettings() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw == null) {
      _cached = const NotifSettings();
    } else {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        _cached = NotifSettings.fromJson(
            decoded.map((k, v) => MapEntry(k.toString(), v)));
      }
    }
  } catch (_) {
    _cached = const NotifSettings();
  }
  _loaded = true;
  return _cached;
}

/// Persist settings to SharedPreferences and update the in-memory cache.
Future<void> saveNotifSettings(NotifSettings settings) async {
  _cached = settings;
  _loaded = true;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(settings.toJson()));
  } catch (_) {
    // Swallow — JS source also silently ignores write failures.
  }
}

/// Read the current settings synchronously. Falls back to defaults if
/// [loadNotifSettings] has not run yet.
NotifSettings getNotifSettings() {
  if (!_loaded) return const NotifSettings();
  return _cached;
}

/// Whether the OS will let us show a notification right now.
///
/// TODO(port): replace with a real permission check once
/// flutter_local_notifications is wired up.
bool canShowNotifications() {
  return false;
}

/// Ask the OS for permission to show notifications.
/// Returns one of 'granted' | 'denied' | 'default' — same string domain as
/// the browser Notification API, so call-sites don't have to change.
///
/// TODO(port): replace with a real permission request via
/// flutter_local_notifications + permission_handler.
Future<String> requestPermission() async {
  return 'default';
}

/// Show a "new message" notification.
///
/// TODO(port): implement via flutter_local_notifications. Until then this is
/// a no-op — equivalent behaviour to the JS code running in a tab that has
/// already been granted permission and is in focus.
Future<void> notifyNewMessage({
  required String from,
  required String text,
  String? tag,
}) async {
  final settings = getNotifSettings();
  if (!settings.enabled) return;
  if (!canShowNotifications()) return;
  final body = text.length > 200 ? text.substring(0, 200) : text;
  final title = 'Orbits — ${from.length > 64 ? from.substring(0, 64) : from}';
  // TODO(port): plugin.show(id, title, body, details, payload: tag);
  // Discard locals for the stub — they're here as a hint for the follow-up.
  // ignore: unused_local_variable
  final _ = [body, title, tag];
}

/// Show an "incoming call" notification with requireInteraction behaviour.
///
/// TODO(port): implement via flutter_local_notifications, setting the
/// Android channel importance to HIGH and the iOS interruption level to
/// timeSensitive so the notification behaves like a ringtone.
Future<void> notifyIncomingCall({required String from}) async {
  final settings = getNotifSettings();
  if (!settings.enabled) return;
  if (!canShowNotifications()) return;
  final safeFrom = from.length > 64 ? from.substring(0, 64) : from;
  // ignore: unused_local_variable
  final body = 'Звонит $safeFrom';
  // TODO(port): plugin.show(...)
}
