# Local verification: v1.0.21 / Android vc11

## Actual command outcomes

- Final `npm run lint`, `npm run typecheck`, `npm run preflight`: exit 0 each. The initial typecheck caught two test-only Array.at uses outside the project's library target; both were changed to ordinary indexing and rechecked. No runtime source change was required.
- Complete `npm test`: **3284 tests, 3282 passed, 2 failed, exit 1**. Zero skipped, cancelled or todo. This is not an all-green suite.
- The same two historical missing-art tests remain enabled and fail with ENOENT:
  - `tests/cargo-atlas.test.ts`: committed raster artwork verifies every generated source and exact encoded atlas; missing `artifacts/v0200-art-source/cargo-wood-generated.png`.
  - `tests/v021-cargo-forklift-art.test.ts`: new generated atlas rows obey their incremental byte budgets and preserve source evidence; missing `artifacts/v0210-art-source/cargo-harbor_container-generated.png`.
- TDD: `audio-red.txt` captures failures for missing Android gain and incorrect per-sample level. `staging-red.txt` captures missing gain metadata before implementation. Initial focused group: 19/19 pass. After the final test-only compatibility/assertion refinements, `final-focused.txt` has 11/11 pass, exit 0. Release metadata group: 11/11 pass.
- After the full suite, production browser/WeChat + Android staging and `verify:android` ran **twice**, all exit 0. The second staging remains the current output. Both formal builds report 680660-byte WeChat JavaScript and a 3982652-byte raw single main package; WeChat tools/device acceptance is not implied.

## Scope, assets and rebuilds

- `protected-sources.json`: `src/`, original `assets/`, and native production `android/app/src/main/` have zero diff from v1.0.20. Both complete dependency graphs are unchanged. Version metadata alone advances to 1.0.21/vc11.
- `rebuild-and-platform-isolation.json`: all **93** media assets are byte-identical across the two final whole builds. Compared with v1.0.20, all browser/WeChat assets and every Android asset except the twelve specified game-effect WAVs are unchanged.
- `built-audio-verification.json`: **42** shipped audio files examined, **30** unchanged and precisely the twelve Android game effects changed. Each changed PCM16 sample equals `Math.round(original * reviewedScalar)`, with unchanged header, format, duration and original silence. Button and BGM remain exact baseline bytes.
- Five interleaved target-loader passes give **195** matches to staged audio; all 195 retained buffers stay unchanged. A regression also overwrites the staged place file and proves a full rebuild restores the correct, once-amplified bytes.
- Every adjusted effect's loudest 50 ms RMS is 0.008–2.531 dB above the unchanged button reference. No single changed source clips; maximum changed-source 4× true-peak estimate is 0.605309. Runtime effect volume stays 0.45.

## Mixing limits

The original eight source-informed schedules retain at least 5.254 dB conservative absolute-sample-sum headroom including BGM. Three additional rapid reduced-motion scenarios reduce that minimum to **0.679 dB**. All twelve ordinary/observed/stress schedules checked have zero full-scale SFX samples. The additional synthetic all-thirteen-cues-at-once case **clips** and is explicitly outside the claimed normal schedule coverage. No arbitrary-overlap guarantee or actual-phone perceived-loudness claim is made.

Reproduce actual staged audio checks with Python, NumPy, SciPy and Node 24:

```sh
python qa/v121/verify-built-audio.py --root . --output qa/v121/built-audio-verification.json
```

This script is read-only with respect to product inputs and performs no rebuild. Run after staging has completed, without another build concurrently replacing outputs.

## Delivery boundary

These results verify source and local staging, not a signed APK. Android compilation/signature/packaged-asset and CI runtime receipts are separate. Physical Android speaker listening remains unverified. The first attempted fresh baseline run was interrupted by the execution tool without a terminal result; it was not counted as passing or failing and is not substituted for the final completed suite above.
