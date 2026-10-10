# v0.24 shop, structural forklifts and retirement

Started 2026-10-10 13:02 北京时间（UTC+08:00）. Status: product and host verification complete; delivery restoration and final backup follow.

Approved bounded changes to v0.23: Back on the left and primary action on the right; preserve the four-tile same-screen paginated shop; rework nonbasic forklifts using four selected vector anchors; retire express_sorting, theme.express_sorting, cargo.taped, forklift.compact without losing historical account data. No gameplay, price or balance changes.

Reuse existing controls, pure appearance projection, strict historical account validator and A/B transactions. No new dependency or storage format. Historical art atlas indices stay fixed. The active catalog has 50 items and the shop 15 sets including classic. Historical ownership still permits all 53 original IDs. Browsing must not persist a migration; a later requested atomic transaction can normalize retired equipped slots while preserving rights, wallet, records and inventory.

## Verification checkpoints
- Footer regression observed RED at Back x684 instead of x132, then passed after shared paired-footer geometry.
- Ordinary item and set-member footer: Back (132,1640,264,150), primary (420,1640,528,150).
- Set/classic detail footer unchanged: Back (132,1692,396,150), primary (552,1692,396,150).
- Final serial suite: 2539 tests, 2537 passed, exactly two unchanged historical missing-master failures; zero skipped or cancelled. Lint, typecheck and preflight passed.
- Free and paid builds passed. Frozen original-build host: 80/80, comprising 66 game.js native cases, 12 app.js event-host cases and 2 source checks; 0 inherited cases.
- Historical registry and all8 ownership/equipment subsets tested in formats3/4, including all53 rights, mixed slots, A/B mirror faults, restart/retry and no-browse writes.
- Four basic and four selected anchor models preserve exact pixels; all14 active nonbasic models remain native with loaded atlas, have distinct opaque silhouettes, and have zero envelope spills at32 headings ×5 sizes.
- Independent non-art review found no actionable issue; root reviewed final art contact sheet and actual320px shop screenshots.
- Frozen native product88b04391bebb7b633e15ac6ef3baec900c58c0cc maps to remote d0e1da7e3b6f090507a11d8789e964d4d8edd6ef. Exact835-file tree bc0f76660e407e5ede7c197050b1f11db2ede25f and branch ref read back.
- Existing v0.23 baseline: 2516/2518 tests passed, two historical missing-master checks failed. These guards are retained. Browser GUI, WeChat developer tools and physical devices have not been verified.

## Delivery gates
Independent review, exact frozen source/build hashes, source ZIP extraction and rebuild, history-preserving GitHub backup with full-tree readback, then updates to the existing Library light and compact-source identities. No private feedback images in repository backups.

## Evidence and limitations
Recorded 2026-10-10 13:18 北京时间（UTC+08:00）. Compact host summary, independent review and validation logs are committed. Compressed full input/storage traces and representative screenshots are additional source-package evidence. All raw host screenshots are retained in a separate Library QA archive, rather than expanding every source backup. No private user feedback image is included.

The two blocked tests are `committed raster artwork verifies every generated source and exact encoded atlas` and `new generated atlas rows obey their incremental byte budgets and preserve source evidence`. Their historical source-file guards were not removed. Legacy atlas validation is explicitly separated from the current native forklift dispatch tests.
