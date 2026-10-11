# v1.0.5 independent background review

Result: scoped visual and regression review PASS. Parent inspected the final screenshot comparisons and seam zoom, then approved packaging conditional on the full matrix. The matrix subsequently passed. No product files were changed by this reviewer.

## Exact tested candidate
- Frozen paid directory: `../scene-width-current/v105-review/paid-candidate-seamfix`
- Browser SHA-256: `85534a47ecf9e1c972150c98db333e0776c67eca38d3265520c265407e17d493`
- WeChat SHA-256: `a5c315ecde01d43ba03e88e327032457d27418c7b617362580124a4190c60309`

## Visual review first
The user's 1356×660 v1.0.4 screenshot showed three repeated warehouses. The prior acceptance of mirrored side architecture was wrong. Central-pixel equality and filled margins alone are insufficient acceptance criteria.

Reviewed all 14 non-default themes in 1356×660 and 768×1024 contact sheets, plus original-size railway/cold-chain/harbor/forest 1356×660 frames, phone railway, classic phone comparisons and final 8× boundary zoom. The new sides contain only original theme base gradients and low-detail horizontal wall/floor bands. No second warehouse, fan assembly, complete door/frame, crane or train arrangement appears in the side extensions. No UI text is mirrored or stretched. Original central architecture is retained in its original position and size.

Classic reference uses day theme + classic cargo + yellow forklift at the identical 1356×660 window, 446×694 phone ratio and 390×844 tall phone ratio. Classic side darkness and slight original rack overshoot remain unchanged; the new themes fill peripheral atmosphere rather than copying the classic art or scaling central content. Parent explicitly reviewed these composition differences.

## A defect found and corrected before approval
The first v1.0.5 candidate still had a fractional-pixel alpha seam. At 1356×660, x492 had alpha158 while neighbors were opaque. A full matrix found 37 affected wide cases. Reviewer blocked packaging and supplied exact samples. The implementer changed the quiet backdrop to a continuous underlay, covered by the unchanged opaque central art. Final full-width checks find no transparent pixels in any measured scene row.

## Independently executed final evidence
- 136 baseline/final production-bundle frames: browser/wx; all 16 offered themes at 1356×660, 446×694 and 768×1024; selected standard/tall/landscape/DPR2/safe-top cases and inbound gameplay samples.
- Central pixels, all recorded text/bounds and account snapshots remain equal to v1.0.3. Day/night full frames remain equal. Standard/tall cases with no side margin remain full-frame equal.
- 100 non-default wide scene cases: all scene rows fully opaque across the viewport. Each side's per-row RGB range is zero, independently confirming no copied architectural pattern remains in the extension. Verified both native-Canvas JavaScript and Pillow/NumPy image scans.
- 32 production shop previews: all offered themes in browser/wx, entire frames, controls and accounts equal to v1.0.3.
- 82 focused art, preview-cache, scenery, seam and platform tests pass.
- 34 packaged assets remain byte-identical to v1.0.3.

## Evidence files
- `candidate/evidence/classic-baseline-1356x660.png`
- `candidate/evidence/classic-baseline-446x694.png`
- `candidate/evidence/classic-baseline-390x844.png`
- `candidate/evidence/seam-zoom-1356x660.png`
- `candidate/evidence/all-themes-{1356x660,768x1024,446x694}.png`
- Original-size individual PNGs in the same folder
- `candidate/evidence/report.json`, `comparisons.json`, `boundary-review.json`, `boundary-review-numpy.json`, `seam-samples.json`
- `preview-evidence/report.json`, `focused-tests.log`
- Failed-candidate proof: `boundary-before-seamfix.json`, `boundary-red.log`; final `boundary-green.log`
- Reproduction scripts: `review.mjs`, `previews.mjs`, `boundary-review.mjs`, `visual-sheets.mjs`, `seam-zoom.mjs`

## Limits
These are untouched production bundles executing in native Canvas/DOM-event host simulations, not real-browser or physical WeChat tests. Earlier Chromium startup failed with `socket() failed: Operation not permitted (1)`; the sandbox was not disabled. Core pixel hashes exclude 2 physical edge pixels to avoid fractional-raster ambiguity, but this review separately scans the full-width opacity and inspects actual edge colors. The implementer owns final full-suite/release verification; this report does not claim a fully green aggregate suite. APK work is out of scope and paused.
