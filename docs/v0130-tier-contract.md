# 入库两档规则18合同

2026-10-07 20:45后最终决定：顶部只提供“困难”“专业”，默认困难；它控制五班和无限。每日挑战固定困难，不跟随顶部专业选项。普通A不再作为新局入口。

## 玩法与身份

- 困难C各班新订单：[4,4]、[4,5]、[5,5]、[5,6]、[6,7]。
- 专业B：[4,5]、[4,6]、[5,6]、[5,7]、[6,8]。
- 五班30单；两档均可通关后沿同一局／同档继续无限。直接无限从第一阶段开始，封顶第五阶段。
- 五班／无限无加急无清扫；每日每次开局选2单／6次放置清1旧废格，前四阶段加急6%、末班新货全部加急。危险、双倍箱、万能与原生成顺序保留。
- 新局规则18、run.inbound_v18.hard 或 run.inbound_v18.expert；每日只允许hard。规则16旧局／分数不重算，危险移除17不启用。
- 五班／无限／每日×档位×使用工具状态分别计成绩；每日只有困难档。菜单切档不改活跃棋盘或已绑定身份。

## 分数与金币

困难得分为原始累计分数的3/2，专业为2/1，最终显示分=floor(rawScore×倍率)。存储rawScore并严格核对score；按累计总分取整，不能逐组截断或恢复后再乘。出货事件使用相邻累计分之差，阶段／通关奖励同样只乘一次。

金币仍按最终显示分除120取整；每日失败基础币、成功总3倍，无其他难度金币倍率。每日奖励账本仍按开局日期共用：已在同日期旧版本通关也不能再领；没有旧钱包追回、清除或重置。跨午夜结算原日期，不剥夺新日期机会。

## 当前实现接口

- src/domain/v18/{types,content,engine,replay}.ts：薄层复用16的板面／生成／工具和结算，不复制引擎、不改16文件。
- InboundDifficultyV18='hard'|'expert'；StartV18 {seed,mode:'standard'|'daily'|'endless',inboundDifficulty?:...,guided?:false,toolCharges?:...}；默认hard，daily+expert及guided:true明确拒绝。
- InboundRunV18=16公共结构＋rulesetVersion18、上述配置ID、hard/expert、rawScore；guided恒false。事件/命令复用16。
- 核心导出createRunV18、applyCommandV18、previewPlacementV18、findLegalMovesV18、asV16、fromV16、checksumV18、replayV18、compactCommandTailV18；content导出RULES_V18_CONFIG、inboundConfigIdV18、isInboundDifficultyV18、scaledScoreV18。
- asV16将显示分投影回rawScore并去掉rawScore字段；fromV16只按原始累计分重新计算一次显示分。所有正常命令按16真实事件结算，特殊实现仅是允许两档继续加班和创建每日困难／无限两档。
- 每日开局订单必须按困难C使用同一个初始seed的正常订单抽签生成，候选在真实清扫选择后才补。不能先生成普通A候选再仅改订单数字；不得增加随机重抽或隐藏保底。

## 应用/UI边界

账户格式4、经济2不升版。扩充18单局/身份/历史校验和独立分数键。新的每日日期seed绑定18；同日期锁与付账记录跨规则版本共用。

提供明确isInboundV18，以及只供共享表现/引导旧结构使用的isTieredInbound(16|18)；原isInboundV16保持精确，不能误派引擎。New Run选择18；恢复仍按保存版本。当前说明/四门调整保留，已取消所有自动教程/重播，不增新引导。
