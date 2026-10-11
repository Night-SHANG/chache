# v1.0.10 pause overlay: independent candidate review

## Scope and status

Candidate-only UI evidence: 40 original-bundle host cases and 205 source/platform pixel cases passed. These are fresh native Canvas/DOM-event and wx-host executions, not a browser GUI, WeChat developer-tools or physical-device test. This review did not run the full project suite and does not establish final-release readiness. The user's UI approval and the final product commit were still pending when this evidence was prepared. No source, build, publication or production account was changed by this review.

## Exact identity

- Candidate source SHA-256: `78365d5545c4120564fb150aa077d01f31e7f37a088cb90469e4e3517749a3c7`
- Candidate browser app.js: `5581f1c5788af39df7d290ab4b569eeefb3c50bccc4bd2c75f8d7275b218bcf8`
- Candidate WeChat game.js: `c25ec9161958c15528f7a6c5d3e5f0496773e2cae21395c8325c11da446faf9e`
- v1.0.9 baseline browser app.js: `927aa753e29bd9dd6001de51e44d0bc9b2506d84e987a20e8ddf4fbd950797c5`
- v1.0.9 baseline WeChat game.js: `857ec06c984b6364d863b26b63798c2f14c63d3b49198beb736e843ff6e2c79e`

Each script verifies the candidate manifest's source binding and records equal initial/final hashes. The manifest's base commit describes the checkout base, not a finalized commit containing these uncommitted candidate changes.

## Results

1. Original bundle input and rendered UI: two targets × ordinary/endless inbound/outbound × five viewport configurations = 40 cases. All pause controls retain order, dimensions, spacing, font, color, weight, alignment, baseline and alpha; only their y coordinate moves by exactly −200 design units. All new buttons are activated through registered platform events. Settings/help return, restart/home/finish cancellation, resume, invalid old lower slots, side regions, board taps, orphan pointer-up and dragging out of a pressed control are verified. No board move or unintended storage change occurred.
2. At 512×768, the inset pixels of all 44 buttons across eight target/mode combinations are byte-identical after translation. A separate 1080-physical-pixel-wide rendering has the precisely documented primary-gradient quantization difference below. The modal header and body region are byte-identical to baseline.
3. Source/platform matrix: 16 themes × six viewport/DPR/safe-area configurations × two platforms = 192 cases. Unpaused complete framebuffers remain byte-identical to v1.0.9, protecting the finite v1.0.6 scene boundary and orientation. All tested pixels outside the logical design rectangle receive the intended 0.84 shade. Expanded and design-only overlays have identical pixels inside the game/modal. This checks 76,798,656 outer pixels and 306,559,024 inner pixels. The maximum observed shade rounding difference was 1 channel level.
4. Thirteen current inbound/outbound difficulty and rush control configurations additionally compare every control field to baseline, allowing only y −200.

## Initial failures retained and explained

- `host-first-pass-report.json`: eight strict byte-equality failures at 540×960 CSS with DPR 2. Only the yellow primary button differed: 481 red-channel values on a single cropped row were 244 in the old location and 245 in the new one. No other row/channel differed; secondary buttons were byte-identical. `gradient-quantization.mjs` reproduces the same one-row difference using the unchanged v1.0.9 gradient function with exactly the same endpoints and height at y=1090 and y=890. The final host test asserts this exact row, channel, delta and count; it does not allow arbitrary perceptual error. The additional 512×768 cases require strict byte equality. The complete assets.ts bytes and drawControl implementation are unchanged between the two sources.
- `source-matrix-first-pass-report.json`: 112 transform-geometry assertions initially used a 0.000001-physical-pixel bound. Native Canvas stores transform components at finite precision. The final geometry-only bound is 1/64 physical pixel; actual inner framebuffer equality and outer shade pixel assertions were not relaxed. The other 93 cases had already passed.

## Reproduction

Requires Node 24+, dependencies already installed for the source checkout, and the regular/bold Noto CJK fonts under the standard Linux font directory. No package installation is performed.

Supply these environment variables or matching flags:

- `SOURCE` / `--source`: candidate source checkout
- `BASELINE` / `--baseline`: v1.0.9 source checkout
- `BUILD` / `--build`: candidate root containing browser/ and wechat/
- `OLD_BUILD` / `--old-build`: v1.0.9 production root containing browser/ and wechat/
- `OUT` / `--out`: an independent evidence directory, outside both source/build trees

Run `node --expose-gc independent-ui-host.mjs`, then use a different OUT for `node --expose-gc independent-source-matrix.mjs`. The minimal `gradient-quantization.mjs` requires only BASELINE and an existing OUT. UI_CASE_FILTER optionally selects one existing viewport configuration; omit it for the full 40 cases.

## Artifacts and limits

Public JSON includes screenshot relative names and SHA-256 identities only. Screenshot PNGs remain separate private review artifacts and are deliberately excluded from this package. Synthetic zero-wallet/owned-theme fixtures are isolated QA data. This review did not test all modal types, all gameplay histories, real touch hardware, real font stacks on every operating system, or the full release process. It establishes the described pause-screen candidate behavior only.
