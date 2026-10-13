# v119 Android / 浏览器 / 微信实现差异只读审计

审计对象：基线 `df32cd76639170666b6af559531c0c05541f5fd9` 上的 v119 工作树，2026-10-13 UTC。包含本次已完成的启动文字隐藏和安卓点击音量修改。本文不修改产品代码、不重复执行全套测试，也不把源码审计当作安卓真机运行结果。

## 结论

- **正常商店、外观分类、翻页、选中预览、购买、换装、开始游戏、暂停、返回和前后台恢复，没有安卓独有的图片加载页、进度条、转圈或“加载中”提示。** 三端走相同 `GameSession`、输入控制和 `renderer`，只在平台接口处适配。
- **安卓正常冷启动有系统级图标启动画面。** 项目通过 `Theme.SplashScreen` 配置启动背景和应用图标；没有自定义计时器或“加载中”文案。这与游戏内的加载遮罩不是同一个实现。
- **安卓仍有真实失败界面。** 包括游戏自己的“无法开始游戏”覆盖层，以及 Capacitor 在无法创建 WebView 时的英文故障页。它们不是正常路径中必经的额外步骤。
- **没有文字不等于零启动工作。** 原生存储打开/校验、桥接连接、等待真实窗口安全区、逐项试读存档仍先于游戏首帧。正常不显示提示；安全区永远不到的异常会静默等待，存在纯底色停留风险。
- **仍有合理的可见平台差异。** 安卓全屏/安全区、长屏主页纵向间距、背景延展、系统返回操作，以及 v119 的点击音量提升。没有新增游戏页面或玩法分支。

## 一、实际可见差异与触发

| 类型 | 安卓实现、触发与影响 | 源码依据 |
|---|---|---|
| 正常冷启动画面 | 启动 Activity 使用系统 SplashScreen 主题，显示配置的背景及图标。没有自定义加载文字、进度数或人为等待时间。显示行为/时长取决于系统和设备，未实机测量。 | `android/app/src/main/res/values/styles.xml:19–22`；`AndroidManifest.xml:19–22` |
| 原来的两段启动检查文字 | v119 HTML 的 `#startup-status` 默认为空且 `hidden`；JS 不再先写“正在检查本地存档…”。成功后再次清空隐藏。浏览器和微信没有此 DOM 节点。 | `scripts/build-android.mjs:18`；`src/android-main.ts:6–20` |
| 真正启动/绘制失败 | 只有 `fail(error)` 才解除隐藏，展示“无法开始游戏”、错误原因及“已有存档未被清空”。触发包括能力不支持、来源不正确、宿主/存储未就绪、桥接读取失败；绘制抛错也会显示并停止该运行实例。它不是读取进度界面。 | `src/android-main.ts:8,10–28`；`src/platform/android-host.ts:60–83` |
| 框架无 WebView 失败页 | **依赖里另有一页，不能只搜索项目的 Java/XML。** Capacitor 在创建 WebView 布局抛异常时，改用 `no_webview.xml`，大字显示 “This app requires a WebView to work”。仅 WebView 缺失或初始化失败触发，发生在游戏 JS 之前。 | `android-shell/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeActivity.java:27–31`；同依赖 `res/layout/no_webview.xml:6–13`、`res/values/strings.xml:2` |
| 主页布局 | 安卓将安全区中额外高度分配到主页 8 组内容的 7 个间隙；标题保持整体，底部信息跟随到底部。浏览器/微信没有 `androidContentBounds`，沿用原坐标。控件内容相同，触摸命中跟随同一布局。 | `src/platform/android-host.ts:89–93`；`src/presentation/home-layout.ts:3–20`；`renderer.ts:620–632`；`ui.ts:77` |
| 仓库背景 | 安卓在场景 PNG 已准备好、且视口符合条件时，对保护的物体区段保持比例，延展中间建筑条带覆盖长屏。缺图仍走同步回退，**不等待它加载**。加载完成可由原比例回退绘制切为安卓延展构图，是视觉切换而非加载界面。 | `src/presentation/warehouse-art.ts:10–19`；`android-warehouse-background.ts:35–73` |
| 系统栏、安全区与方向 | 安卓原生隐藏状态/导航栏，可滑出临时系统栏；综合系统栏、挖孔、手势区域的 Insets，竖屏锁定。浏览器使用 CSS safe-area；微信使用窗口 safeArea。 | `WarehouseHostPlugin.java:65–100,105–115`；`src/platform/android-viewport.ts:14–26`；`scripts/build.mjs:43–44`；`src/platform/wechat.ts:32–43` |
| 安卓系统返回 | 优先关确认框、工具选择、供货升级、详情；其他页面调用共用 back；游戏中首次返回打开**已有暂停界面**；已暂停/主页/结算等再返回移到后台。没有新“是否退出”页面，没有结算或清档。 | `src/platform/android-back.ts:4–15`；`WarehouseHostPlugin.java:93–99,145–150` |
| 返回后台失败提示 | `minimize()` 拒绝时写入“无法切到后台，请使用系统主页键”。不是独立弹窗；文字只在共用 `view.message` 绘制位置显示。主页/账户故障页不绘制该字段，因此**不能保证所有触发场景可见**。 | `src/platform/android-host.ts:117–119`；`renderer.ts:89–97,416–422` |
| 点击音量 | 安卓 `ui_click` 在原共用点击混音上额外 +6 dB；浏览器/微信点击常量不变。其他安卓效果音仍用浏览器的 0.45 主效果音量。声音按需创建且失败忽略，不增加任何等待页。 | `src/shared/ui-click-level.ts:1–6`；`src/platform/android.ts:83`；`browser.ts:61`；`wechat.ts:81–91` |

