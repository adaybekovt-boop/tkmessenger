// Port of the `orbits_local_profile_v1` slice of localStorage that
// `src/context/AuthContext.jsx` manages. Keeps displayName, bio, avatar,
// and the scrypt password record in a single JSON blob.
//
// "Secure" in the filename refers to *what* we persist — the passRecord
// (v2) is an HMAC verifier only, not a secret; there's nothing here that
// needs keychain-level protection. `shared_preferences` (non-encrypted,
// native-backed on Android/iOS) is the right tier. If we later add
// biometric-gated auto-unlock, the wrapped KEK bytes go into
// `flutter_secure_storage` — that's explicitly NOT this file's concern.

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// SharedPreferences key we mirror from the JS `STORAGE.profile` constant.
const String kLocalProfileKey = 'orbits_local_profile_v1';

/// The persisted profile. `passRecord` is the v2 scrypt record shape
/// `{algo, v, saltB64, N, r, p, dkLen, verifierB64}` — we keep it as a
/// raw map so we can round-trip v1 records unchanged during migration.
class LocalProfile {
  const LocalProfile({
    required this.displayName,
    this.bio = '',
    this.avatarDataUrl,
    this.passRecord,
    this.onboardedAt,
  });

  final String displayName;
  final String bio;
  final String? avatarDataUrl;
  final Map<String, Object?>? passRecord;
  final int? onboardedAt;

  LocalProfile copyWith({
    String? displayName,
    String? bio,
    Object? avatarDataUrl = _sentinel,
    Object? passRecord = _sentinel,
    int? onboardedAt,
  }) =>
      LocalProfile(
        displayName: displayName ?? this.displayName,
        bio: bio ?? this.bio,
        avatarDataUrl: identical(avatarDataUrl, _sentinel)
            ? this.avatarDataUrl
            : avatarDataUrl as String?,
        passRecord: identical(passRecord, _sentinel)
            ? this.passRecord
            : passRecord as Map<String, Object?>?,
        onboardedAt: onboardedAt ?? this.onboardedAt,
      );

  Map<String, Object?> toJson() => {
        'displayName': displayName,
        'bio': bio,
        'avatarDataUrl': avatarDataUrl,
        if (passRecord != null) 'passRecord': passRecord,
        if (onboardedAt != null) 'onboardedAt': onboardedAt,
      };

  static LocalProfile? fromJson(Map<String, Object?> json) {
    final name = json['displayName'];
    if (name is! String || name.trim().isEmpty) return null;
    final rawPass = json['passRecord'];
    final Map<String, Object?>? passRecord =
        rawPass is Map ? Map<String, Object?>.from(rawPass) : null;
    final rawBio = json['bio'];
    final bio = rawBio is String
        ? (rawBio.length > 220 ? rawBio.substring(0, 220) : rawBio)
        : '';
    return LocalProfile(
      displayName: name,
      bio: bio,
      avatarDataUrl:
          json['avatarDataUrl'] is String ? json['avatarDataUrl'] as String : null,
      passRecord: passRecord,
      onboardedAt: (json['onboardedAt'] as num?)?.toInt(),
    );
  }
}

/// Sentinel so `copyWith` can distinguish "don't change" from "set to null".
const Object _sentinel = Object();

/// Load the persisted profile, or null when first-run.
Future<LocalProfile?> loadLocalProfile() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(kLocalProfileKey);
  if (raw == null || raw.isEmpty) return null;
  try {
    final parsed = jsonDecode(raw);
    if (parsed is Map) {
      return LocalProfile.fromJson(Map<String, Object?>.from(parsed));
    }
  } catch (_) {
    // Corrupt JSON — treat as first-run so the user can re-onboard instead of
    // being stuck in a broken state.
  }
  return null;
}

Future<void> saveLocalProfile(LocalProfile profile) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(kLocalProfileKey, jsonEncode(profile.toJson()));
}

Future<void> clearLocalProfile() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(kLocalProfileKey);
}
