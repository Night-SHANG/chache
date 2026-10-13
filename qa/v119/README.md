# v1.0.19 local verification

The Android startup acceptance criterion is the current browser and WeChat behavior: ordinary startup has no additional loading/checking text. Historical Android implementation is not a product-acceptance oracle.

- `logs/startup-red.txt`: tests-first reproduction of the old HTML default message and JS normal-startup text write (exit 1 expected).
- `logs/startup-green.txt`: initial fix, 12/12.
- `logs/startup-version-final.txt`: startup plus release metadata focused checks, 43/43.
- `logs/version-build.txt`: actual generated Android staging and version checks, 38/38 (before final audio manifest addition, which is covered again by full suite).
- `logs/full-final.txt`: complete suite. Read its terminal counts and exit; known missing artwork-authoring files must not be described as a green suite.
- The exact-bundle host intentionally holds the native bridge, then holds zero geometry for five frames, then releases geometry while every image is pending. It observes every status text/hidden write and verifies a real cold menu frame. This is a simulated native bridge, not phone evidence.
- `scripts/verify-android-startup-host.mjs` adds actual Chromium DOM/CSS coverage of unchanged generated HTML before app.js executes, all ordinary text/visibility writes, the first menu frame, and visible genuine failures. CI pins Playwright 1.62.1, keeps Chromium sandboxing enabled, and saves screenshots/receipt. An unrun or blocked browser run is not a pass.

No API, permission, signing secret, or authorized CI branch allowlist is changed. Browser and WeChat button gain and all encoded audio files remain unchanged.

## Final local result

- `npm run lint`, `npm run typecheck`, `npm run preflight`: exit 0.
- `npm test -- --test-concurrency=4`: 3262 tests, 3260 passed, 2 failed, exit 1. The only failures are `committed raster artwork verifies every generated source and exact encoded atlas` and `new generated atlas rows obey their incremental byte budgets and preserve source evidence`; both reference pre-existing missing authoring PNG files.
- `npm run build:android` and `npm run verify:android`: exit 0. WeChat main package: 3,979,020 bytes / 40 files, JS 677,028 bytes. This is below 4 MiB by 215,284 bytes, before WeChat IDE processing.
- Exact production-bundle/native-Canvas trace: 757 frames and 12 cases on each of browser, WeChat and Android, 2271 total frames / 36 cases, exit 0. Local image files and reports are under `artifacts/v119-static-host` (generated artifacts are not Git source).
- `media-byte-comparison.json`: all 17 PNG and 14 encoded audio files per platform equal v118 byte for byte.
- Local Chromium run: BLOCKED at launch (`socket() failed: Operation not permitted` and ptrace denial), exit 1; 14 cases NOT RUN, zero screenshots. See `../android-v119/host/host-receipt.json` and `logs/chromium-local.txt`. No sandbox bypass was attempted. CI results are still pending at source freeze.
- The late review fix only synchronizes the QA harness's held app.js route; `logs/startup-harness-lint.txt` is the additional final script-specific lint result (exit 0).
