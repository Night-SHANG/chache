# v0.7 开发中恢复备份（未完成、未发布）

此分支保存开发中检查点，不能视为已验收试玩成品。建立备份时，稳定源码仍为 [dev/wechat-game 的 v0.6.0](https://github.com/Night-SHANG/chache/commit/bd7df8056cf0100128a0b42d1f61027f361e130d)。

## 提交映射

- 原本地 WIP：`b7cf2e97664f144b1edd136c06e99cf9328184e6`
- 原本地父节点：`d937569dafc37f187410cb67ff6f1be915caeacc`
- GitHub WIP 源码快照：[`c1cc219b9f37c52f8cebc0cc2482f6f15270a5a0`](https://github.com/Night-SHANG/chache/commit/c1cc219b9f37c52f8cebc0cc2482f6f15270a5a0)
- 本分支建立基点：`027f3beadd9eb348129195090820e8817f04b36b`

这是从已核验 bundle 重新导入的快照，不冒充原始 Git 提交。过滤后209个源文件的路径、模式和 blob SHA 全部与原 WIP 一致。

## 当时的验证边界

`WIP-V070.json` 记录新 v8 出库入口占用终局判定、可恢复反例、规则/存档独立审查和部分玩家文案与整合测试。该检查点尚未完成输入前缀证据、全项目最终检查、普通构建的实际 game.js 截图/开发开关验收和最终打包。此次只验证备份完整性，不宣称完整构建、全套测试或实际宿主最终验收通过。

部分 README、package.json、CHECKPOINT.json 仍可能描述上一个稳定版本，不能作为本 WIP 已验收的依据。后续稳定版本应另行备份，不改写这个检查点。

源码备份排除依赖、构建输出、真实玩家存档、凭据、私有截图、原始参考文档、大型扫描原始数据及内部实施记录。稳定分支、main 和 v0.6 WIP 分支保持不变，没有强推、标签或 Release。

## 恢复开发进度

在独立克隆或已保存工作的目录中：

```sh
git fetch origin
git switch -c restore/v0.7-wip c1cc219b9f37c52f8cebc0cc2482f6f15270a5a0
```

这个检查点不要求玩家下载或试玩；选择代码版本不恢复玩家存档。
