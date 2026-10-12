# Static warehouse cache candidate

Date: 2026-10-12. Branch: `dev/mobile-static-cache-v110`.
Worktree: `/workspace/scratch/e6b59ff34222/mobile-static-cache-work`.
Frozen baseline: `0143e3436934a8c627af5a9e354f6aba8907e1c6`.
Implementation commit: `549be1572bff9d73511a9a6c00a57b2cbe2a98fc`. Final verification below is against this implementation; this update changes documentation/evidence only.

## Result and exact scope

The optional cache retains only the original warehouse artwork plus the platform's existing fixed frame backing and original logical `clearRect`. The backing surface has the screen's **native pixel dimensions**, but **no board, game state, cargo, forklift, UI, text, countdown, animation, overlay or complete gameplay frame is cached**. Board-floor caching is deliberately deferred, not partly implemented. No rules, input/session behavior, assets, visual boundaries, DPR, frame scheduling, save formats, signature/Secrets, version, or release workflow changed.

`drawWarehouse` was moved byte-for-byte (function body unchanged) from the renderer into `warehouse-art.ts`, because the existing renderer was already 79,979 bytes against its 80,000-byte source-file gate. The gate was not relaxed. The renderer invokes the optional cache before its existing dynamic drawing and immediately uses the original painter on a miss/failure.

## Why a transparent image was insufficient

An exploratory native-raster comparison showed that simply painting the warehouse to a transparent image and source-over blitting it changes the semi-transparent outer racks: 29,203 channel values differ on a 1205×1920 wide scene, maximum delta 2/255. Fractional vertical phase also differed by 1/255. This is intermediate-alpha rounding, not altered artwork.

The implemented opt-in contract is `Platform.frameBackdrop`, using the same `FRAME_BACKDROP='#0c131c'` constant as each platform's unchanged `beginFrame` fill. Before the original warehouse painter runs, the cache reproduces this opaque backing and the original logical clear at the **identical native transform including absolute pixel phase**. It then copies the complete same-size native surface with an identity-transform `drawImage` and `globalCompositeOperation='copy'`. The source covers the complete target, so the Canvas copy rule cannot clear a region outside the source. Existing outer backing, finite scenery borders, and fractional clear/painter edges remain exact. This contract is only for a freshly prepared, unclipped platform frame. Callers without that explicit contract continue uncached. No logical region or scene extent is widened.

## Bounds, invalidation and safe fallback

- One retained surface. Fixed limit: 24 MiB (25,165,824 bytes of RGBA accounting), each side ≤4096 native pixels. 1440×3120 =17,971,200 bytes, about17.2 MiB. The separate pre-existing shop cache retains its existing 5,000,000-byte cap; maximum combined retained accounting is30,165,824 bytes. Backend-internal textures/readback buffers are not claimed to fit this accounting.
- Old backing stores are shrunk to1×1 **before** replacement allocation. Explicit invalidation/configuration, hide/show, asset load completion (including load failure), and screen/cached-surface loss/restoration release the retained pixels. No imported module allocates a canvas.
- Keys include theme, all background-bound coordinates, backdrop, screen width/height, exact native scale and translation, line/dash state, and image-smoothing state. Viewport/rotation/size/DPR changes cannot reuse mismatched pixels. Explicit resource invalidation serves as the resource revision barrier.
- Non-source-over/opacity/filter/effective-shadow transforms, rotations/skews/flips, missing native transform/canvas support, invalid numeric bounds, oversize allocation, context loss, null/throwing context creation, rejected native dimensions, or copy/draw failure all preserve the original drawing route. Allocation/painting failures disable attempts until lifecycle/resource/config invalidation, avoiding a failing allocation every frame.
- A factory incorrectly returning the screen is rejected without resizing or releasing it. Optional cache failures never mutate gameplay.
- Browser, WeChat and Android entries explicitly configure the cache and resource/lifecycle invalidations. Actual bundled WeChat entry VM testing proves canvas1 remains the screen, cache allocation begins only on the first render, warmed frames reuse it, and asset/hide/show events release/rebuild it.

## Final verification

