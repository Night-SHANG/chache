# 版本备份与安全回退

备份日期：2026-10-06。仓库为私有仓库，源码备份分支为 `dev/wechat-game`；`main` 用作导航。没有正式 Release，也没有强推或覆盖原有分支历史。

## 可恢复版本

下面是按时间连接的新备份提交链。每个节点都完整保存该版本的可构建源码，而不是只有差分文件。点击备份提交可查看、下载该版本。

| 版本与状态 | 恢复后本地提交 SHA | GitHub 备份提交 |
| --- | --- | --- |
| v0.3.1 恢复快照 | `1a9a2378af73f8be5a499f1c6d1f686c944ced86` | [`02df332`](https://github.com/Night-SHANG/chache/commit/02df3324fe216b42312393743e30eafd8a64a913) |
| v0.3.2 暂停时 WIP（未完成全面验收） | `854b33fa98aae957f41a94eef811c8e5eb536658` | [`1b8f034`](https://github.com/Night-SHANG/chache/commit/1b8f034034c08a6af8e80e7361628ab7d44231ec) |
| v0.3.2 本地已验证 | `c673bdc8a53fd65d1ae5ff93cd3add03b4439ce8` | [`05e525e`](https://github.com/Night-SHANG/chache/commit/05e525ed6186f353a30795d6fd6727469b113d87) |
| v0.4.0 双模式本地已验证 | `c634897168e9cb7827d7d5647f502ea533d044d3` | [`ac85514`](https://github.com/Night-SHANG/chache/commit/ac855148ffecdf99ac4d611822077b4afcd25485) |
| v0.5.0 混色三档本地已验证 | `cc78c06d73c475eadf2457dbe199227209e02bcc` | [`18f6bf4`](https://github.com/Night-SHANG/chache/commit/18f6bf4e65dc3de39e654c0c9a211f18253b4603) |

完整 GitHub SHA：

- v0.3.1 恢复快照：`02df3324fe216b42312393743e30eafd8a64a913`
- v0.3.2 暂停时 WIP（未完成全面验收）：`1b8f034034c08a6af8e80e7361628ab7d44231ec`
- v0.3.2 本地已验证：`05e525ed6186f353a30795d6fd6727469b113d87`
- v0.4.0 双模式本地已验证：`ac855148ffecdf99ac4d611822077b4afcd25485`
- v0.5.0 混色三档本地已验证：`18f6bf4e65dc3de39e654c0c9a211f18253b4603`

## 历史边界

- 这些 GitHub 提交是从稳定节点重新导入的源码快照，不是把原提交的作者、时间、父链原封不动推送。上表保留对应关系。
- 本次可验证的原本地历史起点是 `1a9a2378af73f8be5a499f1c6d1f686c944ced86`，它从已有备份恢复 v0.3.1 源码。更早 v0.1/v0.2/v0.3 的原 Git 对象未找回，不能承诺按当年的原 SHA checkout。
- 恢复后的原始五提交 Git bundle 仍在完整私有文件备份中保留。GitHub 此处不上传该 bundle，因为其中含不应随代码上传的原始参考文档。
- v0.3.2 WIP 特意保留为中间快照；需要稳定修复版时选择后一个 v0.3.2 已验证节点。
- 历史文档中的“未上传仓库”等叙述表示当时状态；此页说明当前备份状态。

## 包含与排除

保留源码、package-lock.json、测试和合成 fixtures、构建/预览/验证脚本、程序化资源生成代码、许可说明及项目派生说明。游戏图形和音效资源由代码生成。

排除 node_modules、构建产物、真实玩家存档和账号信息、密钥、私有参考截图、docs/research 中的 Notion 原文及原始研究导出、十万局原始扫描数据、外部文档仓库和嵌套 bundle。部分旧说明保留对这些外部证据的引用；它们不是此源码仓库的缺失运行依赖。

## 获取当前版并构建

需要对该私有仓库有访问权限，使用 Node.js 24：

```sh
git clone --branch dev/wechat-game https://github.com/Night-SHANG/chache.git
cd chache
npm ci --ignore-scripts
npm run check
npm run serve
```

预览地址为 http://127.0.0.1:4173/ 。`npm run check` 包含 lint、typecheck、Node 测试、preflight 和构建；Python 报告测试另行运行：

```sh
python -m unittest discover -s tests -p 'test_*.py'
```

## 无损查看或恢复旧版

先确认工作区没有未保存修改。最好在单独克隆目录检查历史版；不要对正在开发的目录执行 reset --hard。

例如从 v0.4.0 创建独立恢复分支：

```sh
git fetch origin
git switch -c restore/v0.4.0 ac855148ffecdf99ac4d611822077b4afcd25485
npm ci --ignore-scripts
npm run check
```

查看 v0.5.0 的纯源码快照：

```sh
git switch --detach 18f6bf4e65dc3de39e654c0c9a211f18253b4603
```

回到最新备份：

```sh
git switch dev/wechat-game
git pull --ff-only origin dev/wechat-game
```

这些操作只选择代码版本，不恢复或删除浏览器/微信内的玩家存档。旧代码不一定接受新版存档；历史试玩建议使用独立浏览器资料，保留现有试玩进度。

## 已做的备份核验

- 五个源码快照均回读 GitHub tree，对保留文件逐一核对路径、文件模式与 Git blob SHA，确保字节相同；依次确认为 112、119、121、139、163 个文件。
- 全部原历史文件及新版本增量做了敏感内容检查，原始 Notion 导出从每个上传快照中排除，不能只依赖 HEAD 删除。
- 每次更新分支都使用预期旧 SHA 并禁止 force，再读取远端 ref 确认提交。
- v0.4.0 的独立恢复目录重新通过 npm check（576 项 Node 测试）和 22 项 Python 测试。
- v0.5.0 稳定源节点的验证记录为 674 项 Node 测试、22 项 Python 测试及本地三档宿主检查；此次备份核对源文件与该节点相同，没有另称完成真实浏览器、微信真机或真人可玩性验收。

后续备份应追加新提交并记录源 SHA，不改写这些恢复节点。数值平衡、真人体验与真实微信运行仍以各版验证说明为准。
