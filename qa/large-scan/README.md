# 冻结规则3的离线压力扫描

这是开发QA工具，不进入game.js，也不改变用户正在测试的v0.3.1界面。

执行环境：已安装项目锁定依赖的Linux、Node24、Python3标准库、util-linux flock及/proc。父亡保护prctl不可用时拒绝开跑，不能关闭保护降级。

1. 先运行项目测试和tests/scan-*执行测试。
2. 在项目根目录创建manifest：
   `node qa/large-scan/create-manifest.mjs artifacts/campaign-manifest.json 33334 100 rules3-100002-uniform-upgrades-v1`
3. 核对manifest来源/参数，再启动：
   `node qa/large-scan/supervisor.mjs --manifest artifacts/campaign-manifest.json --output artifacts/campaign`
4. 中断后只对相同manifest恢复：
   `node qa/large-scan/supervisor.mjs --manifest artifacts/campaign-manifest.json --output artifacts/campaign --resume`
5. 查看progress.json；只有status=completed、全部receipt验证及配对/守恒对账满足时，才算该扫描完成。failure.json出现须先调查，禁止跳过问题宣布成功。

manifest、原始批次、receipt、stats和中断证据需一起保留。checkpoint只是可重建摘要。修改执行源码、pure-rand实际包字节或Node版本都会拒绝继续同一manifest。

该扫描仅standard。三策略使用已说明的uniform独立升级游标新协议，不与先前固定首选升级的小样本混算。胜率不是玩法乐趣或公平性认证。详细预注册见docs/large-scan-plan.md。
