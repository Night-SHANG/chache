# v1.0.13 静态美术纹理化

开始记录：2026-10-12 22:49 北京时间（UTC+08:00）

## 已批准边界

用户确认 B 方案：保留 BGM、日夜班背景及基础外观在主包；额外外观和商店预览放在一个普通 cosmetics 分包。没有 CDN、额外资源域名、音乐重新编码、新美术设计、玩法改变或账户格式迁移。v1.0.12 基线 dd847c3174466f0004111b8667a2ff45c563e889 保持冻结。

入口先读账户，再等待当前实际装备的资源；显示加载或失败/重试界面，不用默认外观掩盖资源失败，不改写装备。原有退役外观的账户归一化政策保持不变；17 个背景与19 个叉车的历史直接渲染兼容资源仍保留。暂停、静态帮助、商店当前页面的实际图片需求由同一个资源服务管理。加载期间阻止不可见玩法输入及计时推进；音乐沿用原有偏好、启动与生命周期。

## 架构与资源

- 作者源冻结在 scripts/static-art-authoring，离线使用已钉住的 MIT @napi-rs/canvas 1.0.10。运行时不导入作者源或 Node Canvas。
- 生成器、PNG编码哈希、解码像素哈希、逻辑位置、精确裁切及源哈希构成同一清单。预检验证 TypeScript 运行清单与作者 JSON 一致，避免只校验另一个副本。
- 仓库背景一张图片，原始有限范围为 x=-57、y=0、w=1205、h=1920。日夜外侧透明空隙保留，非经典主题沿用原视口裁切。
- 当前完整叉车、经典货箱、废弃箱/轮廓、道具和经典棋盘外框改成纹理；既有付费货箱、棋盘材料和场景材料图片原字节保留。货类语义标记、剩余次数、动态文字、简单棋盘填色/渐变/接缝继续即时绘制。
- 商店背景为53 个按原形状分别烘焙的图层，而非拉伸大场景。运行时不再创建仓库或外观预览离屏画布；保留原拖动预览缓存与输入取消修复。
- 只保留一个当前大背景与一个加载中的背景；过时请求不能替换最新选择。预览保留上限6 MiB RGBA。丢弃 JavaScript 引用不代表原生/GPU 内存立即释放，峰值仍需手机测量。
- main/cosmetics资源键与路径分离；微信接口用 typeof loadSubpackage 保护，并共享同一包的并发请求、失败后允许明确重试。不使用未保护的 canIUse 调用。浏览器和Android staging将全部相对路径打包在本地。

## 构建与许可证

正式构建为1.0.13、付费商店、诊断关闭。esbuild完整压缩已启用；project.config.json采用已核实的 setting.minified=true。没有写入未经核实的 automaticCompression/uglify 配置字段，没有不必要的基础库版本变更。

包体门将主包 raw 保守限制在3.2 MiB以内、普通外观分包保守限制在4 MiB以内；总量小于30 MiB。这里的本地字节统计不是开发者工具处理后的上传大小。微信工具处理大小、上传、扫码及实体手机均未验证。

参考为固定官方文档快照，不能冒称当前官网已重新核实：
- https://github.com/VaJoy/wx-minigame-helper/blob/ad99e35a0200d4548cd879aa218ce845fd1e9fa2/skills/wx-minigame-helper/references/guide/base-ability/code-package.md
- https://github.com/VaJoy/wx-minigame-helper/blob/ad99e35a0200d4548cd879aa218ce845fd1e9fa2/skills/wx-minigame-helper/references/guide/base-ability/subpackage/useSubPackage.md
- 原官网 https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.html 和 https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.html
- 官方类型固定提交 https://github.com/wechat-miniprogram/minigame-api-typings/blob/4cae82af7f3c4339d1f11aea8e672fb16051d24a/types/wx/lib.wx.api.d.ts

音频文件、音量和CC0许可文本/通知保留。原始声音授权PDF完整保留在源码与备份，仅不再复制到运行包。它在微信实际上传白名单中本就可能被排除，不声称靠排除PDF节省IDE上传体积。

Android只同步版本身份、锁文件中根版本以及网页staging；依赖图、versionCode=1、签名、CI触发策略与publishApk=false门不变。没有编译APK、签名、触发CI、配置Secrets或替换已交付v1.0.10 APK。

## 可重复命令

