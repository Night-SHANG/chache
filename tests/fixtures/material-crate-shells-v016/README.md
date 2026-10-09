# Frozen pre-v0.17 material pixels

Captured before this task modified `src/presentation/assets.ts`, at source HEAD
`65dc903` (full revision in `hashes.json`). Its cargo/forklift painter is identical
to task baseline `670cea012fab4dc0742dae410634acdc36259a0c`.

These small checked-in fixtures are required by `material-crate-shells.test.ts`:

- `hashes.json`: classic and legacy outline, five cargo colors, eight traits,
  both countdown styles and independent outline, at 28.5185/36.6667/110 px;
  all ten forklift paints at 32 directions and those sizes plus 80 px.
- `normal-*.png`: transparent production cargoBox strips, at the exact sizes
  above, for measuring replacement of the old fine material details.
  Column order: classic, wood, reinforced, taped, toy_brick, paper_fold,
  insulated, space_case, outline. Cell width is `ceil(size) + 20`, with each
  cargoBox drawn at `(column * cellWidth + 10, 10)`. All use `cargo.cold`.

Generate with `node artifacts/v0170-material-production/render-material-production.mjs
--baseline` in a checkout of the source revision above, with that evidence script
copied in and the pinned `@napi-rs/canvas` dependency installed. The flag refuses
to overwrite a baseline. Do not regenerate the fixtures from changed production
code. The normal after-mode of the script does not write these test fixtures.
