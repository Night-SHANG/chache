# 冻结规则3 · 十万局扫描预注册

2026-10-06 北京时间（UTC+08:00）

## 范围与样本

母文档05要求10万～100万局发现crash/dead loop，没有强制百万。本轮计划100,002个完整standard运行：seed 1…33,334，每个seed分别random / greedy / route；三策略各33,334局。是连续seed扫描，不是全32位空间的均匀抽样。额外边界seed与定向fixture另列，不混入主分母。

游戏冻结为v0.3.1、规则3，commit 2f069901b69ecec8fcfbc0383c15fcf1ab7b7fc7。main game.js SHA256 c5774c8f3b434390d1f463c1136dc4f5ceeb4bd9efb68b5b23437bde8470abd0。UI与Domain不修改，旧v1/v2保留冻结。工具在独立qa目录，记录执行源SHA、规则SHA、Node版本和完整manifest；结果报告另记录分析程序来源。

## 测试Bot协议1

复用既有chooseMove：随机均匀合法落点；Greedy最大净空格、得分次序；保路为既定启发式，不保证长期通路。同分按候选/行优先枚举。

本轮三策略的升级都在可选3项中均匀抽取，消除旧Greedy/Route总选首项而不选择纯计分升级的结构性覆盖缺口：

- 放置Bot RNG种子：int32(seed XOR 0x51f15e)
- 升级Bot RNG种子：int32(seed XOR 0x6a09e667)，独立游标
- 游戏RNG不被Bot/观察器消费
- 独立是指升级游标与放置/游戏RNG隔离；同seed三策略共用同样的升级索引随机流，不是跨策略IID样本。实际可选ID会随局面分化

这是明确的新测试协议，不与原300局首选升级协议混为同一数据。相同seed可做策略配对描述，但不同动作、候选池及游戏RNG分支会分化；不是单个升级的因果收益估计。

## 安全终止与资源预算

- 1个worker串行，100个seed×3策略/批；最后34个seed。
- 每进程Node old-space上限256MiB；RSS监督阈值512MiB；输出预算1GiB。
- 直属worker经Linux PR_SET_PDEATHSIG在父亡时由内核终止，防止SIGKILL父进程后遗留孤儿计算；启动race与prctl失败均拒绝运行。
- 独立父进程watchdog 60秒无协议进展即停止子进程，保留当前seed/策略、所选完整命令trace和原错误/原始state。
- 单局指令上限2000。不是沿用小样本300的任意截断：标准胜利最后一次最多从29单到33单，每次shipment最多清49格，所有清理依赖shipment，累计放置格数≤49+33×49=1666；再加最多7次升级，保守≤1673条指令。该证明只限当前冻结standard，不延伸到Overtime。
- crash、capped、存档/重放/观察器断言、协议/文件校验、内存/磁盘预算超限一律fail-fast，不跳过问题继续宣称完成。
- 完整分片fsync/校验/receipt/原子rename后才计数；恢复重验每分片哈希、身份和数量，checkpoint只是派生摘要。半成品隔离重跑，不把重跑计成新样本。

## 预先实测成本

原工具300局：9.34秒，峰值155,152KiB。新runner+只读观察300局：约11.71秒；线性估计100,002局约65分钟，加监督/校验/批启动有额外成本。该估计不是承诺；最终报告实际wall/CPU/RSS。

## 检查与指标

每条指令：合法性、前态不可变、旧订单集合及唯一出货、最多4条shipment、存档encode/decode往返、只读观察器不改checksum、影子棋盘/trait/score与真实事件对账。每局完成再做全Command Log重放校验。

报告三策略分别的胜负/失败班次、已出货样本首次实际出货步数与未出货删失、结算后占用与放置瞬间峰值、每100次放置订单数、0–4 Chain分布、最多shipment数（不是BFS内部步骤）、三/四候选无合法落点发生率、升级出现/选择/严格实际作用或概率机会、trait流量/废物/长链与极端seed。

概率类small_parcels/stock_orders/wild_supply只记条件生效机会与输出分布，不把一次随机结果归因为升级。actualEffects、未观测项、专门fixture证据分别报告。

性能分开记录Bot、reducer、存档验证、observer、replay、IPC与整局wall；不能把包含大量Bot预览的耗时说成手机帧率。

## 完成条件与边界

planned=completed=100002，33334个不同seed均有三策略，0 pending/重复/丢seed，所有文件和守恒校验通过，异常单列。若遇异常先定位、回归并保留失败证据；改变协议后不得静默合并旧样本。

机器人经验分布不证明玩家好玩、数值公平、所有seed可解或所有升级自然触发；不包含百万局、Overtime长期生存、真实浏览器、微信或真人听感/触控。
