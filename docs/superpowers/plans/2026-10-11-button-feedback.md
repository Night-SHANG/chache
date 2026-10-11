# v1.0.7 Button Feedback Implementation Plan

> For agentic workers: use the approved native implementation with separate platform/settings task and independent whole-candidate review. Follow TDD for each behavioral change.

**Goal:** All actionable controls show immediate pressure, valid release gets one quiet UI click, and only major confirmations get optional short light haptics.
**Architecture:** Preserve immutable domain rules and hit rectangles. Input owns ephemeral capture/pressure and validates current control identity. Renderer applies a bounded visual overlay on the captured visible control. Session emits UI acknowledgment after actions finish, respecting settings and suppressing duplicate business cues. Optional platform haptics fail safely.
**Tech Stack:** Existing TypeScript, Canvas2D, node:test, deterministic WAV synthesis and browser/wx platform adapters. No new dependencies.
**Spec:** User-approved scheme conveyed 2026-10-11 17:13 Beijing by parent, message Sentinel_6063b4117c5c81918b5dc53094facd4d; source baseline e5cedc8eda05850c2da5b3fd8591f473a76b7f92 (GitHub mapping 794cff14032584653ae78adf96f3d444ded1a49d).

## Global Constraints
- Do not alter v106 scenery, music autoplay, game rules, prices, save keys or ownership.
- No APK, ads, upload, release or user package before screenshot gate.
- Sound toggle and vibration toggle stop their own feedback immediately. Vibration defaults enabled for old settings with absence tolerated.
- Baseline archive and all native history are preserved in sibling feedback-v107-baseline.

## Review Focus
- Scroll/drag, release outside, interruption and replaced control must never execute stale action or leave pressure visible.
- Custom cards/icons and legacy controls need the same pressure evidence as ordinary buttons.
- UI click must survive clearFeedback; existing upgrade/business sound must not double-play.
- Persisted old settings/checksums/wallet/inventory cannot be invalidated by adding vibration.
- Unsupported/throwing browser or wx vibration must not prevent action or audio.

## Task 1: Capture, rendering and UI acknowledgment
Files: input.ts, view-types.ts, renderer.ts, new control-feedback.ts, session.ts, ui.ts/ui-types.ts; tests/button-feedback-v107.test.ts.
- [x] RED: down exposes pressure only for enabled hit; outside/up/cancel clears; current page/modal/control replacement rejects; repeated up produces at most one acknowledgment.
- [x] Implement bounded capture identity, active pressure and movement state; validate against current top controls and context before accepting release. Preserve shop swipe and 350ms purchase guard.
- [x] RED: every captured rect yields an immediate visible full-control overlay, released image equals baseline; disabled/blank has none.
- [x] Add renderer overlay after existing scene rendering but before restoring main transforms; use original rect for input, darker face and inset edge for pressed appearance.
- [x] RED: effective up triggers short ui_click after action; mute/disable haptics prevent current and subsequent feedback; business cue suppresses duplicate UI sound; only major actions haptic.
- [x] Implement session acknowledgment via a dedicated user-activation callback, separate from programmatic action calls. Set conservative 60ms audio/120ms haptic rate limits.

## Task 2: Optional platform haptic, cue and persisted setting
Files: platform types/browser/wechat; scripts/audio.ts; profile/account setting validation; dedicated tests. Delegated to platform/settings worker.
- [x] RED then GREEN for ui_click whitelist/generation; wx light short vibration and browser 15ms capability, throws/fail safe; blur cancels active browser pointer.
- [x] RED then GREEN for missing vibration field compatible, explicit boolean persists, invalid field rejected, unrelated account data unchanged.
- [x] Integrate settings row via existing settings transaction and reset-compatible optional field.

## Task 3: Validation and visual handoff
- [x] Run typecheck, lint, focused tests, preflight, full serial tests while retaining known historical-art failures separately.
- [x] Build production and free comparison, verify pre-existing assets and v106 music/scenery files unchanged.
- [x] Execute actual app.js/game.js Canvas/DOM host with input, interruptions, haptics/audio counters, and old storage.
- [x] Capture mobile normal/pressed/released/settings frames; provide paths to parent for visual review before any deliverable archive.
- [x] Independent review, TDD corrective pass and final evidence summary. No external publish.

## Ledger
2026-10-11 17:15 Beijing: archive revision12 SHA/size exact; native HEAD exact; git fsck clean. Fresh isolated copy used, existing branch/history left untouched; task branch feat/v1.0.7-button-feedback. Parent and reviewer informed. Baseline targeted tests recorded in qa/v107/baseline-focused.txt.

2026-10-11 17:34 Beijing: implementation and independent review complete. Capture, platform/settings and session TDD logs retained. Refactored new UI policy out of session to preserve the existing 80KB source budget; did not raise the gate. Full serial second 2842/2844 with only inherited source-art failures. Later disabled-control assertion 16/16 targeted. Production/free builds and UI/music bundle host checks passed. Candidate screenshots saved for user review. User visual gate and packaging remain pending.

2026-10-11 17:55 Beijing: user confirmed the two screenshots at 17:53; authorized final packaging and history-preserving Git backup. Production source SHA remains frozen; no further feature changes.
