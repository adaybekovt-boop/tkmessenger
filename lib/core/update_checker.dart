// In-app update checker.
//
// Hits the GitHub Releases API on startup and resolves to an
// [UpdateInfo] if there's a published release with a higher semver
// than [kAppVersion]. The whole flow is best-effort: any network
// failure, parse error, missing release, or rate-limit response
// returns `null` so app startup never blocks on this. The UI side
// (a Riverpod FutureProvider in `lib/state/update_provider.dart`)
// shows a dialog only when a non-null result lands.

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_version.dart';

class UpdateInfo {
  const UpdateInfo({
    required this.version,
    required this.releaseUrl,
    required this.releaseNotes,
    required this.publishedAt,
  });

  /// Pretty version string (without leading `v`) — e.g. `0.2.0`.
  final String version;

  /// `https://github.com/owner/repo/releases/tag/v0.2.0` — where the
  /// release notes + assets live. On native this is the URL we open in
  /// the system browser; on web we don't use it (we just reload).
  final String releaseUrl;

  /// Markdown body of the release. Trimmed and truncated by the UI.
  final String releaseNotes;

  /// ISO-8601 release publish timestamp from GitHub. Surfaced in the
  /// dialog footer so the user can tell stale vs. fresh updates apart.
  final String publishedAt;
}

/// Fetch the latest GitHub release and decide whether it's newer than
/// the running build. Returns `null` if no update is available, the
/// request fails, the tag doesn't parse, or the released version isn't
/// strictly greater than [kAppVersion].
///
/// [timeout] guards the HTTP call — anything past this and we give up.
/// The default (6 s) is comfortable on 3G and short enough that even a
/// fully wedged network never delays the update dialog past app start.
Future<UpdateInfo?> checkForUpdate({
  Duration timeout = const Duration(seconds: 6),
  http.Client? client,
}) async {
  final ownClient = client ?? http.Client();
  try {
    final resp = await ownClient
        .get(
          Uri.https(
            'api.github.com',
            '/repos/$kGithubRepo/releases/latest',
          ),
          headers: const {
            // GitHub recommends the versioned media type for stability.
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            // GitHub rejects requests without a User-Agent. Identify
            // ourselves so abuse triage doesn't lump us in with bots.
            'User-Agent': 'orbits-flutter/$kAppVersion',
          },
        )
        .timeout(timeout);

    // 404 means no releases yet — that's the happy "no update" case.
    // Any other non-200 we treat the same: skip silently.
    if (resp.statusCode != 200) return null;

    final decoded = jsonDecode(resp.body);
    if (decoded is! Map<String, dynamic>) return null;

    final tag = decoded['tag_name'];
    if (tag is! String) return null;

    final latest = SemVer.tryParse(tag);
    final current = SemVer.tryParse(kAppVersion);
    if (latest == null || current == null) return null;
    if (latest.compareTo(current) <= 0) return null;

    // Drafts and pre-releases are excluded so a release marker pushed
    // for internal testing doesn't pop up an update dialog on stable
    // builds. The `releases/latest` endpoint already filters drafts,
    // but pre-releases need an explicit check.
    if (decoded['prerelease'] == true || decoded['draft'] == true) {
      return null;
    }

    final notes = decoded['body'];
    final htmlUrl = decoded['html_url'];
    final publishedAt = decoded['published_at'];

    return UpdateInfo(
      version: latest.toString(),
      releaseUrl: htmlUrl is String && htmlUrl.isNotEmpty
          ? htmlUrl
          : 'https://github.com/$kGithubRepo/releases',
      releaseNotes: (notes is String) ? notes.trim() : '',
      publishedAt: publishedAt is String ? publishedAt : '',
    );
  } catch (_) {
    // Network down, DNS failure, JSON malformed, timeout — never
    // propagate. The update check is a nice-to-have, not a blocker.
    return null;
  } finally {
    if (client == null) ownClient.close();
  }
}