## 二、正常页面逐路径检查

| 路径 | 实际调用及是否多等待/多显示 |
|---|---|
| 空存档进首页 | 三端实例化同一 `GameSession`。安卓传 `standard`、浏览器/微信传 `tutorial`，但当前 `firstLesson=false`，构造时统一创建 standard；不产生安卓专属教程或首局界面。见 `session.ts:92–112`，尤其 95–101。 |
| 首页进商店 | `session.ts:294` 同步设置 `screen='shop'`，重复点击不重建；从首页进入重置到工具页。安卓没有第二套商店入口。 |
| 工具 / 外观切换 | `session.ts:295–296` 同步切 tab/section；`renderer.ts:773–788` 同一绘制路径。没有平台判断、准备状态或图片等待条件。 |
| 外观翻页 / 选中预览 | `session.ts:304–307` 立即切选中项；`renderer.ts:779–783` 调用同一个预览画法。预览按当前选择同步生成；没有安卓额外请求远程图片、遮罩或延迟定时器。 |
| 购买 / 装备外观 | `session.ts:287–309` 使用同一确认和同步账户事务；`equipCosmetic` 没有 await 图片。成功更改账户后下一帧准备对应场景图；当前视觉由回退画法立即显示。存储事务可能耗时，属于保存工作，非图片加载门槛。 |
| 开始入库 / 出库 / 加急 | `session.ts:193–213,278–281,312–315` 使用同一配置选择、准备道具页及启动事务。准备道具是已有用户操作页面，不是“资源准备中”。 |
| 暂停 / 继续 / 返回首页 | 共用 `session.ts:441–447` 和 `renderer.ts:109–110`；安卓系统返回只是增加调用入口，不增加页面。 |
| 切后台 / 回前台 | 共用 `session.hide/show` 保存/暂停逻辑；安卓额外同时依赖原生 Activity 和 DOM visibility，等待安全区重新测量后恢复帧循环。不显示“重新加载”或图片准备页。 |
| 存档损坏 / 未确认保存 / 只读窗口 | `renderer.ts:89,109` 的故障/恢复界面三端共用。安卓可以更早在创建 GameSession 之前拒绝打开损坏/不可读数据库，走独有启动故障层；不能把共用账户故障 UI 算作新增安卓页面。 |

