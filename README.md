# orbits_flutter

Flutter port of the Orbits P2P messenger.

## CI

GitHub Actions builds the project on every push to `main`:

- Android APK artifacts
- Windows single-file installer EXE
- Flutter web static bundle
- GitHub Pages deployment

The platform folders (`android/`, `windows/`, etc.) are intentionally not
checked in. CI generates them with `flutter create` and then applies the
patches from `tool/ci/patch_android.sh`.

## Web Deploy

The `Deploy Web` workflow publishes the Flutter web build to GitHub Pages
with:

```bash
flutter build web --release --base-href /tkmessenger/ --pwa-strategy offline-first
```

After the workflow succeeds, the app should be available at:

```text
https://adaybekovt-boop.github.io/tkmessenger/
```

## Direct Download Links

Use these URLs for website buttons:

```text
Windows EXE:
https://github.com/adaybekovt-boop/tkmessenger/releases/latest/download/orbits-windows-x64.exe

Android APK:
https://github.com/adaybekovt-boop/tkmessenger/releases/latest/download/orbits-android-universal.apk

Flutter Web:
https://adaybekovt-boop.github.io/tkmessenger/
```

## Local Development

Install Flutter 3.32 or newer, then run:

```bash
flutter pub get
flutter run -d chrome
```

For local web testing with the headers used by Drift's faster
SharedArrayBuffer path:

```bash
dart tool/serve_web.dart
```
