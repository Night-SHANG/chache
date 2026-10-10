# v0.24 shop, structural forklifts and retirement

Started 2026-10-10 13:02 北京时间（UTC+08:00）. Status: implementation in progress.

Approved bounded changes to v0.23: Back on the left and primary action on the right; preserve the four-tile same-screen paginated shop; rework nonbasic forklifts using four selected vector anchors; retire express_sorting, theme.express_sorting, cargo.taped, forklift.compact without losing historical account data. No gameplay, price or balance changes.

Reuse existing controls, pure appearance projection, strict historical account validator and A/B transactions. No new dependency or storage format. Historical art atlas indices stay fixed. The active catalog has 50 items and the shop 15 sets including classic. Historical ownership still permits all 53 original IDs. Browsing must not persist a migration; a later requested atomic transaction can normalize retired equipped slots while preserving rights, wallet, records and inventory.

## Verification checkpoints
- Footer regression observed RED at Back x684 instead of x132, then passed after shared paired-footer geometry.
- Ordinary item and set-member footer: Back (132,1640,264,150), primary (420,1640,528,150).
- Set/classic detail footer unchanged: Back (132,1692,396,150), primary (552,1692,396,150).
- Full aggregate tests, free/paid original-build host tests, artifact recovery and remote tree readback pending.
- Existing v0.23 baseline: 2516/2518 tests passed, two historical missing-master checks failed. These guards are retained. Browser GUI, WeChat developer tools and physical devices have not been verified.

## Delivery gates
Independent review, exact frozen source/build hashes, source ZIP extraction and rebuild, history-preserving GitHub backup with full-tree readback, then updates to the existing Library light and compact-source identities. No private feedback images in repository backups.