三端调用证据：`src/browser-main.ts:17–23`、`src/wechat-main.ts:10–15`、`src/android-main.ts:14–23`。三个入口都调用 `prepareStaticArtForView`，函数是 void/fire-and-forget，不 await（`src/presentation/static-art-requirements.ts:7–18`）。加载器内部存在 `loading`、图片尺寸校验与错误字符串，但当前渲染和输入不据此阻塞。

## 三、安卓增加了哪些无 UI 检查或等待

| 阶段 | 检查 / 等待 | 影响与边界 | 依据 |
|---|---|---|---|
| Activity / 原生存储初始化 | 获得持久文件所有权；同步打开 SQLite；已有库先只读检查版本、quick_check、固定表结构，无 trigger/view；必要时先复制回滚日志到私有临时目录验证；随后检查持久化配置 | 首个网页加载之前有本地磁盘工作。会增加真实启动时间，但没有正常检查页面。不能为了隐藏提示删除这些保护。失败保留原库，不伪造空库。 | `WarehouseHostPlugin.java:47–64`；`storage/WarehouseStore.java:38–50,107–150`；`storage/RecoverySnapshot.java:23–59` |
| 框架 WebView 版本判断 | Capacitor `isMinimumWebViewInstalled()` 查询系统 WebView 包版本 | 当前未配置 server.errorPath；不满足只日志报错，继续现有页面加载流程，不另加版本提示页。不能和 no_webview 创建失败页混淆。 | 依赖 `Bridge.java:305–325,329–374`；`android-shell/capacitor.config.json` |
| JS 能力检查 | 固定来源、Promise/Map/Set、数组方法、帧 API、performance、Image、Pointer capture、2D context | 当前入口一次、startAndroidSession 再一次，是重复的同步轻量检查；仅失败时显示故障文字。 | `src/android-main.ts:11`；`src/platform/android-host.ts:60–64,77` |
| 原生桥接握手 | 先订阅状态，再取当前状态，防止旧状态覆盖新生命周期事件 | 异步本地桥调用，无互联网验证、登录或检查进度页。桥接 promise 若永不完成也无产品超时提示。 | `src/platform/android-host.ts:35–56` |
| 尺寸 / Insets | 等待原生和 CSS 画布都有正尺寸，再验证安全区 | 每帧检查，无固定人为延迟，无截止时间；若永远没有有效尺寸，保持无文字底色，尚未进游戏。现有审计确认代码风险，未宣称真机已出现。 | `src/platform/android-host.ts:67–79`；`WarehouseHostPlugin.java:122–132` |
| 存档预读 | 检查 bridge 和 owner，列出 warehouse.* 全部键并逐个 get | Android 独有的 GameSession 前置同步预读；比仅进入共用账户读取更早发现桥接/读取错误；数据量和磁盘慢可影响首帧。无提示，不允许以删除安全检查来“优化”。 | `src/platform/android-host.ts:80–89` |
| 每次存取 | TS 协议/键/值校验；Java 真正所有权、库状态检查；写入使用 DELETE journal、synchronous EXTRA、事务 COMMIT 返回后才确认 | 普通操作的实际阻塞来自同步可靠存储；浏览器 localStorage、微信 wx storage 是不同宿主实现，但业务事务/账户规则共用。未测设备耗时，不能说额外检查“零耗时”。 | `src/platform/android-storage.ts:23–49`；`WarehouseStore.java:57–104,159–200`；`HostOwnership.java:49–73` |
| 每帧、触摸、音效、振动 | 重新测量视口/比例，检查 active、owner、lease；几何变化取消触摸；失效时暂停帧和输入 | 无检查提示；回前台/系统栏重布局期间可能短暂停帧，游戏会保持已暂停状态，需要沿用现有“继续”。这属于生命周期/安全区适配。 | `src/platform/android.ts:25–50,57–85,88–93`；`android-host.ts:94–123` |
| 静态资源 | PNG 解码后核对尺寸、控制保留引用；失败继续使用绘制回退 | 三端共用，并非安卓独有。背景/外观仍会在后台加载，正常界面不等待图，也不显示加载失败遮罩。 | `src/presentation/static-art-resources.ts:74–94,126–163`；`static-art-requirements.ts:15–18`；`warehouse-art.ts:13–19` |
| 离线来源 / 资源安全 | 固定 https://localhost、本地 assets、禁止外部跳转和文件/content访问、禁止 service worker 请求、CSP | 无在线更新、无下载资源页、无登录页；外部 URL 被拒绝，不弹外部浏览器。 | `MainActivity.java:8–14`；`FixedAssetWebViewPlugin.java:14–36`；`OfflineWebViewClient.java:22–41`；`OfflineServiceWorkerClient.java:14–29`；`scripts/build-android.mjs:18` |

