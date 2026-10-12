# Drag preview performance verification

## Scope

Presentation-only optimization on the v1.0.10 source baseline. Domain rules, random generation, persisted data, artwork, frame rate, pixel density and release/signing metadata are unchanged. Touch-offset and static-background rendering changes are independent tasks.

The input controller now retains only its most recent preview for an immutable state reference, selected piece ID and grid origin. The screen-space drag position still updates on every move. Exiting the board, pointer completion/cancellation, selecting a new piece or replacing the state invalidates reuse. Pointer release performs a fresh preview and the original authoritative dispatch.

The risk function accepts the corresponding preview's settled state and events. This preserves post-shipment/cleanup/rush-expiry semantics while removing a second full simulated command. Its original simulation remains the fallback when a caller omits the settled preview.

## Verification

- TDD: ten initial tests produced six expected failures on the original implementation, including 121 same-cell previews instead of one and redundant history access during risk analysis. The matching optimized tests pass.
- Final focused run: 76/76 tests pass. Coverage includes cache invalidation, live drag position, invalid placements, off-board transitions, pointer IDs, cancel/pause, fresh release validation, route-ready sound transitions, and real GameSession wiring without storage access.
- Differential risk tests cover all 20 supported rule versions, every legal placement in opening and four progressed states per version, plus existing entry-blocked/route-cut/clearing/win/side-gate fixtures. Input checksums stay unchanged.
- Typecheck, lint, preflight and browser/WeChat build passed.
- `scripts/verify-drag-preview-parity.mjs <baseline-checkout>` compared 32 full rasterized frames: eight reachable early/late states × valid/same-cell/invalid/off-board positions. All pixels, preview objects and risk results match exactly. Example PNGs and hashed results are generated under `artifacts/mobile-perf/pixel-parity/`.
- `scripts/benchmark-drag-preview.mjs [source-checkout] [output-json]` replays the checked-in visible-policy traces with production reducers. No artificial command history is inserted; selected tails range from 0 to 86 commands, below the production 128-command segment boundary. Output checksums match between baseline and optimized source.
- Over 20 warm-up plus 240 measured same-cell moves, preview/risk call counts fall from 260 each to one each. In one cloud Node run, late rush same-cell p95 fell from 6.69ms to less than 0.001ms; alternating legal cells fell from 4.78ms to 3.11ms. These are CPU microbenchmarks with scheduling noise, not phone frame rate or a claimed end-to-end improvement.

## Full-suite status at this checkpoint

The first isolated-worktree full run attempted all 3113 existing tests: 3099 passed and 14 failed. Nine Android checks failed because the worktree had not yet linked the existing Android shell dependencies; that environment setup is corrected. Three scan-supervisor timing tests failed under concurrent worker load and require quiet reruns. Two original artwork-source checks remain known baseline failures because their ignored master PNG inputs are not available: `cargo-atlas.test.ts` and `v021-cargo-forklift-art.test.ts`. Packaged runtime atlases are present and unchanged. No test was relaxed or asset regenerated to hide these failures.

A final frozen-code run, `node --test --test-concurrency=2 tests/*.test.ts`, completed with **3146 tests: 3144 passed and the same two missing-master-PNG checks failed**. All nine dependency-related failures and all three scan-supervisor timing failures from the initial run are absent. No other failure remains in this performance-only branch. Its independent code review approved spec compliance and quality.

Integration verification must still run after the separate touch and static-render changes are combined. The known two baseline failures mean this is not a completely clean suite, and it is not a phone-performance sign-off. The user's OnePlus/WeChat test package remains the device acceptance step; no APK was built, signed or published for this change.
