# v1.0.7 independent review

Verdict: No remaining product blocker found in the reviewed candidate. Release still depends on owner visual approval and final full-suite accounting; reviewer did not package or publish.

## Bound candidate
- Source SHA-256: e11f54d8e52a5921f37125c478a7420d20a6763fa0f767a56ed2bb571af8e026
- Browser bundle: 17c8c0be3336c9c09c9f899f23e95dae10b0c880d7d6b67505f3cfe5bf271828
- WeChat bundle: a66965ad64ab3bad2e521433ece7308cdec07c68330c28d08a0408e5f7432d96
- Paid production, diagnostics false, version 1.0.7, account format 4/economy 2.

## Fresh independent evidence
- 216 native-Canvas production-host cases passed, 108 per target. Covers all enabled/disabled controls on menu, settings, tool shop, quantity modal, set list/detail/member, item shop, outbound selection/preparation/game, pause menu, toolbox, rotation controls, candidate pieces, wildcard cargo controls, and held-button hide.
- Each visual probe checks down paint, move-out, move-back (or irreversible shop drag), cancellation pixel restoration, no sound on down/cancel, and no storage writes from cancellation. Separate checks establish ordinary navigation has no haptic requests and hide cannot replay UI click.
- 58 current focused tests passed, including 350ms purchase guard, shop gestures, platform fallback, optional persisted vibration, clear invalid-target filtering and UI feedback policy.
- 5 independently authored semantic checks passed: readonly and blocked-account no-write, major-action rate limit without lost actions, exact 60ms sound/120ms haptic boundaries, business cue precedence and silent current mute/unmute gestures.
- Source manifest rehashed exactly; 115 domain/assets files unchanged, original 12 WAVs byte-identical, existing BGM/scenery/layout source hashes unchanged.
- Inspected actual screenshots for pressed home button, six-row settings and special tool cargo panel; no text clipping or misplaced pressure observed at tested viewport.

## Issues raised and resolved
1. Sub-threshold shop-card edge exit retained pressed paint. Added edge exit/reentry handling and regression test.
2. Clear-tool empty/reserved/third-unselectable cells got a misleading press/click. Filtered invalid capture without changing the existing 40px hit rectangle.
3. A test-update trailing comment accidentally swallowed existing storage/checksum assertions. Both original assertions restored and tests rerun.

## Limits
- These are unmodified production bundles in simulated browser/wx hosts with actual native Canvas pixels, not real browser GUI, WeChat developer tools or a physical phone. Audible loudness, device vibration feel and user-perceived latency remain physical-device checks.
- Full serial suite is owned by the implementer and was still running at review handoff; first run contained two missing historical artwork-source checks. Both absent paths also verified absent in recovered v106 baseline. Do not claim full suite passed unless final evidence supports it.
- Legacy developer-only controls and upgrade/supply/practice render branches were source-reviewed via the shared wrapper but not separately traversed in the independent production-host sequence.

## Evidence
- host-evidence/final-report-browser.json
- host-evidence/final-report-wechat.json
- final-focused.tap
- independent-semantics.json
- final-binding.json
- TEST-MATRIX.md
