# 抖音独立适配计划与边界

2026-10-14，北京时间。

## 已批准范围

- 固定长期分支：`dev/douyin-minigame`；基于已验收 v1.0.22 源码 `70d835196ccc012284bc7df28e54692f6e7d5360`，对应备份树 `20f576be04caca9072d270355d39930a1f052909`。
- 独立入口、tt 宿主、构建目录、测试、文档。原浏览器/微信/Android 路径不改；不改规则、经济、账户格式。
- 单包、本地静态 PNG、同步可交互回退，不增加载页或准备预览闪屏。
- 先使用 common 原 WAV，13 种音效统一播放 volume=1，不设按钮专用系数；BGM 保留公共音乐设置，抖音真机试听后再独立调整。
- 不注册、上传、提审或发布；用户于北京时间 18:19 提供真实 AppID `ttfa0f8cb26476311702`，已记入本分支配置，无需 AppSecret。IDE/设备验证仍单独记录。
- 用户于北京时间 18:29 确认左上侧边栏入口样板：仅抖音主菜单逻辑坐标 x84/y100/w216/h132 的蓝灰小按钮，保留原标题、菜单、页脚，不新增奖励。

## Canvas 兼容取舍

官方 Canvas2D 文档将 `clip`、`lineDashOffset` 列为未支持。本实现不在原模块加入全局条件，不将 clip 改成无操作。

1. 警示斜纹和留空标记：边界内多边形/线段。
2. 棋盘冷态纹理：只在证明原几何位于内缩边界后移除冗余裁切。
3. 按压反馈：直接圆角填充及边界内的顶部/底部高光。
4. 已解码场景 PNG：drawImage 源区域与目标矩形同步裁切。
5. 同步复杂背景、商店组合预览、旋转运输：仅这些具体绘制点允许一个惰性复用的固定逻辑像素 scratch，最大 1205×1920（RGBA 理论 9,254,400 B，约 8.83 MiB）。它是临时局部绘制层，不是背景缓存，不随 DPR 放大、不逐帧新建或反复 resize。
6. 主画布必须先创建；嵌套/重入明确拒绝或通过具体调用点消除，不能覆盖活跃绘制；不使用 destination-in、copy、lighter。
7. 普通热态场景 PNG 直接画到主画布，不经全屏 scratch。逻辑像素 scratch 可能产生栅格边缘差异，需量化并截图检查，不能称逐像素完全一致。

抖音专属 esbuild 插件只处理这次构建的 presentation 模块；原端构建不加载插件。

## 平台契约

- 首 Canvas 上屏；getSystemInfoSync 逻辑窗口、安全区与 getMenuButtonLayout 一起确定绘图/输入同源坐标。
- 触摸优先有限 clientX/clientY，兼容文档 screenX/screenY；DPR 只处理画布分辨率，不能二次乘输入。实际设备坐标必须另验。
- string-only 存档、容量 KB→byte、异常语义保持；存档在抖音宿主独立，不提供跨端迁移承诺。
- 同步监听 onShow，记录启动/前台来源；隐藏取消手势、停止音效并暂停音乐。
- 侧边栏 checkScene/navigateToScene 提供独立能力，不自动跳转、不添加奖励。可见入口已获样板确认；只从明确点击触发，处理异步检测的取消、过期、失败重试，仍不能将本地测试称为平台复访完整验收。

## 验证顺序

1. 为宿主、构建、Canvas 兼容先写失败测试，再实现。
2. 规则/lint/类型/preflight、独立单包构建与资源哈希。
3. 实际 game.js 的模拟 tt 宿主运行：缺 clip/lineDashOffset、冷/热/图片失败、全部外观、商店分页与快速装备、运输边界、后台恢复。
4. 原三端相同定义的内存 bundle 与冻结 v122 字节一致；原静态/音频不变。
5. 全套测试真实统计与退出码；保留已知两项历史母图 ENOENT，环境缺依赖的初跑另记，绝不伪造全绿。
6. 用户提供 AppID 后：抖音 IDE 包体/模拟器；Android 与 iOS 抖音真机触摸、首屏、性能、音频、存档、前后台、复访验收。

## 官方参考

- [Canvas2D](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/drawing/picture/canvas-get-context)
- [Canvas 创建](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/drawing/picture/tt-create-canvas)
- [单包/分包限制](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)
- [侧边栏技术接入](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/Introduction-for-tech)
- [平台运营规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/operation1/norms/standards)
- [官方类型声明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/framework/api-type-declaration)，开发依赖独立放在 `douyin-tools`，不改变原三端锁定依赖图。
