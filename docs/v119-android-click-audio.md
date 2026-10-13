# v1.0.19 Android 按钮点击声

## 变更范围

仅在 Android 的 ui_click 播放路径，将原点击增益提高 6 dB（振幅约 1.995 倍）。浏览器和微信仍使用原增益；BGM、其他 12 种音效、音效开关与保存方式、60 ms 按钮防连发、前后台暂停规则均不改。

所选 Dustyroom DM-CGS-32 原素材、CC0 许可和成品 WAV 字节保留。成品仍为 44.1 kHz、双声道、PCM16、8253 帧（约 187 ms）。没有重新合成、放大 WAV、变调、裁切、压缩或 EQ。

## 增益与数字余量

- 共用 UI_CLICK_GAIN 仍为 0.2428740327036814。
- Android 专用 ANDROID_UI_CLICK_GAIN 为 UI_CLICK_GAIN × 10^(6/20)，约 0.4845974047381747。
- Android 总音效系数保持 0.45。因此点击 HTMLAudio.volume 从 0.10929331471665664 提高至 0.21806883213217862（浮点乘法顺序可能产生末位差异）。仍在 0 到 1 的合法区间内，不依赖超范围音量被钳制后的无效增益。
- WAV 实测样本峰值为 0.9881591796875；最终点击峰值从约 0.107999 提高至约 0.215487。每次播放从固定常量赋值，缓存复用不会累乘。
- BGM 正常音量仍为 0.18 × 10^(-2/20)。当前 MP3 解码后的混音峰值约为 0.064888；单次点击加 BGM 的保守样本峰值上界约为 0.280374，约有 11.05 dB 数字余量。

上述数据只验证数字增益和单次点击加 BGM 的余量，不能代表实体手机扬声器的辨识度或主观响度，也不保证任意多个业务音效同时叠加都不会截幅。物理 Android 听感尚未验证。

Android 构建 manifest 记录专用 playbackGain、androidBoostDb、实际 playbackVolume 及调整后的 effectiveTargetPeak。该 target peak 沿用既有字段含义，即点击专用增益后的目标值、尚未乘总音效系数；实际播放器音量见 playbackVolume。浏览器原 manifest 的音频参数不变。

## 验证

先运行新用例确认旧代码在预期处失败：实际播放仍为旧 0.109293；Android manifest 也仍报告旧增益。改动后，音频与 Android staging 相关 67 项测试通过：

- Android 仅按钮提升 6 dB，其余 12 种音效保持 0.45
- 连续 30 次播放、停止后重播、未知音效名与缓存复用
- 原音频 SHA 与浏览器／微信播放音量保持不变
- BGM 正常、暂停、关闭状态不被按钮改动
- Android 后台、失去宿主所有权时停止且不意外重播
- 真正的 GameSession 音效设置、静音导航、保存重载和重新开启
- 实际 Android staging manifest 与打包素材一致

证据：qa/v119/android-audio-focused.log、qa/v119/android-audio-level-report.json。项目最终全量检查由主任务合并执行；本记录不将定向通过表述为全项目通过。没有据此生成、签名、推送或发布 APK。
