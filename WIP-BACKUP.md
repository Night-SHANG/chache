# 入口与出库工具：已验候选备份，尚非最终交付

当前状态：CORE_VALIDATED_PARAMETERS_UNDECIDED。代码核心已完成本地验证，但此次全部需求与参数选择尚未收口。玩家轻包和稳定 `dev/wechat-game` 仍保持v0.9.0；本次只在原WIP分支增量保存候选。

## 本分支恢复节点

- 初始未完成WIP：原 `81922dbecb65736fa93ab58af40a3bcfd2a6ce1b` → [源码备份 `692bbac8e5fe29e239e5146f2594c86a48f90bec`](https://github.com/Night-SHANG/chache/commit/692bbac8e5fe29e239e5146f2594c86a48f90bec)。其含说明的旧分支HEAD为 `d2b4f38cc0aed898b312cf990a59b6dd8a44e707`。
- 本次已验候选：原 `f17d92757c2249f4957729148766338d164e80f0` → [源码备份 `7f2c2325a2b1db01ed99a7062014bdf7beef763e`](https://github.com/Night-SHANG/chache/commit/7f2c2325a2b1db01ed99a7062014bdf7beef763e)。

新节点追加在旧节点之后，没有重做或覆盖初始WIP历史。这些是过滤后重新导入的备份提交，原提交与备份提交SHA不同。

## 核验边界

实际代码验证提交为 `afc8342bdcef62888e274590ea6dba8be7528405`；随后 `841bbb1` 和 `f17d927` 仅改检查点/说明，src、scripts、package及lock字节未变。

源记录：1422项Node、22项Python、lint/typecheck/preflight和独立审查通过；实际game.js原生wx/Canvas宿主51/51场景通过。真实浏览器、Windows GUI、微信设备与真人手感尚未验证。原81922db的UI失败/未完typecheck描述属于历史检查点，不代表本次候选状态。

本次411个保留源文件的路径、模式和blob SHA全部与独立bundle恢复一致。构建输入SHA-256：`befa231b6dd63e02d128de88ff5c72451e4393e3b509601eb088922da752b021`。

118个src TypeScript文件的产品SHA-256：`bc74b241ef291c8568b501974c48bba484bf71c97e58392df0b2bf902940393c`。已按POSIX相对路径排序、每项“路径+NUL+原始字节+NUL”独立复算。src另有2个JSON文件，也包含在逐文件备份核验中；此产品摘要与包含scripts/package的构建摘要不是同一算法。

## 尚待用户决定，未提前实施

普通/每日/无限加急概率、多格加急形状、入库/出库纯分数金币折算系数与每日倍率尚未最终选定。每日首胜锁定等新经济方向仍属于待定研究。本候选生成仍6%，金币仍使用旧公式，没有将这些提案提前作为正式版本。

规则12/13/14的入口预留、出库工具与救场核心已在候选内；它不等于这次完整任务已完成。详细当前状态见 `docs/v0100-core-checkpoint.md` 与 `CHECKPOINT.json`。固定策略研究不是真人胜率或最终平衡结论。

## 安全恢复

在独立克隆或已保存工作的目录执行：

```sh
git fetch origin
git switch -c restore/entrance-candidate-f17d927 7f2c2325a2b1db01ed99a7062014bdf7beef763e
```

先完成待定参数与后续验收，再统一交付；不要将此候选直接替换稳定玩家包。选择源码版本不会恢复或删除玩家存档。

原始Notion导出、内部实施记录、依赖目录、真实存档、凭据和大型QA素材继续排除。稳定dev、main及其他WIP分支未改，没有强推、标签或Release。
