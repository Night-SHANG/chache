# Android v1.0.14：统一启动画面

状态记录：2026-10-13 06:43 北京时间（UTC+08:00）。实施与验证中，尚未生成或交付本版本 APK。

## 范围与基线

- 用户批准把 Android 正常启动统一为同一个简洁画面，后台保留所有检查；首个完整游戏帧完成后直接切入，不人为增加最短等待。
- 本地源基线 `fe77382aab02d83ae2b4bab8755bad2444ca6c30`，tree `e9e9049b293cf65f9f71ac3b9d57cf9b1f7c30a0`；与已签名远端 `a1a7dec23055b9e1f6a030b864d7e4490c11d189` 的源树一致。
- 独立开发分支 `dev/android-v114-startup`。旧 1.0.13 Android APK、冻结微信/浏览器工作树和历史提交保留。
- Android 版本名 1.0.14、release versionCode 4；debug 验收夹具仍用 1/2。Android staging 记录 `sourceContentVersion: 1.0.13`，原正式游戏内容、浏览器与微信版本保持 1.0.13。

## 正常、失败与长期路径

既有 HTML 启动层立即显示“货箱最后一格 / 正在启动…”，不再先后更换“检查能力”“检查存储”两段文案。能力、可信来源、原生宿主、尺寸/Insets、存档读取与单写权限检查保持原逻辑；所需图片继续由原 StaticArtGate 准备。

初始资源等待期间，HTML 盖层保持不变，不绘制 Canvas 中间进度页。第一次完整游戏帧先绘制，再在同一次回调中隐藏盖层；绘制异常不会露出半帧。隐藏使用明确 CSS `[hidden]` 规则，避免作者级 `display:grid` 覆盖浏览器 hidden 样式。交接后不会每帧重复写入 DOM hidden 属性。

真实图片失败时，先画好现有错误/重试界面，再撤下盖层。沿用原重试、加载门禁、指针序列取消与游戏计时阻塞，不用默认外观替代坏资源。初始盖层仍在时，输入不能提前进入游戏；后台不绘制，恢复前台只继续原流程，已交接后不重新显示启动盖层。

独立于 app.js 的 CSS 延迟兜底在持续 12 秒后显示重新打开/WebView/存档保留说明；该延迟只控制详细说明，不控制游戏进入时间。即使 app.js 无法加载或解析，静态 HTML/CSS 仍提供信息。可执行入口捕获到的实际启动错误立即显示，不等待 12 秒。原生 Android 系统 SplashScreen 保持不变。

## 验证和签名边界

先运行启动状态、第一帧、错误、输入与生命周期回归，再运行 lint/typecheck/preflight 和完整回归。完整回归保留两项既有母图缺失失败，严格匹配原失败类型与数量，不宣称全部测试全绿。

实际浏览器帧捕获须与逻辑/离屏测试分开记录。首次本地 Chromium（保留 sandbox）启动遇到 socket EPERM，标准执行权限审核重试仍失败；在获得实际像素前，不能把捕获脚本存在写成视觉验收通过。Chromium 原生桥接测试宿主也不能替代 Android WebView、真实原生插件、物理手机或带档覆盖升级验收。

沿用已有私有同轮 build/sign 交接流程及长期签名配置，只修改版本、固定身份校验和产物名。不会生成新密钥、扩大权限、上传秘密、发布公开 Release、卸载旧应用或清空存档。

后续须补：独立审查、最终完整回归、精确远端 commit/tree、CI run/attempt、artifact 摘要、APK SHA256、版本身份、签名证书及用户交付回执。签名证书预期基线为 `0033e1a1078d85c73f4eef88184eba06e039b76d8e311c364a55500686bc1bdb`。

### 2026-10-13 06:50 北京时间（UTC+08:00）：启动源码与真实 Canvas 宿主检查

启动与版本身份的独立源码审查未发现严重/重要问题；69项针对性检查及68项补充检查通过（含5项重叠启动用例）。最终合并快照仍须重新跑完整回归。

原样 staging `app.js` 的 Node VM＋真实 `@napi-rs/canvas` 宿主已跑4场景27断言，保存8张实际游戏绘制PNG；首帧截图是在 `hidden=true` 写入之前取得，之后与完整帧像素一致。覆盖宿主/最后一图延迟、快速首帧、按住释放不穿透、新输入可用、前后台恢复、真实Image加载错误及重试恢复、20:9。记录和重跑入口：`scripts/verify-android-startup-canvas.mjs`、`qa/android-v114/host-canvas/canvas-receipt.json`。图像位于忽略目录 `artifacts/android-v114-startup/`，不包含用户上传图片。

这些是真实包的Canvas画面，不是浏览器截图。HTML盖层为DOM测试替身；CSS延迟的实际浏览器视觉、原生Android和手机验收仍未运行。保留完整Chromium回归脚本 `scripts/verify-android-startup-host.mjs` 与明确BLOCKED回执；既有云浏览器又因协议限制拒绝data:静态HTML导航，未绕过限制。

本轮另收到Android上下留白的窄范围修复需求，由独立视觉审查处理。初始直接cover方案会裁掉货架/主题装饰，未获接受；第二版也未通过。上述启动证据不是留白修复通过证明。发布暂停，等待保留画面与控制几何的修正、视觉复核、最终重跑。

### 2026-10-13 06:55 北京时间（UTC+08:00）：启动单项本地冻结，等待范围决定

所有未通过视觉审查的留白试样均已撤回，不进入候选。当前20:9原留白仍在；用户正在决定是否扩大为正式长屏/逐主题适配。未触发本版本CI、未签名、未发布或交付APK。

最终启动-only快照：lint、typecheck、preflight、Android sync及staging严格校验通过。完整 `npm test` 共3286项，3284通过，仅2项原母图缺失失败；0 skipped/cancelled/todo、0新增失败，原始exit为1，严格历史基线解析器accepted=true。不是测试全绿。报告见 `qa/android-v114/node-test-report.json`。

最终真实包Canvas宿主重跑4场景27断言并经独立审查复跑通过，8张实际绘制图保存；包摘要 `a02cbf627bdbe240b0e1d56a3dab16ddc305cadad0492fa9ad8e8f6257ef155f`。独立只读esbuild重编摘要与staging相同。HTML/CSS实际视觉、原生Android、签名包和手机仍未验收。

本地依赖沿用已安装的锁定版本目录。Capacitor sync因此生成了本机符号链接解析路径，已把 `android/capacitor.settings.gradle` 恢复到原有可移植相对路径；该文件最终无diff，干净CI安装不依赖本机路径。未改依赖或冻结工作树。
