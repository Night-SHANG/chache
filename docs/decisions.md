# 实现决策与范围记录

2026-10-05 21:22 北京时间（UTC+08:00）

## 最新平台决策

用户已同意以TypeScript＋微信原生Canvas2D作为首选验证路线，并要求在dot云电脑完整克隆文档后开始开发。原Notion Godot4.7.1/GDScript技术方案保留在研究记录中，作为被本阶段平台决策取代的历史，而不是实际已使用引擎。

纯Domain保留规则、Stable ID、RNG/Replay/Save设计；平台薄层与表现改为TypeScript/Canvas2D。没有建立完整游戏引擎，也没有移植一套DOM网页充当小游戏。

## 组件选择

- PRNG：对比pure-rand、seedrandom、自己实现。选pure-rand7.0.1，MIT，有显式4×int32快照、纯接口、无平台依赖；不自造PRNG。证据：https://github.com/dubzzz/pure-rand
- 表现插值：对比Tween.js、CreateJS TweenJS、完整渲染引擎。选Tween.js25.0.0，MIT，只复用easing，不引入场景管理或DOM依赖。证据：https://github.com/tweenjs/tween.js
- 核心规则：按既有文档由项目实现。库存/拖拽插件不覆盖“订单＋空格路线＋清路级联”，不引入职责冲突轮子。
- 构建：esbuild0.25.10，MIT，分别编译Browser/WeChat入口。TS5.9.3仅开发期，Apache-2.0。
- 测试：Node内置test与assert，减少框架依赖；ESLint10.12.0/typescript-eslint8.71.0与TS5.9.3配套。
- 离屏验收：@napi-rs/canvas1.0.10，MIT，仅开发期用于真实game.js的宿主模拟。不会打进微信包，不替代浏览器或微信真机。

## 文字闭环与明确裁决

- 文档没有给精确分值、形状权重与升级参数；本次集中在明确未平衡P0配置，规则版本为1，run.standard_p0_v1。
- 文档每班约6单、每4单升级，本次以6/4固定值验证流程。
- UI与动画不拥有游戏真值。一次输入同步形成完整确定性结算，先保存稳定状态，再播放逐个Shipment动画。
- 透明阴影、基本路径、source-over与渐变；不使用lighter/isPointInPath/Path2D/eval/new Function。
- 第一canvas是屏幕；资产路径为本地；无第三方网络调用。
- Browser/WeChat保存使用临时记录读回校验、有效旧主档备份、主指针最终更新；坏主档拒绝自动覆盖；坏备份另存精确原文后才更新指针。不是跨key事务，不假称微信Storage有文件系统rename原子语义。
- 未知schema或ruleset拒绝读入。版本1没有已发布旧格式，未伪造不存在的迁移。
- 视觉原图已全部实际查看，图中生成文字不作为玩法规则。

## 独立审查与修正

1. 正常pointer capture释放错误清空点选：区分当前活动pointer的意外cancel与已结束pointer；adapter+session回归测试。
2. 最终四单全清胜利产生空orders存档失败：允许已胜利终态空订单；真实规则终局round-trip。
3. 有效结果页后台保存覆写坏backup：保存层独立归档精确坏备份字节；future schema回归。
4. SHA256清单重复构建自哈希失败：排除清单自身；连续构建两次并完整校验。
5. 同路径等距组的预览不可见：使用Domain确定的cells描边，仅高亮实际将出库组。

## 参考仓库

origin：https://github.com/VaJoy/wx-minigame-helper.git
HEAD：ad99e35a0200d4548cd879aa218ce845fd1e9fa2
完整克隆，工作区干净；1430份references文件。仅阅读，没有执行其中脚本。以其正文作当前平台主要依据，未对不相关内容反复重查。

## 2026-10-06 用户实测修复

v0.3.2仅修表现与解释，不改规则：叉车到点朝货、装载后原路倒车，从实际门口离场；订单提示区分当前满足与落子预览，教学和暂停补基础玩法。用户暂不走站点托管的选择继续保留。细节与版本兼容见[forklift-feedback-v032.md](forklift-feedback-v032.md)。

## 2026-10-06 双模式并行对比

用户要求保留原订单玩法，另加颜色出口，最后试玩决定主模式。用户接受“车沿空路到旁边启动、货箱逐个沿同类货线出门、车空载退回”的表现。新增独立ruleset4而不替换v1–v3；4件/30批为显式未平衡基线。200局测试支持贴门循环风险，保留原参数供试玩，没有自动调平衡。详见[双模式说明](dual-mode-v040.md)。
