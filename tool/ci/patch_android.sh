#!/usr/bin/env bash
# Patch the freshly-generated `android/` folder so it matches what this
# project actually needs:
#
#   1. AndroidManifest.xml — add INTERNET, CAMERA, RECORD_AUDIO, plus the
#      `<queries>` blocks for `share_plus` / file picker intents and the
#      `usesCleartextTraffic` flag we toggle for local PeerJS dev signaling.
#
#   2. build.gradle(.kts) — point release builds at the *debug* keystore.
#      The user has no upload key. The debug keystore is auto-generated
#      and cached in CI (so updates work without "INSTALL_FAILED_UPDATE
#      _INCOMPATIBLE" — the signature stays stable across runs). This is
#      a sideload-only setup; you cannot ship to Play Store like this,
#      but `adb install` and "open APK on phone" both work.
#
#   3. gradle.properties — bump the JVM heap so the d8/r8 step doesn't
#      OOM on the GitHub-hosted runner with the larger transitive
#      dependency graph (cryptography + drift + flutter_webrtc).
#
# Run this AFTER `flutter create --platforms=android …`. Idempotent.

set -euo pipefail

ANDROID_DIR="android"
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found. Did you run 'flutter create' first?" >&2
  exit 1
fi

# ─── 1. AndroidManifest permissions ──────────────────────────────────────────

# Insert the permissions just before the `<application` opening tag, which
# is where Flutter places its own internet permission in the default
# template. Use a marker so re-running this script doesn't duplicate.
if ! grep -q "ORBITS_PERMS_INJECTED" "$MANIFEST"; then
  python3 - "$MANIFEST" <<'PY'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
xml = path.read_text(encoding="utf-8")

block = """\
    <!-- ORBITS_PERMS_INJECTED -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.RECORD_AUDIO"/>
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30"/>
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO"/>
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    <uses-permission android:name="android.permission.WAKE_LOCK"/>
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>

    <uses-feature android:name="android.hardware.camera" android:required="false"/>
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false"/>
    <uses-feature android:name="android.hardware.microphone" android:required="false"/>

"""

# Inject right before <application
new_xml, n = re.subn(r"(\s*<application\b)", "\n" + block + r"\1", xml, count=1)
if n == 0:
    print("ERROR: could not find <application tag", file=sys.stderr)
    sys.exit(1)

# Allow cleartext traffic — needed if the user points the app at a local
# `peerjs-server` over plain ws:// during development. Production build
# can override this with a network_security_config.xml later.
new_xml = re.sub(
    r'(<application\b)([^>]*?)(\s*>)',
    lambda m: m.group(1) + m.group(2) + ' android:usesCleartextTraffic="true"' + m.group(3),
    new_xml,
    count=1,
)

path.write_text(new_xml, encoding="utf-8")
print(f"Patched permissions into {path}")
PY
else
  echo "Permissions already present, skipping manifest patch."
fi

# ─── 2. build.gradle — release signing = debug keystore ──────────────────────

# Newer Flutter (3.27+) emits Kotlin DSL by default. Older / migrated
# projects might still use Groovy. Handle both.

GRADLE_KTS="$ANDROID_DIR/app/build.gradle.kts"
GRADLE_GROOVY="$ANDROID_DIR/app/build.gradle"

if [ -f "$GRADLE_KTS" ]; then
  if ! grep -q "ORBITS_RELEASE_SIGNING" "$GRADLE_KTS"; then
    python3 - "$GRADLE_KTS" <<'PY'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
src = path.read_text(encoding="utf-8")

# The default template has:
#     buildTypes {
#         release {
#             signingConfig = signingConfigs.getByName("debug")
#         }
#     }
# i.e. it ALREADY uses debug for release. But the line is sometimes
# commented or absent depending on Flutter version. We force it.

new = re.sub(
    r'buildTypes\s*\{\s*release\s*\{[^}]*\}\s*\}',
    '''buildTypes {
        release {
            // ORBITS_RELEASE_SIGNING — sideload-only build, no upload key.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }''',
    src,
    count=1,
    flags=re.DOTALL,
)

if new == src:
    # Couldn't find the buildTypes block — append one.
    new = re.sub(
        r'(android\s*\{)',
        r'''\1
    // ORBITS_RELEASE_SIGNING
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
''',
        src,
        count=1,
    )

path.write_text(new, encoding="utf-8")
print(f"Patched {path}")
PY
  else
    echo "Release signing already patched in $GRADLE_KTS."
  fi
elif [ -f "$GRADLE_GROOVY" ]; then
  if ! grep -q "ORBITS_RELEASE_SIGNING" "$GRADLE_GROOVY"; then
    python3 - "$GRADLE_GROOVY" <<'PY'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
src = path.read_text(encoding="utf-8")

new = re.sub(
    r'buildTypes\s*\{\s*release\s*\{[^}]*\}\s*\}',
    '''buildTypes {
        release {
            // ORBITS_RELEASE_SIGNING — sideload-only build, no upload key.
            signingConfig signingConfigs.debug
            minifyEnabled false
            shrinkResources false
        }
    }''',
    src,
    count=1,
    flags=re.DOTALL,
)

path.write_text(new, encoding="utf-8")
print(f"Patched {path}")
PY
  else
    echo "Release signing already patched in $GRADLE_GROOVY."
  fi
else
  echo "ERROR: no build.gradle(.kts) found at $ANDROID_DIR/app/" >&2
  exit 1
fi

# ─── 3. gradle.properties — bigger heap, AndroidX ────────────────────────────

PROPS="$ANDROID_DIR/gradle.properties"
if [ -f "$PROPS" ]; then
  # Heap. Default is 1.5g — bump to 4g so r8/d8 doesn't OOM with our
  # cryptography + flutter_webrtc + drift dependency graph.
  if grep -q "org.gradle.jvmargs" "$PROPS"; then
    sed -i.bak -E 's|^org\.gradle\.jvmargs=.*|org.gradle.jvmargs=-Xmx4G -XX:MaxMetaspaceSize=2G -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8|' "$PROPS"
  else
    echo "org.gradle.jvmargs=-Xmx4G -XX:MaxMetaspaceSize=2G -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8" >> "$PROPS"
  fi
  rm -f "$PROPS.bak"

  grep -q "android.useAndroidX=true" "$PROPS" || echo "android.useAndroidX=true" >> "$PROPS"
  grep -q "android.enableJetifier=true" "$PROPS" || echo "android.enableJetifier=true" >> "$PROPS"
fi

# ─── 4. minSdk bump — flutter_webrtc + mobile_scanner need 21+, several
#       package transitive deps (just_audio, record) want 23+. Bumping to
#       23 keeps coverage at >99% of in-use Android devices and avoids the
#       desugaring grief that minSdk<21 causes.

APP_GRADLE="${GRADLE_KTS:-$GRADLE_GROOVY}"
if [ -f "$APP_GRADLE" ]; then
  python3 - "$APP_GRADLE" <<'PY'
import sys, re, pathlib
path = pathlib.Path(sys.argv[1])
src = path.read_text(encoding="utf-8")

# Kotlin DSL: `minSdk = flutter.minSdkVersion` or `minSdk = 21`
# Groovy:     `minSdkVersion flutter.minSdkVersion`
new = re.sub(r'minSdk\s*=\s*[^\n]+',           'minSdk = 23',     src)
new = re.sub(r'minSdkVersion\s+[^\n]+',         'minSdkVersion 23', new)
path.write_text(new, encoding="utf-8")
PY
fi

echo "── Android patches done."
