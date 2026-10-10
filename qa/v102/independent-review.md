# v1.0.2 independent scoped review

Result: PASS. No blocking issue remains in the reviewed quantity-discount change.

## Frozen subject

- Product commit: `27f59a44b280add90a346c2ac560b75e36a7093d`
- Compared with v1.0.1: `fc0d90626f99dc8ee940e64fe59c81b1f1cbf50d`
- Source SHA-256: `fe2a288bbbed4abd4a9d47214454173e64493faf60c9b0fc71d12630cdbc745e`
- Paid game.js SHA-256: `d7e5e2237839780799137198a0420fe851ed0753a0dedcef0721219fe323d395`
- Paid app.js SHA-256: `2216a2e14530208d13da51f04820505cf87303f64f27383ea42c6b1ac479a4ea`

The frozen source and executed paid bundle hashes remained unchanged during the independent runs. No product files were edited by this reviewer.

## Fresh independent results

- Domain and compiled-service review: 9 groups passed, 0 failed.
  - 224 exact quote checks and 224 transactions: 14 fixed sets × all 8 owned subsets × paid/free policies.
  - 294 exact-wallet/insufficient-wallet boundaries.
  - 532 before/after storage-I/O fault cases across all 7 missing-member states and both policies.
  - 196 completed v1.0.1 receipt replays, including explicit-free receipts reopened in paid policy, without repricing or identity changes.
  - Old uncommitted partial-set quotes are rejected; fresh explicit confirmation is required.
- Original-output UI host review: 14 groups passed, 0 failed, 86 screenshots.
  - Unmodified paid app.js and game.js, all 8 ownership states, at 320/360/540 CSS-pixel widths.
  - All 7 insufficient-balance states on both outputs.
  - Classic white at 600, ordinary scene/forklift/cargo at 900/600/300, and blue/red achievement locks.
  - Actual stale-account transitions from 3 missing to 2, from 2 missing to 1, and wallet-only changes on both outputs.
  - Explicit free app/game builds, all 8 ownership states, zero-wallet claims.
- Original v1.0.1 runtime → original v1.0.2 runtime continuity: 2 groups passed, 0 failed, 4 screenshots.
  - Old app.js and old game.js each really purchased a partial set for 720 through their original input callbacks.
  - New outputs reopened the same saved bytes, retained wallet 6280 and completed ownership, and did not refund or charge anything.
  - A subsequent 2-missing-member purchase in another fixed set really debited 810, yielding 5470, and survived another restart.

Total: 25 independent groups passed, 0 failed; 90 screenshots. Group counts are not added to the owner’s unit-test count. Source-level receipt tests and actual old/new runtime continuity are reported separately.

## Requirements verified

- 3 missing members: 80%, total 1440.
- 2 missing: 90%; scene + forklift 1350, scene + cargo 1080, forklift + cargo 810.
- 1 missing: original single-item price 900, 600, or 300.
- 0 missing: no new charge and no purchase control.
- Only the currently missing members determine quantity and price. Owned members are never purchased again. Integer prices remain safe integers.
- Detail CTA, discount text, confirmation quote, balance preview, and actual persisted debit agree.
- Two-member details and confirmations show 9折; one-member details show 剩余1件 · 原价… and the confirmation shows 原价. Partial-set details/modal do not retain the old 8折 label.
- Current paginated cards retain their owned-count layout. The list summary says 补齐3件8折、2件9折、1件原价. The retained legacy card-status helper also now uses the same tier function.
- Price-first CTA remains one line: `价格金币 · 购买套装`. Back stays on the left. No 还差 or 差额 is introduced.
- Footer geometry stays x132/w264 on the left and x420/w528 on the right, height150, gap24; set row y1692. Purchase font stays 800 42px; Back 800 32px; equipment 800 36px.
- Largest checked purchase label measures 395.05 logical pixels within 480 available. There is no newline, reduced purchase font size, or Canvas maxWidth squeezing.
- Cancellation and repeated confirm-release are neutral; purchases do not auto-equip; incomplete/failed storage states never publish partial rights; retries complete exactly once. Stale account confirmations do not charge until the user confirms a fresh quote.
- Old balances, owned rights, equipment, inventory, account epoch, and migration identity remain intact. No retroactive refund or charge occurs.
- Classic remains outside fixed-set discounts. Production remains paid; only explicit free builds claim without charging.

