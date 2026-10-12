# Android acceptance shell

This project was created from the official `@capacitor/cli@8.5.3` Android
template. It is isolated from the existing browser and WeChat entry points.

## Fixed acceptance identity

- Application: 货箱最后一格
- Package: `io.github.nightshang.chache`
- Android version: `1.0.14`; signed release version code `4`
- Debug acceptance builds retain version codes `1` and `2`
- Browser/WeChat and source content remain `1.0.13`
- Node `24.19.0`, npm `11.9.0`, JDK `21`
- Capacitor core, CLI and Android: `8.5.3`
- AGP `8.13.0`, Gradle Wrapper `8.14.3`
- Compile/target SDK `36`, minimum SDK `24`, Build Tools `35.0.0`

## Rebuild

From the repository root:

```sh
npm ci
npm --prefix android-shell ci
npm run sync:android
cd android
./gradlew testDebugUnitTest assembleDebug
```

`build:android` first runs the unmodified formal production build, then copies
its verified assets and licenses into a fresh `build/android` directory. It
bundles only `src/android-main.ts` with paid shop pricing, diagnostics disabled,
and Android version `1.0.14`. Its staging manifest records `sourceContentVersion: 1.0.13`
for the unchanged formal media. `sync:android` also copies staging into Capacitor's native
asset directory. Generated assets, local SDK configuration, Gradle outputs and
signing files are excluded from Git.

Capacitor's npm dependencies and lockfile are isolated in `android-shell/`.
The root lockfile is unchanged, preserving the existing formal release graph.
The shell config uses the official `android.path: ../android` and
`webDir: ../build/android` paths. TypeScript resolves `@capacitor/core` via a
public-package directory mapping in root `tsconfig.json`; esbuild uses
`android-shell/node_modules` as a nodePaths search location. No private dist
entry point is hardcoded. Android's manifest additionally records the shell
lockfile SHA-256 for receipt verification.

## Current acceptance gate

Task 1 deliberately displays a clear blocked startup message. Native storage,
viewport and lifecycle integration must replace that gate before an APK may be
delivered. A successful staging build is not a device or native compilation
result. The local environment currently has a Java 21 runtime, but no discovered
Android SDK or `javac` executable. Full native compilation and runtime checks
remain required in the configured build environment.
The compiler itself is available locally through
`java -m jdk.compiler/com.sun.tools.javac.Main`; the pure URL-policy probe uses
that real compiler without Android API stubs.

The shell permits only its own bundled HTTPS origin. Remote navigation does not
launch external intents; remote resource requests and Capacitor's arbitrary
file/content routes are rejected. CSS does not consume safe-area insets, and
the supported Capacitor `plugins.SystemBars.insetsHandling: disable` setting
disables its competing Insets consumer. Native WindowInsets integration owns
the later viewport adaptation. Native execution still must verify that behavior.

Workers are unused. The CSP includes `worker-src 'none'`, Capacitor's separate
worker delegation is disabled, and a deny-all native worker client is installed
before bridge construction. A named replacement for the built-in WebView plugin
rejects live asset/file-root changes and persistence. Its load hook installs the
ordinary offline client and WebView restrictions before the first asset load.
The builder explicitly selects the APK's `public` asset root, overriding a stale
deployment preference before any queued load.

Available Node checks exercise a real official config copy, public Capacitor
imports through production esbuild options and TypeScript resolution, and the
real Java URL policy. Android JUnit and instrumentation tests additionally probe
native callbacks, JS-to-native root-changing calls and attempted private-file
reads; those require SDK/device CI and have not run locally.

The acceptance build uses Android's standard temporary debug signing only.
Do not commit private signing material. Changing to a long-term signature may
require uninstalling this build and will not guarantee preservation of its
local progress. Only a compatible same-package, same-signature upgrade can be
used to verify retained progress. Cloud backup is disabled.