- node scripts/generate-static-art.mjs
- npm run lint
- npm run typecheck
- npm test
- npm run preflight
- npm run build:production
- npm run build:android
- npm run verify:android
- node scripts/verify-static-art-host.mjs

最终静态检查、全套测试、包体、源码SHA及独立审查结果记录在 qa/v113/summary.json。历史两项源美术缺失检查必须原样报告；不跳过或删掉来宣称全绿。测试数据与账户均为隔离夹具，不读取玩家存档。

## 必须保留的验收边界

1. v1.0.11/v1.0.12手机全黑的根因未被证实。纹理迁移与模拟宿主成功不等于手机问题已修复。
2. 1:1原生背景可与冻结画法逐像素比较；任意缩放的抗锯齿可能不同。透明货箱采用整图透明：与原先逐笔alpha相比，内部重叠笔画不再逐次增深，这一可见合成差异已单独测量并审查接受；不要求为了复制旧逐笔叠色而新增复杂分层纹理。货色、图标、醒目轮廓与加急数量仍须清楚保留。该差异不能写成仅抗锯齿或像素全等。
3. 新作者资源、预检、完整构建、实际bundle smoke与独立审查完成后，仍需原微信项目真机测试加载、自定义装备、商店翻页、拖拽、前后台与分包失败恢复。

## 本地证据解读

`qa/v113/composition/` 保存不透明与半透明图片、实际拖影、19辆叉车、动态文字/轮廓及本地方法调用计数。冻结画法与新图片合成均未使用旧运行时仓库缓存；不能据此宣称比上一版本的热缓存更快。

附带的30样本CPU记录测量本地原生Canvas绘制调用提交，没有完整像素读回屏障，不能当作已完成栅格帧耗时或实体手机FPS。共享主机调度/GC造成较大p95噪声；六卡压力样本的p95甚至变差。可靠的结构性结果是复杂路径调用大幅减少、文本数量保持，真机帧时间与内存峰值仍需实测。

## 冻结前候选验证结果

2026-10-12 23:14 北京时间（UTC+08:00），产品候选提交为 `c01b77304065e60d3d80be58210c31d8e4822b6e`，产品源码 SHA256 为 `4a5ab0616a552882c2cbea404b68b0664ee9f3ee82ed1ae68b45a24d84e1b04f`。全套测试前后源码哈希一致；后续只补证据文档，不改变该产品源码。

- `npm test`：3270 项，3268 通过，2 项历史源图缺失失败，0 跳过、0 取消，原始退出码1。失败分别是 `artifacts/v0200-art-source/cargo-wood-generated.png` 与 `artifacts/v0210-art-source/cargo-harbor_container-generated.png` 未提供。完整日志在 `qa/v113/full-tests.txt`。
- lint、typecheck、preflight 通过；正式构建与 Android 网页 staging 校验通过。Android 的 `publishApk=false` 门仍保持。
- 本地产物 raw 字节：主包3,031,601，cosmetics普通分包2,728,095，总计5,759,696。主包约2.89 MiB，距离4 MiB的本地字节预算约1.11 MiB；不等于IDE处理后大小或上传验收结论。
- 当前实际正式bundle的16个模拟宿主案例全部通过：默认/自定义启动、BGM先启动、加载期间输入阻断、单可见Canvas、商店翻页、经典预览、前后台、分包失败明确重试、缺少loadSubpackage能力。32张原始截图及哈希在 `qa/v113/host/`。
- 独立审查发现加载界面通用字体在原生宿主缺少中文像素，已改用项目已有中文字体栈，并增加实际像素断言；加载标题、错误解释和“重试加载”文字均已重新截图查看。构建后11项包体/分包/加载界面回归全通过。

实体手机、微信开发者工具处理后包体与上传、APK编译及CI仍未运行。下一步实际宿主验收仍需覆盖默认与付费装备冷启动、商店往返、拖拽半透明与轮廓、后台恢复和分包网络失败恢复。

独立审查结论为 `PASS_WITH_DOCUMENTED_LIMITATIONS`，无未解决的迁移阻断项。独立运行34项资源/平台用例、4项几何合成组合、75项原生尺寸付费货箱逐像素比较，核对192个冻结作者源文件和三个构建目标各78个资源哈希。完整原始结论在 `qa/v113/independent-review/review.json`；该通过不覆盖以上明确未测的实际宿主边界。