浏览器也不是完全没有启动检查：`browser-main.ts:13` 异步获得 navigator.locks 单写者；拿不到则使用共用只读提示（`writer-lease.ts:2–13`、`session.ts:137`）。微信主上下文使用 held lease，并有独立 wx storage 格式/容量校验（`wechat.ts:55–61`）。

## 四、遗留、测试和打包检查

1. 对 `src` 中文字面量以及 `\uXXXX` / `\u{...}` 解码后搜索“加载/载入/检查/准备中/请稍等/读取中”、spinner 和常见等待符号，并追调用，不把关键词命中直接算可见提示。
2. `static-art-resources.ts` 仍保留 warm、prepareScene、retry、readiness 等辅助 API；当前产品源码除定义外没有调用 `warmStaticArt`、`setStaticArtWarmPaused`、`prepareStaticArtScene`、`retryStaticArt`、`staticArtKeysStatus`。这些保留代码不等于仍有准备/重试页面。
3. 产品原生 Java/XML 没有 Dialog、Toast、ProgressBar 或 Spinner。Capacitor WebChromeClient 有标准 JS dialog 实现，但 `src` 没有 alert/confirm/prompt 调用，因此不是普通游戏路径新增弹窗。
4. androidTest 的 acceptance.js、测试控制桥、采样定时器、Thread.sleep 位于测试源码和单独测试资产集。`android/app/build.gradle` 的 sourceSets 指向 androidTest；产品构建入口为 `src/android-main.ts`。审核时没有将测试界面误算为产品界面。
5. 用 esbuild **仅内存构建**三套正式入口（write:false，不改现有 build 目录，不跑全套测试）核对实际输出。三套输出均没有所查常规加载文案，也没有 `WarehouseAcceptance*`、`__ANDROID_ACCEPTANCE_*` 或 `__WAREHOUSE__` 测试控制。Android 独有“无法开始游戏”，与源码结论一致。机器可读摘要：`android-platform-import-audit.json`。
6. 内存入口对比显示 Android JS 约 706 kB，浏览器约 678 kB、微信约 677 kB。安卓包含 Capacitor 以及额外保留的部分 replay/随机数模块；这些是包内代码差异，**未发现产品调用这些额外保留部分进行新的开局回放检查，也不代表增加 UI 或远程下载**。此处数字仅审计构建参考，不替代正式包校验或设备启动测量。
7. 仅就生产逻辑，v118→v119 的可见改动是隐藏正常启动提示与安卓点击音量；本次没有修改安全区、原生存储、生命周期或其他产品逻辑。

## 五、边界与建议

- 可以明确回复“正常商店等路径没有安卓额外加载界面”；不宜回复“安卓已和浏览器/微信完全一样”或“完全没有加载/检查”。系统启动画面、失败页、布局、安全区和持久化仍有差异。
- 当前静默启动会失去旧 HTML 文案对 JS 解析/执行前失败的兜底：若脚本根本没执行，`fail()` 也没机会显示，用户可能只见底色。已知具体 WebView 能力异常在 JS 可运行时才可给出中文提示。此项是此次隐藏提示后的边界，不建议为正常路径重新加检查文案。
- Insets/桥接永不返回的异常目前没有终止条件；运行中所有权丢失或几何失效会 fail-closed 暂停，错误状态未必刷新到屏幕。可作为单独异常恢复改进讨论，**本次未擅自更改**。
- 没有执行安卓模拟器/真机，因此不能报告系统 splash 实际时长、磁盘检查耗时、音效真实听感或旧 WebView 故障页实际截图。启动音频任务已有的测试应由其原始日志认定，本文不重复背书。
