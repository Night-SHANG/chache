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
| v0.6.0 入库/出库本地已验证 | `d937569dafc37f187410cb67ff6f1be915caeacc` | [`bd7df80`](https://github.com/Night-SHANG/chache/commit/bd7df8056cf0100128a0b42d1f61027f361e130d) |
| v0.7.0 玩家界面与堵入口终局本地已验证 | `a12803adf741bb27861e3d4517b3220e388b44f4` | [`b279c5d`](https://github.com/Night-SHANG/chache/commit/b279c5d6057165837543eff075764e2148f05f65) |
| v0.7.1 逐格装载与载货离场本地已验证 | `55b48e3f4d4c32c77581437cad8b92020941cc3a` | [`e31dada`](https://github.com/Night-SHANG/chache/commit/e31dada459edca3b63f24cf4a61a26ff6a16d3e8) |
| v0.7.2 分段节奏与安全少绕路本地已验证 | `aa42b4c51e341ab81d92c68948a2e3eb7a8b43ed` | [`2617825`](https://github.com/Night-SHANG/chache/commit/26178254eb3c0d5439e8d1fdbbc24a8fd83829ff) |
| v0.7.3 整组收拢与最短安全离场本地已验证 | `d619eb92d3189684c5bda2e340105752953060f5` | [`3281ba8`](https://github.com/Night-SHANG/chache/commit/3281ba8bf2782e472d4379097c515e44899c2045) |
| v0.7.4 普通出库每组1秒本地已验证 | `5b7c293e26f5c45d00b014b415681b61a3b8bcca` | [`6158a1e`](https://github.com/Night-SHANG/chache/commit/6158a1ebf1fe1fec489f70c68c50f29f0970bc44) |
| v0.8.0 成长、经济与独立教学本地已验证 | `ff6e6d7ce78cb0b8f58810de7d2d4536490d2ef7` | [`22b1f53`](https://github.com/Night-SHANG/chache/commit/22b1f5384aa3d891fb1626219f1243feb1ecab8c) |
| v0.9.0 无普通升级入库与交互精修本地已验证 | `c1560138d6166b541611921a9b4715fb3406dcae` | [`389367e`](https://github.com/Night-SHANG/chache/commit/389367e2183beb6bd88a43c30f3006468d0bd27e) |
| v0.10.0 入口、道具、多形加急与纯分币完整本地已验证 | `eff25c268cd340bdaf787e2755975a9c2c3934c8` | [`ab05f53`](https://github.com/Night-SHANG/chache/commit/ab05f5384811bffc867bfec28b8124455c14bdd4) |

完整 GitHub SHA：

- v0.3.1 恢复快照：`02df3324fe216b42312393743e30eafd8a64a913`
- v0.3.2 暂停时 WIP（未完成全面验收）：`1b8f034034c08a6af8e80e7361628ab7d44231ec`
- v0.3.2 本地已验证：`05e525ed6186f353a30795d6fd6727469b113d87`
- v0.4.0 双模式本地已验证：`ac855148ffecdf99ac4d611822077b4afcd25485`
- v0.5.0 混色三档本地已验证：`18f6bf4e65dc3de39e654c0c9a211f18253b4603`
- v0.6.0 入库/出库本地已验证：`bd7df8056cf0100128a0b42d1f61027f361e130d`
- v0.7.0 玩家界面与堵入口终局本地已验证：`b279c5d6057165837543eff075764e2148f05f65`
- v0.7.1 逐格装载与载货离场本地已验证：`e31dada459edca3b63f24cf4a61a26ff6a16d3e8`
- v0.7.2 分段节奏与安全少绕路本地已验证：`26178254eb3c0d5439e8d1fdbbc24a8fd83829ff`
- v0.7.3 整组收拢与最短安全离场本地已验证：`3281ba8bf2782e472d4379097c515e44899c2045`
- v0.7.4 普通出库每组1秒本地已验证：`6158a1ebf1fe1fec489f70c68c50f29f0970bc44`
- v0.8.0 成长、经济与独立教学本地已验证：`22b1f5384aa3d891fb1626219f1243feb1ecab8c`
- v0.9.0 无普通升级入库与交互精修本地已验证：`389367e2183beb6bd88a43c30f3006468d0bd27e`
- v0.10.0 入口、道具、多形加急与纯分币完整本地已验证：`ab05f5384811bffc867bfec28b8124455c14bdd4`

## 历史边界

- 这些 GitHub 提交是从稳定节点重新导入的源码快照，不是把原提交的作者、时间、父链原封不动推送。上表保留对应关系。
- 本次可验证的原本地历史起点是 `1a9a2378af73f8be5a499f1c6d1f686c944ced86`，它从已有备份恢复 v0.3.1 源码。更早 v0.1/v0.2/v0.3 的原 Git 对象未找回，不能承诺按当年的原 SHA checkout。
- 此前恢复后的原始 Git bundle 已随完整私有文件备份保存；GitHub 保存上表可直接回退的过滤源码快照，不上传包含私有参考文档的 bundle。
- v0.3.2 WIP 特意保留为中间快照；需要稳定修复版时选择后一个 v0.3.2 已验证节点。
- 历史文档中的“未上传仓库”等叙述表示当时状态；此页说明当前备份状态。

## 包含与排除

保留源码、package-lock.json、测试和合成 fixtures、构建/预览/验证脚本、程序化资源生成代码、许可说明及项目派生说明。游戏图形和音效资源由代码生成。

排除 node_modules、构建产物、真实玩家存档和账号信息、密钥、私有参考截图、docs/research 中的 Notion 原文及原始研究导出、十万局原始扫描数据、外部文档仓库、内部实施记录和嵌套 bundle。部分旧说明保留对这些外部证据的引用；它们不是此源码仓库的缺失运行依赖。

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

查看 v0.10.0 的纯源码快照：

```sh
git switch --detach ab05f5384811bffc867bfec28b8124455c14bdd4
```

回到最新备份：

```sh
git switch dev/wechat-game
git pull --ff-only origin dev/wechat-game
```

这些操作只选择代码版本，不恢复或删除浏览器/微信内的玩家存档。旧代码不一定接受新版存档；历史试玩建议使用独立浏览器资料，保留现有试玩进度。

## 已做的备份核验

- 十四个源码快照均回读 GitHub tree，对保留文件逐一核对路径、文件模式与 Git blob SHA，确保字节相同；依次确认为 112、119、121、139、163、196、215、225、233、239、245、335、369、436 个文件。
- 全部原历史文件及新版本增量做了敏感内容检查，原始 Notion 导出从每个上传快照中排除，不能只依赖 HEAD 删除。
- 每个源码快照推进备份分支时都使用预期旧 SHA 并禁止 force，再读取远端 ref 确认提交。
- v0.4.0 的独立恢复目录重新通过 npm check（576 项 Node 测试）和 22 项 Python 测试。
- v0.5.0 稳定源节点的验证记录为 674 项 Node 测试、22 项 Python 测试及本地三档宿主检查；此次备份核对源文件与该节点相同，没有另称完成真实浏览器、微信真机或真人可玩性验收。
- v0.6.0 稳定源节点的验证记录为 839 项 Node 测试、22 项 Python 测试、8组实际游戏本地宿主检查以及 lint/typecheck/preflight/build，独立审查问题已关闭。本次备份核对196个保留文件的原始字节，source SHA-256 与该节点的 `5bb11e9558ca59e06eee092deb3546f654a8ce7287e039b9b355d10ac0394735` 完全一致。

- v0.7.0 稳定源节点的验证记录为906项 Node 测试、22项 Python 测试、400条旧局记录前缀核验、11组实际游戏本地宿主检查（17个量测页面、41张截图）以及 lint/typecheck/preflight/build。宿主已绑定稳定原提交 `a12803ad` 再次复跑通过，没有新增源码改动。本次备份215个源文件逐字节一致，source SHA-256 为 `27b23401766113f1c45eef82b37e75fde842ac78715d346f6b4b9b7d6d7be2f7`。

- v0.7.1 稳定源节点的验证记录为934项 Node 测试、22项 Python 测试、12组实际游戏本地宿主检查与82张截图/帧，以及 lint/typecheck/preflight/build和独立审查。最终构建绑定原提交 `55b48e3`，source SHA-256 为 `98b839b887fe4e0b4b323e43b3f2eada6d30e1702d84943034974ac6673406ff`。本次225个源文件逐字节一致，Domain目录与v0.7.0一致；版本内容是出库逐格装载、载货从对应色口离场等表现调整，没有改动规则与计分。

- v0.7.2 稳定源节点的验证记录为947项 Node 测试、22项 Python 测试、12组实际游戏本地宿主检查和82张截图，以及5段30fps连续视频（共1474帧）、lint/typecheck/preflight/build与独立审查。source SHA-256 为 `d10965dc0eb5770658f5547b3e034f0356df5cb35fd2c84111ab31c36e554233`。233个保留源文件逐字节一致，Domain与v0.7.1一致；本版调整每段动画速度、缓起停和安全少绕路，不改规则与计分。大型视频/逐帧原始证据不放入源码Git树。

- v0.7.3 稳定源节点的验证记录为952项 Node 测试、22项 Python 测试、12组实际游戏本地宿主检查与79张截图，以及8段30fps连续视频（共733帧）、lint/typecheck/preflight/build和独立审查。source SHA-256 为 `3211f409f90eab513d96d941c3185f5767a34e2599ef31f39b2d2b08a1bde71f`。239个保留源文件逐字节一致，Domain与v0.7.2一致。表现已从逐箱巡回改为整组收拢到托盘，再沿本组清空后的最短安全路从对应色口离场；不改规则与计分。

- v0.7.4 稳定源节点的验证记录为956项 Node 测试、22项 Python 测试、12组实际游戏本地宿主检查与133张PNG，以及9段视频共414帧、lint/typecheck/preflight/build和独立审查。最终构建和host/video报告都绑定原提交 `5b7c293` 再次通过，source SHA-256 为 `9b3af2e849fdf3665cb6efb79bc43bf730df3a866d2e643c5ea4b61f1f32aaeb`。245个保留源文件逐字节一致；运行代码仅出库时序文件变化，Domain、入库源码与计分不变。普通出库每组1000ms，连锁每组分别计时；简化动效沿用80ms，整组装载与合法路径保留。

- v0.8.0 稳定源节点的验证记录为1251项 Node 测试、22项 Python 测试、lint/typecheck/preflight/build、独立规格/质量审查以及实际game.js本地宿主22/22案例（三尺寸、40fps连续采样）。新增规则9/10、成长、游戏内经济、账户持久化和独立教学，因此本版规则实际改变；旧规则1–8引擎文件与v0.7.4相同。335个保留源文件逐字节一致，source SHA-256 为 `f398788dccce139be5183880b382de784b1bdfd163494bab65161d9a926febf7`。

- v0.9.0 稳定源节点的验证记录为1334项 Node 测试、22项 Python 测试、lint/typecheck/preflight/build、独立审查和实际game.js本地宿主16/16案例（三尺寸）。新规则11去掉普通升级并恢复基础订单量，旧规则1–10引擎文件与v0.8.0一致；本版不能描述为整个Domain未变。369个源文件逐字节一致，source SHA-256为 `95d9987895cab674f6f46a077156d19fd480167e264f4e142884ab486d26073a`。896局固定策略五班研究见 `docs/v090-five-shift-comparison.md`，它不是玩家真人胜率。

- v0.10.0 稳定源记录为1529项Node、22项Python、lint/typecheck/preflight/build、独立模块与整支审查，以及实际game.js本地宿主59/59（三尺寸、139张静帧、738帧连续采样）。436个源文件逐字节一致，source SHA-256为 `0f5cb97a4a51573c365a699583cda07474361a8446360d8a366405c9b63bbbc1`。规则12/13/14与经济v2包含本轮最终批准参数；旧规则1–11引擎文件与v0.9.0相同。

## v0.6 的中间 WIP 单独保留

[wip/v0.6-development](https://github.com/Night-SHANG/chache/tree/wip/v0.6-development) 保留原 `347ec2d63fda87f299325cdf7239f66353277ff1` → 备份 `b9ba194b9d4afde990e4330863097e1618803696` 的历史中间检查点。该 WIP 当时尚未完成整合，状态说明不适用于本表已验证的 v0.6.0 `d937569` 节点。两条分支各自保留，WIP 分支没有被改写。

v0.6.0 的 `WIP-V060.json` 已明确旧检查点被当前本地验收节点取代。当前记录见 `CHECKPOINT.json` 和 `docs/v060-validation.md`；真实浏览器、Windows GUI、微信设备与真人平衡仍待实测。

## v0.7 的中间 WIP 单独保留

[wip/v0.7-development](https://github.com/Night-SHANG/chache/tree/wip/v0.7-development) 保留原 `b7cf2e97664f144b1edd136c06e99cf9328184e6` → 备份 `c1cc219b9f37c52f8cebc0cc2482f6f15270a5a0` 的开发中检查点。该 WIP 当时未完成最终宿主验收；本表的稳定 `a12803ad` 已完成本地验收，不能混用两者状态。WIP 分支保持原样。

当前稳定 v0.7 的 `WIP-V070.json` 已标明完成本地验证；详细记录见 `CHECKPOINT.json` 与 `docs/v070-validation.md`。这不等于真实浏览器、Windows GUI、微信设备或真人可玩性验收已完成。

## v0.7.1 的验证节点

原本地 `61dcb55adbe163b9c5b1b594de7f0c08a6fd1540` 是中间 WIP；本表对应的是后续已完成本地验证的 `55b48e3f4d4c32c77581437cad8b92020941cc3a`，不能混用状态。当前记录见 `CHECKPOINT.json`、`docs/v071-playtest.md` 与 `docs/v071-validation.md`。真实设备、Windows GUI和真人观感仍待后续实测。

## v0.7.2 的验证节点

原本地 `cf700be1e744866078cd0396b2d100102b51e3bd` 是中间 WIP；本表对应后续本地已验证的 `aa42b4c51e341ab81d92c68948a2e3eb7a8b43ed`。当前说明见 `CHECKPOINT.json`、`docs/v072-playtest.md` 和 `docs/v072-validation.md`。不要将中间开发状态、离屏宿主视频检查和真实设备/真人体验验收混为一谈。

## v0.7.3 的验证节点

原本地 `35cdc4b2d17dec1798372c493e647c32e5a003a3` 是中间 WIP；本表对应后续本地已验证的 `d619eb92d3189684c5bda2e340105752953060f5`。当前说明见 `CHECKPOINT.json`、`docs/v073-playtest.md` 和 `docs/v073-validation.md`。v0.7.1/v0.7.2 的逐箱巡回表现仅留在旧版本中供恢复，当前版本已改为整组装载；本地宿主和视频证据仍不能替代真实平台/真人体验验收。

## v0.7.4 的验证节点

原本地 `23643771c938bb9583e24443dbb8c28c56948887` 是未发布WIP；此表对应后续本地已验证的 `5b7c293e26f5c45d00b014b415681b61a3b8bcca`。只在稳定备份链追加，未另推该WIP或覆盖原WIP分支。当前说明见 `CHECKPOINT.json`、`docs/v074-playtest.md` 与 `docs/v074-validation.md`。旧版可变时长描述作为历史记录保留；当前普通模式固定每组1秒，不代表真实设备或真人体验验收已经完成。

## v0.8.0 的完整验证与成长WIP边界

实际宿主验证的代码提交是 `cdfc9ad9568f5080af2190ff03e3d9afdd7ec573`。最终封存提交 `ff6e6d7ce78cb0b8f58810de7d2d4536490d2ef7` 只改6份文档，src、scripts、package.json及lockfile字节完全相同；重建源hash与game.js字节一致。game.js SHA-256为 `a99be3b7429bf51874e3a712a0296a0ae5d59e5d388911dc3c24817d0188a0fa`。当前验收以 `CHECKPOINT.json`、`docs/v080-validation.md`、`docs/v080-scope-audit.md` 和 `docs/v080-playtest.md` 为准，不沿用旧WIP/旧版本状态。

[wip/growth-economy-tutorials](https://github.com/Night-SHANG/chache/tree/wip/growth-economy-tutorials) 继续保留原 `83054ad80cc7f609926dc1b3d5f05f6b1010c1de` → 备份 `80870140f977b4fe0f9797837cd9c83ea739cf53` 的灾难恢复检查点。它当时尚有UI整合/typecheck/test未完成；当前稳定v0.8.0已完成本地验收，WIP分支没有被改写。

本版增加版本化账户、钱包、道具和教学存储。回退源码不等于回退玩家存档；历史版测试应使用独立浏览器资料并保留现有数据，不把真实存档上传到此源码仓库。真实浏览器、Windows GUI、微信设备、音频听感与真人平衡仍待实测，本地宿主通过不代表这些验收已经完成。

## v0.9.0 的完整验证与无升级WIP边界

实际代码验证提交为 `65c835b89fde56fca1505aa32011049a9fa7224e`。最终封存 `c1560138d6166b541611921a9b4715fb3406dcae` 只修改7份文档/检查点，src、scripts、package.json与lockfile字节完全一致。game.js SHA-256为 `4d72b357256bca25eb44bd110a6309170906a5ddad4a8665f7e72a127810b831`。当前验收见 `CHECKPOINT.json`、`docs/v090-validation.md` 与 `docs/v090-playtest.md`；真实浏览器、Windows GUI、微信设备与真人平衡仍待实测。

[wip/refinement-no-upgrades](https://github.com/Night-SHANG/chache/tree/wip/refinement-no-upgrades) 保留原 `0a2d632fa4b5b8229e15a65b0ab92c4cc0759d14` → 备份 `d4b605e87e240aa08e497fdafc9aa81956c3dbf5` 的灾难恢复点。该点当时尚未完成最终实包QA，WIP分支仍保留NOT_RELEASED说明；不要把它的阶段状态和后续稳定v0.9.0混用。旧稳定与所有已有WIP历史未被覆盖。

## v0.10.0 完整稳定版与此前候选边界

本次稳定原提交为 `eff25c268cd340bdaf787e2755975a9c2c3934c8`。已验代码 `066cd0b47b3967f516f6557fedd6ae283f122ebb` → 最终提交只改7份文档/元数据，src、scripts、package和lock字节相同。game.js为850505字节，SHA-256 `7fb6bb9c7c17ed6197771177e4e29c9f2aee2597c1bceaa8a875b50d0c790f7b`。最终说明见 `CHECKPOINT.json`、`docs/v0100-playtest.md` 与 `docs/v0100-validation.md`。

当前正式实现本轮批准更新：入库保留四入口，出库保留南入口并支持工具；自适应多形加急的普通/每日/无限概率为6%/12%/6%；纯分数金币入库/出库除数120/30，每日首次胜利总3倍并按开局日期锁定，无限以累计应得减去已付避免重复发放；出库四档累计分数倍率1/1.25/1.5/2。经济版本与账户格式为2。它已不是“参数待定”的候选。

[wip/entrance-outbound-tools](https://github.com/Night-SHANG/chache/tree/wip/entrance-outbound-tools)保留两阶段历史：原 `81922dbecb65736fa93ab58af40a3bcfd2a6ce1b` → 备份 `692bbac8e5fe29e239e5146f2594c86a48f90bec`；原已验候选 `f17d92757c2249f4957729148766338d164e80f0` → 备份 `7f2c2325a2b1db01ed99a7062014bdf7beef763e`。该分支的参数待定说明属于当时状态，分支未被覆盖；现在选择稳定v0.10.0时应看本节及最终验收文档。

生产自适应生成研究共288次观察，其中7个无限案例在120次放置窗口结束时仍进行中，不是失败或真实终局。固定策略普通89/128、每日94/128的结果不证明每日更难，也不代表真人胜率或最终平衡。真实浏览器、Windows GUI、微信设备与真人体验仍未验收。

回退代码不等于回退钱包/局内存档；尤其候选原型与经济v2不能混当同一存档协议。历史测试应保留现有数据并使用独立浏览器资料。

后续备份应追加新提交并记录源 SHA，不改写这些恢复节点。数值平衡、真人体验与真实微信运行仍以各版验证说明为准。
