# Android bootstrap build and signing

This branch provides compiler and device-acceptance feedback. It is not an accepted release. `ci-acceptance-state.json` keeps delivery/publication closed. The private repository workflow may preserve one build-verified temporary-debug phone candidate, its receipt and SHA-256, explicitly pending final root evaluation. Private artifact preservation does not approve phone delivery, a public Release or store publication. No test APK, keystore, SDK, cache, home directory or signing secret is uploaded.

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
./gradlew --no-daemon --console=plain :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
```

The root npm lock remains unchanged. Capacitor core/CLI/android8.5.3 are installed from the independent Android shell lock. Sync invokes that installed local CLI, with no implicit `npx` download.

Gradle targets are explicitly scoped to `:app`. The application still compiles its dependent libraries and tests the shipped application, while avoiding unrelated instrumentation APK variants belonging to the generated Capacitor/Cordova library projects.

Build `node scripts/build-android-acceptance.mjs` before assembling the instrumentation APK. Its assets remain in the generated androidTest source set. The emulator script preserves vc1/test APKs in runner-local storage, builds vc2 with the same conventional debug key, then runs the reviewed explicit disposable-emulator driver. The final product APK is vc2 when that build succeeds; earlier failure can leave vc1, which the receipt must report honestly. Neither acceptance fixture APK is uploaded.

Hosted regression also requires the existing Noto Sans CJK SC font dependency. `scripts/setup-android-ci-fonts.sh` downloads only the official Noto CJK Sans2.004 Regular/Bold TTCs at commit `523d033d6cb47f4a80c58a35753646f5c3608a78`, checks their fixed SHA-256 bytes before installation into the tests' existing system-font paths, and probes embedded font families. It does not change Node preload/system-font discovery, old pixel assertions, game assets or APK contents. `--verify` checks an already-provisioned machine without installing fonts. `font-report.json` records source and actual hashes.

For early native feedback, the hosted bootstrap runs static checks, the eight unchanged affected font assertions, staging verification and private native compilation before the complete Node regression. The full unchanged regression and exact-baseline gate remain mandatory before a successful bootstrap receipt; the APK delivery gate stays closed.

## Truthful Node regression accounting

The reporting script actually invokes the unchanged `npm test` command. A custom Node reporter preserves Error causes, file/name/code/path and the final full-suite totals in `node-events.jsonl`. `node-test-report.json` records the direct command's exit code and `rawPassed` separately from exact-baseline acceptance. A raw exit1 with two known failures is never called a green `npm test`.

Only these combinations may be recognized as historical failures:

- `tests/cargo-atlas.test.ts`, “committed raster artwork verifies every generated source and exact encoded atlas”, `ENOENT`, `open`, exact `artifacts/v0200-art-source/cargo-wood-generated.png`
- `tests/v021-cargo-forklift-art.test.ts`, “new generated atlas rows obey their incremental byte budgets and preserve source evidence”, `ENOENT`, `open`, exact `artifacts/v0210-art-source/cargo-harbor_container-generated.png`

The classifier also checks the wrapper error, exact original error message, uniqueness, final summary and command exit consistency. New failures, altered paths/errors, skipped/cancelled/todo tests and incomplete output fail the job. Old tests and assertions are unchanged.

## Official emulator boundary

The script uses the installed official SDK tools, stable channel0, API36 Google APIs x86_64, a new AVD and a bounded cold boot. Existing matching licenses may be reused. Installation has closed stdin; it never accepts a new agreement, runs `sdkmanager --licenses`, writes license hashes, changes KVM permissions or adds a third-party emulator Action.

Missing SDK tools, insufficient disk, declined licenses or an emulator boot failure after the bounded launch attempt produce a specific `blocked` report and exit78. Inaccessible `/dev/kvm` selects the bounded software fallback described below. The workflow records that native acceptance remains unverified while retaining independently verified compilation. An actual `connectedDebugAndroidTest` failure exits1 and fails the job. Headless audio, physical cutouts and phone navigation remain unverified.

When `/dev/kvm` is already readable/writable and the bounded official `-accel-check` succeeds, launch remains hardware-accelerated (`-accel on`,360-second boot bound). Otherwise the root-authorized fallback makes exactly one launch attempt using the same official emulator in TCG software mode (`ANDROID_I_WANT_MY_TCG=yes`, `-accel off`,900-second boot bound). [Official documentation](https://developer.android.com/studio/run/emulator-commandline) labels this mode unsupported and very slow. No KVM/udev/group/SELinux permissions or license choices are changed. Software results may establish functional/storage-recovery/upgrade evidence, but the timing numbers are explicitly nonrepresentative of phone performance. Root-selected bounded software mode now requests explicit functional-only native, recovery and same-key upgrade evidence. All three performance categories are marked not-run and overall acceptance stays blocked. Hardware-accelerated mode retains the complete100-sample matrix with original p95/max gates and each25-minute measurement bound. Both modes retain the120-minute workflow limit; native500ms main-Looper assertions remain unchanged, and any such TCG failure stays failed. Timeout/missing reports never become passes. `emulator-mode.json`, `emulator-report.json` and receipt `performanceContext` retain observed mode, unsupported warning and this limitation.

The job is bounded to120minutes. Its runtime sub-budget reserves five minutes for receipt/artifact handling, with TERM followed by a90-second hard-stop bound. Only the emulator started by this script is isolated into its own process session, so TERM can preserve its booted context for the bounded cleanup capture before the exact owned PID is stopped. Software functional-only mode omits the three performance commands explicitly; hardware full mode retains them. Normal, realistic and extreme raw100-transaction samples remain separate and protocol-validated. Complete over-threshold measurements remain failed; missing, skipped, stale, truncated or incoherent evidence stays blocked. The inherited local Node comparison in ACCEPTANCE.md is not rerun or represented as CI-native evidence.

Before the emulator is killed, a separate60-second cleanup helper cold-launches the real product MainActivity and captures foreground/process/window evidence and a screenshot when possible, including after native assertion or per-action timeout. If the compiled product has not yet been installed, this helper may install that exact compiled APK on the already-booted disposable emulator before capture; it never clears data. Capture cannot change the original acceptance exit status. A screenshot does not verify touch, phone geometry, actual audio, frame timing or formal product acceptance.

## Temporary signing and private APK verification

Gradle's standard ephemeral debug signing is authorized for this build. The key stays inside the runner and is never an artifact, cache, Secret or exported file. The receipt verifies the actual final APK's package `io.github.nightshang.chache`, app name `货箱最后一格`, versionName1.0.10 and observed versionCode1 or2, offline permission policy, one signature/certificate fingerprint, alignment, staged asset bytes and absence of acceptance controls. Candidate name is `warehouse-last-slot-1.0.10-vc<actual>-temporary-debug-candidate-<sha12>.apk`; its copy is rehashed before private preservation.

Each runner can create a different debug certificate. Only a same-package, same-key update can establish overwrite-install save preservation. A future permanent certificate may require uninstalling the temporary APK, which deletes local app data. No permanent key or persistent GitHub credential is created here.

## Receipt and remaining acceptance

Reports contain the actual checked-out commit/tree, workflow SHA/run/attempt, installed runner/SDK/JDK/npm versions, both lock hashes, temporary certificate and truthful verification states. The coordinator must independently verify the local-to-remote commit mapping; the runner does not invent that mapping.

Mapped GitHub snapshot metadata is parsed as inert text from the commit message and checked against the actual tree. The source local commit and remote commit stay distinct. Receipt schema2 separates `buildStatus: verified`, native acceptance passed/failed/blocked and `acceptanceApproved: false`; `deliveryStatus: CLOSED_PENDING_ROOT_EVALUATION` always keeps delivery closed. The verifier reclassifies full Node terminal evidence, reconciles real unit/instrumentation XML with native test methods, retains lint warnings, validates driver raw reports and compares the same-key upgrade proof with the actual final certificate. The driver-only instrumentation skip is identified but never counts as device acceptance.

The candidate and allowlisted report artifacts are private, retained7days, and have separate names. Candidate upload requires a successful verified receipt after the actual compile and complete Node gate. Native/environment/performance failures remain visible even when a build-verified candidate is preserved for evaluation. Root approval is still needed before anyone calls it accepted or delivers it as the phone test result.

Before acceptance can be complete, review the integrated native storage/ownership, Insets, game startup, back/lifecycle and actual device results. Recovery/process death, same-key increasing-versionCode upgrade without clearing data, all latency categories and available phone checks remain separate requirements. No public GitHub Release or store publication occurs.

Remote upload and exact-commit CI monitoring belong to the coordinator using the existing GitHub connection. Only branch pushes to `dev/android-v110-release` trigger this workflow. Default/release branches and repository history are preserved.

## This job isolated cache and actual disk evidence

Before the first npm or Gradle command, the workflow creates a unique marked cache root beneath existing RUNNER_TEMP. Only that root is exported as npm_config_cache/GRADLE_USER_HOME. After compilation and complete Node accounting, the owned helper stops its dedicated Gradle daemon, validates ownership and releases only this job re-downloadable caches. Default home, preinstalled SDK and the separate debug signing key are untouched. Init/release reports and actual preinstall/postinstall/postboot space remain allowlisted and included in receipt/checksums. Preboot space must satisfy official6GiB×1.2 plus512MiB; postboot space must cover the measured released cache allocation plus512MiB before Gradle re-download/rebuild. Insufficient actual resources stay blocked. Sparse pure-probe success does not guarantee a full product job has sufficient space.
