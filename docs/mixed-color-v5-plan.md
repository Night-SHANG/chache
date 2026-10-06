# v5三档实施计划

依据mixed-color-v5-spec.md，用户授权仅混色比例对比，其余规则不加机制。使用共享工作树分文件TDD；阶段已验才提交/给备份worker，禁止直接并发推外部仓库。

1. Domain：新增v5 content/engine，复用固定出口/货线算法；新增pieceCellCargo helper，根types/路由/checksum/Replay接tier；四固定范围抽签，12图样、无板面fallback；冻结v1–v4。先红后绿核心/生成/golden测试。
2. Save/Profile：RunSlot目录扩为orders、旧color_exit与三个color_exit_<tier>；schema5严格字段/图样、禁止跨档；Profile三命名空间独立幂等和reset边界，所有槽统一枚举。单独坏档/写失败/旧档用例。
3. Session/UI：中央slot目录替换硬编码二槽；共同对比seed、三档选择/继续/新开与旧纯色入口；selector失败回滚、cancel零写、globalSerial/reset全槽保护；placed快照按每格货类。
4. 表现：底部候选、hover、drag按每格绘制；双色两色分带可见，准确列出要出与留下格；独立首次说明例图，绝不合并两色数量。沿用已验证运输、简化、音频时钟。
5. QA：fixed seed三档生成比例及有界整局经验采样，protocol/cap/command日志/Replay可复核，不自动调参；实际game.js三档、局部出货、档切换/取消、旧v4、三尺寸证据。同源全lint/typecheck/tests/preflight/build/旧host+新host。
6. 独立审查后固化版本0.5.0、测试/源SHA/截图和用户说明。把已在精简包验证的Windows便携启动helper纳入正式源；HTTP与Win32路径回归。一个<10MiB试玩包原ID替换；完整开发ZIP原ID更新，稳定Git bundle供授权备份worker。
