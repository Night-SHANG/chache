# Phase 2：确定性三策略模拟器与软指标

2026-10-05。追溯母文档 `docs/research/05-preflight.md` 第132–153行「Headless 大规模模拟」「软指标」。本批仅扩充离线脚本和测试；没有改动Domain规则、渲染、版本或冻结v1/v2。

## 已完成与边界

- 三种明确策略、连续Seed扫描、Bot随机流与游戏随机流隔离。
- 每个接受的命令验证真实存档encode/decode roundtrip；真实shipment事件驱动指标。
- 游戏失败、命令上限截断、异常分开；不把异常或未完成局算作正常失败。
- 保留 `chooseMove(state, mode='route')` 导出和原route评分/稳定平局顺序，兼容宿主脚本。seed=1、v3的默认route仍63命令完成30订单。
- CLI默认使用 `CURRENT_RULESET`（当前3），可明确选择1/2/3；不会迁移旧版规则。
- 已实际完成每策略100局v3，总300局；另有每策略3局v1和v2兼容小样，总18局。
- 这不是10万～100万局压力验收，也不证明平衡、可玩性或主观乐趣。标准局结束即停止，不自动进入Overtime。

## 运行与复现

```sh
# 默认：每策略100局，当前规则，seed 1–100，Bot seed 0，最多300个接受命令
npm run simulate

# 本次v3正式小样的精确参数
node scripts/simulate.mjs --runs 100 --ruleset 3 --strategy all --seed-start 1 --bot-seed 0 --max-commands 300 --output artifacts/simulation-v3-100-each.json

# 旧的位置参数仍支持：局数、规则版本；默认三策略
node scripts/simulate.mjs 3 1 --strategy all --output artifacts/simulation-v1-3-each.json
node scripts/simulate.mjs 3 2 --strategy all --output artifacts/simulation-v2-3-each.json

# 复现需要检查的保路seed 49
node scripts/simulate.mjs --runs 1 --ruleset 3 --strategy route --seed-start 49 --bot-seed 0 --max-commands 300 --output artifacts/simulation-route-seed49.json

# 单策略；合法值random / greedy / route / all
node scripts/simulate.mjs --runs 10 --strategy random --seed-start 101 --bot-seed 55
```

参数要求：runs和max-commands为1–1,000,000的整数；seed-start、bot-seed及最终扫描Seed必须落在有符号32位范围；规则版本为1/2/3。未知参数、策略、缺失参数或非法数字直接报错。输出目录会自动创建。

退出码：0表示全部扫描局自然结束且无异常；1表示参数/文件等执行错误；2表示至少一个异常或命令上限截断，完整报告仍输出。游戏内爆仓是有效自然终点，可返回0，不能据此声称胜率良好。

输出为schemaVersion=2 JSON，完整写入指定文件，同时向stdout输出同一报告。无时间戳/耗时/平台熵；相同代码、锁定依赖和参数产生相同JSON。`runsPerStrategy`是每策略局数，`totalRuns`是合计数。不要再按旧脚本的单策略顶层字段解析；各策略汇总位于 `strategies.<name>`。

报告保留每局Seed、实际Bot seed、最终checksum、状态和详细统计。仅发生异常时才附命令历史与快照；初始化前即异常时没有有效快照，错误仍携带Seed和Bot seed。正常局可用原参数重跑取得相同命令序列。

## 策略与RNG

- random：在全部合法「货件ID＋落点」中等概率选取，因此不是先等概率选货件再选落点。升级也从当前候选中等概率选取。
- greedy：优先最大化本次预览后的净释放格数，即出货及副作用实际清除的去重物理格数减新放入格数；包含Hazard/顺路搬运等extraClearedCells，不把托盘单位数当物理格。平局按出货分数，再按稳定枚举顺序。升级选第一个。
- route：保留既有保路启发式，奖励即时出货、相邻同货类、相邻空格和当前订单货类，惩罚占用四个原Dock入口；平局按稳定枚举顺序。升级选第一个。它不是全局最优路线搜索，也不保证所有通路一直保持开放。

每局独立Bot seed = int32(game seed XOR CLI bot-seed XOR 0x51f15e)。Bot持有自己的随机游标；不会读取或推进RunState.rngState。每策略/每局重建游标，因此增加其他策略或改变执行顺序不会改变random策略的同Seed结果。Greedy/route不消费Bot RNG。

脚本直接复用真实引擎合法性/预览/命令执行，未植入公平性救援、重抽、修改棋盘或必胜预设。单次调用 `chooseMove(state,'random')` 未传独立游标时使用state.seed和commandIndex派生的确定性游标；批量模拟始终显式传入持久Bot游标。

## 指标口径

