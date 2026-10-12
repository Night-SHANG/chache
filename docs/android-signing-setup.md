# 《爆仓：最后一格》首次创建安卓长期签名

这个入口只为 `io.github.nightshang.chache` 准备长期签名文件，不编译游戏、不发布 APK、不修改游戏版本。Windows 不需要安装 Android Studio 或 Java。

**只在从未建立长期签名时运行一次。** 已有长期签名应继续使用原文件。重新生成会得到不同密钥，即使文件名、别名和密码都相同，也不能恢复原密钥；已安装正式版的后续升级依赖原签名。

## 1. 自己保存密码

在 [仓库](https://github.com/Night-SHANG/chache) 中进入 Settings → Secrets and variables → Actions → Secrets → New repository secret：

- Name：`ANDROID_KEYSTORE_PASSWORD`
- Secret：你自己新建、自己保管的随机密码，至少 20 个英文大小写字母、数字或符号，不含空格或换行。推荐密码管理器生成 24 位以上随机密码。

点 Add secret。**不要把密码发给助手。** GitHub 保存后不能让你重新查看原值，所以务必在自己的密码管理器或其他安全位置保存一份。

如果已经完成这一步，不要重复新建，也不要改动已经用于生成密钥的密码。仅修改 GitHub Secret 不会给已有 `.p12` 文件改密码。

## 2. 由你亲自运行一次

1. 打开 [生成安卓长期签名](https://github.com/Night-SHANG/chache/actions/workflows/generate-android-signing.yml)。
2. 点击 **Run workflow**。
3. Branch 选 **main**。
4. 确认自己没有旧的长期签名，并准备立即下载；在输入框填写 **首次生成**。
5. 点击绿色 **Run workflow**，打开新出现的运行记录，等待成功。

不要在运行表单中填写密码。工作流只从你保存的 Secret 读取密码，密码只交给生成步骤，不写入代码、日志、附件或步骤摘要。

如果失败，先看失败步骤的普通错误说明。不要开启 debug logging，不要截图、复制或发送任何密码或签名内容。**不要盲目点 Re-run 或再次生成**：先确认原运行是否已经产生附件。凭据创建与下载由你亲自完成，助手只检查不含秘密的状态和错误。

## 3. 下载，并做两份安全备份

在成功运行的页面下方 **Artifacts**，下载名称以 `chache-android-signing-backup-` 开头的 ZIP。在 Windows 右键 ZIP → 全部解压。里面只有：

- `chache-release.p12`：真正的长期签名文件，包含密码保护的私钥。必须安全保存。
- `chache-release-certificate.pem`：公开证书，不是私钥，也不能替代 `.p12` 用于签名。
- `certificate-info.txt`：公开证书信息和指纹。
- `SHA256SUMS`：下载文件的完整性校验值。

**附件保留 7 天，请现在就下载。** Actions 附件不是长期保险箱；到期或运行记录被删除后不能恢复。将 `.p12` 保存两份安全备份，例如电脑的受保护目录与加密移动硬盘，密码另外保管。不要放进项目目录、公开网盘、Git 提交、Release、Issue、聊天或在线 Base64 转换网站。

仓库目前为私有，但有仓库读取权限的人可以下载其 Actions 附件。`.p12` 的密码保护仍依赖强密码与安全保管。ZIP 本身没有另加密码，保护私钥的是里面的 PKCS12 文件。

可选校验：在解压文件夹的资源管理器地址栏输入 `powershell` 并按回车，运行：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\chache-release.p12
```

显示的哈希值应与 `SHA256SUMS` 第一行一致（大小写不影响比较）。这只校验文件是否一致，不能替代密码验证或私钥备份。

## 4. 在自己的 Windows 电脑上转 Base64

GitHub Secrets 的值是文字，不能直接选择上传 `.p12` 文件。因此需在自己的电脑上把它转为 Base64。**Base64 只是二进制转文字，不是加密，仍应按私钥文件保护。**

在解压文件夹的资源管理器地址栏输入 `powershell` 并按回车，然后粘贴这一行并回车：

```powershell
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath '.\chache-release.p12').Path)))
```

这会把转换结果复制到剪贴板，不在终端显示，也不产生额外的 Base64 文本文件。请只在自己的可信电脑上操作，留意剪贴板历史与跨设备同步。

回到 Settings → Secrets and variables → Actions → Secrets → New repository secret：

- Name：`ANDROID_KEYSTORE_BASE64`
- Secret：按 Ctrl+V，粘贴刚才剪贴板里的整段文字。

确认 Name 正确后，亲自点 Add secret。不要粘贴到聊天。如果这个名字已经存在，先停下确认是否已有长期签名；不要覆盖。

完成后清空当前剪贴板：

```powershell
Set-Clipboard -Value ''
```

如果开启了 Windows 剪贴板历史或同步，也要亲自在对应记录中清除这一项。清空当前剪贴板不会自动清除历史或已同步副本。

最后只需告诉助手“两个 Secrets 已保存，签名文件已备份”。不需要发送值、文件或截图。

## 固定参数与下一步

- 文件：`chache-release.p12`
- 格式：`PKCS12`，不是 `JKS`。这两者是不同的密钥库格式；重命名文件后缀不会转换格式。
- 别名：`chache-release`，无需另外创建 alias Secret。
- 算法：RSA 3072 位；证书签名算法：SHA256withRSA。
- 证书有效期：10,000 天，约 27 年。
- 密钥密码与密钥库密码相同，均为你保存的 `ANDROID_KEYSTORE_PASSWORD`。
- 用途：本游戏包名 `io.github.nightshang.chache` 的长期签名；该用途约定并非密钥本身的技术限制。

**保存两个 Secrets 后，还需要另行接入正式签名构建。** 这个生成入口不会修改现有 debug 构建，不代表已经产生正式签名 APK。接入后应核对 APK 的公开证书指纹与这份证书一致。

防误生成保护：只允许本仓库 `main` 上的手动首次运行；必须填写“首次生成”；已有 `ANDROID_KEYSTORE_BASE64` 时拒绝生成；同一运行的 Re-run 被拒绝；不会写入、覆盖或删除任何 Secret，也不会替换旧附件。

这些检查**不是绝对的一次性锁**：在尚未保存 `ANDROID_KEYSTORE_BASE64` 时，手动新开另一条运行仍可能生成不同密钥。因此首次成功后先下载备份并保存第二个 Secret，不要再次点 Run workflow。附件名称包含独立运行编号，以免误覆盖。

## 安全实现与官方说明

工作流不拉取项目源代码，不执行项目脚本，没有 npm/Gradle 编译，没有 push 或 pull_request 自动触发。`GITHUB_TOKEN` 权限为空；官方 artifact 上传使用当前运行的临时 artifact 凭据，无需仓库写权限。仅使用固定完整提交 SHA 的 GitHub 官方 `setup-java` 和 `upload-artifact`。密码以步骤环境变量交给 `keytool` 的 `:env` 参数，不能作为明文命令参数；生成目录位于临时 runner，上传只包含上面四个明确文件。

仓库写权限持有人可修改工作流从而使用仓库 Secrets；Secrets 不能防御不可信的仓库写权限持有人。不要扩大仓库访问权限。长期密钥一旦丢失或泄露，不要自行重新生成并覆盖，应先评估现有发布渠道与升级影响。

- [Android 官方签名与密钥保管说明](https://developer.android.com/studio/publish/app-signing)
- [Oracle keytool：PKCS12 与密码环境变量](https://docs.oracle.com/en/java/javase/21/docs/specs/man/keytool.html)
- [GitHub 手动运行 workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [GitHub Secrets 与 Base64](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub artifact 下载与读取权限](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)
- [GitHub workflow 安全建议](https://docs.github.com/en/actions/reference/security/secure-use)
