# 每日专属加急与教学：开发中恢复点（NOT_RELEASED）

这是 v0.12.0 新一轮实现的首个灾难恢复检查点。当前只有规则16及存档编解码、玩法接口的部分接入；账户和教学整合尚未完成，不能当作最终试玩包或稳定版本。

## 来源与映射

- 远端分支：`wip/daily-only-rush-guides`
- 原本地源码提交：`0643280f39437f394a350c2ff9ff45014a0b7f67`
- GitHub 源码快照：`d59d0858d6882db1d5dbb3159698fb50fa5df9cc`
- 原源码父节点：`e84de2ded3c8ffa7e513c1dfa4f48a3284ef2930`（v0.11.0）
- 备份链父节点：`dffb068f8043976719f8efcf67166536fb076f37`
- 来源为独立复制并验证通过的完整10-ref Git bundle；只采用固定0643280f源码。
- 484个保留文件逐路径、模式和Git blob SHA匹配；过滤源码树为 `7cb8e2fde8041d0578f3b64147e421b7f27c6f30`。本说明另加1个文件。
- 构建输入恢复摘要SHA256：`dbfb7212118d657cc158c99b18777f22e4f476eba00b4483bd83fdc30bcad3d9`。

构建输入摘要按src/、scripts/下的文件及package.json、package-lock.json的POSIX相对路径排序，逐项加入路径UTF-8字节和文件原字节，无分隔符。它证明恢复内容的一致性，不代表构建或产品验证成功。

GitHub源码快照是重新创建的提交，不是原作者、时间和父链原封不动导入；恢复时使用上述GitHub SHA。此前恢复后的完整原Git历史保留在原bundle中，GitHub仅保存过滤后的版本快照。

## 这个节点的真实状态

源码生产阶段记录为129项相关测试通过，其中22项为新增；不是最终全量验收。本次备份核验源码身份和字节，没有另称重跑产品测试。

规则16核心包含：普通、直接无限及普通通关后的加班均不生成加急、没有清扫天赋；每日前四阶段新货6%加急，第五阶段新货100%加急，每次开局需选择每2单或每6次成功放置的清扫。旧规则1–15文件与v0.11.0基线保持一致。新规则尚未完成账户、会话和界面整体接线，不要将领域实现等同于最终玩家流程。

该检查点仍有5个后续账户/界面类型接线错误，任务独立审查当时进行中。账户格式4、独立每日教学及引导恢复尚未实施；全量门禁、实际game.js宿主和最终试玩包尚未完成。批准的最终范围见 `docs/v0120-approved-scope.md`，它是目标范围说明，不是已完成清单。

特别注意：原 `CHECKPOINT.json`、README及v0.11文档仍保留基线的 `LOCAL_VALIDATION_COMPLETE`、1625测试、139宿主和旧构建摘要。这些数值只属于旧v0.11.0，不能用于证明0643280f已经通过。为保持原字节，本备份没有改写源文件；本说明明确当前WIP边界。真实浏览器、Windows GUI、微信设备和真人体验也未对该点验收。

## 恢复方法

在独立目录克隆并创建恢复分支：

```sh
git clone https://github.com/Night-SHANG/chache.git
cd chache
git switch -c restore/daily-guidance-wip d59d0858d6882db1d5dbb3159698fb50fa5df9cc
```

已有克隆先 `git fetch origin`，再创建独立分支。需要连同此说明查看时使用 `origin/wip/daily-only-rush-guides`。不要对正在开发的工作区做强制重置。源码含锁文件和脚本，可依项目README准备Node 24；此WIP存在已知类型错误，恢复成功不等于检查通过。

稳定版仍为 [dev/wechat-game的v0.11.0](https://github.com/Night-SHANG/chache/tree/dffb068f8043976719f8efcf67166536fb076f37)，旧版本恢复方式见 [版本指南](https://github.com/Night-SHANG/chache/blob/dffb068f8043976719f8efcf67166536fb076f37/BACKUP_VERSIONS.md)。恢复代码不会恢复玩家存档；测试旧版请使用隔离资料并保存现有真实数据。

## 保存范围

保存源码、锁文件、测试和合成fixtures、必要开发资源、构建/测试脚本及项目文档。排除原始Notion导出、内部规划目录、node_modules、构建/大批QA素材、其他项目、真实存档与凭据；保留文件扫描无敏感内容命中。

本分支只提供开发灾备；旧稳定链与此前WIP分支保留。
