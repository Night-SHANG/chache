# Immutable build-to-runtime Android CI

The branch-push-only Android workflow has two jobs with `contents: read`. The build keeps the existing complete npm regression accounting, static/production/font checks and real `:app` Java/unit/lint/build gates. It builds vc1, the test APK and vc2 using one job's ordinary temporary debug key. Both product APKs are checked for formal paid v1.0.10 content, embedded asset checksums, one signing certificate, alignment and absence of test JavaScript/classes. The test APK has its exact observed package/version, the expected runner/target, the test-only acceptance bundle and the same certificate. No private key or production signing credential is transferred.

## Handoff and source provenance

The private seven-day handoff contains only three named APKs, `manifest.json` and six named bounded build-evidence files. Every file is regular, allowlisted and hash/size checked. There are per-file and aggregate size limits; extra files, symlinks, traversal and signing material are rejected. Once manifested the APK bytes are immutable.

The manifest binds:

- Exact remote commit/tree and mapped local source commit
- Workflow repository, run ID/attempt and build-job identity
- File hashes/sizes and actual APK versions, SHA-256 and certificate
- The exact runtime script allowlist and its source hashes
- Native source hashes and the complete expected class#method test inventory

Runtime has a `needs: build` dependency. It downloads exactly the upstream artifact ID in the same workflow/run, without a token, Secrets or actions-write permission. The official download action rejects an archive digest mismatch. The upload action's immutable artifact ID/archive SHA-256 and the build-computed manifest SHA-256 are passed through job outputs and retained in the joined receipt.

The new official action pin is `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` (v8.0.1). Its official tag points to that commit; the GitHub commit verification is valid, with tree `f008da01d74dc8156ff9b1d22b2bccec8ff2ee72`. The pinned [action.yml](https://github.com/actions/download-artifact/blob/3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/action.yml) uses Node24, defaults to the current repository/run without a github-token, and supports `digest-mismatch: error`. This source was checked before pinning. Existing official Node, Java, checkout and upload pins are unchanged.

## Fresh runtime boundary

The fresh ubuntu-24.04 runner checks out only ten explicitly named runtime script files, at the exact workflow commit, using non-cone sparse checkout. The pinned [checkout source](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/src/git-source-provider.ts) automatically selects `blob:none` when sparse checkout is requested, avoiding full-repository blob transfer. These scripts import only Node built-ins and one another. The runner uses pinned official Node24.19.0/JDK21 and existing official SDK tools. It performs no package install, Gradle command, full source checkout, asset generation or APK rebuild. Its source/tree, mapping, manifest, file digests, versions, certificates, alignment and product-hook exclusion are verified before any install and reverified before receipt join.

Available bytes are measured before/after artifact download, before/after SDK installation and after boot. Payload logical and allocated bytes are recorded. The unchanged postinstall gate remains8,267,812,045 bytes on the same filesystem. Postboot also retains the build's actual released cache allocation plus536,870,912 bytes as conservative headroom. The downloaded immutable build-cache report proves that amount; runtime's independent cache-init is empty and creates no re-download dependency. Runtime never invokes cache release or Gradle. Existing SDK, default home and user/preinstalled data are never deleted for capacity.

A clean infrastructure probe had only38,687,539 bytes above the postinstall gate. Official action code, all APK/evidence bytes and real runner variation consume capacity. No capacity success is inferred from that probe. A measured block is reported without an identical retry or a lower guard.

Exactly one official emulator is launched. Hardware mode preserves the360-second bound; TCG preserves900 seconds and is functional-only. A unique random AVD name, an empty reserved serial before launch, official `emu avd name` verification and owned process-session cleanup protect unrelated endpoints. Only this verified disposable emulator may receive fixture writes or product capture. Cleanup preserves the original exit status and keeps its independently bounded cold-launch screenshot attempt before shutting down the exact owned session.

## Direct-adb native protocol

The prebuilt vc1/test APKs are installed and [official adb instrumentation](https://developer.android.com/studio/test/command-line) runs the generic native suite directly. No native test or500ms assertion is changed.

The inventory on the current source contains27 tests, including both ShellBoundary methods and the driver-only test. Inventory extraction includes timeout-bearing `@Test` annotations and ignores Java comments/literals. The parser checks the exact class#method set, total/current values, unique sequential starts, matching individual completion, outcome codes, failure stacks, one final JUnit count, final instrumentation code, shell exit and timeout. Bare `OK` is insufficient. The exact original log, its hash/size, command exit and all partial case outcomes are retained; join reparses that raw log and checks the recorded report.

The outcome codes follow the official AndroidX [InstrumentationResultPrinter](https://github.com/android/android-test/blob/675b8197a3f970b1b3c0ed52baa0a304ee7ae873/runner/android_junit_runner/java/androidx/test/internal/runner/listener/InstrumentationResultPrinter.java): start1; pass0; error−1; failure−2; ignored−3; assumption failure−4. Only `io.github.nightshang.chache.DeviceAcceptanceTest#runAcceptanceAction`, code−4 and its exact known assumption message are allowed to skip without driver arguments. This never proves device acceptance. The original [JUnit assumeTrue](https://github.com/junit-team/junit4/blob/r4.13.2/src/main/java/org/junit/Assume.java) throws that named assumption on a false condition. Arbitrary skips, duplicates, unknown tests and missing completions without an observed failure remain blocked. Observed assertions/errors, process failures and timeouts retain failed precedence even with other missing results. Neither state can pass.

After generic instrumentation, the existing six actual force-stop/reopen phases and same-key `install -r` vc1→vc2 upgrade run on the bundled APKs. Default/full mode retains the entire performance matrix and its gates. TCG explicitly leaves normal, realistic and extreme performance not-run; phone/performance acceptance stays closed. Existing local Node performance risks remain separate, inherited evidence, never phone measurements.

## Truthful receipt and failure handling

The original build receipt/candidate remain unchanged. A separate final schema3 receipt joins immutable build and current runtime evidence via exact source/run and manifest/artifact/APK identity. Missing or malformed runtime evidence remains blocked/unverified; observed failures retain aggregate precedence, including when downstream phases were never run. Functional-only success is still blocked overall because its three performance categories were not run.

The final receipt retains `acceptanceApproved: false`, `publishApk: false` and `deliveryStatus: CLOSED_PENDING_ROOT_EVALUATION`. The private build candidate is preserved with its actual vc2 identity. Neither a successful artifact transfer nor an emulator screenshot opens phone delivery, release publication or formal acceptance.
