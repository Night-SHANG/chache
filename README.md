# 货箱最后一格 v1.0.15 · 单包与外观加载

微信、浏览器与 Android 使用同一份单包资源代码。商店只保留场景、货箱、叉车三个单品分类，移除套装入口与优惠。霓虹货站、野外补给站、海港仓库、鎏金宝库四套停售。历史购买记录与库存保留；已装备的退役外观安全显示经典默认外观，金币与其他进度保持。音乐文件、音量与编码不变。

普通外观预览等待或失败仅在图片区域显示状态，页面操作保留；近期预览在有界缓存内复用，主页实际绘制后逐张后台准备。启动或已装备的核心场景仍保留必要的加载保护与重试。

## 打开与继续旧存档

试玩包完整解压，关闭上一版游戏页和服务。Windows安装Node.js24后双击start-preview.cmd；macOS/Linux执行node scripts/serve.mjs，打开http://127.0.0.1:4173/。

必须沿用原浏览器、用户配置与原网址来源；127.0.0.1和localhost不是同一个存档来源。不要清站点数据或使用无痕窗口；关闭旧页再打开新版。沿用原存档键和账户格式。浏览或购买不会自动装备。

微信工程位于build/wechat，由有权限的开发者填写原AppID。全部内容都在主包，没有外观分包或下载接口。原始主包超过4MiB时构建会明确警告；这是供用户导入开发者工具核验的单包，尚不能声称通过微信包体限制。没有上传、提审或公开发布。

## 构建与验证边界

使用Node.js24，运行npm ci --ignore-scripts，再执行npm run lint、npm run typecheck、npm test、npm run preflight。正式构建为npm run build:production；Android网页staging为npm run build:android。新Android标识为v1.0.15/vc5；staging构建不代表已生成或签名APK。

历史两项美术母图缺失检查保留，不能表述为全量测试全绿。运行PNG和当前构建不依赖这两张缺失母图的重新生成。当前三页真实截图使用生产renderer与native Canvas，不能替代浏览器、微信开发者工具或实体手机验证。

详情见[本次记录](docs/v115-single-package-loading.md)。[v1.0.14入口说明](docs/v114-entry-readme-history.md)保留为历史，其中分包、套装和旧版本说明不适用于当前版本。
