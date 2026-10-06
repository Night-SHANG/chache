# 成长、经济与教学 WIP 恢复检查点

此分支用于灾难恢复，明确未完成，不是正式可玩版，也不要求玩家下载。当前稳定版本仍在 [dev/wechat-game](https://github.com/Night-SHANG/chache/tree/dev/wechat-game)，本次没有替换它。

## 版本对应

- 原本地功能分支：`feat/growth-economy-tutorials`
- 原本地检查点：`83054ad80cc7f609926dc1b3d5f05f6b1010c1de`
- GitHub源码快照：[`80870140f977b4fe0f9797837cd9c83ea739cf53`](https://github.com/Night-SHANG/chache/commit/80870140f977b4fe0f9797837cd9c83ea739cf53)
- 远端恢复分支：`wip/growth-economy-tutorials`
- 建立本分支时的稳定备份基点：`1c86ba441b7f9c24667e181deadf34f566836e99`

这是从完整、已核验的Git bundle独立恢复后导入的过滤源码快照，不是原提交作者、时间与父链的原封不动移植。保留315个源文件，逐文件路径、模式和blob SHA与原检查点一致；完整源输入SHA-256为 `a7d7dada6ef6579b1566d3c28416b45dad8d2edebb8c1dff0b41ee33372d37f6`。

## 未完成状态

本检查点保存成长规则、游戏内经济/道具、账号存档服务、独立入库/出库教学和界面整合中的工作。该检查点的UI整合、全项目typecheck/test尚未通过，未完成整体验收。此次只证明备份完整，没有声称构建或全套测试通过。

源码中保留的README、CHECKPOINT.json、WORK-IN-PROGRESS.json等旧说明仍可能描述已验证的v0.7.4；它们不能证明本检查点的新功能已经完成。后续稳定版应另行验收和备份。

排除原始Notion参考导出、内部实施记录、node_modules、构建/原始QA大产物、真实玩家存档、凭据及私有截图。保留源码、lockfile、测试和必要的固定种子/教程合成fixture。

## 安全恢复

请在独立克隆或已保存工作的目录使用：

```sh
git fetch origin
git switch -c restore/growth-83054ad 80870140f977b4fe0f9797837cd9c83ea739cf53
```

先按源码实际状态继续修复和验证；不要将这个中间检查点替换玩家的稳定试玩。选择代码版本不会恢复或删除浏览器/微信内的玩家存档。

没有改变main、稳定dev或已有WIP分支，没有强推、标签、Release或试玩发布。