## Real host-font and visual inspection

Both installed NotoSansCJK Regular and Bold TTC files were registered under the exact production family `Noto Sans CJK SC`. This is not a generic alias/fallback-font check. The production 800/42px stack renders `1440金币 · 购买套装` pixel-identically to an explicit separately registered Noto Bold face:

- Sample pixel SHA-256: `a95345fef27e497ad291a8654198981ecae907ac780392699b9be688aeaf6bc3`
- Bold TTC SHA-256: `faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb`

Final painted pixels, glyph bounds, footer metrics and screenshots were checked. The reviewer directly viewed these examples:

- `ui/paid-app-320-mask-0-detail.png`: 3 missing, 1440 and 8折.
- `ui/paid-app-320-mask-1-detail.png`: 2 missing, 810 and 9折.
- `ui/paid-app-320-mask-3-detail.png`: 1 missing, 600 original price.
- `ui/paid-game-320-mask-1-confirmation.png`: 2 missing, modal 810 and 9折.
- `ui/paid-game-320-mask-3-confirmation.png`: 1 missing, modal 600 original price.
- `ui/paid-app-540-mask-2-detail.png`: 2 missing, 1350 and 9折.
- `ui/free-game-320-mask-1-detail.png`: explicit-free claim.
- `ui/paid-game-320-mask-2-insufficient.png`: disabled 1350 purchase with unchanged typography.

These inspected samples are legible without clipping or footer wrapping.

## Scope and source review

Only three product source files differ from the v1.0.1 baseline: `src/application/cosmetic-sets.ts`, `src/presentation/economy-ui.ts`, and `src/presentation/renderer.ts`. The change centralizes the 80/90/100 percentage and label policy, then uses it for quotes and relevant displayed copy. Catalogue items/prices, account format/transaction implementation, storage identities, game rules, assets, and button geometry remain unchanged.

The reviewer initially identified an 8折 hardcode in the retained card-status helper; the owner fixed it and added a red/green regression. The actual current paginated renderer displays ownership counts, not that legacy status line. An initial reviewer expectation that the current cards painted prices was therefore corrected after tracing original rendered labels and renderer source. That exploratory assertion failure is preserved under `exploratory/`; it is not a product failure and contributes no final passes.

The independent domain runner also ran against the exact v1.0.1 baseline. It rejected the old 720-versus-810 quote, old balance threshold, and acceptance of obsolete quotes as expected. That intentional red result is preserved under `baseline-domain/`.

## Evidence and reproducibility

- `review-domain.mjs`, `domain/report.json`, `domain-run.txt`, `domain-run.exit`
- `review-ui.mjs`, `ui/report.json`, `ui-run.txt`, `ui-run.exit`, per-screen PNG/JSON files
- `review-continuity.mjs`, `continuity/report.json`, `continuity-run.txt`, `continuity-run.exit`
- `baseline-domain-run.txt` and `baseline-domain/report.json`: intentional baseline-red verification
- `SHA256SUMS`: evidence file hashes

The runners accept `REVIEW_ROOT`, `REVIEW_BUILD`, `REVIEW_FREE_BUILD`, `REVIEW_BASELINE`, `REVIEW_OLD_BUILD`, `REVIEW_OUT`, and `REVIEW_COMMIT` as applicable. Run from the workspace root with Node24; use `node --expose-gc` for UI/continuity. The final run used the owner's frozen paid/free builds under `v102/artifacts/v102-frozen/`, and the prior production build under `v101/artifacts/v101-frozen/paid`.

## Limitations

- This is original app.js DOM-event/native-Canvas simulation and original game.js wx/native-Canvas simulation. It is not Chromium, real WeChat, WeChat developer-tools, or physical-device validation.
- Only the available Noto host fonts were proven. PingFang and Microsoft YaHei on physical devices were not tested.
- All accounts are isolated, validated QA fixtures; no real player's account was touched.
- This review does not claim a separate full repository-suite run. The implementation owner reports 2715/2717 tests passing with the same 2 pre-existing missing-art-master failures, plus passing lint/typecheck/preflight. Those 2 tests are not counted as passing here.
- This is a scoped pricing/UI/state review, not a general product redesign or accessibility certification.
