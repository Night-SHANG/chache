# Static artwork authoring

This directory is authoring and preservation-test source only. Nothing here is imported by a runtime entrypoint or shipped in browser/WeChat/Android packages.

## Provenance

`src/` is an exact snapshot of all 192 source files from commit `dd847c3174466f0004111b8667a2ff45c563e889`. The full import graph is retained so historical visual tests can import unchanged painter modules, without importing the replacement runtime painters. `sources.json` hashes every frozen source and the three existing material PNGs. The existing cargo, board and scene material PNG bytes are never modified. The obsolete themed-forklifts PNG remains in source/history, but is not a production resource; the runtime exposes the 14 active vehicles through the current complete frozen structural painters. Unused historical cells remain within the unchanged shared atlas; they are not exposed through runtime sprite mappings.

## Rebuild and verify

Run `node scripts/generate-static-art.mjs` with the repository's pinned `@napi-rs/canvas` 1.0.10 and Node 24 environment. The generator writes the 29 active generated PNGs, the typed runtime manifest, and `resources.json`. Together with the three original material PNGs, the runtime contains 32 resources. Existing historical PNG files are retained in source/history but are not copied into builds. Run `node --test tests/static-art-assets.test.ts` to verify all 32 active resources, regenerate every PNG in memory and compare encoded bytes, and check frozen-painter/atlas packing parity. Build/preflight use `verifyStaticArtAssets` from `scripts/static-art-assets.mjs`; that helper does not render or allocate canvases. It binds the TS manifest to the exact generation manifest, validates source or packaged paths, and verifies dimensions, encoded and decoded hashes. Authoring-source checks also bind generator input hashes, including the active cosmetic catalog. Generator version 2 filters runtime resources and sprite mappings from that catalog; the frozen painter snapshot and its original source hashes stay unchanged.

The PNG codec uses adaptive lossless filtering and deterministic zlib level 9 compression. It neither resizes nor quantizes. Decoding verifies CRCs. Packing copies exact decoded RGBA bytes. Cargo and tool cells are rendered separately before packing: drawing directly at large atlas offsets can produce tiny native-rasterizer antialias differences. Frame side strips are packed clockwise 90 degrees and restored counterclockwise at runtime; tests reconstruct the complete original frame byte for byte, including corner rivets. Transparent outer classic-rack gaps remain transparent.

## Density, geometry and dynamic content

- 12 active scene backgrounds: 1205×1920, logical rectangle (-57,0,1205,1920).
- 12 item preview backgrounds: 816×232. Card, set and classic detail backgrounds are no longer runtime resources. Active item previews keep the exact original aspect-specific renders, not crops or stretches of scene backgrounds.
- Four base and ten active styled forklifts, using the unchanged historical atlas of four base and fifteen styled cells: 256×192 cells at 2× density, logical rectangle (-60,-44,128,96) for size 110.
- Core cargo: five complete classic colors, an unlabeled waste body, and a separate outline overlay. Seven 256×256 cells at 2× density avoid upscaling the large shop examples; logical rectangle (-6,-6,128,128) for size 110. Live traits/countdowns and the waste label stay runtime text.
- Tools/toolbox: four 256×256 cells. The fixed literal `90°` is baked from the frozen painter; dynamic quantities stay runtime text. Glyph rasterization is deterministic in the pinned authoring environment, not guaranteed across arbitrary host font installations.
- Classic frame: lossless 1024×272 packed strips. Existing board, cargo and scene materials retain original bytes and existing crop semantics.

## Single-package runtime

Every active resource has package `main` and a local `assets/...` runtime path equal to its source path on browser, WeChat and Android. WeChat declares no subpackages and calls no subpackage host API. No hosted assets or external domains are introduced.

The active manifest contains twelve scenes and their item previews plus eight shared atlas resources. Historical express_sorting/compact/taped and the retired neon, field, harbor and royal families remain represented in source/save history but have no active scene, preview or forklift mapping. Shared cargo/scene/forklift material images retain all original encoded and decoded bytes, so unused historical cells within these images are intentionally not physically removed.

Builds copy only manifest resources. `wechat-package-sizes.json` accounts for every raw main-package file, records an empty subpackage map, and reports bytes over the recorded 4 MiB limit without splitting or claiming acceptance. WeChat IDE processed upload size and physical-device validation remain separate, unrun acceptance steps. The source artwork, audio bytes, provenance hashes and final build checksums remain independently verifiable.
