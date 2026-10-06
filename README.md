# 爆仓：最后一格 · v0.7.2 试玩版

入库按订单配货，出库把同色货物连到出口；两个模式都需要给叉车留路。入库保留普通五班、无限和每日挑战；出库为9×9四档。

本版修正出库动画过快的问题：按每段距离和转角计时，直线缓起缓停，逐箱取货，到色口停稳后离场；安全路线尽量减少重复折返。没有总时长硬压缩。载荷仍为视觉抽象，其他颜色原地保留，规则、入库演出与计分不变。

操作见[试玩说明](docs/v072-playtest.md)，本地验收与平台边界见[验证记录](docs/v072-validation.md)。

## 打开试玩

完整解压ZIP。Windows已安装Node.js时双击start-preview.cmd，启动后打开http://127.0.0.1:4173/。关闭命令窗口停止服务。macOS/Linux在目录中运行node scripts/serve.mjs。已构建试玩无需安装项目依赖；需要Node.js可从https://nodejs.org/获取官方版，开发基线为Node24。

build/browser/index.html可直接打开，但文件模式的存储与音频支持取决于浏览器，优先HTTP方式。使用相同浏览器和地址保留本地进度；换浏览器或清缓存不会自动迁移。

微信开发者工具导入build/wechat为小游戏，目录含真实game.js和game.json。project.config.json的AppID留空，由有权限的开发者填写。没有申请、配置凭据、上传或发布微信版本。

## 开发与证据

依赖由package-lock.json固定，恢复依赖使用npm ci --ignore-scripts。常用任务为npm run lint、npm run typecheck、npm test、npm run preflight、npm run build和npm run host-smoke。构建不依赖网页dist转换，浏览器与微信共享规则和画面，平台适配单独隔离。

普通构建默认关闭诊断。明确开发用途可执行npm run build:debug，开启只读状态与浏览器复现接口；开发构建不能替代玩家交付构建。普通出库按持久化局序号分配不同seed，固定seed仍保存在单局/回放中。每日的客户端日界仍为北京时间，不使用服务器校时，也没有在线排行榜。

- src/domain：独立TS规则、连通组、BFS、确定性生成、连锁与Replay。
- src/application：会话、14个兼容存档槽、关闭标记、Profile、异常保护。
- src/presentation和src/platform：共享Canvas2D、触控、生命周期、声音。
- scripts/host-v072.mjs：实际game.js在离屏Canvas/wx宿主中的当前验收。
- scripts/outbound-video-qa.mjs：实际game.js的完整30fps原速无声录像、逐帧载荷/位置与速度检查。
- qa/v8-prefix-verify.mjs：读取400条已记录v6输入，验证旧状态及新增终局的前缀行为。
- docs/v8-prefix-verification.md：核对方法与结果，不能当作新机器人平衡实验。
- docs/project-scope-audit.md及历史版本记录：母文档范围和历史完成情况。

build-manifest.json、CHECKPOINT.json与包内SHA256SUMS记录来源和产物。完整开发备份保存历史Git bundle与大型QA数据；轻量试玩包只包含启动所需内容和说明。

## 验证边界

本地测试和离屏宿主能够验证代码、规则和产物行为，不能替代真实浏览器、WindowsGUI、微信开发者工具/真机、音频听感或真人平衡验收。主玩法尚未最终选定。

旧100,002局只覆盖旧入库规则；v0.6的400局测量和v0.7的记录前缀核对各自注明范围。没有依据机器人胜率自动调整规则，也没有把这些结果当作好玩或公平性证明。

无远程账号、广告、支付、在线榜单或云存档。视觉采用现有程序化资产；四张视觉样板仅作方向参考，不嵌入游戏包。
