# 抖音首轮适配验收记录

2026-10-14，北京时间。代码基于已验收 v1.0.22，固定在 `dev/douyin-minigame` 分支。

## 结果

已生成带真实 AppID `ttfa0f8cb26476311702` 的独立单包开发目录。主页左上侧边栏入口已按确认样板实现；没有改动原三端源码、玩法、经济、账户格式及原有主页布局。没有注册、上传、提审或发布。

**抖音 IDE、Android/iOS 抖音真机均未运行。** 当前是本地构建与模拟宿主验证完成的开发候选，不是平台上线或手机性能验收。

## 最终自动检查

- `npm run lint`：退出 0。
- `npm run typecheck`：退出 0，含官方 `@douyin-minigame/api-typings@1.3.0` 的宿主兼容契约。
- `npm run preflight`：退出 0。
- `npm test`：**3,339 项，3,337 通过、2 失败，退出 1**；无取消、跳过或待办项。
- `npm run test:douyin`：**52 项全部通过，退出 0**。
- `node scripts/build-douyin.mjs --release` 与 `npm run verify:douyin`：退出 0。

两项全套失败均为保留的历史母图缺失，没有删除测试或把失败改成跳过：

1. `committed raster artwork verifies every generated source and exact encoded atlas`：ENOENT，`artifacts/v0200-art-source/cargo-wood-generated.png`。
2. `new generated atlas rows obey their incremental byte budgets and preserve source evidence`：ENOENT，`artifacts/v0210-art-source/cargo-harbor_container-generated.png`。

前期不完整依赖、编写中的出库测试 fixture 等失败日志已保留，与上述最终冻结结果分开。可选且未被官方声明的窗口监听扩展若抛错，现会安全忽略；同步 onShow 的尺寸刷新继续生效，已验证失败→修复→通过。

## 实际包身份与资源

- `game.js`：682,377 B。
- SHA-256：`a0589c96adfed97e7cfe08f1385134a1ddce5194f2f987540bfb1d921cc1ce40`。
- 源内容 SHA-256：`05de7abcecd6aec6ed1c17d02cd973303654ad387c5f647f5628668f3d19f3b0`。
- 原始单包目录：42 文件，3,981,783 B，远低于保守采用的 20,000,000 B 未分包上限。该数值不是 ZIP 大小或抖音 IDE 处理后的包体测量。
- 13 个 WAV 与 common 原素材逐字节一致，全部播放 volume=1，无按钮专用系数；17 个 PNG 与原资源逐字节一致。BGM 继续使用原公共音乐设置，不随这次音效改动调整。
- 完整清单、游戏哈希、源内容哈希、静态图和音效均校验；篡改音频、额外未列文件、禁用 Canvas API、缺真实 AppID 的严格构建均会拒绝。

## 实际 game.js 的独立验证

以下五组完整渲染/交互检查针对音量纠正前候选 `b8cdbc1352dfe92d32e2849944605c6feeaba7eed207aa8946c33772384ed2e6`。该候选因继承了音效 0.45 与按钮专用系数而被取代，不能作为最终交付。所有 tt 导航都是受控回调，没有向外部服务发起真实导航。

1. 首页冷/热、全部 29 件在售外观的触摸预览，分别在正常图片和永久图片失败下验证。
2. 九套场景冷/热/失败图与重复帧的分配检查。普通热背景每帧零 scratch 合成；冷失败非经典背景每帧一次背景合成，day/night 直接绘制。
3. 可经 reducer 到达的 v12 五步前缀、四次转向运输：正常/失败图下共 38 个时序边界采样，游戏命令和状态与原实现一致。
4. DPR3、安全区/胶囊触摸、真实会话操作、隐藏落盘与重新启动恢复。
5. 实际侧边栏按钮：缺 API、不支持、抛错、拖出/cancel、pending 重复点击、失败重试成功、8 秒超时、晚回调、离开主页、hide/show 失效。无自动导航或账户/奖励改动。

最终音量纠正只改 `src/platform/douyin.ts` 的音效播放参数：去除按钮系数、统一为 volume=1。对以上最终 SHA 另做独立复核：

- 13 种音效五轮共 65 次播放/上下文复用均为 volume=1，hide/show 恢复及 BGM normal/duck 设置保留。
- 未修改实际 bundle 的点击、取货、放置、路线就绪、叉车、出库声音均观察到 volume=1。
- 冷/热首页、侧边栏失败、主题商店、夜景预览、热/失败图旋转运输共七幅代表画面，与纠正前候选逐像素一致。
- 13 个 WAV、17 个 PNG、BGM 字节保持一致，原三端重打包仍逐字节相同。
- 音量断言先在旧参数下失败，再在修正后通过；构建清单和核验脚本也拒绝音效播放策略漂移。旧候选及失败记录保留，未改写历史提交。

最终首页见 [导入说明与截图](IMPORT-GUIDE.md)。其中批准的新增按钮以外，原标题、菜单及页脚保留。

## 原三端隔离

原有 `src`、`scripts`、`assets`、主 `package-lock.json` 内容未改；仅根 package.json 增加抖音命令，其余实现为新增文件。相同生产定义重打包得到：

- Browser：681,316 B；`8233b9c66f16ccbb0ac22d8f826bfdcb769775cfee791e1e5437be372c5f285d`。
- WeChat：680,660 B；`93cc47d494ca83ce12f462ef5b980a79c02252b367a38d545706afe2256c1259`。
- Android：709,578 B；`148270c4644b8fcaf26eb3cf672ab7aaafe8cecf8a8e362c9576b547bf70691a`。

三者均与冻结 v122 字节一致。新 worktree 内旧测试会重建 browser/wechat manifest 的 source hash/builtAt 元数据；原已验收 worktree 与交付产物没有修改，不能把新 worktree 的元数据刷新误报为旧游戏内容变化。

## 仍需实机验收

- 抖音 IDE 的实际包体、基础库/API行为和项目导入。
- Android/iOS 的触摸字段、胶囊、安全区、DPR、首 Canvas 和本地 PNG/音频。
- 静音、音效连播、首触、切后台/来电后恢复；原始音量基线由手机试听后校准。
- 侧边栏真实跳转与复访来源；当前模拟回调不代表真实平台验收。
- 长时切场景/商店、内存回收、FPS、温升。固定 scratch 的像素量约 8.83 MiB，但不是宿主总内存测量；模拟冷回退曾出现 8.2–23.5 ms 中位帧及约 67 ms 峰值，不能据此承诺手机性能。
- 固定逻辑 scratch 在不同主画布缩放下仍有局部边缘重采样差，详见 [渲染验证](RENDERER-VERIFICATION.md)。
