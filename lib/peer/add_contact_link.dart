// Shareable invite-link helpers — turn a peerId into a URL you can paste
// into iMessage / Telegram / SMS and back. The QR code on `MyQrPage`
// embeds the URL (not the raw peerId) so a stranger scanning with the
// system camera lands on a real page (web/404.html, the SPA-style
// landing that GitHub Pages serves for any unknown sub-path) even if
// the app isn't installed.
//
// Wire format we currently emit:
//   https://adaybekovt-boop.github.io/tkmessenger/add/ORBIT-ABC123
//
// On parse we accept anything whose URL path ends with `/add/<ORBIT-…>`,
// regardless of host or base-path prefix. That keeps old QRs scannable
// after a custom-domain migration (`https://orbits.app/add/…`) and
// covers self-hosted mirrors without further code changes. The legacy
// `orbits://add/<id>` custom scheme stays in for QRs printed before the
// HTTPS form existed, plus a bare peerId (the original pre-link format).

import 'helpers.dart';

/// Host that serves the invite landing page today (`web/404.html` on
/// GitHub Pages). The QR generator pins this into every code we emit;
/// the parser, by contrast, does NOT validate the host — it only checks
/// the trailing `/add/<id>` path shape — so swapping this to a custom
/// domain later is one line here and won't invalidate codes already in
/// the wild.
const String kAddContactHost = 'adaybekovt-boop.github.io';

/// Base path that scopes the GitHub Pages deployment. Has to match the
/// `--base-href` flag in `.github/workflows/pages.yml`; if you move
/// Pages to a custom domain (CNAME + `--base-href /`), set this to `''`.
const String kAddContactBasePath = '/tkmessenger';

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
  return 'https://$kAddContactHost$kAddContactBasePath/$kAddContactPath/$normalized';
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

  // Recognise any URL whose path ENDS in `/add/<id>` — host-agnostic so
  // a future custom-domain move (or a self-hosted Pages mirror) doesn't
  // invalidate codes printed today. Concrete shapes we see in the wild:
  //
  //   https://adaybekovt-boop.github.io/tkmessenger/add/<id>
  //     → segments = ['tkmessenger', 'add', '<id>']
  //   https://orbits.app/add/<id>           (future custom domain)
  //     → segments = ['add', '<id>']
  //   orbits://add/<id>                     (legacy custom scheme)
  //     → host = 'add', segments = ['<id>']
  //   orbits:///add/<id>                    (rare, but seen on paste)
  //     → segments = ['add', '<id>']
  //
  // We intentionally do NOT check the host on HTTPS forms — the peerId
  // itself is the trust root; the URL only exists to route a stranger
  // somewhere readable. Spoofing the host buys an attacker nothing
  // because they'd need the corresponding identity key to actually
  // impersonate the peer.
  String? candidate;
  if (scheme == 'https' || scheme == 'http') {
    if (segments.length >= 2 &&
        segments[segments.length - 2] == kAddContactPath) {
      candidate = segments.last;
    }
  } else if (scheme == 'orbits') {
    if (host == kAddContactPath && segments.isNotEmpty) {
      candidate = segments.first;
    } else if (host.isEmpty &&
        segments.length >= 2 &&
        segments.first == kAddContactPath) {
      candidate = segments[1];
    }
  }

  if (candidate == null) return null;
  final normalized = normalizePeerId(candidate);
  return isValidPeerId(normalized) ? normalized : null;
}
