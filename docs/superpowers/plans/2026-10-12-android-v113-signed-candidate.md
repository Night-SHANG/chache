# Android v1.0.13 signed candidate implementation plan

> **For agentic workers:** Use superpowers:executing-plans; complete independent security review before triggering CI.

**Goal:** Produce a private, permanently signed v1.0.13 APK from the frozen game, with truthful build and runtime evidence.

**Architecture:** Reuse the existing build and diagnostic runtime jobs in a new branch-specific workflow. The build job compiles unsigned release vc3 without any signing secrets. A fresh signing runner consumes only the immutable same-run APK and verified metadata, uses official SDK apksigner, and uploads only the final APK and public verification receipt.

**Tech Stack:** Existing Node24.19.0/npm11.9.0/JDK21/Capacitor8.5.3/AGP8.13.0/Gradle8.14.3/SDK36/BuildTools35.0.0.

**Spec:** Existing Android design 2026-10-11 plus explicit user approval on 2026-10-12 to use the two existing repository Android Secrets for APK signing. No secret creation, replacement, export to chat/repository, or public release is authorized.

## Global constraints
- Frozen source 4aefaa7ce6c0f0498e075ed78c9617869ed3f27a; no game, assets, save, browser or WeChat change.
- Application io.github.nightshang.chache, label 货箱最后一格, versionName1.0.13, release versionCode3.
- Debug acceptance vc1/vc2 remain distinct from release vc3.
- Official Actions pinned; contents:read only; new workflow push branch dev/android-v113-release only.
- Signed candidate is private and unaccepted until evidence review; no public Release or store publication.

## Review focus
- Missing/invalid Secrets must fail closed, never fallback debug or regenerate.
- Wrong artifact, altered APK, wrong source/run, unsupported identity must fail before signing.
- Signing secrets scoped only to signing step; no npm/Gradle or project arbitrary dependency execution there.
- Private key temporary runner path only, restrictive permissions, cleanup on failure and success, no wildcard upload/cache.
- Native debug evidence never represents signed-release/physical-device acceptance; old debug install must not be uninstalled silently.

### Task 1: Isolated release version and unsigned evidence
- [x] Add failing tests for explicit warehouseReleaseVersionCode=3 and unchanged debug1/2 defaults.
- [x] Implement guarded release-only build property; preserve default legacy debug configuration.
- [x] Add verifier of actual unsigned APK metadata, exact packaged assets, production controls exclusion, native unit/lint evidence and complete Node regression accounting.
- [x] Bind unsigned handoff to actual commit/tree/run, APK hash and immutable artifact digest.

### Task 2: Fresh-runner signing and workflow
- [x] Add failing tests for branch/permissions/secrets isolation, exact upload allowlists, integrity gates and cleanup.
- [x] Copy existing build/runtime workflow into android-release.yml with new branch trigger.
- [x] Add unsigned release compile/verification/upload after complete regression; add fresh signing job consuming artifact ID/digest only.
- [x] Run official zipalign before apksigner, fixed PKCS12 alias chache-release, password env only; verify final signature, fingerprint, identity, byte manifest and absence of debug/test flags.
- [x] Record signed artifact SHA256, source and separate unverified release-runtime/phone states; retain7days privately.

### Task 3: Verify, review, publish branch and monitor
- [x] Run focused tests, lint/typecheck/preflight/full regression and staging; retain two exact known source-art failures.
- [x] Independent review before signing-enabled branch push; fix blockers with regression.
- [ ] Push only dedicated branch, verify remote tree matches local tree, monitor exact commit CI autonomously.
- [ ] Validate private signed artifact and receipt; deliver through existing Library identity when suitable. Never claim physical device acceptance.
