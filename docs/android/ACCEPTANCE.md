# Android 验收：证据、恢复、覆盖升级和性能

## 当前结论与边界

本页是验收方法，不是“已通过”证书。真实结果以对应 commit 的 CI 产物为准。未执行的 Android 编译、模拟器和真机项目必须保留“未验证”。Node 的测试和计时不代表 Android SQLite、WebView、进程死亡或手机性能已经验证。

临时 debug 签名只用于本次手机验收。同一 CI job 的 vc1/vc2 可验证覆盖升级；不同 job 的临时证书不承诺一致。升级证明最终包为 versionCode 2，包名仍为 `io.github.nightshang.chache`，versionName 仍为 `1.0.10`。不得通过卸载、清除应用数据或降级来冒充升级成功。

## 可复现运行

先用正式内容的 Android staging 完成 `npm run sync:android`。使用当前已配置的官方 SDK/JDK，不接受新 SDK 协议，不改 KVM/udev/安全权限。Gradle任务显式限定 `:app:`，避免同时构建生成的Cordova库自身无关的测试APK。

```sh
node scripts/build-android-acceptance.mjs
cd android
./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest
# 在同一 job 中保留 vc1 及 androidTest APK，再使用同一临时 debug key 构建 vc2：
./gradlew --no-daemon --console=plain -PwarehouseAcceptanceVersionCode=2 :app:assembleDebug
```

`scripts/android-emulator-test.sh` 负责官方模拟器启动、上述两个连续版本构建以及实际设备驱动。它在退出时关闭本次启动的模拟器。独立调用驱动时必须显式指定一次性模拟器：

```sh
ANDROID_SERIAL=emulator-5554 bash scripts/android-device-check.sh \
  --disposable-emulator <apk-vc1> <apk-vc2> <androidTest-apk>
```

驱动拒绝未指定序号、非 `emulator-*` 序号和不能确认 `ro.kernel.qemu=1` 的目标。`--disposable-emulator` 明确允许清空该一次性模拟器中应用的 `warehouse.*` 测试数据。它不得用于用户手机或真实存档。不会执行 uninstall、pm clear、降级安装或强制修改签名。

默认输出为 `build/android-ci/device-acceptance/`。普通测试执行 `DeviceAcceptanceTest` 时会明确跳过，需要专用驱动逐项调用；跳过不能证明矩阵通过。

## 恢复与丢失回执

独立 androidTest APK 承载测试 WebView、测试控制器和测试 bundle。产品入口、StoragePort、账户事务逻辑及生产桥没有测试方法；产品 APK 中不允许测试 JS 资产、控制器名称或测试类。测试调用正式 `createAndroidStorage` → `WarehouseStorageBridge` → `WarehouseStore`，使用应用真实私有 `warehouse-v1.db`。不启动 MainActivity，避免同时创建第二个存储所有者。

测试固定使用现有 v9 golden trace 的真实可执行第 1–128 条指令。基线在第127条；第128条封装首个128指令历史块。每次测试先创建合法测试存档，运行真实账户服务，在以下位置阻塞，然后由主机 adb 对实际目标 PID 执行 force-stop：

- history-before：首个历史块写入之前
- history-mid：首个完整历史块已持久化，但历史阶段尚未返回，也未写 B 根
- b-after：B 根写入成功之后，事务逻辑尚未取得返回
- a-before：已验证 B，A 镜像写入之前
- a-after：A 镜像写入成功之后，事务逻辑尚未取得返回
- receipt-lost：关闭局的合法历史存档执行真实80币工具购买，A 已持久化而客户端未收到回执

history-mid 证明的是历史写入阶段被中断，不假称在单条 SQLite 写事务中间截断。SQLite 热 journal/提交异常由独立 WarehouseStoreTest 用真实数据库与 killed-writer fixture 验证。

检查点包含 action、phase、唯一 nonce 和原生 PID，写入后 fsync。驱动核对 PID，杀掉进程并确认退出，在新进程重新加载，检查钱包、库存、generation、operationId、完整历史指令数量及摘要。重新提交或修复，再次重试同一 operationId，必须保持同一代际和钱包，不能重复扣款。

## 同签名覆盖升级

1. 从实际 APK 读取包名、versionName、versionCode 和证书 SHA-256；要求 vc1→vc2 且证书相同，androidTest APK 也必须同证书
2. 对比两个产品 APK 的全部离线资产列表及逐文件 SHA-256，确保游戏内容没有改变
3. `adb install -r` 安装 vc1，测试 APK 注入合法历史和一次实际购买
4. force-stop 后以 `adb install -r` 安装 vc2，核验安装后的 versionCode=2
5. 在新进程加载并重试已有回执，比较升级前后完整账户摘要：钱包、库存、generation、operationId、历史和根摘要必须相同

不上传、不共享临时签名私钥。脚本构建过程中保留的 APK 只在受控输出目录，由最终交付流程决定是否提供手机测试包。

## 性能矩阵：每类100次真实账户事务

现有账户协议没有有限的“最长合法历史”：128条一个不可变块，链长没有全局上限，账户根正常上限496KiB，关闭上限512KiB。因此不能诚实地声称覆盖所有可能的最长历史。

保留以下三个明确、可复现的样本，每个都执行100次真实 setSettings 事务，计时包含账户校验、真实同步桥/SQLite提交、镜像验证与发布。fixture 生成单独执行，不混入计时：

- normal：无局历史和每日证明的普通账户，初始根约1KiB
- realistic：真实 replay 通过的150指令 golden 历史、1个历史块、1,460条合法每日证明（四年每天一次的负载），初始根约61KiB
- extreme：16,384条 schema 合法的合成历史、128个历史块、约12,531条合法历史每日证明，初始根约502,772字节；它不是完整游戏实际 replay 轨迹，作为账户协议极限压力数据单独标注

