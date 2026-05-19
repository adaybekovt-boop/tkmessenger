// Shareable invite-link helpers — turn a peerId into a URL you can paste
// into iMessage / Telegram / SMS and back. The QR code on `MyQrPage`
// embeds the URL (not the raw peerId) so a stranger scanning with the
// system camera lands somewhere useful even if the app isn't installed.
//
// Wire format:
//   https://orbits.app/add/ORBIT-ABC123
//
// Both `https://orbits.app/add/<id>` and the legacy `orbits://add/<id>`
// custom-scheme form are accepted on parse, plus a bare peerId (the
// pre-link format from before this file existed). Anything else returns
// null.

import 'helpers.dart';

/// Canonical host for shareable invite links. Kept as a single const so a
/// future domain swap touches one line. Has to stay byte-identical with
/// whatever the server side will route — see docs/deployment.md when the
/// landing page lands.
const String kAddContactHost = 'orbits.app';

/// Path segment that scopes invite URLs. Future link types (e.g. group
/// invites) should pick a sibling segment instead of reusing this one.
const String kAddContactPath = 'add';

/// Build the shareable invite URL for [peerId]. The peerId is normalised
/// (trim + upper-case) before going into the URL so a casually-typed
/// `orbit-abc123` still ends up as the canonical `ORBIT-ABC123` in the
/// link — both the QR encoder and the receiver-side parser do the same
/// normalisation, so this stays consistent end-to-end.
///
/// Returns an empty string if [peerId] doesn't validate — callers should
/// guard against that (we never want to ship a QR that encodes nothing).
String buildAddContactUrl(String peerId) {
  final normalized = normalizePeerId(peerId);
  if (!isValidPeerId(normalized)) return '';
  return 'https://$kAddContactHost/$kAddContactPath/$normalized';
}

/// Pull a peerId out of [input]. Accepts:
///   • the bare canonical form: `ORBIT-ABC123` (or any case)
///   • the https form:          `https://orbits.app/add/ORBIT-ABC123`
///   • the legacy custom scheme: `orbits://add/ORBIT-ABC123`
///   • the same forms with trailing slash / query string / whitespace
///
/// Returns the normalised peerId (`ORBIT-XXXXXX`) on success, or `null`
/// if the input isn't a recognised invite payload. Designed so the QR
/// scanner and the manual-paste field can share one entry point.
String? extractPeerIdFromInput(String? input) {
  if (input == null) return null;
  final trimmed = input.trim();
  if (trimmed.isEmpty) return null;

  // 1. Bare peerId — the fast path. Also catches the "user typed their id
  //    in the manual tab" case where there's no URL at all.
  final asPeerId = normalizePeerId(trimmed);
  if (isValidPeerId(asPeerId)) return asPeerId;

  // 2. URL form. `Uri.tryParse` accepts surprisingly malformed input
  //    (returns a Uri with everything in `path`); we validate host +
  //    path segments explicitly instead of trusting it.
  final uri = Uri.tryParse(trimmed);
  if (uri == null) return null;

  final scheme = uri.scheme.toLowerCase();
  final host = uri.host.toLowerCase();
  final segments = uri.pathSegments
      .where((s) => s.isNotEmpty)
      .toList(growable: false);

  // Recognise both:
  //   https://orbits.app/add/<id>   (universal link — host + path)
  //   orbits://add/<id>             (custom scheme — `add` lives in host
  //                                  on Uri's parsing, not path)
  String? candidate;
  if ((scheme == 'https' || scheme == 'http') &&
      host == kAddContactHost &&
      segments.length >= 2 &&
      segments[0] == kAddContactPath) {
    candidate = segments[1];
  } else if (scheme == 'orbits' &&
      (host == kAddContactPath || segments.firstOrNull == kAddContactPath)) {
    // `orbits://add/ID` — Uri puts `add` in `host`, ID in segments[0].
    // `orbits:///add/ID` (rare, but seen in some pasted forms) — `add`
    // in segments[0], ID in segments[1].
    candidate = host == kAddContactPath
        ? segments.firstOrNull
        : (segments.length >= 2 ? segments[1] : null);
  }

  if (candidate == null) return null;
  final normalized = normalizePeerId(candidate);
  return isValidPeerId(normalized) ? normalized : null;
}
