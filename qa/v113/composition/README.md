# Local visual and CPU evidence

Recorded 2026-10-12 22:54–23:01 北京时间（UTC+08:00） from source `4a5ab0616a552882c2cbea404b68b0664ee9f3ee82ed1ae68b45a24d84e1b04f`.

These are original/current native Canvas comparisons, not screenshots from WeChat on a phone. The original reference uses frozen v1.0.12 vector painters with no runtime caches configured. The new image renderer preserves opaque artwork geometry and dynamic labels. Group alpha visibly differs from per-primitive overlap; `alpha-metrics.json` quantifies that separately from image resampling.

`actual-drag-comparison.png` is a real renderer drag state with independent outline and live rush-3 count. `game-contact-sheet.png` covers day/night/forest/ice. `vehicle-contact-sheet.png` includes all 19 current and retained historical models. Known pre-fix frame diagnostics are deliberately not included in this acceptance subset.

CPU measurements are 30-sample local native draw-call submissions on a shared host, without synchronous full-frame pixel-readback barriers. They are noisy and do not establish GPU/phone FPS or warmed-cache improvement. The six-card stress comparison is not the current four-card production page. Its p95 worsened (136.50→158.93ms), so no blanket latency improvement is claimed.

The helper script imports and output paths are adapted to this directory. Run them with Node from the repository root, for example `node qa/v113/composition/render-current-review.mjs`. Timings reproduce a draw-submission workload and must not be described as completed raster-frame timing. Product verification is independently covered by the current tests and `scripts/verify-static-art-host.mjs`.
