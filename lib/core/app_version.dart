// App version + GitHub release coordinates.
//
// We keep the current version as a Dart const (and not via
// `package_info_plus`) on purpose: this is the only place we read it
// from, and `package_info_plus` would drag in platform plugin code on
// every target just to surface a string already declared in
// `pubspec.yaml`. Keep [kAppVersion] in sync with the `version:` field
// in `pubspec.yaml` — the in-app update checker compares this against
// the latest GitHub release tag.

/// Current app version (semver). Bump together with `pubspec.yaml`'s
/// `version:` and the GitHub release tag at cut time — the in-app
/// update checker compares this against `tag_name` from
/// `/repos/{owner}/{repo}/releases/latest`, so it has to match what
/// you tag on GitHub (minus the leading `v`).
const String kAppVersion = '8.1.0';

/// `owner/repo` for the upstream GitHub project. The update checker
/// queries `https://api.github.com/repos/$kGithubRepo/releases/latest`.
const String kGithubRepo = 'adaybekovt-boop/tkmessenger';

/// Minimal semver tuple — major/minor/patch only. Pre-release suffixes
/// (`-beta.1`, `+build.5`) are stripped before parsing so a stable
/// `1.2.3` is treated as newer than a pre-release `1.2.3-rc.1`, which
/// is the behaviour we want: pre-releases don't trigger update prompts
/// for users on a stable build.
class SemVer implements Comparable<SemVer> {
  const SemVer(this.major, this.minor, this.patch);

  final int major;
  final int minor;
  final int patch;

  /// Parse a `[v]MAJOR.MINOR.PATCH[-...|+...]` tag. Returns null for any
  /// shape we don't recognise — callers must skip the update if either
  /// side fails to parse, since "is X newer than Y" isn't answerable.
  static SemVer? tryParse(String raw) {
    var s = raw.trim();
    if (s.isEmpty) return null;
    if (s.startsWith('v') || s.startsWith('V')) {
      s = s.substring(1);
    }
    // Strip pre-release / build metadata before splitting on '.'.
    final dashIdx = s.indexOf(RegExp(r'[-+]'));
    if (dashIdx >= 0) s = s.substring(0, dashIdx);
    final parts = s.split('.');
    if (parts.length < 3) return null;
    final major = int.tryParse(parts[0]);
    final minor = int.tryParse(parts[1]);
    final patch = int.tryParse(parts[2]);
    if (major == null || minor == null || patch == null) return null;
    return SemVer(major, minor, patch);
  }

  @override
  int compareTo(SemVer other) {
    if (major != other.major) return major.compareTo(other.major);
    if (minor != other.minor) return minor.compareTo(other.minor);
    return patch.compareTo(other.patch);
  }

  @override
  String toString() => '$major.$minor.$patch';
}
