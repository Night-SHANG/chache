# 无升级精修 WIP 灾难恢复检查点

状态：NOT_RELEASED，未发布，非玩家试玩包。此分支只用于保住开发进度，当前稳定版本仍为 [dev/wechat-game 的v0.8.0](https://github.com/Night-SHANG/chache/commit/22b1f5384aa3d891fb1626219f1243feb1ecab8c)。

## 版本对应

- 原本地分支：`feat/polish-no-upgrades`
- 原源码检查点：`0a2d632fa4b5b8229e15a65b0ab92c4cc0759d14`
- GitHub源码快照：[`d4b605e87e240aa08e497fdafc9aa81956c3dbf5`](https://github.com/Night-SHANG/chache/commit/d4b605e87e240aa08e497fdafc9aa81956c3dbf5)
- 远端分支：`wip/refinement-no-upgrades`
- 本分支建立时的稳定备份基点：`6c011d2da6ecbd98f566909e7bc9660b43627a30`

这是从完整且已验证的bundle独立恢复后重新导入的过滤快照，不冒充原始Git提交的作者、时间或父链。保留362个源文件，逐文件路径、模式和blob SHA与原检查点一致。用于恢复核对的源输入SHA-256为 `5e537964e8753ebd047f19abcf5e1f9d3e114305153012b2069fb4f3bdf170a1`，它不是最终可玩版的验收标记。

## 当前范围与边界

此检查点保存新规则11、无普通升级的入库流程、账户/UI与商店/工具箱精修、教学和研究脚本。已有实现与阶段集成回归进展，但最终实际构建QA及完整交付检查尚未完成。不能把阶段测试数量等同于正式可玩或已完成验收。

`WIP-V090.json` 明确为WIP_NOT_RELEASED，`CHECKPOINT.json` 明确IMPLEMENTATION_IN_PROGRESS。其他旧README/旧版本文档仅供历史参考；当前稳定试玩仍是v0.8.0。本次不替换用户试玩、不创建Release。

排除Notion原始参考导出、内部实施记录、node_modules、构建和大QA素材、真实玩家存档、凭据及私有截图。保留源码、依赖锁文件、测试和必要合成fixtures。

## 安全恢复开发

在独立克隆或已保存工作的目录执行：

```sh
git fetch origin
git switch -c restore/refinement-0a2d632 d4b605e87e240aa08e497fdafc9aa81956c3dbf5
```

之后继续完成当前代码的检查与真实构建QA。选择源码版本不会恢复或删除浏览器/微信中的玩家存档，不要把此WIP直接替换稳定试玩。

稳定dev、main及此前各WIP分支均保持原样，没有强推或发布。
