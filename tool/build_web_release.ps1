# Release build for Flutter web — Orbits.
#
# Output goes to `build/web`. Serve with `tool/serve_web.dart` (which sets
# the COEP/COOP headers Drift needs) for an authentic perf benchmark.
#
# Flags:
#   --release             AOT-compiled JS, tree-shaken, minified.
#   --tree-shake-icons    Strip unused MaterialIcons glyphs from the
#                         bundled icon font (typically saves ~1-2 MB).
#   --split-debug-info    Move the symbol map out of the main bundle so
#                         the user-facing payload is smaller (and so
#                         release crash reports can still be symbolised
#                         later via `flutter symbolize`).
#   --obfuscate           Renames Dart class/method symbols. Pairs with
#                         --split-debug-info; the saved symbol file is
#                         the only way to read stack traces.
#
# We deliberately do NOT pass --wasm yet: the wasm output is gated on all
# JS-interop dependencies being wasm-compatible, and we use dart:html /
# package:cryptography_flutter which don't compile to wasm today. Run
# `flutter build web --wasm-dry-run` to see the current incompatibility
# list — once it's empty, switch this script to --wasm for a 2-3× perf
# bump on the math-heavy parts of the app (crypto, image decode).

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$symbolDir = Join-Path $projectRoot 'build\symbols'
if (-not (Test-Path $symbolDir)) {
    New-Item -ItemType Directory -Path $symbolDir | Out-Null
}

Write-Host "[build_web_release] project: $projectRoot"
Write-Host "[build_web_release] symbols: $symbolDir"

# `--no-source-maps` keeps the bundle small in production. Keep them on
# in profile builds (see run_profile.ps1) so the timeline view in
# DevTools shows readable function names.
flutter build web `
    --release `
    --tree-shake-icons `
    --split-debug-info=$symbolDir `
    --obfuscate `
    --no-source-maps

if ($LASTEXITCODE -ne 0) {
    Write-Error "[build_web_release] flutter build web failed (exit $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[build_web_release] OK. Next steps:"
Write-Host "  1. dart run tool/serve_web.dart"
Write-Host "  2. open http://localhost:8080"
Write-Host ""
Write-Host "Symbols stashed in $symbolDir — keep them, they're the only"
Write-Host "way to symbolise obfuscated stack traces from production."
