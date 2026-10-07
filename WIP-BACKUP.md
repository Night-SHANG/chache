# 入口预留与出库工具 WIP 恢复检查点

状态：NOT_RELEASED，未发布，非玩家试玩包。仅用于灾难恢复；当前稳定版仍为 [v0.9.0](https://github.com/Night-SHANG/chache/commit/389367e2183beb6bd88a43c30f3006468d0bd27e)。

## 提交对应

- 原本地分支：`feat/entrance-tools`
- 原源码检查点：`81922dbecb65736fa93ab58af40a3bcfd2a6ce1b`
- GitHub源码快照：[`692bbac8e5fe29e239e5146f2594c86a48f90bec`](https://github.com/Night-SHANG/chache/commit/692bbac8e5fe29e239e5146f2594c86a48f90bec)
- 远端分支：`wip/entrance-outbound-tools`
- 建立本分支时的稳定备份基点：`63a6ebee4b114b62f28f8c617a3aba59736e7b98`

来源bundle已独立恢复并验证完整历史，导出的是过滤后的新快照提交，不冒充原始提交的作者、时间或父链。404个保留源文件逐路径、文件模式和blob SHA匹配。恢复校验用源输入SHA-256为 `2a465e9f761fb0757a0dceff5eae3b3d51ed916508d6b367f8d98cbafec946dc`，不是最终构建验收标记。

## 这个检查点仍未完成

新规则12/13/14包含入库四门预留和出库工具及账户/UI整合。按该固定检查点的状态，UI目标高亮还有2项测试失败、旧默认版本测试待迁移，全量typecheck也尚未通过；后续实际构建QA与审查未完成。个别已过的规则检查不代表整版通过。

概率、按分金币和每日首胜锁定的新提案仅做研究，并未正式实施。此分支不表示这些数值或经济方案已获实现验收。

`WIP-V0100.json`明确WIP_NOT_RELEASED。其他旧README、CHECKPOINT或旧版本文件可能仍描述先前稳定版，不能用来证明此WIP完成。后续修复或稳定版须使用新的检查点，不能修改本次保存的历史含义。

排除Notion原始参考导出、内部实施记录、node_modules、构建和大型QA素材、真实存档、凭据及私有截图；保留源码、依赖锁、测试及必要合成fixtures。

## 安全恢复

在独立克隆或已保存工作的目录执行：

```sh
git fetch origin
git switch -c restore/entrance-81922db 692bbac8e5fe29e239e5146f2594c86a48f90bec
```

继续修复和验证后再用于交付，不把此WIP替换稳定试玩。选择源码版本不会恢复或删除浏览器/微信的玩家存档。

稳定dev、main和以前的各WIP分支均未改变，没有强推、标签、Release或试玩发布。
