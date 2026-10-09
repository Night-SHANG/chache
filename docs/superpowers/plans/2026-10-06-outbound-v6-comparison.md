# Outbound v6 comparison implementation plan

> Execute this bounded QA subtask under Task 5 of the approved outbound-v6 implementation plan.

Goal: source-bound evidence for seeds 1–100 across easy/normal/hard/expert, retaining the v5 fixed heuristic with 9×9 geometry.
Architecture: independent QA module imports production rules and strict storage; production stays read-only. Short protocol tests precede one full campaign.
Spec: docs/outbound-v6-design-draft.md

Constraints: 20/30/40/50%, 600 valid moves/game, 10000 independently generated pieces/tier; no tuning, 60% tier, network, npm/npx, commits, or production edits. Preserve v5 history.

Review focus: seven-wide stride; anchor-only color metrics; four-cell assumptions in P5; source drift; caps labeled as losses; 66-pattern sampling confused with equal shape weighting.

- [ ] RED protocol, geometry/per-cell scoring, hidden state independence, P5 partial metrics, six-draw/nested/unplaceable generation, short replay/save/load tests.
- [ ] GREEN independent qa/outbound-v6-compare.mjs; no coefficient changes. Check strict storage at initial/every tenth/final command, preview/actual and per-command/full-state replay.
- [ ] Short tests and local lint/typecheck; coordinate source freeze before full campaign.
- [ ] Exactly one 400-game campaign plus 40000-piece generator sample; hash domain/storage/RNG dependency bytes before/after. Stop/dump on drift, no automatic restart.
- [ ] Read-only artifact verification and Chinese report with historical v5 capacity/distribution caveats.

Ruling: use the existing shared task worktree and no commits, as explicitly assigned by parent. Avoid separate workspace/git edits during parallel development.
