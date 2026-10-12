# v1.0.11 移动端三项优化集成验证

## 发布边界

本轮是浏览器与微信本地体验候选，包含同落格预演复用、静态仓库背景缓存及触屏拖拽上提。基线为 `0143e3436934a8c627af5a9e354f6aba8907e1c6`。基线工作树及 v1.0.10 分支不改动。玩法、商店定价、历史存档、字体、布局和运行美术资产不变。

项目根、根锁文件、浏览器/微信正式构建清单使用 1.0.11。Android shell 根版本、原生 versionName、web staging 与合成验收 fixture 仅同步当前源码版本，避免把新源码误标为旧版；没有升级依赖、改变 versionCode、创建签名或 Secrets、编译 APK、执行模拟器或触发 Android CI。此前交付的 v1.0.10 APK 保持原样。

## 合流语义

触屏先按货件所在棋盘的 1.25 格上提投影，然后以 immutable state 引用、pieceId、投影落格匹配单项缓存。每次 move 都更新实际拖影位置；托盘、越界、cancel/down/up 使缓存失效。松手使用该次真实触点投影、最新状态和新的 preview，随后调用原始 dispatch，不能以缓存预演结果直接提交。

合流专项覆盖触屏同格 60 次微移仅一次预演/风险计算、拖影逐次更新、松手再校验；缓存合法后替换占用棋盘并直接松手会拒绝；拖回托盘后再入棋盘重新预演。鼠标、pen、unknown 和触屏 tap/tap 保持原落点规则。

仓库缓存仅包含平台底色、原始 clearRect 和 drawWarehouse；棋盘底纹、格态、货物、叉车、文字及 UI 不在缓存中，仍逐帧绘制。棋盘底纹缓存需要单独的合成像素证明与内存预算，本轮没有纳入。

## 证据与执行边界

最终完整检查、静态缓存逐像素比较、最终触控对照和计时结果在下方记录。实现单分支报告见 `mobile-drag-performance-verification.md` 与 `../artifacts/mobile-static-cache/report.md`；这些单项结果不能替代最终合流验证。

首轮完整合流测试执行3198项：3193通过，5失败，其中2项为历史母图缺失。新增3项都来自 Android staging 验证器仍固定 v1.0.10 整份根锁文件 SHA；两处根版本升到1.0.11后，整文件 SHA 必然改变。完整依赖图已逐字段与基线核对一致。只将严格 SHA 钉值同步为1.0.11当前锁文件值，并增加篡改传递依赖仍被拒绝的回归，不取消或降低锁验证。首次失败日志保留于 `artifacts/v111/full-tests-before-lock-pin.log`，随后重跑全量。

完整测试始终保留两个既有缺失母图检查，不降低断言、不跳过、不伪造文件：

- `tests/cargo-atlas.test.ts` 的原始母图核验，首先缺少 `artifacts/v0200-art-source/cargo-wood-generated.png`。
- `tests/v021-cargo-forklift-art.test.ts` 的增量图集母图核验，首先缺少 `artifacts/v0210-art-source/cargo-harbor_container-generated.png`。

运行 PNG 图集仍存在且未修改。母图全量重建不能声称恢复。Node 微基准、Canvas2D 栅格像素相等和云端浏览器验证均不代表实体手机或微信实际 FPS；实体设备、微信开发者工具、触屏舒适度与温升仍需本地体验验收。


## 最终组合结果

- 完整 `node --test --test-concurrency=2 tests/*.test.ts`：3199项，3197通过，仅上面2项母图缺失失败，0跳过、0取消，196.514秒。退出码保留1，不能称全量全绿。
- 组合输入/缓存专项50/50；升版锁/Android staging与receipt回归35/35。最终独立合流审查另做48项短测，全过。
- lint、typecheck、preflight、默认浏览器/微信构建、1.0.11付费正式浏览器/微信构建、Android web staging及staging验证均通过。Android输出只到网页staging，publishApk仍false，未编译或签名原生APK。
- 正式微信game.js为908,485字节；微信目录合计3,792,923字节，仍低于原1 MiB JS及4 MiB初始包门槛。最终源码SHA256：`88c52dd829d2ff790fef8f6b4f1e3d5db7184de83b9fd9c6e5ff3b65714a1993`。
- 根锁SHA256为 `29d75f7f45a4be544c4872725e5bf48a60b36c6a231fd1d4d907e24a239db3a5`，完整测试前后相同。根锁与Android shell锁对比基线，均只改变各自2处项目版本字段，全部依赖及resolved身份不变。
- 32帧拖拽预览/风险结果与冻结基线完全相同，包括同格、异格、无效格及出板；238帧背景缓存冷/热全RGBA通道一致（17主题×7视口×2），资源/变换/透明边界没有容差豁免。
- 最终真实Canvas触控对照包含实际缓存：每种指针冷/热像素一致且只分配一次背景surface。同一合成输入(540,1120)，鼠标拖影(540,1120)、预览/提交(3,4)；触屏拖影(540,970)、预览/提交(3,3)。白圈是额外标注的输入位置，不是产品UI。PNG及JSON见 `../qa/v111/touch-renderer-proof.png` 与 `../qa/v111/touch-projection-evidence.json`。
- 冻结基线工作树HEAD仍为0143e34且干净；Domain、商店内容、布局与assets没有改动。没有远端推送、Library发布或本轮APK动作。

## Node计时与静态调用证据

最终组合在空闲长测窗口后顺序重放公开引擎的8组真实可达状态，20次预热+240次计时。同格move的preview/risk调用从各260次降至各1次，所有状态checksum不变；使用生产指令尾段0–86条，没有人为堆大历史。

| 晚局模式 | 同格move p95毫秒，原→新 | 交替合法格move p95毫秒，原→新 |
|---|---:|---:|
| 普通 |2.1424→0.0014|2.1160→1.2991|
| 困难 |3.1015→0.0012|2.9160→1.8435|
| 专业 |3.5505→0.0007|3.3925→2.5046|
| 加急 |5.3406→0.0005|5.2700→2.9386|

加载真实图集、困难开局、day主题的静态仓库加帧准备方法调用6092→10，整帧9772→3690（约62.2%方法调用减少，不能等同于速度提升62.2%）。背景缓存之外仍有约1000次棋盘底纹方法调用，本轮不缓存它。

`@napi-rs/canvas` 的整帧render+同步全像素readback p50：360宽15.82→8.52ms，1080宽31.53→27.17ms，1440宽46.77→45.66ms。大画面受内存/readback开销影响；1440宽仓库单层p95还从27.47ms升到28.04ms，不用选择性统计暗示所有设备/场景更快。以上都是云端Node/native后端微基准，不是浏览器、微信、安卓实体手机的端到端帧时间或FPS。

详见 `../qa/v111/summary.json`、`preview-benchmark-before.json`、`preview-benchmark-after.json` 与 `warehouse-benchmark.json`。静态专项截图由pixel脚本最后生成；benchmark脚本也写同名native PNG，因此复现时先跑benchmark，再跑pixel脚本保留对应的宽屏像素差分图。

## 仍未验证

实际浏览器GUI、微信开发者工具、实体手机触感/帧率/内存压力/温升均未测试。静态任务尝试的云端Chromium被socket权限阻断，未记为浏览器通过。最终微信工程需要开发者使用原AppID导入验收；仍未上传、提审或公开发布。原始美术母图缺失仍是全量素材重建的明确限制。
