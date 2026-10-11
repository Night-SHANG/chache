# 《货箱最后一格》首个 Android 版本设计

记录时间：2026-10-11 23:28 北京时间（UTC+08:00）。状态：用户已于 2026-10-11 23:38 北京时间明确批准；产品代码尚未实施。

## 1. 本次真正新增的决定

游戏继续采用已交付 v1.0.10 的玩法、经济、图像、声音和存档格式。Android 作为长期维护的正式平台，不建立可丢弃的玩法版本。

- 应用名：**货箱最后一格**；固定 applicationId：**io.github.nightshang.chache**。
- 游戏与 Android versionName 均为 **1.0.10**；Android 首个 versionCode 为 **1**，以后严格递增，不从附件修订号推导。
- 用户已选择今晚先使用常规 Android 临时 debug 签名，长期签名另行办理。因此本轮是正式内容的手机验收构建，**不是可对外正式发布的签名产物**。文件名与交付说明必须标明临时签名，不用测试玩法或免费商店冒充正式内容。
- 换长期签名后不能保证直接覆盖这个临时 APK，可能需要卸载；卸载会删除应用本地数据。因此今晚产生的进度不能承诺跨换签名保留。不得生成长期密钥、上传私钥或配置 GitHub Secrets。
- Android 有独立应用沙箱，不自动读取或搬迁浏览器、微信存档。Android 自身正常重启、杀进程重开及**同包标识、同签名**覆盖升级要保持进度。

## 2. 存档：保持既有事务，只补原生存储

推荐采用 **Android 自带 SQLite 的小型键值存储适配器，加受限同步 WebView 桥**。继续使用现有同步 StoragePort、warehouse.* 键、A/B 根、代际、幂等操作和分段历史；不把 AccountService、GameSession 或游戏规则全链改成异步。

选型已比较：

- Capacitor Preferences 使用异步接口，Android 实现的 apply() 不能以回读代替磁盘写入结果，不适合直接承接当前“写入后立即回读确认”的账户协议。
- SharedPreferences.commit() 能同步报告结果，但失败时内存值可能已经变化；当前代码会在 set 报错后回读判定是否提交，直接接入会出现误确认风险。避免该风险还需额外不可用状态与恢复策略。
- 成熟 Capacitor SQLite 插件可提供真实异步事务，是未来跨平台重构的候选；本次采用它需要改变账户与 UI 的同步成功边界，侵入范围大于 Android 薄适配。
- 原生 SQLite KV 直接复用系统事务。定制部分仅限协议适配、所有权与错误封套；不开放 SQL、任意文件路径或通用原生能力。

必须满足以下发布门：

1. 每次 set/remove 只有在最外层事务提交返回后才报告成功；失败先结束/回滚事务。后续读必须来自有效数据库状态，不能从未提交缓存读出“成功”。明确区分键不存在、I/O 失败、数据库损坏及不支持的版本。
2. 使用并回读验证 SQLite 持久化配置；不为了速度降低同步级别。禁止自动删除损坏数据库或以空档替代读取失败，保留原文件并显示可解释阻塞。
3. 只允许一个有效宿主拥有写权限，旧 Activity/WebView 被替换后失效；不能仅对每个方法加锁就假定账户操作天然独占。
4. 桥只提供 warehouse.* 范围的 get/set/remove/listKeys，验证参数、长度和响应格式，使用绑定参数访问数据库。加载来源限定应用自带 HTTPS origin，拒绝外部导航、iframe、动态远程脚本和任意文件访问。
5. 同步桥不得等待主线程回调。对长历史、重复点击及后台中断测量保存延迟；发生明显卡顿或安全验证失败时不能带病交付，先报告并调整适配方案。

可靠性承诺针对正常退出、系统杀进程、写入失败保护和兼容覆盖升级；不宣称手机硬件损坏、卸载或所有极端断电都绝对无损。

## 3. 已认可手机适配的实施边界

