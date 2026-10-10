# v1.0.1 independent shop review

Verdict: PASS for the scoped paid-production presentation and behavioral checks below. No blocking or minor regression was found in the reviewed changes. This is native Canvas host evidence, not a real-browser or device certification.

## Exact reviewed snapshot

- Commit: `4659e28430bb70cf633a9c77cd2552d57d30167e`
- Tree: `d19e0719561d363af8b7430d9104c643fc781303`
- Product source SHA-256: `19b943271e3112342bde76585656f93bde47db4cd5655be1625dc095ac181ecf`
- Paid game.js SHA-256: `b92a973cee70aa1ab0fe3aea12987fb55eb59c487d24957855109af487085c52`
- Paid app.js SHA-256: `6866c68644c95b7f89088d84a098274ccd90ed14219c4441e3fc4d55f43b6d1d`
- Beginning and ending commit, source hash and bundle hashes were checked and identical.

## Fresh evidence

1. Original user references: both supplied PNGs were opened and inspected. They are not copied into this evidence directory or the repository.
2. Original paid game.js through wx callbacks and native Canvas: 320, 360, 540 CSS-pixel widths. Healthy.
3. Original paid app.js through DOM pointer events and native Canvas: the same widths. Healthy.
4. Reference states and purchasing: 15 scenario groups passed, 0 failed, 116 fresh screenshot captures. Every footer and modal was visually inspected through six footer contact sheets and one modal contact sheet; 12 representative whole-screen captures were also inspected. Healthy.
5. Independent focused source regressions: 96 tests passed, 0 failed, no skipped tests. Healthy.

`frozen/report.json` contains per-case results, exact controls, actual painted labels and fonts, glyph measurements, final-pixel witnesses, and screenshots. `frozen-run.txt` and `scoped-regression.txt` retain command output. `review-shop.mjs` is the independent runner and does not alter product source or bundles.

## Requirements confirmed

- Outline shows 装备 before use, 使用中 and disabled after use.
- While outline is enabled, classic shows 装备 and can be selected to clear outline in one durable transaction. Classic and outline do not both display 使用中.
- The historical outline-enable behavior still selects the classic base. Equipping another material afterward retains the existing overlay behavior. Classic now clears the overlay as specifically approved. Wallet, inventory and ownership are unchanged by equipping.
- Partial harbor set: `720金币 · 购买套装`; back label 返回. The original-price and discount row remains `原价900 · 8折`, with no deficit annotation.
- Insufficient scene: `900金币 · 购买`, disabled. Affordable cargo: `300金币 · 购买`. Their labels, size and font do not depend on affordability.
- Whole set: `1440金币 · 购买套装` fits on one line without shrinking.
- All paired footers reuse the existing single-item shape: left x132, width264; right x420, width528; height150; gap24. Sets/classic retain their existing vertical row at y1692, single items at y1640.
- Purchase typography is exactly `800 42px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif` in each actual paint. Equipment/using is 800 36px. Back is 800 32px, retaining the deliberate secondary hierarchy. These values are consistent within each role across pages and hosts.
- No newline, Canvas maxWidth compression, or reduced font size is used for the reviewed purchase CTAs. The longest actual purchase label measures395.05 logical pixels within480 available.
- Achievement lock, owned/equipped states, classic-white purchase, partial bundle, member entry/return, cancel, paid single purchase, partial-set purchase, explicit equip and reload were exercised through the original input callbacks.
- Purchase still does not auto-equip. Native observed deductions were300 for the single item,720 for the partial set, and240 for3 rotation tools. Storage survives reopening.
- Quantity modal remains legible at all widths. Decrement/increment,3-piece total, balance preview and confirmation were observed. Focused regressions include rapid confirm/cancel dismissal protection.

## Actual font verification

The native Canvas library does not automatically register the OS Noto family. The reviewer explicitly loaded the installed Regular and Bold TTC files under the exact production family and asserted that registration succeeded. This avoids testing a silent generic fallback.

The production42px/800 font stack and a separately named explicit Noto Bold face produced pixel-identical samples for `1440金币 · 购买套装`:

- Sample pixel SHA-256: `a95345fef27e497ad291a8654198981ecae907ac780392699b9be688aeaf6bc3`
- Bold font-file SHA-256: `faa5f3656a78b2e2d450d27fe8382c778bc2b6bb5ea29c986664a6a435056ceb`

Registry contains actual400/700 faces; the800 request resolves consistently to the loaded bold face in this host. Family, weight, size, baseline, bounds and final painted pixels were checked rather than only checking label strings.

## Source review

- `purchaseLabel` centralizes price-first labels for single, set, classic and tool controls.
- `shopFooterRects` is reused with the existing264/528 proportions.
- The existing shared `drawControl` draws all paired buttons, preserving their gradient, borders and font rules. No duplicate special set button renderer was introduced.
- `cosmeticEquipped` centralizes classic/outline status so tiles and footer agree.
- The only account mutation change is the approved classic-cargo selection clearing cargoOutline. The only session change removes the deficit amount from a rejected bundle-intent notice. Domain/gameplay, catalogue prices, bundle quote math, account schema and asset files remain unchanged.

## Coverage boundaries

- No Chromium, physical WeChat, WeChat developer-tools, PingFang-device, or Microsoft-YaHei-device claim is made. No extra browser permission was assumed.
- These15 groups are paid-production evidence. The implementation owner runs the separate explicit-free compatibility matrix; it is not included in this count.
- The full2605-test suite is not claimed by this reviewer. The implementation owner reported2603 pass and the same2 historical missing-art-master failures; they are not counted as passing or silently repaired.
- This is scoped UI/regression review, not a full accessibility compliance audit. Keyboard, screen-reader and physical touch behavior were not certified.
- The red baseline rejects the original outline/back-label defects. Its two exploratory other-material assertions were corrected after verifying historical outline-enable behavior; those discarded assumptions are not product regressions.