极限根目标为491KiB，给首次真实账户版本升级、操作回执及100次代际增长留出有限空间；历史深度不因此降低。每次必须 acknowledged，generation 恰增1，记录该次根字节数，任何超过496KiB的容量失败都使测量不完整，不能当作快速事务。报告保留初始/最终根大小、指令/块/证明数量、100个原始耗时、100次确认、p50/p95/p99/max、WebView事件循环延迟和 Android 主 Looper 延迟。

门槛保持 p95≤100ms、max≤500ms；原生主 Looper 延迟超过500ms也阻断通过。JS事件循环延迟体现Canvas/输入阻塞，Handler主Looper调度延迟也不是UI帧时长，两者均不能单独证明没有ANR；逐帧时间未测量。驱动单独比较events缓冲区中的目标应用 am_anr 事件，记录实际观察和缓冲区有限的限制。完成但超时的一个类别不妨碍继续测量另外两个类别，最终总状态仍失败。ANR、进程崩溃、缺少报告或不足100次确认都不能视为通过。每类原生执行上限24分钟，驱动等候25分钟；超时不截取较快样本求绿。

Node 原引擎对比可运行：

```sh
node scripts/android-baseline-comparison.mjs 100
```

它从原生基线 commit `51b07d03db07dd20f4f032bfeab0bd8f9cc1e8cd` 导出到新的临时目录，使用同一个测试 helper、同样的内存存储和缓存的官方构建依赖。不会修改还原备份或在其中安装包。原基线与当前分支的测量分别记录；这用于确认既有账户校验成本，绝不取代真实 Android 桥/SQLite 测量。云端Node和模拟器WebView的引擎/硬件不同，不能相减来归因Android桥开销；本次没有同一WebView内存存储对照，新增平台开销的因果归属尚未证明。

若极端或长期样本失败，保留数值和限制，不能关闭持久化、删除历史、改阈值或重写账户协议来求通过。可调查重复整根编解码、重复历史完整校验和同步跨桥次数；任何优化必须保持现有错误/回读/幂等保证并另行审阅。只有普通样本通过时，不得声称完整性能验收通过。

## 报告与失败语义

- `summary.json`：总状态，六个进程死亡阶段、覆盖升级、normal/realistic/extreme 的独立结果
- `crash-*.json` / `recover-*.json`：原生死亡检查点和新进程账户核验
- `upgrade-before.json` / `upgrade-after.json`：覆盖安装前后账户
- `performance-*.json`：各类100次事务和延迟，失败样本也保留
- `anr-report.json`：驱动期间实际观察到的目标应用 ANR 事件；帧时间明确未测量
- `android-api.txt`、`android-release.txt`、`android-build.txt`、`webview.txt`：实际系统和 WebView 版本
- `*-signature.txt`、`*-badging.txt`：实际 APK 身份及证书

退出0仅限全部必要矩阵通过；退出1为断言/测量失败或证据不完整；退出78仅限已观察到的 SDK/KVM/模拟器环境阻塞。报告缺失、旧 nonce、错误 action、只跳过测试，都失败关闭。没有产物不能合成“通过”回执。Node/lint/typecheck、原生编译、普通 instrumentation、专用驱动、真机分别记录。

## 产品和手机检查（人工/真实宿主）

测试 WebView 只验证账户持久化与桥，它不能证明产品 MainActivity 的 UI、宿主插件、Insets、Back 或音频。

另外记录产品宿主测试及模拟器的离线冷启动、返回、锁屏/切后台、触点取消、资源加载。headless `-no-audio` 模拟器不能证明扬声器可听声音，不能把“没有崩溃”写成音频通过。截图、ANR证据和回执只进入受控构建目录。

真机逐项验收：

- 手势导航/三键导航、挖孔、安全区和系统栏暂显
- 四边拖放、旋转/尺寸变化后的触点取消与画面坐标一致
- 重复返回不结算、不扣币；根页面最小化，暂停局保持暂停
- 锁屏、切后台、反复恢复不补跑时间，不在后台恢复音乐
- 真正断网的离线冷启动、全部图像/声音资源和实际可听输出
- 普通与长历史连续操作卡顿、掉帧、ANR

没有可访问真机时这些项目明确“未验证”。可由最终负责人评估是否交付带明确限制的手机测试 APK，但不把未完成的自动/手机验收描述为正式发布通过；不自动 merge、发布公开 Release 或上架。

## 2026-10-11 本地 Node 对照记录（不代表 Android 验收）

使用原始 `51b07d03db07dd20f4f032bfeab0bd8f9cc1e8cd` 与 Android 工作分支，三个样本各100次，共600次全部 acknowledged，完整原始记录保存在受控 `build/android-ci/node-baseline-comparison.json`。

- normal：原始 p95 3.43ms / max 6.81ms；Android分支 Node p95 3.74ms / max 6.33ms
- realistic：原始 p95 238.02ms / max 419.30ms；Android分支 Node p95 208.87ms / max 230.11ms
- extreme：原始 p95 2465.55ms / max 2994.39ms；Android分支 Node p95 2220.23ms / max 2433.34ms

两组最终根和历史摘要逐类相同，最终根大小分别1,276 / 61,510 / 503,011字节；每类均恰好 generation 101，没有将容量拒绝当成快速事务。account-store、account-service、history-store 三份实际账户代码与原始版本字节一致。

这说明大记录成本在原始引擎已经存在，realistic/extreme 的 Node p95 均超过100ms门槛。测量有共享云环境调度噪声，不能根据两组细小差异推断优化效果，更不能据此扣算Android桥成本。原生编译/运行与真机此时尚未执行，不得写成通过。