| 指标 | 字段和分母 |
| --- | --- |
| 首次可出库预计步数的经验估计 | `firstShipmentPlacements`为该Bot首次产生真实shipment时累计接受的place命令数，升级不计。它是该策略实际路径的观测值，不是最优解/理论最少步数。汇总给observed、censored、unknown、均值、min/median/p95/max；未出货正常结束/截断局记null并计censored，异常记unknown，不按0稀释均值。 |
| 平均Board occupancy | 每次有效place完成全部resolution及副作用后采一次，occupiedCellsSum / (49 × occupancySamples)，包含废弃物。汇总按有效放置数加权；不含初始空棋盘、不重复计升级、不代表落下但尚未清货时的瞬时峰值。 |
| 每100 Placement订单数 | 100 × 真实shipment事件数 / 接受的place数；不把升级、预览或非法输入计入分母。 |
| Chain分布 | `chainDistribution[n]`为一次有效place产生n个shipment的次数，包含0；各桶之和等于placements。另报maxChain。 |
| 最大Resolution step | `maxResolutionSteps`为单次有效place产生的最大shipment次数，与现引擎一次成功resolution循环一次出货的计数对应；不是BFS搜索节点数或for循环扫描次数。每次验证不超过64且不超过放置前冻结订单数。 |
| 三候选全部不可放发生率 | 每次有效place后的已补充候选状态观察一次；包含爆仓结果，排除胜利时尚未补候选的终止状态。仅恰好3候选的allBlocked / observations列入 `threeCandidateAllBlocked`；4候选单列 `candidateBlockage['4']`，不混入3候选分母。每局通常最多一次allBlocked。 |
| 升级出现/选择分布 | `upgradeOffered`每次新出现的一组候选逐ID计数；`upgradeSelected`只统计实际接受的升级命令。即使恰在选择前截断，也保留出现数而不虚构选择。完整版本目录包含0计数，附neverOffered/neverSelected。它们不等于升级效果实际触发计数。 |
| 平均失败班次 | meanFailureShift仅由真正failed局计算；另报所有自然/截断局的shiftHistogram和失败专属failureShiftHistogram。无失败则null。 |
| 完整性 | 每个接受命令做save roundtrip；snapshotChecks与commands对账。报告自然胜/败、capped与errors，所有局数之和可核验；每个正常局给finalChecksum。 |

## 真实执行结果：v3，Seed 1–100

同一代码与参数，各策略100局，max-commands=300，bot-seed=0。报告：`artifacts/simulation-v3-100-each.json`。

| 指标 | random | greedy | route |
| --- | ---: | ---: | ---: |
| 胜利 / 失败 | 0 / 100 | 39 / 61 | 86 / 14 |
| 异常 / 截断 | 0 / 0 | 0 / 0 | 0 / 0 |
| 接受命令 | 2,656 | 5,629 | 6,628 |
| 有效放置 | 2,609 | 5,208 | 5,968 |
| 完成订单 | 318 | 1,849 | 2,824 |
| 首次出货观测局 / 未出货删失局 | 85 / 15 | 99 / 1 | 99 / 1 |
| 首次出货平均有效步数（只含观测局） | 4.1765 | 2.2323 | 1.9192 |
| 首次出货中位数 / P95 | 3 / 13 | 2 / 6 | 2 / 5 |
| 平均占用率 | 42.3299% | 20.9168% | 10.3009% |
| 每100次放置订单数 | 12.1886 | 35.5031 | 47.3190 |
| 失败平均班次 | 1.17 | 2.3607 | 3.3571 |
| Chain 0 / 1 / 2 / 3 | 2307 / 287 / 14 / 1 | 3397 / 1773 / 38 / 0 | 3174 / 2764 / 30 / 0 |
| 最大Resolution step | 3 | 2 | 2 |
| 恰好3候选的全部不可放数 / 观察数 | 94 / 2486 | 49 / 3974 | 10 / 4182 |
| 恰好3候选全部不可放率 | 3.7812% | 1.2330% | 0.2391% |
| 升级候选总出现 / 总选择 | 141 / 47 | 1263 / 421 | 1980 / 660 |

四候选全部不可放另计：random 6/123，greedy 12/1195，route 4/1700。精确命令总数为14,913，放置总数13,785，全部14,913次快照回环验证通过。

覆盖缺口与可复查Seed：

- random从未出现pallet_pass、wild_supply；从未选择overfill、pallet_pass、rush_buffer、wild_supply。
- greedy与route都见到18个升级，但都未选择overfill、deep_route、chain、contract、variety这5个计分升级。这是固定首选升级策略造成的覆盖偏差，不应宣称18种效果都获批量触发验证。
- route失败Seed：4、13、16、20、22、27、35、37、46、49、53、59、64、85；其中49未出货。greedy未出货Seed为19。这些只表示相应Bot路径失败，不能称为人类不可玩的Seed。
- random有15个未出货Seed，详细逐局结果保存在JSON，不从首次出货均值中隐去删失数量。

旧版兼容小样，各策略仅3局：v1的random/greedy/route胜利数为0/0/2；v2为0/3/3。18局均0异常、0截断。规模不足以对旧版平衡做判断。

## 测试与后续压力验收

`tests/simulator.test.ts`覆盖：三策略白名单；随机合法性、复现和RNG隔离；Greedy净空间优先与Hazard副作用清格；默认route宿主胜利兼容；固定教程的精确首单/占用/Chain口径；真实run事件重放对账；跨策略独立性；v1/v2/v3入口；CLI逐字节复现与参数拒绝；截断退出码；3/4候选分母隔离；无合法/非输入阶段；截断时只出现未选择升级；实际引擎异常与Seed保留。

TDD证据：初始7失败/1兼容通过；实现后8/8；新增「截断不得成功退出」断言产生2个预期失败（0≠2），修改后通过。随后补齐统计边界与异常回归。

大规模阶段仍待执行：

1. 将Seed范围拆为有界批次，如每批1,000局，分别保存规则版本/参数/策略/Seed范围，串行运行或限制并发；现实现保留逐局统计在内存，不应直接把一次百万局当作低内存流式任务。
2. 64步Domain guard与max-commands能限制当前结算链和跨命令运行长度，不能打断单次同步引擎调用的真正死循环。未来长跑应由外层进程设置合理墙钟超时并保留批次范围，超时要记为未完成/异常，不能吞掉。
3. offered/selected分布只识别采样缺口；专项规则/升级效果触发仍依靠规则测试和后续覆盖任务。不要把升级被选择等同于效果已触发。
4. 人类体验、真浏览器、微信开发者工具和真机不是本脚本的验收范围；本次没有调用这些环境，也没有上传。

`largeScaleCoverage:false`是当前有界QA工具的明确声明；即使人为增加runs，也不会自动把它升级为母文档压力验收通过证明。