- TDD evidence: `red.log` asserts missing native cache; `red-render.log` records no production allocation (0≠1); `red-platform.log` records missing backdrop/entry wiring. Subsequent cache-focused tests initially passed17/17 (`focused.log`); the final targeted run, including the new legacy-host regression and seven existing host checks, passes25/25 (`host-regression.log`).
- `npm run lint`: pass. `npm run typecheck`: pass. `npm run preflight`: pass. `git diff --check`: pass.
- `npm run build`: browser and WeChat builds pass, WeChat JavaScript906,798 bytes at this candidate. `npm run build:android` also passes, producing Android web assets only; it does not invoke Gradle/APK packaging or signing. Native Android packaging/signing remains paused.
- Full `node --test --test-concurrency=2 tests/*.test.ts`: first run3130 tests/3126 pass/4 fail. Two were the known missing source-art fixtures. Two newly incompatible host assertions were diagnosed: the old `/runtime\.platform\.frame/` pattern mistakenly matched `frameBackdrop`, and a total canvas-count assertion did not allow the newly authorized lazy offscreen layer. The first now has a word boundary and additionally asserts the backdrop contract; the second retains native-screen/global checks and adds exact first-screen, one-native-size bounded offscreen, and warm reuse assertions. Both test files pass in a targeted rerun. A further targeted red/green test exposed and repaired the legacy screenshot host: subsequent canvas allocations must return separate surfaces without overwriting its reference to the first screen. The related host-smoke assertion now explicitly permits one lazy warehouse surface while preserving the screen reference. The fresh final complete run finished **3131 tests /3129 pass /2 fail**,188.31 seconds (`full-test-final.log`). Only the two missing baseline source-art fixtures remain. Product behavior was frozen before this run (an extra trailing blank line was removed before commit). Legacy `express_sorting` was added after the earlier full run started, explicitly verified in a separate focused run, and is included in this final run. The final standalone cache-focused run passes18/18 (`focused-final.log`).
- New-worktree baseline test initially had11 failures:9 missing Android-shell dependency failures disappeared after linking the already-installed baseline `android-shell/node_modules`;2 known generated-source-art fixtures are absent in the baseline and are not fabricated or restored by this task. The final suite reports the two unchanged source-art failures separately. Their exact names are “committed raster artwork verifies every generated source and exact encoded atlas” (`tests/cargo-atlas.test.ts`, missing `artifacts/v0200-art-source/cargo-wood-generated.png`) and “new generated atlas rows obey their incremental byte budgets and preserve source evidence” (`tests/v021-cargo-forklift-art.test.ts`, missing `artifacts/v0210-art-source/cargo-harbor_container-generated.png`).

### Pixel evidence

`node scripts/verify-warehouse-cache.mjs --native --baseline=/workspace/scratch/e6b59ff34222/android-v110-work`

Produces an independent frozen-baseline bundle and compares against current cache-enabled rendering. **238 full-frame RGBA comparisons, zero changed channels**, one allocation for both cold and warm frames of every case. Coverage: all17 supported themes (16 catalog themes plus legacy express_sorting) ×7 native viewports/scales/phases ×cold/warm. Includes DPR1/2/3-sized screens, fractional y phase, fractional x/y wide scene, landscape,1440×3120, explicit scenery bounds and night-theme pause overlay. Readback is exact equality, not a visual tolerance. `tests/warehouse-render-cache.test.ts` additionally covers real asset fallback→loaded invalidation and optional uncached callers.

Artifacts:
- `native-pixels.json` and `native-pixels.log`: all238 results.
- `native-original.png` and `native-cached.png`: wide/fractional native scene. Both SHA256 `bc241389215112ab751dec11db70a14a563eb65a292b0463668695eb9d5fe897`.
- `native-difference.png`: black zero-difference RGB image.

Chromium verification was attempted but **not completed**: both ordinary and requested-escalated installed Chromium launches failed with `process_singleton_posix.cc socket() EPERM`. The available cloud browser rejected the generated file:// QA page under its URL policy; that route was stopped. `chromium.log` records the failure. `scripts/verify-warehouse-cache.mjs --baseline=...` is ready for an environment that can launch Chromium; `--html` generates a self-contained offline harness. These native-raster results do not establish browser/WeChat/Android device pixel parity.

