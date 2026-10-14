# Local verification: v1.0.22 / Android vc12

## Final approved behavior

The user superseded the initial volume-1 request, first requesting parity with pick's net common-asset gain and then requesting exactly 1 dB more for the lower-pitched placement cue. The final Android place playback volume is **0.7554618081551522** = 0.45 × 10^(4.5/20). With the unchanged additional Android asset gain of +6 dB, net gain relative to the pre-Android common place asset is **+3.5642502755 dB**, 1 dB above pick's +2.5642502755 dB. Place's older common +2 dB is part of that reference asset and is not double-counted.

All other Android cue volumes, button, BGM, browser/WeChat behavior and every media byte are retained. No new effects processor or trigger/timing/gameplay change is introduced.

## Test-first evidence and preliminary attempts

- `final-target-runtime-red.txt`: actual volume 1 fails the final approved 0.7554618082 expectation before the final production change; exit 1.
- `final-target-staging-red.txt`: the same final-target manifest assertion fails before implementation; exit 1.
- `final-target-focused-green.txt`: 24/24 pass, zero skipped/cancelled/todo, exit 0.
- The independent reviewer also ran 36/36 focused tests covering adapter volumes, cached handle reuse, lifecycle, mute, session timing and cross-platform audio isolation.
- Files beginning `superseded-volume-one-` document an abandoned proposal. Its incomplete full-suite run was canceled with SIGINT (exit 130) when the user changed the target. It is not final verification and is not counted as a pass or a completed suite.
- Initial metadata and floating-point test-expectation failures are preserved in the two `focused-initial-*-failure` logs. Release identity coverage was brought into sync, and the expected button gain uses the same mathematically equivalent multiplication grouping to avoid a 3e-17 floating-point discrepancy. No button production value changed.

- The first completed final-target suite exposed an additional frozen-source integrity failure: 3287 tests, 3284 pass, 3 fail, raw exit 1. `pre-relocation-full-suite.txt` retains it. The Android-only constant was moved to its own new module and the shared audio-levels.ts was restored byte-for-byte. The original freeze test was not edited. `final-focused.txt` then passed all 25 tests including that freeze check.

## Final command outcomes

- Final `npm run lint`, `npm run typecheck`, `npm run preflight`: exit 0 each.
- Final complete `npm test`: **3287 tests, 3285 passed, 2 failed, raw exit 1**. Zero skipped, cancelled or todo. This is not an all-green suite.
- The two original enabled failures are unchanged:
  - `tests/cargo-atlas.test.ts`, “committed raster artwork verifies every generated source and exact encoded atlas”: ENOENT for `artifacts/v0200-art-source/cargo-wood-generated.png`.
  - `tests/v021-cargo-forklift-art.test.ts`, “new generated atlas rows obey their incremental byte budgets and preserve source evidence”: ENOENT for `artifacts/v0210-art-source/cargo-harbor_container-generated.png`.
- After that complete suite, `npm run build:android` and `npm run verify:android` each exit 0. The final stage is v1.0.22/vc12 production content. The staging verification retains bootstrap/publication gate `{phase: "bootstrap", publishApk: false}`.
- `media-isolation.json`: **93/93 media paths retain exact v121 bytes**, including place, every other cue, music and all images. Browser and WeChat JavaScript are byte-identical after only replacing the app version string 1.0.21 → 1.0.22. Final sizes remain 681316 and 680660 bytes respectively; no audio or other runtime behavior changed on either platform.
- Per-command `.exit` files record actual exit codes. The final logs are `final-lint.txt`, `final-typecheck.txt`, `final-preflight.txt`, `full-suite.txt`, `build-android.txt` and `verify-android.txt`.

## Scope and artifacts

`protected-source-check.json` records the modified Android adapter and the new Android-only named-constant module; the legacy shared audio-levels.ts file remains byte-identical. Original media, native production sources, and both full dependency graphs are unchanged. Release metadata and its test/receipt/signing identities advance to 1.0.22/vc12, preserving debug acceptance codes 1/2, branch, security permissions and signing separation.

`v121-media-sha256.json` freezes all 93 built media paths at source commit 64987c3b1685d55ee5e31fa3d65d469e4ba0a325, tree 34caa956e91efc4677bef3d4e3d4c0e17ce9dffd. Final staged comparison and independent mix checks are recorded alongside this file.

## Independent staged audio and mix review

`verify-independent-audio.py` exits 0 against the final staging (`independent-audio-verification.json/.txt/.exit`). It reads actual adapter playback values, checks 30 repeated plays per cue, compares all 42 audio and 93 total media files to built v121, and records two real GameSession → Android adapter traces with normal and reduced motion. `independent-focused.txt` records 36/36 passing independent focused tests. The final review receipt is `independent-review.json`.

The original twelve finite modeled normal/stress timelines have zero clipped SFX samples. Their worst aligned 4× true-peak estimate plus conservative unchanged-BGM peak bound is **0.8271892274**. This does not prove every possible host phase/timing overlap safe.

A constructed, unproven-reachable 328.9 ms chain-tail/failed-placement negative control has SFX sample peak **0.9631782890**, zero clipped SFX samples, and a 4× true-peak-plus-any-BGM bound of **1.0287579353**. The over-full-scale bound is a possible worst-case overlap risk; it is not demonstrated decoded-BGM clipping or established normal gameplay. The all-thirteen-cues synthetic negative control also lies outside reachable-gameplay claims. No mix processing or other gain was changed to mask these boundaries.

Reproduce after both checkouts have been staged:

```sh
python qa/v122/verify-independent-audio.py --root . --baseline /path/to/built-v121 --output qa/v122/independent-audio-verification.json
```

## Verification boundaries

The final fixed-timing and negative-control results are finite offline numerical checks. They do not establish arbitrary-overlap clipping safety, Android device latency, speaker response, or perceived loudness. A constructed rapid chain-tail timing negative control is not a proven reachable gameplay sequence: the existing exact four-chain fixture enters upgrade and rejects the subsequent placement. Physical phone listening remains unverified.

Local staging is not a signed APK. Native build/signature/packaged-byte/runtime receipts are owned by the separate final release workflow; this record does not claim they have run.
