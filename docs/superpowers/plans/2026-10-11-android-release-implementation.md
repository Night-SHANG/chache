# 首个 Android 版本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付《货箱最后一格》正式游戏内容的 Android 手机验收 APK，今晚使用已获授权的临时 debug 签名。

**Architecture:** 保留 v1.0.10 玩法、账户事务和资源，以 Capacitor 薄壳承载独立 Android 入口。增加原生 SQLite KV 同步适配、单宿主所有权、原生 Insets 和生命周期；复用现有 Canvas 渲染与输入协议。

**Tech Stack:** TypeScript、Android Java/SQLite、Capacitor 8.5.3、Node 24.19.0/npm 11.9.0、JDK 21、AGP 8.13.0、Gradle 8.14.3、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-10-11-android-release-design.md`；用户于 2026-10-11 23:38 北京时间明确批准。本计划只待执行安排审阅，不重开技术选型。

## Global Constraints

- 名称 `货箱最后一格`；applicationId `io.github.nightshang.chache`；versionName `1.0.10`，初始 versionCode `1`；compile/target SDK `36`、min SDK `24`、Build Tools `35.0.0`。
- 只在独立副本 `android-v110-work` / `dev/android-v110-release` 工作；GitHub 新分支以 `c12f83781e3b1dacd021e9cfd83d1328dbba0e3c` 为祖先。保留旧版本和历史，不强推。
- 保持 StoragePort、warehouse.*、A/B 根、幂等、历史协议；不重写玩法、经济或异步账户系统。原浏览器/微信入口和产物不混入 Android 交付。
- 本地 HTTPS 资产，无远程页面/脚本/iframe；安全区只由原生统一提供，不叠加 CSS/Capacitor Insets。
- 临时签名不作为正式发布签名；不创建长期密钥、不上传私钥、不配置 Secrets。相同包名且同签名升级才验证保档；更换长期签名可能需卸载。
- 验证分为 Node、原生测试、模拟器、真机；未执行写未验证。两项历史母图缺失精确报告，禁止跳过所有失败或修改旧断言求绿。

## Review Focus

- 提交失败但缓存已有新值：不得误报已保存；任务 2 用故障注入和真实数据库重开验证。
- Activity 重建后旧 WebView 继续调用：旧宿主必须失权；任务 2/4 测并发和替换。
- 手势栏暂显、挖孔或窗口变化：画面与点击必须一致且旧拖动取消；任务 3 测几何与真实 Insets。
- 连续返回、锁屏及重复生命周期事件：不自动结束游戏、不重复保存、不恢复后台音频；任务 4 测状态序列。
- 同签名覆盖安装及长历史存档：进度保留且无不可接受卡顿；任务 6 测覆盖升级和计时。

---

## 执行与分工

推荐逐任务由实现者完成，再由独立审阅者核对 spec 与代码；任务 2 和 3 在任务 1 接口固定后可并行，任务 4 合流，任务 5/6 验收。分工是原生持久化、Canvas/宿主适配、构建与 CI 三块；避免同时改同一文件。每项依次写失败测试、确认失败、最小实现、复测、提交；最后做整分支复核。

### Task 1：独立 Android 壳与可复现构建

**Files:** 新增 `capacitor.config.json`、`scripts/build-android.mjs`、`src/android-main.ts`、`android/`（官方模板）；修改 `package.json`、`package-lock.json`、`.gitignore`；测试 `tests/android-build.test.ts`。

**Interfaces:** `npm run build:android` 生成 `build/android/`；`capacitor.config.json.webDir='build/android'`。Android bundle 入口 `src/android-main.ts`，`__DEV_DIAGNOSTICS__=false`、`__PLAYTEST_FREE_SHOP__=false`、`__APP_VERSION__='1.0.10'`。

- [ ] 写配置/输出测试：`assert.equal(config.appId,'io.github.nightshang.chache')`；输出 manifest 断言 version `1.0.10`、pricing `paid`、diagnostics `false`；HTML 无 CSS safe-area 扣边、无远程资源，资产 hash 与现有正式构建相同。
- [ ] 运行 `node --test tests/android-build.test.ts`，确认因 Android 配置/构建缺失失败。先 `npm ci` 记录原有完整测试基线，再安装固定版 `@capacitor/core`、`@capacitor/cli`、`@capacitor/android` 均 `8.5.3`；只使用官方模板，不安装 IDE。
- [ ] 实现 Android staging：调用现有 production 构建生成可核验资源，再复制离线资产、独立 HTML 并单独 bundle Android 入口；不改现有 `scripts/build.mjs` 和浏览器/微信源码。正式实现完成前入口可清晰显示尚未就绪，不交付占位 APK。
- [ ] 固定上述 SDK/Gradle/JDK 组合，配置竖屏、游戏类别、同一正式身份；禁止网络明文/任意导航/文件访问，关闭外部自动备份以免许诺未经验证的跨安装迁移。忽略 `local.properties`、Gradle 输出、所有 keystore/密钥和机器文件。
- [ ] 运行 `npm run build:android && node --test tests/android-build.test.ts`；验证通过后提交 `build: add isolated Android shell and production assets`。

### Task 2：可靠原生 KV 与受限同步桥

**Files:** 新增 `android/app/src/main/java/io/github/nightshang/chache/storage/{WarehouseStore,WarehouseStorageBridge,HostOwnership}.java`；`src/platform/android-storage.ts`；测试 `tests/android-storage.test.ts`、原生 `android/app/src/androidTest/java/io/github/nightshang/chache/storage/WarehouseStoreTest.java`。

**Interfaces:** JS `NativeStorageBridge` 仅有 `get(key:string):string`、`set(key:string,value:string):string`、`remove(key:string):string`、`listKeys(prefix:string):string`，返回 JSON `{v:1,ok:true,value:T}` 或 `{v:1,ok:false,code:string}`（set/remove 成功 value=null）；`createAndroidStorage(bridge:NativeStorageBridge):StoragePort` 严格解码并抛错。原生 `WarehouseStore(Context)` 提供同名 Java get/set/remove/listKeys，桥实例绑定唯一宿主代际，所有调用核验所有权。

- [ ] 写适配测试：`assert.equal(store.get('warehouse.missing'),null)`；I/O/损坏/未来版本/无权限/非法 JSON 均 `assert.throws`；set 失败且重读仍旧值，现有 `commitAccount` 不得变成 acknowledged。覆盖中文和空字符串，与空档区分。
- [ ] 运行 `node --test tests/android-storage.test.ts` 确认模块缺失失败；原生测试先断言失败，再实现，不用 JS mock 宣称磁盘提交已验证。
- [ ] 使用固定私有库 `warehouse-v1.db`、schema 1、单表 `kv(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)`、绑定参数。限定 warehouse.*，key ≤256 个 UTF-16 单元、value ≤2 Mi 个 UTF-16 单元；校验 list 前缀，列表排序。先与所有现有合法存档样例核对上限，不截断值。
- [ ] 用系统 SQLite 外层事务，成功须等 `endTransaction()` 返回。选 DELETE journal + synchronous EXTRA 并查询验证实际值；不可用就阻断，不静默降级。异常结束事务；结果不明/连接失效时后续读抛错，绝不从缓存确认。自定义 corruption handler 保留文件；不 destructive migrate、不删库重建。
- [ ] 所有权锁覆盖宿主完整寿命和桥调用，替换宿主先撤销旧者；暂停不释放以便保存，销毁/明确替换释放；不支持第二进程。同步桥不等待 Android 主线程。除这四个 KV 方法不暴露 SQL/文件/任意执行。
- [ ] 运行 `cd android && ./gradlew connectedDebugAndroidTest`（需模拟器/设备，缺失即记录阻塞），原生测试验证重开读、rollback、提交异常、磁盘读取失败、损坏/未来版本保留、两个宿主和旧引用拒绝；Node 运行现有账户 fault 测试。通过后提交 `feat: persist Android saves through guarded SQLite storage`。

### Task 3：原生安全区与 Canvas 同坐标适配

**Files:** 新增 `src/platform/android-viewport.ts`、`src/platform/android.ts`、`android/app/src/main/java/io/github/nightshang/chache/WarehouseHostPlugin.java`；测试 `tests/android-viewport.test.ts`、`tests/android-input.test.ts`。

**Interfaces:** `NativeHostState={active:boolean,owner:boolean,widthPx:number,heightPx:number,insetsPx:{top:number,right:number,bottom:number,left:number}}`；宿主插件 `getState():Promise<NativeHostState>`、`minimize():Promise<void>`，发 `state`/`backButton` 事件。`computeAndroidViewport(canvasRect:Rect,state:NativeHostState):{safeRect:Rect,scale:number,origin:{x:number,y:number},overlay:Rect}`；`createAndroidPlatform(canvas:HTMLCanvasElement,storage:StoragePort,lease:WriterLease,state:NativeHostState):{platform:Platform,updateHost(next:NativeHostState):void}`。

- [ ] 写几何断言：1080×2400、上下 inset 100/80 时 scale=1、origin.y=250；逻辑 `{x:540,y:960}` 渲染后逆变换仍同值；边缘栏外触摸不命中。覆盖左右挖孔、横宽窗口、零尺寸/NaN 拒绝和 DPR 1/2/3。
- [ ] 运行 `node --test tests/android-viewport.test.ts tests/android-input.test.ts`，确认新模块缺失失败。
- [ ] AndroidX WindowInsets 取 systemBars/displayCutout/systemGestures 的逐边最大值，不相加；传物理像素和窗口尺寸，按实际 Canvas/CSS 矩形转换。停用 Capacitor 8.5.3 SystemBars 自动 padding，WebView 全窗口，背景/遮罩铺满、1080×1920 交互区 contain。
- [ ] 参照现有 browser 平台复用音乐控制器/音量与资源逻辑，在 Android 专用文件实现变换、pointer capture、窗口变更 cancel 全部触点；不重构原 browser/wechat 平台。输入与绘制使用同一 viewport。
- [ ] 运行上述测试加 `tests/browser-input.test.ts tests/account-platform.test.ts`；确认原平台无回归，提交 `feat: align Android safe viewport and touch coordinates`。

### Task 4：可信启动、返回与前后台

**Files:** 实现 `src/android-main.ts`；新增 `src/platform/android-host.ts`、`src/platform/android-back.ts`；修改 `android/app/src/main/java/io/github/nightshang/chache/MainActivity.java`、宿主插件、Manifest；测试 `tests/android-lifecycle.test.ts`、`tests/android-back.test.ts`、原生 `HostSecurityTest.java`。

**Interfaces:** `handleAndroidBack(session:GameSession):'handled'|'background'`；`connectAndroidHost():Promise<{state:NativeHostState,subscribe(callback:(state:NativeHostState)=>void):()=>void,onBack(callback:()=>void):()=>void,minimize():Promise<void>}>`。沿用任务 2 StoragePort、任务 3 Platform；只在真实 owner=true 时创建 held lease，失权立即置 busy。

- [ ] 写返回断言：confirmation→cancel；tool/toolbox→toolCancel；supplyUpgrade→supplyCancel；商店详情→closeShopDetail；帮助/子页走既有 back；运行局→togglePause；已暂停局和根菜单→background，绝不发 finish/home/close 自动结算。
- [ ] 写生命周期断言：hide、hide、show、show 只产生一次 hide/show；隐藏立即停输入/音乐/音效，显示不取消暂停、不补跑时间；新 owner 撤销旧写权限；反复返回不扣币、不重复结算。运行两项 Node 测试确认失败。
- [ ] 注册本地 WarehouseHost 插件和只承载 KV 的同步桥；检查 bridge 生命周期安装时序，确保注入在首次页面执行前。AndroidX OnBackPressedDispatcher 处理系统/预测返回，根节点 moveTaskToBack。原生与 DOM 可见状态合并，遵从现有 session.hide/show。
- [ ] 启动检查桥协议、真实所有权、2D Canvas、Promise/Map/Set/Object.fromEntries/flat 等实际所用能力；不支持时显示明确原因，不初始化新档。来源仅 https://localhost；CSP 限本地脚本/资源，frame-src/object-src none，禁止外部导航、弹窗、任意 file/content 加载，阻止远程 frame 获得桥。
- [ ] 跑 Node 测试及原生导航/恶意 iframe/旧宿主测试；产品不包含测试控制接口；提交 `feat: integrate Android lifecycle back and trusted startup`。

### Task 5：GitHub 构建、自主跟进与回执

**Files:** 新增 `.github/workflows/android.yml`、`scripts/verify-android-build.mjs`、`scripts/android-test-report.mjs`；测试 `tests/android-ci-policy.test.ts`；新增 `docs/android/BUILD-AND-SIGNING.md`。

**Interfaces:** `npm run verify:android` 校验 staging/配置；CI 产物 `warehouse-last-slot-1.0.10-vc1-temporary-debug-<sha>.apk`、`android-build-receipt.json`、测试报告和 SHA256SUMS；回执列本地/远端 commit 映射、工具版本、身份、证书指纹与真实验证状态。

- [ ] 写策略断言：只有 dev/android-v110-release push，permissions contents:read，无 pull_request_target/Secrets/长期签名/发布步骤；官方 Actions 固定完整 SHA、checkout persist-credentials=false，防止上传 .jks/.keystore。运行测试确认配置缺失失败。
- [ ] 用官方 checkout/setup-node/setup-java/upload-artifact；runner 固定 ubuntu-24.04，Node/JDK 取 spec 值。先探测 runner 已装 SDK，缺失组件仅由官方工具安装；遇新协议或权限边界停止说明，不自动接受未知条款。
- [ ] 依次 npm ci、lint、typecheck、preflight、完整 Node 测试、build:android、cap sync android、Gradle testDebugUnitTest/lintDebug/assembleDebug。完整测试的两项已知缺图按精确文件/测试名与 ENOENT 路径匹配归档；新失败必须失败，旧异常与总数公开，不给 npm test 虚报全绿。精确基线为 cargo-atlas.test.ts 的“committed raster artwork verifies every generated source and exact encoded atlas”（cargo-wood-generated.png），以及 v021-cargo-forklift-art.test.ts 的“new generated atlas rows obey their incremental byte budgets and preserve source evidence”（cargo-harbor_container-generated.png）；仅断言名称相同不足以放行。
- [ ] 发布前 secret 扫描与 changed-file 清单审阅；用现有 GitHub 连接在 c12f8378 上追加新树/提交，非强制更新新分支。仅上传项目源/测试/文档，不上传机器文件、临时签名私钥或日志秘密。先验证远端 ancestry/tree，再触发 CI。
- [ ] 用现有连接自主检查精确 commit 的 run/job/log/artifact，故障诊断→修复→新提交→复测直至产物通过或权限/环境阻塞；不等用户转述。通过策略测试后提交 `ci: build and verify Android acceptance APK`。

### Task 6：原生恢复、升级和手机验收交付

**Files:** 新增 `scripts/android-device-check.sh`、`docs/android/ACCEPTANCE.md`；扩充原生 androidTest 故障/宿主测试；构建回执与截图只进受控产物目录。

**Interfaces:** `bash scripts/android-device-check.sh <apk-vc1> <apk-vc2>` 使用 adb install -r，禁止以卸载重装冒充升级。vc2 为同次验收构建的升级证明，不改变游戏内容或降低版本号。

- [ ] 写原生验收用例：写历史前/中、B 提交后/A 提交前后分别杀进程，重新启动验证钱包、库存、generation、operationId 和历史一致；回执丢失重试不重复扣币。模拟器执行 connectedDebugAndroidTest，并报告真实 Android/WebView 版本。
- [ ] 同一 CI 作业内连续使用同一个临时 debug key 构建 vc1/vc2，先安装 vc1 玩出/注入测试专用 fixture，再 install -r vc2 验证存档。key 不上传/持久共享；不同 CI run 的临时 APK 不承诺互相覆盖。交付最终版本码按实际产物记录，不假称仍为 1。
- [ ] 最长合法账户历史测 100 次事务 p50/p95/p99/max 与主线程卡顿；若 p95>100ms、任次>500ms 或出现 ANR，暂停可交付结论，定位重复跨桥/同步 I/O，向 root 报告必要修正，不能关闭持久化换速度。
- [ ] 模拟器检查离线冷启动、返回、锁屏/后台、音频、触点取消和资源；真机由可访问设备或用户后续完成：手势/三键、挖孔、系统栏暂显、边缘拖放和后台恢复。没有真机就明确未验证，不阻止提供已通过自动检查的手机验收 APK。
- [ ] 最终依次重跑 lint/typecheck/preflight/完整 Node 测试/Android 新增测试/assemble；审阅整分支和 APK 实际内容、applicationId、versionCode、签名 SHA-256、付费模式、无诊断、离线资产。独立 reviewer 通过后交付可打开 APK、回执、run/commit 链接与尚未验证事项。
- [ ] 更新验收文档并提交 `test: verify Android recovery upgrade and acceptance build`；不自动 merge、创建公开 Release 或上架。

## 本次审阅只需确认执行安排

推荐采用以上分工的逐任务实现与独立复核；dot 完成代码、测试、GitHub 构建和失败修复后交付，不要求用户守着 CI。另一种选择是在同一会话直接实现后统一复核，速度较快但中途独立检查较少。长期签名仍按已约定另行办理，不是今晚编码/临时 APK 的前置条件。

自检：spec 各节已映射任务 1–6；存储/宿主/viewport 接口名称一致；五项 Review Focus 各有测试；无未定义的异步账户改造、生产凭据或发布步骤。状态：计划待审阅，产品代码尚未实施。
