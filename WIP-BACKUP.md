# 每日专属加急与教学：开发中恢复点（NOT_RELEASED）

此分支保存v0.12.0开发中的灾难恢复节点，当前第二节点为账户格式4、独立每日引导及规则16界面接线后的检查点。最终全量与实际包验收尚未完成；三档五班、教程开关和独立练习的新范围也尚未实现，不能用作最终试玩。

## 两个可恢复节点

| 检查点 | 原本地源码SHA | GitHub源码快照SHA |
| --- | --- | --- |
| 首个规则16核心WIP | `0643280f39437f394a350c2ff9ff45014a0b7f67` | `d59d0858d6882db1d5dbb3159698fb50fa5df9cc` |
| 第二账户4／每日引导整合WIP | `d032f6d4050b2892ddfdd1f6f8246814484f03fb` | `b849e6ff837a6b0582b45dc1bd73d227b589b68f` |

第二节点由原本地0643280f经坏档枚举修复277a078，再到d032f6d。GitHub新源码快照以先前WIP分支头 `5e2e697e6f71fef398fd43f2fff2c6899fcbfbc7` 为父，保留首个快照及其说明的真实备份链。没有伪造原本地提交对象；原SHA与GitHub快照SHA不同，作者/时间/原父链不保证原样。

[首节点当时的完整说明](https://github.com/Night-SHANG/chache/blob/5e2e697e6f71fef398fd43f2fff2c6899fcbfbc7/WIP-BACKUP.md)仍在历史中。那个点的账户未实现、5处类型接线错误和旧CHECKPOINT沿用v0.11数据，都是当时状态，不能沿用为第二节点的当前结论。

## 第二节点身份与字节核验

- 原始来源：独立复制、验证通过的完整10-ref Git bundle，固定原提交d032f6d；没有读取活跃工作树。
- 492个保留文件逐路径、模式和Git blob SHA匹配；本说明另加1个文件。
- 过滤后的源码树：`b62f308503b7d652a70d58fce8fa49c117d95ea7`，远端与本地计算一致。
- 构建输入恢复摘要SHA256：`54206061191fdb4966cec4abd4017cd509be4d17e086de5ee71a58900a7f8328`。

摘要按src/、scripts/下全部文件及package.json、package-lock.json的POSIX相对路径排序，每项依次加入路径UTF-8字节和文件原字节，无分隔符。它验证恢复字节，不是最终构建或产品通过的证明。

## 当前实现与检查边界

原源码包含规则16坏档枚举修复、账户格式4、每日独立学习进度、旧账户迁移，以及规则16会话/界面接线。普通五班、直接无限、普通通关后的加班无加急、无清扫；每日每次开局必选清扫，前四阶段新货6%加急、第五阶段新货100%。旧规则1–15引擎文件与v0.11基线相同。经济版本仍2，钱包、永久外观、道具和日期领奖账本兼容。

生产交接记录为304项受影响测试、49项账户安全、45项结构兼容及lint/typecheck通过，局部规范与质量独审通过。各批次检查可能覆盖重叠范围，不把它们相加称为一次全量测试。本次备份核验固定源码和恢复内容，不另称重跑这些产品测试。

当前 `CHECKPOINT.json` 已改为 `APPROVED_DAILY_ONLY_UPDATE_IN_PROGRESS`，最终测试数、源/游戏摘要、宿主结果均为空。最终整支验收、全量Node/Python、实际game.js宿主与打包仍待收口。部分 `docs/v0120-validation.md` 的“整合中”记录保持原字节，完整最终验收仍以未来封存节点为准。

新增普通五班三档、教程启用开关和隔离的零奖励独立练习，仅在该节点记录批准范围，尚未实现。不能把 `plannedFiveShiftTiers` 或 `plannedTutorialControls` 当作已交付功能。真实浏览器、Windows GUI、微信设备和真人体验未对该点完成验收。

## 安全恢复

在独立克隆中恢复第二节点：

```sh
git clone https://github.com/Night-SHANG/chache.git
cd chache
git switch -c restore/daily-guide-account-wip b849e6ff837a6b0582b45dc1bd73d227b589b68f
```

恢复首个节点时，创建另一个分支并使用 `d59d0858d6882db1d5dbb3159698fb50fa5df9cc`。已有克隆先 `git fetch origin`。需要连同最新说明查看时检出 `origin/wip/daily-only-rush-guides`。不要强制重置有未保存修改的工作区。

源码包含锁文件和开发脚本，可按README准备Node24。WIP恢复成功不代表最终检查通过；历史代码不一定接受新账户格式，测试时使用隔离资料并保留现有真实存档。

稳定版仍是 [v0.11.0备份节点](https://github.com/Night-SHANG/chache/tree/dffb068f8043976719f8efcf67166536fb076f37)。更早稳定版本见 [稳定版本恢复指南](https://github.com/Night-SHANG/chache/blob/dffb068f8043976719f8efcf67166536fb076f37/BACKUP_VERSIONS.md)。

## 保存范围

保留源码、锁文件、测试、合成fixtures、开发资源、构建/测试脚本与项目文档。本节点新增daily-v16-trace为固定时间/种子的合成测试回放，不是真实玩家存档。

排除原始Notion导出、内部规划目录、node_modules、构建和大批QA素材、其他项目、真实存档及凭据；保留文件扫描无敏感命中。原本地完整历史保存在来源bundle中，GitHub只导入过滤源码快照。稳定dev、main和其他WIP分支保持原样。
