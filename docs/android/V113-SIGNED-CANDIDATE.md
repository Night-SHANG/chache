# v1.0.13 permanent-signing candidate

This is the existing production game frozen at local commit4aefaa7ce6c0f0498e075ed78c9617869ed3f27a (remote backup53555188abdad5c68ee2c94fb7d56f093c5f0658), with Android packaging-only changes. Game rules, assets, sound balance, saves and other platforms are unchanged.

## Identity and release boundary

- Name: 货箱最后一格; applicationId: io.github.nightshang.chache.
- versionName1.0.13; release versionCode3, explicitly selected with `-PwarehouseReleaseVersionCode=3`.
- Debug instrumentation fixtures remain vc1/vc2 and use their existing temporary key. Their deep runtime evidence is not signed-release runtime evidence.
- No public Release/store upload. A verified signed binary is still a private candidate, pending review and physical phone testing.
- Signing does not make a build Stable or prove phone performance, sound, geometry or saves.

## Signing boundary

The owner explicitly approved using the two already configured GitHub Secrets on 2026-10-12. The new `android-release.yml` workflow runs only on push to `dev/android-v113-release` in the private Night-SHANG/chache repository. It has contents:read only. The existing bootstrap workflow is unchanged.

The build job never receives signing secrets. It builds paid, non-diagnostic production staging, runs the complete regression with the existing two exact missing-source-art failures accounted separately, compiles/tests/lints debug and release, and checks the unsigned release identity, assets and forbidden test controls. The unsigned artifact and receipt bind to the real source commit/tree, run/attempt and SHA256.

A fresh signing runner downloads only the immutable same-run unsigned artifact ID, with strict artifact digest checking and separate receipt SHA256 verification. Sparse checkout supplies only the reviewed signing/verification scripts. No npm, Gradle, project dependency installation, application execution or key generation occurs there. Secrets are scoped to one signing step. A restrictive temporary directory holds the existing decoded PKCS12 key only long enough for official Build Tools35.0.0 apksigner to sign the zipaligned APK. The fixed alias `chache-release` and shared keystore/key password match the owner-operated generator at5a817dfbc5fed600f77dd36c2bbed28be5786019; this is configuration provenance, not an independently pinned public certificate fingerprint.

No passwords, Base64, keystore files, signing logs or caches are uploaded. Only the signed APK, public verification receipt and SHA256SUMS are preserved for7days. After signing, a credential-free verifier checks every original APK entry is unchanged, only signature metadata was added, all offline assets match, exactly one signature verifies, version/label/permissions/debug flags are correct, and zip alignment is valid. The observed public certificate SHA256 is recorded for future same-signature upgrade checks.

Missing or invalid secrets fail closed; no debug fallback or key regeneration. Failed signing output is withheld rather than copied into logs. Cleanup removes only files created in this run's own temporary directory.

## Installation and saves

The permanent key may differ from any earlier temporary debug APK. Android will reject an incompatible same-package overwrite. Do not uninstall or clear data to bypass that rejection: uninstall deletes local app data. No user-facing export/import flow was found in the current Android game; portable-data tests only cover cloning/UTF8 helpers. Browser, WeChat and Android remain separate storage domains. Changing appId to create a coexisting app is not part of this release.

## Verification state

Record the exact new CI commit, run, signed APK SHA256 and observed certificate before delivery. Local staging/tests are preparation evidence only. Deep debug native instrumentation, signed-release cold launch, same-permanent-key upgrade and physical-phone acceptance are separate fields. Unrun stages stay unverified. The coordinator monitors CI and diagnoses recoverable failures without requiring manual build feedback.

## First CI run and exact asset-manifest repair

Run38276761764 (commit8897e7cb0a7dcd62b0695a9e26d9f1894c42f2dd) completed the full3277-test regression with only the two original source-art failures, and compiled/tested/linted release vc3 successfully. Before signing, the strict asset-list gate failed. Same-run real APK inspection and pinned CLI8.5.3 source confirmed exactly two additional files: `cordova.js` and `cordova_plugins.js`, both empty. Capacitor's `createEmptyCordovaJS` generates these when no Cordova plugins are present. The repair adds only those exact paths with the fixed empty-content SHA256; collisions, changed content, missing files and all other extras still fail closed. Signing never ran in that first workflow. Independent repair review approved the second push. No game or audio changes.
