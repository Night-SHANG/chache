# v1.0.18: restore nonblocking pre-split artwork

## Scope and history

Source baseline: v1.0.17, `776fd1b90b3dab79364b34dbe3cd2f10dad896d5`.
Historical reference: v1.0.12, `dd847c3174466f0004111b8667a2ff45c563e889` (also checked v1.0.10 `fe9e0b8`). v1.0.13 `c01b773` introduced the shared loading gate; v1.0.16 `466c342` retained it and pinned eight shared atlases plus the committed scene. v1.0.17 only corrected initial shop pagination.

All three entries now render and accept normal input without waiting for art. Image preparation follows the committed appearance only, never blocks the gameplay clock, and never writes the account. The shared loading/error/retry screen, Android art-readiness cover, asynchronous equip UI, presentation clock freeze argument, and Android presentation pointer/back hooks are removed. The original Android capability, native ownership, geometry, storage, and real startup-error handling remain.

Cold or failed PNGs use the existing v112 procedural cargo, tool, forklift, board and scenery painters. Ready images retain the current optimized PNG path. No runtime backing canvas, warehouse cache, new state machine, per-item preview PNG, skin reinstatement, audio edit, subpackage, or all-scene preload was added. Direct equip uses the original account transaction; a stale image completion cannot overwrite a later selection.

## Verification

- Actual production entry tests first reproduced the unwanted first-frame gate on browser, WeChat and Android, then verified a real menu before any PNG callback.
- Seven cold-art tests compare real Canvas pixels with the checked-in v112 painters and verify ready PNG blits.
- Three exact-bundle hosts check every input and every PNG completion: first cold gameplay move, clocks, pause/help/resume/hide/show, all nine image failures followed by another legal move, all 29 active products owned and unowned, direct/rapid equip, saving, and first-page navigation.
- Android's warm menu pixels exactly match v117 at 540×960. Its existing transparent edge regions and PNG band layout are unchanged; the cold frame is the v112 synchronous layout.
- Chromium launch is BLOCKED by the execution host: `socket() failed: Operation not permitted`, followed by ptrace restrictions. All 13 Chromium cases are NOT RUN (0 assertions, 0 screenshots), with sandbox retained. Native Canvas evidence is not Chromium, CSS, WeChat IDE, WebView, or physical-phone acceptance.
- Final full suite: 3,255 tests, 3,253 passed, 2 historical failures; actual process exit 1. `npm test -- --test-concurrency=4` ran against the final production source and tests. Lint, typecheck, and preflight pass. Two historical source-image checks remain real failures: cargo source artwork and added atlas source evidence. These are not skipped or weakened.

## Delivery boundary

Version `1.0.18`, Android versionCode `8`; both dependency-lock graphs are unchanged. Browser/WeChat preview, Android web staging, and a signed Android APK are distinct deliverables. A staged Android directory is not an APK and does not establish installation or native-device acceptance.

The source-history archive includes complete current source and locally available history, with the existing shallow boundary preserved. It is not a claim to contain every early commit. Its independent `.git`, HEAD/tree, fsck exit status, ZIP CRC and split reassembly hashes are checked separately.
