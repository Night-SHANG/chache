# v8 旧输入前缀兼容性核验

核验日期：2026-10-06。协议：outbound-v8-recorded-prefix-v1。

本次只读取此前 v6 的 400 条完整记录，不是 400 局新机器人对局，不运行新策略，也不重新抽样或调整规则。旧记录来源是同一策略、种子 1–100、四档各 100 条。

旧 v6：400/400 完整重放通过，20605 个逐命令 checksum、2648 个已有检查点 checksum、400 个完整终态全部匹配。原输入及原报告的 SHA-256 均匹配旧 manifest。
新 v8：只按原命令执行至各自首个终局，共接受 20544 条命令。20944 次完整状态比较（含 400 个初态），除版本/配置身份外逐字段一致；提前终局时只允许 phase/result/endReason 改变，并单独验证入口 index 76 有货及追加且仅追加一个失败事件。

| 难度 | 旧胜利保持 | 旧失败 | 提前入口结束 | 无提前结束 | 避免后续填格总数 | 每条提前结束记录 min / median / max |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| easy | 65 | 35 | 2 | 33 | 3 | 1 / 1.5 / 2 |
| normal | 30 | 70 | 11 | 59 | 21 | 1 / 2 / 5 |
| hard | 4 | 96 | 11 | 85 | 19 | 1 / 2 / 4 |
| expert | 0 | 100 | 12 | 88 | 18 | 1 / 1 / 4 |

合计：99 条旧胜利全部保持完成；301 条旧失败中 36 条在入口有货时提前结束，省去 61 条原后续填格命令（每条提前结束记录最少 1、中位 1、最多 5 条）。
省去的每条命令都在旧 v6 中继续成功重放，并验证入口持续占用、无出货、已有货物未删除且占用格只增加。它们在新 v8 中仅作终局拒绝探针，61/61 被拒绝且状态/事件不变。所有 400 个新终局另有拒绝探针。

未提前结束的旧失败共 265 条：其中 236 条直到旧终局入口仍为空，29 条恰在原最终命令占入口（没有可省去的后续命令）。具体 seed/difficulty 与分类见 report.json 的 summary.oldFailedWithoutEarlyStopCases。

旧规则证明：v1–v7 共 24 个冻结源码 SHA 保持；v1–v6 已有黄金夹具 645 次初态/逐步摘要保持。v7 使用已有 seed-1 命令夹具，对公开路由与已冻结实现作 65 次完整状态/事件比较（含直接结算）；没有把新生成摘要说成旧黄金 checksum。

## 证据与复现

- 原输入：artifacts/outbound-v6-comparison/runs.jsonl；SHA-256 eb3f351998c634fe3749e55e2f2a7e63342ebc6d1700e6c2525ed488c7d20e86
- 原 manifest：artifacts/outbound-v6-comparison/manifest.json；SHA-256 34ddfa205850917c15271bd964866a3f39a7b5900bb56a9b2b70a2ac487b61e9
- 当前规则、路由、replay、依赖、验证器和旧夹具绑定：092dc8b0c5ea19a17a93fb3a1635c7ac2480993059f5a1856b723ccef4a338fc
- artifacts/v8-prefix-verification/report.json：聚合统计和每条记录的紧凑结果，保留 v6/v8 前缀命令/摘要哈希，不复制旧大日志。
- artifacts/v8-prefix-verification/manifest.json：本次输入来源、协议、源码/输出哈希、环境与运行前后未漂移证明。旧 manifest 的 current-root 源码哈希是历史来源，不要求已新增 v8 的路由恢复旧字节。
- 小协议测试：node --test tests/v8-prefix-verify.test.ts。正式读取入口：node qa/v8-prefix-verify.mjs --output <新证据目录>；拒绝覆盖既有输出。
- 只检查已生成证据及当前绑定：node qa/v8-prefix-verify.mjs --verify artifacts/v8-prefix-verification；不再重放 400 条。

此证据只支持有限旧输入的兼容性和可证明的提前结束性质。它不证明最佳策略、真人公平性、趣味性或胜率提升；新终局反例、玩家 UI、触控、存档/成绩/session 由各自测试另外覆盖。
