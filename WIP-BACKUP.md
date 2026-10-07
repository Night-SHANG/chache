# 静态玩法说明与入口显示：v0.13 开发恢复点（NOT_RELEASED）

本节点用于灾难恢复。界面定向检查通过，但旧教程/练习测试适配、独立源代码审查和实际游戏包QA尚未完成；它不是最终试玩或稳定v0.13版本。

## 固定来源与映射

- 分支：`wip/static-help-visible-ports`
- 原本地源码：`af3f45fd9dfcbf04b25c48b92c26f04446832fbb`
- GitHub源码快照：`59580a8bbfd498955c558b7e067bd9bbf599dc27`
- 原源码父节点：`0a1456390aea595cd2f2c55ad6aa5efa0c5f3d15`（稳定v0.12.0）
- 备份链父节点：`9446432e916c6ebc3e875a837ddd39bb2e10ea1c`
- 来源是独立复制并验证通过的完整12-ref bundle；只导入固定af3f45f，不读取活跃工作树。
- 507个保留文件逐路径、模式、Git blob SHA核对一致；本说明另加1个文件。
- 过滤源码树：`fe48eca29ad6fe4bd77d2c341c8657868469099b`，远端与本地相同。
- 构建输入恢复SHA256：`775f51f116123c104c962a368f0b852f15addc121a2aa122b96d369ed6b50dcf`。

构建输入摘要按src/、scripts/下全部文件及package.json、package-lock.json的POSIX相对路径排序，逐项加入路径UTF-8字节和文件原字节，无分隔符。该值证明恢复内容，不代表构建或验收成功。GitHub快照是新创建的提交，SHA、作者/时间和父链不与原提交相同；恢复时使用上述GitHub SHA。原本地完整历史继续保存在来源bundle。

## 本节点范围

四个已保留入库入口从开局显示，未开门灰显，订单门依原解锁机制点亮；入口禁放、派车和出库规则保持。主页仅一个“玩法说明”入口，选择入库/出库后复用既有页面；暂停中的说明保留并原地返回。新手教程、设置开关、练习重播、自动弹出和强制引导移出可见流程。

加急文案采用用户确定的原句：加急数字按后续成功放置次数倒数，不是倒计时

领域规则文件与v0.12.0逐字节相同，危险货仍沿用规则16，道具上限仍2种、每种1件；订单量、概率、计分、收益、外观和出库时序没有在本节点改变。

来源bundle还保留独立 `fix/daily-only-hazard` 分支上的 `c733ab53e7febcc56d97c812252c9d9c81a719dd` 规则17候选历史。本节点不是那个分支的后代，源码树没有规则17；没有把未接入候选当作稳定机制导入。范围依据见 `docs/v0130-approved-scope.md`。

## 检查边界

生产交接记录为19项定向测试、TypeScript和lint通过。全量首轮仍有71项旧教程/练习预期未适配，独立审查和实际包QA正在进行；不能称v0.13最终门已通过。本次备份只独立核验来源、文件和树摘要，不另称重新运行产品验收。

原package/build标签仍是v0.12。原 `CHECKPOINT.json` 的 `LOCAL_VALIDATION_COMPLETE`、1780项测试、58宿主和旧game.js摘要均属于v0.12稳定基线，不能用于证明af3f45f通过。为保持原字节，本快照保留这些文件并在此明确历史边界。真实浏览器、Windows GUI、微信设备和真人体验也没有对该WIP完成验收。

## 恢复方法

在独立目录恢复：

```sh
git clone https://github.com/Night-SHANG/chache.git
cd chache
git switch -c restore/static-help-wip 59580a8bbfd498955c558b7e067bd9bbf599dc27
```

已有克隆先 `git fetch origin`。需要连同本说明查看时检出 `origin/wip/static-help-visible-ports`。不要对有未保存修改的目录做强制重置。按README准备Node24及锁文件依赖；本节点存在已知测试未适配，恢复成功不等于可以发布。

稳定版继续使用 [v0.12.0备份](https://github.com/Night-SHANG/chache/tree/9446432e916c6ebc3e875a837ddd39bb2e10ea1c)，历史回退见 [版本指南](https://github.com/Night-SHANG/chache/blob/9446432e916c6ebc3e875a837ddd39bb2e10ea1c/BACKUP_VERSIONS.md)。回退代码不代表回退存档；测试历史版使用隔离资料并保留真实玩家数据。

## 备份范围

保留源码、锁文件、测试和合成fixtures、必要开发资源、脚本及项目文档。排除原始Notion导出、内部规划目录、node_modules、构建/大批QA材料、私有参考截图、其他项目、真实存档和凭据；保留文件扫描无敏感命中。

本次只建立专用WIP恢复分支，稳定dev、main及所有旧WIP分支保持原样。
