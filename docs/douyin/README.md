# 抖音小游戏独立开发分支

基线为已验收 v1.0.22；固定分支 `dev/douyin-minigame`。浏览器、微信、Android 的正式版本继续保持原分支与原产物。

## 本地命令

需要 Node.js 24 及项目锁定依赖：

```sh
npm ci
npm --prefix douyin-tools ci --ignore-scripts
npm run lint
npm run typecheck
npm run preflight
npm run test:douyin
npm run build:douyin
npm run verify:douyin
```

`build:douyin` 仅输出 `build/douyin` 与对应包体报告，不执行原 `build.mjs`，不清理其他平台。类型依赖 `@douyin-minigame/api-typings@1.3.0` 独立锁在 `douyin-tools`，不改变已锁定的原三端依赖图。

## 导入和设备验证

1. 将 `build/douyin` 作为抖音小游戏项目目录导入。
2. 本分支配置已填入用户 2026-10-14 提供的 AppID `ttfa0f8cb26476311702`，不需要 AppSecret；导入时确认项目匹配。
3. 在 IDE 核对单包处理后大小、首页、商店、输入和存档。
4. 分别用 Android 与 iOS 抖音真机验证首次 Canvas、触摸字段/DPR、安全区/胶囊、PNG、音频、切后台和复访。

可运行 `node scripts/build-douyin.mjs --release` 使用已配置 AppID 的严格本地构建，或用 `DOUYIN_APP_ID` 显式覆盖。此参数只是本地构建的 AppID/诊断门禁，不会注册、上传或发布，也不代表已通过平台验收。

## 必须保留的验收限制

- Node 模拟 tt 宿主与原生 Canvas 像素比较不是抖音 IDE 或真机验证。
- 13 种音效直接使用 common 原 WAV，统一播放 volume=1，不设按钮专用系数；BGM 保留公共音乐设置。不能把字节无削波当成主观音量已合格。
- 主页左上侧边栏入口已按用户确认样板接入。仅明确点击触发能力检测和导航，重复点击/拖动/后台/页面切换/过期回调受到保护；8 秒无回调及失败可在按钮内重试。没有增加奖励。真实平台复访验收仍待抖音工具和手机验证。
- 旧全量套件有两项历史美术母图 ENOENT，必须报告实际退出码与数量，不得以忽略/删除测试制造全绿。
- 用户手机已验收的是原三端 v1.0.22；抖音当前为独立适配开发候选。

设计、裁剪策略和官方依据见 [适配计划](IMPLEMENTATION-PLAN.md)。最终验证记录另见本目录的验证报告。
