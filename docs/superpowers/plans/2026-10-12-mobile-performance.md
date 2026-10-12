# Mobile Performance Implementation Plan

> For agentic workers: use test-driven implementation, followed by independent task review. The parent coordinates the separately approved touch-offset change.

**Goal:** Reduce redundant drag simulation and unchanged scenery drawing without changing game rules, appearance, placement behavior, saves, or pixel density.
**Architecture:** A one-entry input preview cache is keyed by immutable run identity, selected piece and grid origin. Risk analysis consumes the preview's existing settled state/events. Separately, an optional bounded native-pixel cache retains only static warehouse artwork, with exact fallback to original drawing.
**Tech Stack:** TypeScript, Canvas2D, Node test runner, browser/WeChat/Android shared source.
**Spec:** User-approved three-item design on 2026-10-12. Reproducible preview verification is recorded in `docs/mobile-drag-performance-verification.md`; device FPS is not yet measured.

## Global Constraints
- Work only in an isolated performance worktree from 0143e3436934a8c627af5a9e354f6aba8907e1c6.
- No rule, asset, visual boundary, save, signature, Secrets, CI-release, frame-rate or DPR changes.
- Mouse behavior is unchanged; touch offset belongs to the separate worker.
- Every new optimization is optional and preserves the uncached behavior; no cache result may be used to commit a placement.
- Storage, RNG and game state remain untouched by preview and rendering.

## Review Focus
- Same-cell moves update finger position and effects while skipping recomputation.
- Run, piece, modal, pointer lifecycle or projected origin changes cannot reuse stale results.
- Risk checks use post-settlement state including shipments, expiry and cleanup.
- Cache native pixel phase, bounds and alpha/compositing match the original renderer.
- Unavailable surfaces, resource loading, theme/viewport changes, context loss and memory caps fall back safely.

## Task 1: Reuse drag previews and risk simulation
Files: `src/presentation/input.ts`, `src/presentation/placement-risk.ts`, `src/application/session.ts`; new focused tests and reproducible benchmark under tests/scripts.
- [x] Add tests counting production preview/risk calls across same-cell jitter, cross-cell movement, pointer cancel/up, exit/re-entry and replacement state/piece. Require live dragPoint and fresh up validation.
- [x] Verify the tests fail on the baseline for repeated previews, then implement one retained cache entry keyed by state reference, pieceId and origin.
- [x] Extend the optional InputPort risk callback with the already computed preview; refactor placementRisk to consume its valid stateAfter/events while retaining original fallback when omitted.
- [x] Differential-test all supported rulesets' valid placements and existing risk fixtures, assert original state remains unchanged.
- [x] Run focused tests, full test suite, typecheck/lint and unchanged real-state microbenchmarks. Commit as one independently reviewable change.

## Task 2: Cache static warehouse rendering
Files: new bounded presentation cache; warehouse renderer invocation; platform-entry configuration/invalidation and focused cache/render tests.
- [x] Write failing tests for repeated static painting, native-resolution scale/phase, correct bounds, invalidations, unsupported and failing canvas paths, compositing guards and bounded allocation/release.
- [x] Implement optional `drawWarehouse` cache first. Evaluate pure board-floor caching only if static inputs and exact image-equivalence tests prove safe; no whole-screen caching.
- [x] Compare native raster pixels against the original paths across representative themes/DPR/bounds/overlays; retain artifacts and strict evidence of differences.
- [x] Verify shared platform wiring (first WeChat canvas stays screen), build all applicable entries, and obtain independent review.

## Task 3: Integration verification
- [x] Integrate the separately reviewed touch-offset commit without weakening cache keys or up validation.
- [x] Run complete lint/typecheck/tests/preflight/browser+WeChat+Android web builds, preserving signed packaging pause.
- [x] Repeat benchmarks and screenshot parity against frozen baseline. Report exact commits and verification limits to parent; actual one-plus/WeChat FPS remains user-side validation.

## Integrated checkpoint

Completed in release/v1.0.11. The board-floor option was evaluated and deliberately deferred; only drawWarehouse is cached. Final complete suite:3199 tests,3197 pass,2 unchanged missing-source-art failures; no skipped/cancelled tests. Browser/WeChat production and Android web staging pass, without native packaging. See docs/v111-mobile-integration-validation.md and qa/v111/summary.json for exact verification and device limitations.
