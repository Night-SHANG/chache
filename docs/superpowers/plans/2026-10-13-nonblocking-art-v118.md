# v118 Restore pre-split nonblocking artwork

Approved: restore v112 direct render/input/equip semantics. Keep single-package current PNG assets and live catalog.

1. RED: compile all three actual entries and hold/fail PNG callbacks; assert real first menu frame before any completion. Add complete cold-art visual tests.
2. Remove StaticArtGate and v116 equip-pending state. Prepare only changed committed image requirements without awaiting. Restore Android pre-art platform-check lifecycle and retain native/storage errors.
3. Reuse exact v112 procedural artwork only when its optimized PNG is unavailable. Ready frames keep current PNG blits; no cache/offscreen/all-theme preload.
4. Replace tests requiring loading screens with cold, partial, failure, input, equip, stale-result and hide/show coverage. Verify three exact built bundles from first frame through every image completion.
5. Sync v118/vc8 metadata, lint/typecheck/full suite/preflight/build, independent review, package/audio audit, historical backup and truthful fsck/shallow verification.

Review focus: no missing cold sprites, no asset readiness gating, no late-scene identity replacement, no save changes from image completion, no permanent-return-to-vector warm render.
