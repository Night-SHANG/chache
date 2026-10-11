# v1.0.7 按钮反馈

记录时间：2026-10-11 17:55 北京时间（UTC+08:00）。用户于17:53确认截图并授权继续封包；实现与验证绑定保持。归档、Git与Library最终回执由正式封包凭据记录，不代表微信上传或公开发布。

## 基线与边界

从可重建源码备份修订12恢复，ZIP 20,779,295字节，SHA-256 10131a79a169d68113a4ebf1d21be0c3ccfdb1e9b95a8c09ddae2964f53e0b93。原生HEAD e5cedc8eda05850c2da5b3fd8591f473a76b7f92；对应GitHub release/v1.0.6 794cff14032584653ae78adf96f3d444ded1a49d。原生Git对象、引用、可达历史与恢复包完整保留，恢复后fsck通过。

本轮只增加按钮按态、点击声与独立震动开关。v1.0.6已认可的有限背景宽度、主动尝试音乐、BGM及原游戏音效、玩法规则、经济价格、账户命名空间、旧权益保持。APK、广告、微信上传及公开发布继续不在范围内。

## 交互与实现

- 可操作控件按下立即变暗并出现内压边，移出恢复、移回重新显示；有效抬起才执行。保持原命中区域，不为了按压缩小点击区域。
- 统一捕获入口覆盖普通按钮、暂停图标、工具箱、工具卡、货类选择、套装卡/成员卡、清扫卡、恢复和旧规则控件。按态是临时ViewState，不进入存档或回放。
- 商店拖动超过原14逻辑像素阈值即废弃点击，滑回不恢复点击；取消、失焦、后台、页面/弹窗身份、数量、动态控件变化清理按态。原350ms购买弹窗同区域防穿透保留。
- 清障只捕获实际可选占用格；空格、保留入口、已经选择两格后的第三格不播放“已选择”的反馈。有效格保持旧命中矩形。
- UI click为已有合成器生成的45ms轻声，峰值0.075，无外部音效或新依赖。有效动作处理后播放，避免被暂停/换页清场立即截断。已经发出的业务结果音优先，不叠加通用UI声。普通音最短间隔60ms，不丢操作。
- 主要开始、准备完成、购买确认、道具确认及清扫确认尝试一次轻触感；普通分类/翻页/开关不震。最短间隔120ms，不连续嗡鸣。
- 音效和震动分别控制。关闭当次立即安静；从关闭重新启用音效那次也不补播。震动开关本身不震。
- 浏览器仅在navigator.vibrate存在时请求15ms；微信仅在wx.vibrateShort存在时请求light。拒绝、不支持或抛错安全降级，无长震回退，不阻止按钮功能。

## 旧档兼容与失败路径

vibration为可选布尔字段。新账户默认开；旧档字段缺失按开解释，读取时不为补默认值重写旧档。用户切换时才走原有setSettings原子事务。四种账户格式与旧Profile编码字节往返检查覆盖，钱包、库存、外观、其他偏好保持。

UI反馈策略独立在application/ui-feedback.ts，避免突破现有单文件80KB质量闸门；没有放宽闸门。平台失败仍不改变Domain或事务结果。未完成/阻塞的账户操作不会震动暗示成功。

## 验证事实与限制

- 既有背景、玩法、资产及音乐等123个保护路径与基线SHA完全一致。
- 原样生产app.js/game.js在DOM/wx事件与原生Canvas宿主运行，未经改写。宿主检查覆盖按态像素边界、取消像素完全复原、音震调用计数、旧档读取无写、缺失与异常震动能力。截图账号的20000金币是隔离测试资金，不代表玩家获赠金币。
- 已执行静态、定向与完整串行检查，初次失败及修正日志均保留于qa/v107。第二轮完整串行2842/2844通过，2项继承母图缺失，0跳过/取消。新增禁用控件断言另行16/16定向通过，产品代码未变。独立216项双端宿主、58项定向与5项语义通过；原样音乐宿主4组通过；lint/typecheck/preflight通过。详细候选摘要见qa/v107/summary.json，不把分轮通过冒充单次全绿。
- 历史两项美术母图缺失未删除断言、未伪称恢复。旧脚本中设置行数、音效白名单、当前版号及恢复操作音预期已按新增语义更新；旧存档/规则断言保留。
- 原music startup宿主用适配器仅更新版本断言和脚本导入路径，不改产物，检查双端主动播放、拒绝后手势重试、开关/后台/恢复与单句柄。
- 宿主模拟证明API请求和画面变化，不证明真机听觉/触觉手感。真实浏览器GUI、微信开发者工具、iPhone/Android设备仍需体验；特别是手机网页可能无震动。

## 成熟方案依据

沿用项目Canvas UI、现有账户与音频层作薄适配，参考系统的短反馈/避免过度触觉规范，不引入另一个UI框架。
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/playing-haptics
- Android haptic principles: https://developer.android.com/develop/ui/views/haptics/haptics-principles
- Royal Match独立音效/音乐设置: https://dreamgames.helpshift.com/hc/en/3-royal-match/faq/47-how-can-i-enable-disable-sound-and-music/
- Angry Birds Match独立震动设置: https://roviosupport.helpshift.com/hc/en/37-angry-birds-match/faq/3173-how-do-i-turn-vibration-on-or-off/
- 微信API参考: https://developers.weixin.qq.com/minigame/dev/api/device/vibrate/wx.vibrateShort.html
- 本轮可读取的官方文档快照: https://github.com/VaJoy/wx-minigame-helper/blob/main/skills/wx-minigame-helper/references/api/device/vibrate/wx.vibrateShort.md
