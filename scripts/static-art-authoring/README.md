# Static artwork authoring

This directory is authoring and preservation-test source only. Nothing here is imported by a runtime entrypoint or shipped in browser/WeChat/Android packages.

## Provenance

`src/` is an exact snapshot of all 192 source files from commit `dd847c3174466f0004111b8667a2ff45c563e889`. The full import graph is retained so historical visual tests can import unchanged painter modules, without importing the replacement runtime painters. `sources.json` hashes every frozen source and the three existing material PNGs. The existing cargo, board and scene material PNG bytes are never modified. The obsolete themed-forklifts PNG remains in source/history, but is not a production resource; all 19 vehicles use the current complete frozen structural painters.

## Rebuild and verify

Run `node scripts/generate-static-art.mjs` with the repository's pinned `@napi-rs/canvas` 1.0.10 and Node 24 environment. The generator writes 75 PNGs, the typed runtime manifest, and `resources.json`. Run `node --test tests/static-art-assets.test.ts` to verify all 78 resources, regenerate every PNG in memory and compare encoded bytes, and check frozen-painter/atlas packing parity. Build/preflight use `verifyStaticArtAssets` from `scripts/static-art-assets.mjs`; that helper does not render or allocate canvases. It binds the TS manifest to the exact generation manifest, validates source or packaged paths, and verifies dimensions, encoded and decoded hashes. Authoring-source checks also bind generator input hashes.

The PNG codec uses adaptive lossless filtering and deterministic zlib level 9 compression. It neither resizes nor quantizes. Decoding verifies CRCs. Packing copies exact decoded RGBA bytes. Cargo and tool cells are rendered separately before packing: drawing directly at large atlas offsets can produce tiny native-rasterizer antialias differences. Frame side strips are packed clockwise 90 degrees and restored counterclockwise at runtime; tests reconstruct the complete original frame byte for byte, including corner rivets. Transparent outer classic-rack gaps remain transparent.

## Density, geometry and dynamic content

- 17 scene backgrounds: 1205×1920, logical rectangle (-57,0,1205,1920).
- 53 aspect-specific backgrounds: card 360×246, item 816×232, set 816×840; day/night classic detail 816×780. These are separate aspect-dependent renders, not crops or stretches of scene backgrounds.
- Four base and fifteen styled forklifts: 256×192 cells at 2× density, logical rectangle (-60,-44,128,96) for size 110.
- Core cargo: five complete classic colors, an unlabeled waste body, and a separate outline overlay. Seven 256×256 cells at 2× density avoid upscaling the large shop examples; logical rectangle (-6,-6,128,128) for size 110. Live traits/countdowns and the waste label stay runtime text.
- Tools/toolbox: four 256×256 cells. The fixed literal `90°` is baked from the frozen painter; dynamic quantities stay runtime text. Glyph rasterization is deterministic in the pinned authoring environment, not guaranteed across arbitrary host font installations.
- Classic frame: lossless 1024×272 packed strips. Existing board, cargo and scene materials retain original bytes and existing crop semantics.

## Package B

Day/night scene images, base forklifts, core cargo/tools/classic frames and board material are main-package resources. All preview backgrounds, nondefault scenes, styled forklifts, cargo material and scene material are in the local `cosmetics` package. Manifest keys do not depend on runtime paths. Source paths stay `assets/...`; optional runtime paths are `cosmetics/assets/...` on every platform. No hosted assets or external domains are introduced. Retired express_sorting/compact/taped assets remain compatible; this manifest does not alter shop membership or saves.
