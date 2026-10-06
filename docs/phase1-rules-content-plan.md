# 下一批：局内完整规则内容 v2

2026-10-05 22:07 北京时间（UTC+08:00）

## 目标与边界

延续已批准的母文档与TS/Canvas2D路线，补齐局内可变规则内容。本批交付4种特殊货件、18项数据驱动升级、对应预览/倒计时/废弃物/侧门/四候选显示、旧存档与回放隔离。长期Profile、设置、每日入口、Overtime紧接后续批次，避免在同一数据结构修改中混杂长期层。无网络账号、上传、托管或发布。

## 现有模式/轮子决策

复用既有pure-rand、显式reducer、BFS、Canvas2D、稳定保存点和游戏事件；本次新增的是项目核心规则，库存、物理或FSM框架不能替代该规则。特殊状态采用与49格board平行的cellTraits数组，不引入节点或渲染对象。按现有Stable ID、明确版本、参数表、测试注册契约延伸，不添加新的运行时依赖。

## 版本与恢复

- v1代码完整保留为独立只读规则实现，旧Golden Replay继续按v1执行。
- 新会话由Application显式创建rulesetVersion=2、run.standard_v2。
- v2 Run Snapshot schema2；v1档读回仍是v1，不默改规则。恢复v1局到结算；用户下一次重开才进入v2。
- traits、生成计数、到期计数均进快照与checksum。相同版本+seed+命令必须相同。
- 未来未知schema/ruleset Fail Closed；坏档保护沿用已验证保存层。

## 四类特殊货件

所有特殊货件均强制单格，仍带基础货类；基础普通货件保持20形状。

1. Pallet（托盘）：物理占1格、订单计数2；通路默认仍视作占用。
2. Rush（加急）：生成时携带可见剩余有效放置数。放入本次先正常结算；未运走的既有Rush在之后每次合法放置完整结算后减1，减至0变废弃物，占格但不参与订单。取消/非法/升级不倒计时。新Rush不在自身放入回合减时。
3. Hazard（危险品）：成功出库时清掉与该货组4邻接的一个废弃物；按棋盘扫描序选择，只清废弃物，不无故销毁正常货物。清障可能打开下一旧订单路线。
4. Wildcard（万能）：对当前正在解析的Dock可视作其类别，能连接同类组；同一次resolution仍按固定Dock顺序，只被消费一次。不存在同时给多个订单计数。

P0未定参数版本化：Shift3起引入特殊；普通/托盘/加急/危险/万能权重初定88/5/3/3/1；Rush默认3次后续有效放置到期。全部集中于RULES_V2_CONFIG，balanced=false，不宣称平衡。

## 18项升级与effect契约

保留6个已实现ID，另加12项。至少2项候选来自可用行为升级；候选ID不重复，7次选择以内保持足够池，正数maxStack；前置/冲突/参数显式数据化。

既有：
- upgrade.overfill：超额装载加分
- upgrade.deep_route：深路线加分
- upgrade.small_parcels：小件生成权重增加
- upgrade.chain：连锁倍率增加
- upgrade.contract：订单基础分增加
- upgrade.variety：同次连锁更换类别加分

新增：
- upgrade.side_gate：增加西南侧入口(0,6)，可供各Dock从该空格进入；原门与侧门选最短、原门优先等长。侧门是升级授予的整局入口，明确标注其作用域。
- upgrade.pallet_pass：每次放置的首次出货路线可穿过一个非目标托盘；该托盘不被清除，之后同轮出货恢复正常空地规则。
- upgrade.small_order_first：旧订单每轮解析优先最低数量，其次原Dock顺序；玩家通过选此升级明确改变解析优先级。
- upgrade.light_orders：之后新生成订单最低数量减少1，底限2；不修改正在解析的旧单。
- upgrade.stock_orders：之后新订单的未占用货类按当前库存加权，仍不重复货类，不保证可完成。
- upgrade.four_choices：候选数从3增加到4；所有候选不可放才失败，布局同源。
- upgrade.pallet_supply：Shift3起，每4次生成固定得到单格托盘（仍使用确定性货类抽取）。
- upgrade.rush_buffer：之后生成的Rush额外2次有效放置期限。
- upgrade.hazard_clearance：每次Hazard出货最多清2个相邻废弃物。
- upgrade.wild_supply：万能权重1→3，普通权重等值减少；仍为低频。
- upgrade.sweep_route：每次放置首次出货后，额外清理路线旁扫描序第一个废弃物。
- upgrade.extra_pickup：每次放置首次出货后，顺路清理路线旁扫描序第一个非目标普通货物格；不作为订单出货、不额外计分，不清特殊货物。事件明确展示额外清理。

计分项可叠加，行为项以maxStack1为主。特殊相关升级要求Shift3。没有永久跨局数值战力。

## 正常/失败/长期推演

正常：新v2局→基础订单→升级显示至少2个行为选择→侧门/四候选可见→Shift3特殊货物出现→预览展示实际货组、路线与特殊计数→提交完整旧单连锁→额外清理→Rush到期→刷新新单→稳定保存。非法输入不消耗Rush或随机。

失败：Rush变灰色废弃物→图标说明不可再出库→Hazard/扫路可清障；全3或4候选均无合法落点才爆仓；路径例外只对首次出货且仅一个托盘，不能无限穿箱。新单仍不加入旧连锁。

中断：动画中隐藏→已保存完整v2结果→恢复traits/计数/候选/升级，不复播或重计。v1存档继续v1，旧回放checksum不变。新配置增加ID时Preflight要求注册effect、中文文案、前置/冲突有效、负权重/重复ID立即失败。

## 实施与验收

1. 固化v1规则与Golden基线，新增v2契约及纯Domain失败测试。
2. 单元实现4traits、18effects、candidate/prerequisite/冲突/权重与连锁组合。
3. 版本化Save/Replay、Application新局v2/旧局v1；全部真实终态可保存。
4. 共享渲染与命中：4tray、计数2、Rush倒计时/废弃物、Wildcard/危险、侧门/穿托盘路径、额外清除。
5. 前86测试不回退，新增规则/组合/迁移/预览测试；lint/typecheck/Preflight/双目标Build；独立审查。
6. 实际game.js宿主触摸跑完整5班与失败、多traits/侧门/四候选截图；模拟种子扫描只作稳定性报告。
7. 本地commit与相同Library ZIP身份的新版本检查点；不创建一堆重复附件。真实浏览器/微信真机仍待验。