### Reproducible cost evidence

`node scripts/benchmark-warehouse-cache.mjs` outputs `benchmark.json` and `benchmark.log`.

Day theme, atlas resources loaded, hard-v18 opening, same native resolution and original drawing:

| Measured target calls per warmed frame | Original | Cached |
|---|---:|---:|
| Warehouse + frame preparation Canvas methods |6092|10|
| Warehouse + frame preparation property writes |1666|2|
| Entire game frame Canvas methods |9772|3690|
| Entire game frame property writes |2576|912|

The unchanged warehouse itself had6088 Canvas methods; a hit uses6 bookkeeping/blit methods, including exactly one drawImage. Full-frame method traffic is reduced by about62.2% in this fixture. Factory allocations stay1 across warm frames; original warehouse paint callbacks stay0 on hits.

Native backend render+full synchronous pixel-readback timing (60 samples after warmup; milliseconds):

| Native width | Warehouse p50 original→cache | Whole frame p50 original→cache |
|---|---:|---:|
|360|12.63→1.08|18.19→10.55|
|1080|16.83→11.58|29.02→27.33|
|1440|25.00→21.73|50.25→49.72|

Large-size readback/memory/flush cost dominates this auxiliary backend; some p95 results worsen. These numbers are **not device render time or FPS**, and no phone-speed guarantee is made. The robust result is the large reduction in repeated static Canvas commands, unchanged RGBA, and bounded retained allocation. Physical OnePlus/WeChat/Android smoothness and memory-pressure behavior still need device validation.

## Board-floor assessment (not implemented)

The floor painter `drawThemedBoard` is driven by static geometry/theme/atlas, so a separately bounded exact cache is plausible. It also draws the floor frame and transparent edges, and it occurs after earlier UI drawing; simply grouping it or moving it into the warehouse layer is not proven equivalent. It needs its own compositing/pixel tests and memory/performance decision, so it is conservatively deferred.

A short counter using the same loaded-atlas day/hard-v18 opening measured `drawThemedBoard` at1000 methods/237 property writes. That is about27.1% of the3690 methods remaining after the warehouse cache in this opening fixture. The rest includes text/UI/gates/trays/cargo; late-game `drawBoard` counts from the earlier diagnosis also include dynamic cargo and effects and must not be mistaken for cacheable floor work. No extra long test or implementation was added for this assessment.

## Integration

Cherry-pick `549be1572bff9d73511a9a6c00a57b2cbe2a98fc` on top of the shared baseline/other approved performance changes, then the documentation-only verification commit that follows it on `dev/mobile-static-cache-v110`. It does not require preview/touch changes. It touches platform imports and entry lifecycle wiring: retain both this cache wiring and the touch worker's independent resize-cancellation updates when merging. The root coordinates independent review and version1.0.11 integration. Do not package/sign an Android APK from this branch. No remote push was performed by this worker.

## Baseline setup failure audit

The initial unprepared worktree run was3113/3102/11. In addition to the two unchanged art-source failures named above, these nine environment/dependency failures were observed; all are passing in the final complete run after linking the existing Android-shell dependencies:

- Android production staging is fresh, offline and byte-identical to formal assets
- Android public Capacitor imports resolve through real production bundle and TypeScript options
- Android supported Insets and worker policy survive the official native config copy
- Android app declares its directly imported WebKit API at the pinned Capacitor version
- Android verifier accepts genuine hashed production staging but keeps its bootstrap publication gate closed
- Android verifier rejects tampered asset bytes and extra unlisted files
- Android verifier rejects remote config and any attempt to open the bootstrap APK gate
- receipt CLI preserves only the verified actual-version candidate and truthful blocked native status
- bundled Android entry explains missing primitives before gameplay modules initialize

The two stale assertions repaired after the first candidate full run were “integrated Android entry uses actual production session while trusted shell and security tests remain present” and “strict actual game host uses native canvas and does not install compatibility globals”. No failure was suppressed or skipped.
