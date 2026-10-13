# 单主包与外观加载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox tracking.

**Goal:** 按用户最终批准方案删除四套外观及套装页，输出待IDE验证单主包，修复三端预览全屏闪烁。
**Architecture:** 保留历史ID解析，投影已退役装备到经典外观；只保留单品导航。核心和预览就绪分离，带预算的近期缓存与低优先级帧间准备；构建移除分包并明确报告超限。
**Tech Stack:** TypeScript / Canvas / Node 24 / esbuild。
**Spec:** 用户最终范围覆盖此前 2026-10-13-art-loading-design.md 的分包、套装保留条款。

## Global Constraints
- 删除 neon_depot/neon_circuit/neon、field_station/field_supply/field、harbor/harbor_container/harbor、royal_store/royal_gold/royal。
- 只有场景/货箱/叉车单品页；无套装优惠或运行时套装动作。
- 微信单主包，不自动退回分包；大于4MiB仍输出明确待IDE核验报告。
- 音乐字节、音量、编码与其他玩法保持；历史存档金币、其他库存与进度不丢。
- 保留v114历史，不发布或上传。

## Review Focus
- 历史已装备退役ID：回退经典但不得改坏历史ownership/金币。
- 冷预览失败：局部错误，页面控制保持，重试触点不能触发购买。
- 快速切主题/确认取消：旧异步结果不盖新选择，近期缓存命中。
- 活跃游戏/隐藏：不启动低优先级工作，恢复不重复已有图。
- 原始包超限：报告数字与待验证，不删检查来声称通过。

### Task 1: Catalog/save retirement
Owner worker retire_cosmetics_safely; files application cosmetics/profile/account-profile/account-service/cosmetic-sets and tests.
- [x] Write failing retired-slot preservation and disabled-bundle tests; run red.
- [x] Implement active catalog filtering and safe projections without deleting legacy ownership.
- [x] Run focused tests and report remaining legacy expectations.

### Task 2: Single package assets
Owner worker implement_single_package; scripts build/static-art-assets, manifest/authoring metadata, WeChat platform and packaging tests.
- [x] Test no subpackages/loadSubpackage, missing removed preview shapes, unchanged audio; run red.
- [x] Filter runtime resources and generate matching manifest; preserve source/historical content.
- [x] Report main bytes, 4MiB comparison, IDE unverified; run focused checks.

### Task 3: Single-item shop and loading
Owner coordinator; economy-ui/shop-layout/session/renderer, resources/gate/requirements, entrypoints and own new tests.
- [x] Assert only three sections and ignored historical set actions; run red.
- [x] Remove rendered set routes and default to theme, retain individual purchase/equip logic.
- [x] Assert core-ready paint succeeds while preview pending, cancel/reentry cache hit, scoped retry safe; run red.
- [x] Add independent core readiness, optional preview dependency readiness, bounded recent image references, single foreground-priority loader.
- [x] Render pending/error only in existing 816x232 preview rectangle; retry complete pointer gesture only.
- [x] Add idle one-image-per-frame warm requests after successful home frame and hide/gameplay suppression.

### Task 4: Verify integrated branch
- [ ] Run lint, typecheck, full tests; report exact failures including two historical missing source-image failures.
- [ ] Run preflight, production build, Android staging verification.
- [ ] Render real screenshots for cold theme preview, ready, error/retry, three categories and retained confirmation return.
- [ ] Independently review, correct findings with tests, repeat affected checks.
- [ ] Commit coherent changes preserving history; report before any package delivery.

## Verification status before v1.0.15 final packaging
- Candidate 8235af2: full suite 3243 total, 3239 pass, four failures.
- Two outdated assertions (single-package directory and core-error request progression) corrected in 6f791ea; affected suites 13/13 pass.
- Two historical source-image fixtures remain absent: artifacts/v0200-art-source/cargo-wood-generated.png and artifacts/v0210-art-source/cargo-harbor_container-generated.png. Do not claim the full suite is green.
- Three current shop category screenshots were captured with the production renderer and real PNGs via native Canvas, not physical-device or browser evidence.
- Runtime resource count stays 32. Baseline already retired theme.express_sorting/cargo.taped/forklift.compact; omitting unreachable express scene/item removes a separately accounted 50,702 bytes. This is historical unused-resource cleanup, not a fifth active set retirement. Their original source PNGs remain preserved.
- Final v1.0.15 version bump, final regression/build, independent review and packaged-byte verification remain pending.
