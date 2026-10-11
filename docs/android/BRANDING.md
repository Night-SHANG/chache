# Android 入口图像来源

## 直接复用此前交付的游戏头像

2026-10-10 为本游戏生成并交付的 `小游戏头像-144x144.png` 是本次唯一头像来源。
原图为 144×144、RGB PNG，41,443 字节，图案是黄色叉车和彩色货箱，无文字。
本次将它逐字节复制到
`android/app/src/main/res/mipmap-xxhdpi/warehouse_launcher.png`，未重绘、裁切、调色或重新编码。
144px 在 xxhdpi 对应 48dp；其他密度由 Android 进行标准资源缩放。

原图及 Android 资源 SHA-256：

`832a7e11946c78b889b72b4c3c0f6def7fc1ae0b841c80ff0b5a67205acc6cb3`

Manifest 的普通和圆形 launcher 入口均引用同一图像，由启动器决定外形。
未添加新的 adaptive 或 monochrome 美术。原生启动主题使用同一游戏头像，背景沿用
Android HTML 的 `#0c131c`。系统启动图的具体缩放和裁切仍需对应 APK 的设备截图验证。
现有游戏媒体、玩法、名称、包名、版本、存档、安全限制和 root lockfile 均未改动。

## 模板清理与 lint 边界

已移除 app 自有的 Capacitor launcher/splash PNG、Android Studio 默认 launcher vector、
对应 adaptive XML 与 launcher 背景色资源。不得保留为无引用但仍打包的模板图像。
框架库内部的通用 splash 支持布局不是品牌图像，仍由依赖提供。

相对于先前 19 条 Android lint 警告，本次修改直接处理的来源为：

- ObsoleteSdkInt：删除无用的 `drawable-v24` 模板图标
- UnusedResources 两条：删除模板 `ic_launcher_background` / `ic_launcher_foreground`
- UnusedResources 一条：启动主题明确引用已有 `AppTheme.NoActionBar`
- MonochromeLauncherIcon 两条：删除模板 adaptive 普通/圆形图标，保留原交付 PNG
- IconDipSize、IconDuplicatesConfig、IconLocation 各一条：删除全部模板 splash PNG

以下 10 条旧警告保留在本次范围外，未通过抑制规则隐藏：

- appCategory 的 API 26+ 提示：API 24/25 忽略分类，不改最低版本
- Gradle 更新提示：继续使用已固定的验收工具链
- 固定竖屏两条提示：保留既有产品方向要求和窗口适配逻辑
- WarehouseHostPlugin 静态引用提示：生命周期治理属于独立宿主审阅范围
- 五条无用资源提示：`activity_main`、生成的 `config`、`file_paths`、
  `package_name`、`custom_url_scheme`；未猜测库的动态引用并删除

上述仅说明源码变化与旧警告的对应关系，不是新的 lint 数量或 APK 编译结论。
下一次 CI 必须重新执行资源编译、lint、APK 内容检查及真实启动截图；可能新增的
密度或图标建议也应如实记录。Node 来源测试不能取代这些检查。
