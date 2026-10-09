# v0.17 material pixel baseline

`whole-crates-v017.json` freezes the `cargoBox` bodies from commit `0c1f659` before whole-body material integration. The one authorized v0.18 waste label (`废弃物` → `废弃箱`) was already applied when the baseline was captured; no material, icon, theme, or forklift pixels had changed. This avoids treating the separately approved text correction as an art change.

Hashes are SHA-256 over RGBA pixels from `@napi-rs/canvas` 1.0.10, accumulated in exactly the nested order in `whole-crate-art.test.ts`: three actual sizes, five cargo IDs, eight normal/special states, and outline off/on. Each crate is painted at `(10,10)` on a transparent `140×140` canvas, with alpha 1 and large rush badge enabled.

To reconstruct from `0c1f659`, normalize only the waste `fillText` argument to `废弃箱`, then use the test's `digest` loop. The unchanged classic/outline/insulated/taped/toy-brick/paper-fold/space-case hashes must stay equal. The wood and reinforced hashes are retained as evidence that their body artwork was replaced.

The new atlas is generated from original, locally authored Canvas geometry in `scripts/cargo-material-painter.ts`, not from the user's references or screenshot captures. `scripts/generate-cargo-atlas.mjs` reproduces `assets/cargo-materials.png`; every build checks those exact bytes before packaging it.
