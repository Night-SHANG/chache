# v0.6 开发中恢复备份（未发布）

本分支只保存开发中检查点，不是已验收试玩成品。当前可用试玩和稳定源码仍为 v0.5.0，请查看 [稳定备份分支](https://github.com/Night-SHANG/chache/tree/dev/wechat-game)。

## 提交对应

- 原本地 WIP：`347ec2d63fda87f299325cdf7239f66353277ff1`
- 原本地父节点：`cc78c06d73c475eadf2457dbe199227209e02bcc`（v0.5.0）
- GitHub WIP 源码快照：[`b9ba194b9d4afde990e4330863097e1618803696`](https://github.com/Night-SHANG/chache/commit/b9ba194b9d4afde990e4330863097e1618803696)
- 本分支建立时的稳定备份基点：`41494771549e3a9eeb994edb2083879e56e737fc`

这是重新导入的恢复快照，不冒充原 Git 提交。独立从经过验证的 bundle 恢复，过滤后192个源文件全部与原 WIP 的路径、模式、blob SHA 一致。

## 未完成项

以 `WIP-V060.json` 为准：终局生命周期整合、存档墓碑故障语义审查、菜单界面与旧测试适配、新 game.js 实际宿主检查、项目总体验收和试玩包尚未完成。局部规则与部分专项测试完成不等于整版通过。本次只验证备份完整性，没有宣布构建或全套测试通过。

部分保留的 README、package.json、CHECKPOINT.json 仍描述此前稳定版本；不要把它们当作本 WIP 已验收的证据。

备份继续排除依赖目录、构建输出、真实存档、凭据、私有参考截图、Notion 原文、大型原始扫描数据及内部实施记录。没有修改稳定分支或 main，没有强推、标签或 Release。

## 恢复开发中代码

仅在独立克隆或已保存工作的目录操作：

```sh
git fetch origin
git switch -c restore/v0.6-wip b9ba194b9d4afde990e4330863097e1618803696
```

它用于恢复开发进度，不要求玩家下载或试玩。选择代码版本不会恢复玩家存档。
