# Local validation of v1.0.20 / vc10

- lint / typecheck / preflight: actual exit 0.
- Final complete npm test: 3280 tests, 3278 pass, two known missing-authoring-art failures, actual exit 1. No tests skipped or cancelled. See full-suite.txt for both exact ENOENT paths.
- A prior full run exposed an old Android entry assertion and exhaustive-test native-surface allocation pressure. The assertion now follows the authorized Android startup path; the test reuses one Canvas without reducing combinations or pixel assertions. This directory contains the final complete run.
- Initial resource TDD red followed by focused success; normal menu matrix 99 combinations, failed-image matrix 297 combinations, two late-onload cases all pass.
- Production browser/WeChat plus Android staging build and staging verification: exit 0. Staging is not an APK.
- Post-build legacy host: 1/1 pass. Exact Android bundle / native-Canvas trace: 726 frames, exit 0. Full trace and PNG sequence retained with the release evidence; summary includes the full trace hash.
- Background renderer: 72 scenarios, 216 frames, full same-scene consecutive-frame hashes identical.
- Local Chromium: BLOCKED at sandboxed process launch (socket EPERM), 0 assertions, 0 screenshots, all 21 cases NOT RUN. No sandbox bypass. Actual Chromium execution must be established by the configured CI gate.
- Pure Java state probes and source-level tests do not establish native WebView/Splash composition, API 31/32 runtime behavior, or physical-device visual acceptance.