- 使用 Capacitor **8.5.3** 薄壳和本地离线资产；不引入 Ionic UI、React、Compose 或网络账号。
- 独立 Android 入口和构建 staging，复用 v1.0.10 规则、渲染和资产。现有浏览器/微信入口与已交付文件不替换。
- 手机竖屏、沉浸式；原生 AndroidX WindowInsets 为唯一安全区权威，覆盖系统栏、cutout、手势边界。停用重复的 Capacitor/CSS Insets 消费。全窗口画布负责背景与遮罩，1080×1920 交互空间在安全矩形内等比放置，触摸使用同一逆变换。窗口改变撤销旧触点。
- 系统返回先取消顶层确认/工具选择，再返回子页；局内先暂停，根菜单交系统回后台。不得用浏览器 history 代替游戏页面状态，不因返回自动结算当前局。
- 前后台接既有 session.hide/show，合并重复事件，停输入和后台音频；恢复时重新测量窗口，保留暂停与用户音量选择，不补跑积压时间。
- 针对实际 Android/WebView 能力做启动检查，缺失能力明确阻断，不伪造单写锁成功。最低 SDK24 只是编译支持下限，未经设备测试不承诺所有旧 WebView 都可用。

## 4. 隔离、CI 与验收

只在 dot 云电脑独立副本和 dev/android-v110-release 分支工作。原生基线 51b07d03db07dd20f4f032bfeab0bd8f9cc1e8cd；远端新增分支继承 c12f83781e3b1dacd021e9cfd83d1328dbba0e3c，不覆盖 release/v1.0.10，不强推，不删除历史。

工具组合：Node **24.19.0**、npm **11.9.0**、JDK **21**、Capacitor core/cli/android **8.5.3**、AGP **8.13.0**、Gradle Wrapper **8.14.3**、compile/target SDK **36**、min SDK **24**、Build Tools **35.0.0**。附加插件固定兼容版本并记录锁文件；实际 runner、JDK 补丁和包版本进入构建回执。

仅 Android 分支 push 触发 GitHub Actions，不为手动按钮修改默认分支。权限以 contents:read 为限，官方 Actions 固定 SHA；无长期密钥、额外 token 或 OAuth。

验证顺序：

1. 配置/类型/lint/secret 和资源完整性检查；Insets、坐标、返回与生命周期回归；原生存储错误、所有权、重启恢复测试。
2. 运行既有完整游戏回归。两项已知历史母图缺失继续逐项报告，不删断言，不以 blanket continue-on-error 掩盖新失败。
3. 真实 Android 构建；检查 APK 名称、包标识、版本、离线资产、临时证书指纹、commit 和 SHA-256；签名产物不带免费商店或游戏开发诊断。
4. 模拟器/设备运行与原生存档恢复；真机重点为手势/三键导航、挖孔、边缘拖动、系统栏、返回、锁屏、切后台、音频、性能和离线冷启动。同签名连续构建验证覆盖升级，不用卸载重装替代。

dot 在 CI 触发后提供 run/commit，并自行读进度及失败日志，修复授权范围内问题至可核验产物或明确阻塞。编译、模拟器与真机分别记录，未执行项目保持未验证。临时签名 APK 不自动创建公开 Release、不上传应用商店。

## 5. 签名后续与审阅点

用户目前没有现有签名文件。长期密钥创建、保管和备份另做一次具体确认；用户亲自设置密码并保管私钥，不在聊天发送秘密。若未来采用 GitHub Secrets，私钥与密码由用户亲自在安全界面录入。今晚仅使用已授权的常规 debug 签名。

用户已批准：**固定正式身份、上述原生持久化边界，以及正式内容配临时签名的今晚交付范围**。下一阶段为明确的实现任务与验证计划；实现计划审阅通过后开始产品代码。

## 官方依据

- [Capacitor 8.5.3](https://github.com/ionic-team/capacitor/releases/tag/8.5.3)、[固定版 Android 配置](https://github.com/ionic-team/capacitor/blob/8.5.3/android/capacitor/build.gradle)
- [Preferences 实现](https://github.com/ionic-team/capacitor-plugins/blob/main/preferences/android/src/main/java/com/capacitorjs/plugins/preferences/Preferences.java)、[SharedPreferences.Editor](https://developer.android.com/reference/android/content/SharedPreferences.Editor)
- [Capacitor Community SQLite](https://github.com/capacitor-community/sqlite)、[Android SQLiteDatabase](https://developer.android.com/reference/android/database/sqlite/SQLiteDatabase)、[SQLite 持久化配置](https://www.sqlite.org/pragma.html#pragma_synchronous)
- [WebView 原生桥安全](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)、[WindowInsets](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
- [Android 签名与升级](https://developer.android.com/studio/publish/app-signing)、[AGP 8.13 兼容表](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
