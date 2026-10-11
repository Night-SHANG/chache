# Android bootstrap build and signing

This branch currently provides compiler and instrumentation feedback for the Android shell. It is not an accepted game APK. `ci-acceptance-state.json` explicitly closes APK publication, and the workflow uploads only a fixed list of verification reports. No APK, keystore, SDK, cache, home directory or signing secret is uploaded.

## Reproducible commands

Use Node 24.19.0, npm 11.9.0, JDK21, SDK36 and Build Tools35.0.0. The hosted job uses `ubuntu-24.04`, official Actions pinned to full commits, the project Gradle8.14.3 wrapper and AGP8.13.0.

```sh
npm ci
npm --prefix android-shell ci
npm run lint
npm run typecheck
npm run preflight
node scripts/android-test-report.mjs run
npm run sync:android
npm run verify:android
cd android
./gradlew --no-daemon --console=plain testDebugUnitTest lintDebug assembleDebug assembleDebugAndroidTest
```

The root npm lock remains unchanged. Capacitor core/CLI/android8.5.3 are installed from the independent Android shell lock. Sync invokes that installed local CLI, with no implicit `npx` download.

## Truthful Node regression accounting

The reporting script actually invokes the unchanged `npm test` command. A custom Node reporter preserves Error causes, file/name/code/path and the final full-suite totals in `node-events.jsonl`. `node-test-report.json` records the direct command's exit code and `rawPassed` separately from exact-baseline acceptance. A raw exit1 with two known failures is never called a green `npm test`.

Only these combinations may be recognized as historical failures:

- `tests/cargo-atlas.test.ts`, “committed raster artwork verifies every generated source and exact encoded atlas”, `ENOENT`, `open`, exact `artifacts/v0200-art-source/cargo-wood-generated.png`
- `tests/v021-cargo-forklift-art.test.ts`, “new generated atlas rows obey their incremental byte budgets and preserve source evidence”, `ENOENT`, `open`, exact `artifacts/v0210-art-source/cargo-harbor_container-generated.png`

The classifier also checks the wrapper error, exact original error message, uniqueness, final summary and command exit consistency. New failures, altered paths/errors, skipped/cancelled/todo tests and incomplete output fail the job. Old tests and assertions are unchanged.

## Official emulator boundary

The script uses the installed official SDK tools, stable channel0, API36 Google APIs x86_64, a new AVD and a bounded cold boot. Existing matching licenses may be reused. Installation has closed stdin; it never accepts a new agreement, runs `sdkmanager --licenses`, writes license hashes, changes KVM permissions or adds a third-party emulator Action.

Missing SDK tools, inaccessible `/dev/kvm`, insufficient disk, declined licenses or an emulator boot failure produce a specific `blocked` report and exit78. The workflow records that native acceptance remains unverified while retaining independently verified compilation. An actual `connectedDebugAndroidTest` failure exits1 and fails the job. Headless audio, physical cutouts and phone navigation remain unverified.

## Temporary signing and private APK verification

Gradle's standard ephemeral debug signing is authorized for this build. The key stays inside the runner and is never an artifact, cache, Secret or exported file. The receipt verifies the private APK's package `io.github.nightshang.chache`, app name `货箱最后一格`, versionName1.0.10/versionCode1, offline permission policy, signature/certificate fingerprint, alignment and staged asset bytes. SHA-256 is recorded, but this bootstrap APK is withheld.

Each runner can create a different debug certificate. Only a same-package, same-key update can establish overwrite-install save preservation. A future permanent certificate may require uninstalling the temporary APK, which deletes local app data. No permanent key or persistent GitHub credential is created here.

## Receipt and remaining acceptance

Reports contain the actual checked-out commit/tree, workflow SHA/run/attempt, installed runner/SDK/JDK/npm versions, both lock hashes, temporary certificate and truthful verification states. The coordinator must independently verify the local-to-remote commit mapping; the runner does not invent that mapping.

Before Task5 can be complete, integrate and independently review native storage/ownership, Insets, game startup, back/lifecycle and acceptance tests. Then verify recovery/process death, same-key increasing-versionCode upgrade without clearing data, long-history latency and available phone checks. APK allowlisting/delivery is a later reviewed change; changing the marker alone cannot add an APK to the current workflow. No public GitHub Release or store publication occurs.

Remote upload and exact-commit CI monitoring belong to the coordinator using the existing GitHub connection. Only branch pushes to `dev/android-v110-release` trigger this workflow. Default/release branches and repository history are preserved.
