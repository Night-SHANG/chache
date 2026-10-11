# v1.0.4 independent review

Result: PASS for the scoped background-width repair, with environment and historical-artwork limits disclosed below.

## Exact production binding
- Commit: `3a75d7e64b880361f2a8b52046009e578d47e86c`
- Tree: `baea2a4db95ef78c0510d6005eeaebf25d7cad72`
- Final frozen paid bundle: `../scene-width-current/paid`
- Browser SHA-256: `4e1da08bca45be5525a8204bf62bf4584c3851db17769d83f2adb5b5e8ece64d`
- WeChat SHA-256: `ba904bb23da1e5a7eb07e5ce328b4db1fa09ffc64b2db48fc2087b29cf213f6d`

## Independently executed
- 70 baseline/candidate production-bundle frames via native Canvas/DOM-event host simulation. Covers all 16 currently offered themes (day/night + 14 new), browser and wx entrypoints; selected 432×768, 390×844, 768×1024, 844×390, DPR2 and wx safe-top cases; menu and inbound game samples.
- Central pixels, all recorded text/bounds and account snapshots remain equal. Day/night full frames remain equal. Standard/tall no-side-margin full frames remain equal.
- 44 non-default wide cases: zero original empty side-color pixels remained in measured side region.
- 32 production-bundle shop previews: all 16 themes in both hosts, entire frames, controls and accounts exactly equal to v1.0.3. Therefore the main-scene extension does not leak into bounded previews.
- 40 focused art-preservation, preview-cache, scenery-width and platform tests passed. Diff whitespace check passed.
- All 34 packaged asset files are byte-identical to baseline.
- Both 70-frame and 32-preview final passes bind to the frozen paid SHA values above, after full-suite builds were finished.

## Source and visual review
Only the scene-specific outer drawing path, optional platform background bounds, entrypoint forwarding and version metadata changed in product code. No input transform, UI/board geometry, economy, storage or gameplay module changed. No ads added. Default themes bypass the new drawing path. Original art/preview routines are unchanged.

Reviewed cold-chain, forest and harbor same-viewport comparison images, plus cold-chain/forest 844×390 images. The center is unscaled; no labels/buttons are mirrored. Side architecture is reflected, so additional partial pillars/doors are visible. At very wide landscape ratios the outer copy stretches horizontally; the center and UI do not. This is the documented bounded-cost fallback, not a claim of bespoke landscape art.

## Limits / known failures
- Real Chromium launch failed: `process_singleton_posix.cc:297 socket() failed: Operation not permitted (1)` and SIGABRT. Chromium sandbox was not disabled. These are host-simulation screenshots, not real-browser or physical WeChat evidence.
- Fractional-raster production central hashes exclude 2 physical pixels at each edge; integer-aligned focused tests separately compare the entire original central rectangle.
- Reviewed implementer full-suite log: 2743 total, 2741 pass, 2 fail. Failures reference missing `cargo-wood-generated.png` and `cargo-harbor_container-generated.png` historical master artwork. Independently confirmed both absent from the provided v1.0.3 ZIP. Runtime atlases remain present and unchanged. Do not report full suite as 100% green or claim original artwork regeneration is available.

## Evidence
- `candidate/evidence/report.json`: exact bundle hashes and frame metadata
- `candidate/evidence/comparisons.json`: individual comparisons
- `preview-evidence/report.json`: exact preview bundle binding and results
- `candidate/evidence/compare-{day,cold_chain,forest_depot,harbor}.png`: same-viewport before/after
- `focused-tests.log`, `asset-check.json`, `REVIEW.json`
- Repro scripts: `review.mjs`, `previews.mjs`; set `REVIEW_BUILD` to the frozen paid directory.
