# v1.0.10 final-integration UI equivalence review

## Outcome

PASS: the fixed integration build passed the complete existing UI coverage again: 40 original-bundle host cases, 205 source/platform pixel cases, and seven approved-scene replays. All 73 compared PNGs have identical file bytes and identical decoded RGBA pixels to their original candidate counterparts. This includes all four user-approved pause screenshots, explicitly listed in `visual-equivalence.json`.

The user approved the four screenshots and requested packaging before this final integration check. Full-project regression is run separately by the integration owner; this UI evidence does not replace those gates. Final product-commit identity is supplied by the outer release binding. This review did not publish or modify production code, builds, or user data.

## Final identity

- Source SHA-256: `5603337328565937fc52115a15cd7396228d22ea422a38955ee0e7fe762e7b23`
- Browser app.js SHA-256: `2b412d1e6f92eac1fec1f10f3806c071c94b493d14ea57e43339e6fca291a0ae`
- WeChat game.js SHA-256: `b96a82c48de58b96c21a36d40081364f22c1008fa978680337496b99ce5a67f9`

The original approved candidate had source `78365d5545c4120564fb150aa077d01f31e7f37a088cb90469e4e3517749a3c7`, browser `5581f1c5788af39df7d290ab4b569eeefb3c50bccc4bd2c75f8d7275b218bcf8`, and WeChat `c25ec9161958c15528f7a6c5d3e5f0496773e2cae21395c8325c11da446faf9e`. The final source change extracts the unchanged shade helper into overlay.ts and corrects a transitive dependency version in package-lock.json. The same visual behavior is established by the new executions, not assumed from that description.

`final-binding.json` records final initial/end identities, script hashes and exit codes. Both original bundles are executed unchanged in native Canvas DOM-event/wx host simulations. This is not real browser GUI, WeChat developer-tools or physical-device evidence.

## Checks

- 40 host cases: two targets × four ordinary/endless inbound/outbound modes × five viewport configurations, including DPR 1/2/3 and a safe-area top offset. Real registered input callbacks verify every moved button, settings/help return, restart/home/finish cancellation, resume, old lower blank slots, side and board taps, orphan pointer-up and dragging out of a pressed control.
- 205 matrix cases: 16 themes × six viewport/DPR/safe-area configurations × two platforms, plus 13 current difficulty/rush control configurations. Unpaused complete framebuffers preserve the finite v1.0.6 background and orientation. The shade covers the full visible canvas; expanding it does not dim or change the modal interior. Control fields are unchanged except for y −200.
- 73 visual equivalence comparisons: 40 independent-host PNGs, 12 source-matrix PNGs and 21 PNGs from the seven original approved-scene configurations. Original file hashes are checked against their saved reports before comparison. New scene bundle hashes are checked against the final binding. PNG bytes and decoded RGBA pixels are compared separately; all are identical.
- Four approved after-screenshots: ordinary inbound, endless inbound, ordinary outbound and endless outbound. Each final image's bytes and pixel buffer exactly match the previously approved file.

No extra pixel tolerance was introduced for this final equivalence test.

## Historical initial-test diagnostics

`CANDIDATE-REVIEW.md`, the two first-pass reports and the original candidate reports preserve the initial review. Its earlier approval-pending wording describes that historical stage only.

The original strict host comparison found a one-level red-channel difference on one primary-button gradient row after translation at one physical scale. The unchanged baseline gradient function reproduces it; the host test now asserts its exact row, channel, count and delta. A separate scale requires strict byte equality for all 44 inset buttons. The original matrix also exposed native-transform precision under an excessively small geometry tolerance. Only the geometry bound changed to 1/64 physical pixel; framebuffer checks were not weakened. These historical diagnostics are unchanged and reproduced in the final build. They do not affect the zero-difference candidate-to-final PNG comparison.

## Reproduction

Prerequisites: Node 24+, existing source dependencies, standard regular/bold Noto CJK fonts, and Python with Pillow for screenshot comparison. The scripts install nothing and must write to a separate evidence directory.

For the host and matrix scripts, supply SOURCE, BASELINE, BUILD, OLD_BUILD and OUT environment variables, or their matching `--source`, `--baseline`, `--build`, `--old-build`, `--out` flags. SOURCE is the fixed source checkout; BASELINE is the v1.0.9 source; BUILD is the fixed root containing browser/ and wechat/; OLD_BUILD is the v1.0.9 production root. Use distinct OUT directories.

- `node --expose-gc independent-ui-host.mjs`
- `node --expose-gc independent-source-matrix.mjs`
- `node --expose-gc capture-approved-scenes.mjs` uses SOURCE, BUILD, OLD_BUILD and OUT.
- `gradient-quantization.mjs` uses BASELINE and an existing OUT.
- `compare-evidence.py --help` lists the old/new host, matrix and approved-scene evidence directories required for byte and RGBA comparison.

All screenshot files remain separate private review artifacts. This public technical package contains only scripts, reports, relative image names, hashes and documentation. The reports do not disclose absolute workspace paths or personal identifiers. Synthetic zero-wallet/owned-theme fixtures are isolated QA inputs.
