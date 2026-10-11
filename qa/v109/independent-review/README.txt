v1.0.9 independent review evidence

This folder contains technical evidence only. REVIEW.md identifies the exact product commit, bundles, source hash and waveform. JSON host paths were normalized to placeholders; no product bundle was rewritten or instrumented.

Reproduction prerequisites: the reviewed source checkout with its locked Node dependencies installed; a frozen production build from product c454dce197c8ba2ebc3a7e8ed54ed5aaf565c255; a v1.0.8 production build for legacy byte comparisons; Python with NumPy and FFmpeg for offline PCM analysis. Use Node 24+ for TypeScript imports. Production build directories must remain isolated from unit-test build outputs.

Set SOURCE to reviewed checkout, BUILD to frozen v1.0.9 build (containing browser/ and wechat/), OLD to v1.0.8 build, EVIDENCE to this folder, and OUT to a new output directory. Create OUT before running.

TARGET=browser node "$EVIDENCE/independent-host-click-mix.mjs" "$SOURCE" "$BUILD" "$OUT"
TARGET=wechat node "$EVIDENCE/independent-host-click-mix.mjs" "$SOURCE" "$BUILD" "$OUT"
node "$EVIDENCE/independent-semantics.mjs" "$SOURCE" "$OUT"
node "$EVIDENCE/independent-binding.mjs" "$SOURCE" "$BUILD" "$OUT"
python "$EVIDENCE/independent-click-mix-dsp.py" "$SOURCE" "$BUILD" "$OLD" "$OUT"

From SOURCE, the independent focused run:
node --test --test-concurrency=1 tests/background-music.test.ts tests/rush-base21-session-music.test.ts tests/audio-platform.test.ts tests/playtest-audio-balance.test.ts tests/ui-feedback-policy-v107.test.ts tests/button-feedback-platform-v107.test.ts tests/button-feedback-session-v107.test.ts tests/licensed-ui-click-v108.test.ts tests/v020-frozen-gameplay.test.ts tests/click-mix-v109.test.ts

Expected: 90 focused tests, 6 browser groups, 6 WeChat groups, 5 semantic cases, waveform analysis and source binding all PASS. This independent set is not the full project suite. See outer QA summary and raw logs for full-suite totals and known artwork/watchdog failures. Audio hosts simulate API behavior; no physical-device listening is represented.

From this evidence directory: sha256sum -c SHA256SUMS
