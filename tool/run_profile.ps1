# Profile-mode run for the Flutter app — the only mode where DevTools
# performance metrics are meaningful.
#
# Why not `flutter run` (debug)?
#   Debug mode uses JIT-compiled DDC scripts (we ship 1284 of them on
#   web), runs assertions on every widget, and skips many Impeller
#   optimisations. Debug-mode profiling consistently lies about your
#   real hot paths — you'll chase phantom jank that vanishes in release.
#
# Why not `flutter run --release`?
#   Release strips the VM service connection that DevTools uses to read
#   timeline events. You can run a release build and feel that it's
#   faster, but you can't measure *where* the time actually goes.
#
# Profile mode hits the sweet spot: AOT-compiled native code (so perf
# matches release within ~5 %), but with the VM service kept alive so
# the timeline view, rebuild stats, and CPU profiler all work.
#
# Default target is Chrome. Pass `-Device <name>` to switch (e.g.
# `-Device windows` for the desktop runner once we add that target).

param(
    [string]$Device = 'chrome',
    [int]$WebPort = 8081
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "[run_profile] device=$Device port=$WebPort"
Write-Host "[run_profile] DevTools: http://localhost:9100 (Flutter prints exact URL on start)"
Write-Host ""

if ($Device -eq 'chrome' -or $Device -eq 'web-server') {
    # Web target — drop a hint that perf will still be capped without
    # the COEP/COOP headers. `flutter run -d chrome` doesn't set them,
    # so SharedArrayBuffer is OFF here and Drift falls back to IDB.
    # For an accurate Drift benchmark, run `tool/build_web_release.ps1`
    # then `dart run tool/serve_web.dart`.
    Write-Host "[run_profile] NOTE: chrome run doesn't set COEP/COOP — Drift will use IDB fallback."
    Write-Host "             For accurate Drift benchmarks, build + serve via tool/serve_web.dart."
    Write-Host ""
    flutter run --profile -d $Device --web-port=$WebPort
} else {
    flutter run --profile -d $Device
}
