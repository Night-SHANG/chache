# 每日专属加急、三档五班与教学：候选恢复点（NOT_RELEASED）

本分支当前保存第三个v0.12.0开发检查点。批准功能已经整合为候选源码，但练习独立审查、最终全量检查与实际游戏包QA尚未完成。它是灾难恢复节点，不是已经交付的稳定试玩版。

## 按顺序保留的三个节点

| 检查点 | 原本地源码SHA | GitHub源码快照SHA |
| --- | --- | --- |
| 规则16核心WIP | `0643280f39437f394a350c2ff9ff45014a0b7f67` | `d59d0858d6882db1d5dbb3159698fb50fa5df9cc` |
| 账户4／每日教学整合WIP | `d032f6d4050b2892ddfdd1f6f8246814484f03fb` | `b849e6ff837a6b0582b45dc1bd73d227b589b68f` |
| 三档／独立练习整合候选 | `36ca0441a1a4acd371a6e4730766cf2ce84eaf1f` | `2345c1f46f193640c00ad55b44bffc0a21dfdf0a` |

第三节点原本地历史由d032f6d经bfc82f2到36ca044；GitHub新源码提交以第二节点分支头 `e59a81598cb687d8930b23cf0223429ea7939bcc` 为父。首个和第二个源码快照、说明及备份父链均保留。

GitHub使用新创建的过滤源码快照，原SHA与备份SHA不同，不是原作者、时间及完整原父链原封不动导入。恢复请用右列GitHub SHA。原本地完整历史保存在来源bundle中；GitHub只导入过滤后的游戏文件。

历史状态分别见 [首节点说明](https://github.com/Night-SHANG/chache/blob/5e2e697e6f71fef398fd43f2fff2c6899fcbfbc7/WIP-BACKUP.md) 与 [第二节点说明](https://github.com/Night-SHANG/chache/blob/e59a81598cb687d8930b23cf0223429ea7939bcc/WIP-BACKUP.md)。旧节点“账户未实现”“三档与练习待实现”等边界描述属于它们当时的内容，不适用于当前候选。

## 当前源码与核验

- 来源：独立复制并验证通过的完整10-ref Git bundle，固定36ca044，不读取活跃工作树的未提交修改。
- 498个原文件逐路径、文件模式与Git blob SHA匹配；本说明另加1个文件。
- 过滤源码树：`9215be6326fded8fc695d2963b1df5a42e3f6544`，本地与远端计算相同。
- 构建输入恢复SHA256：`8dac803b4aefbbca56b321e444bec2937c5ddbc0d8df38dd83bbd33253fa2fc9`。

该摘要按src/、scripts/下全部文件及package.json、package-lock.json的POSIX相对路径排序，每项依次加入路径UTF-8字节与文件原字节，无分隔符。它证明恢复内容一致，不等于构建或产品验收通过。

## 当前功能与未完成验证

当前候选包含普通A、困难C、专业B三档固定五班订单与分档成绩；困难和专业通关后不继续加班，每日和直接无限沿用A档。设置中的tutorialsEnabled控制正式局自动教学；入库、出库和每日三项手动练习使用隔离的临时状态，设计为不产生真实金币、成绩或每日奖励。

规则16保持普通、无限与普通通关后的加班0加急；每日前四阶段新货6%、第五阶段新货100%，每次每日开局必须选清扫。旧规则1–15引擎文件与v0.11.0相同。账户格式4与经济版本2分离，旧钱包、永久外观、道具与每日奖励账本仍在兼容范围。

生产阶段交接记录为314项局部测试、TypeScript与限定范围lint通过，三档审查发现的三个问题已复审通过。练习独立审查、最终全量Node/Python及静态门、实际game.js宿主和最终打包仍在进行。本次备份核验固定源码及字节，不另称重跑这些产品测试，也不把局部测试当作完整验收。

原 `CHECKPOINT.json` 仍明确为进行中，最终测试数、源码/游戏摘要及宿主结果为空；其planned字段尚未收口。`docs/v0120-playtest.md` 已预写功能和“本包已验证”等措辞，但在这个固定候选节点中不能作为最终包或宿主完成证明。原文保持原字节，实际状态以本说明的边界为准。没有向玩家交付这个候选包。

真实浏览器、Windows GUI、微信设备、真人审美与手感均未对该候选完成验收；早期固定策略研究不是真人胜率。

## 安全恢复

在独立目录恢复第三节点：

```sh
git clone https://github.com/Night-SHANG/chache.git
cd chache
git switch -c restore/v0120-candidate 2345c1f46f193640c00ad55b44bffc0a21dfdf0a
```

恢复早前节点时使用表中相应SHA创建另一个分支。已有克隆先 `git fetch origin`；需要连同当前说明查看时检出 `origin/wip/daily-only-rush-guides`。不要强制重置有未保存修改的目录。

源码包含锁文件及开发脚本，依README准备Node24。代码回退不会回退真实玩家存档；旧代码可能不接受新格式，测试历史版应使用隔离资料并保留现有数据。

稳定备份仍是 [v0.11.0](https://github.com/Night-SHANG/chache/tree/dffb068f8043976719f8efcf67166536fb076f37)，旧稳定版本见 [版本恢复指南](https://github.com/Night-SHANG/chache/blob/dffb068f8043976719f8efcf67166536fb076f37/BACKUP_VERSIONS.md)。

## 保存范围

保留源码、锁文件、测试、合成fixtures、必要资源、构建/测试脚本与项目文档；排除原始Notion导出、内部规划目录、node_modules、构建/大批QA素材、其他项目、真实存档与凭据。保留文件扫描无敏感命中。

此更新只推进专用WIP分支，稳定dev、main及其他WIP分支保持原样。
