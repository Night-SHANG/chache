# Exact candidate bundle host evidence

Candidate product commit: c01b77304065e60d3d80be58210c31d8e4822b6e.
Source SHA256: 4a5ab0616a552882c2cbea404b68b0664ee9f3ee82ed1ae68b45a24d84e1b04f.

All 16 cases passed on the freshly built paid production bundles. These are real PNG decode/native Canvas captures in wx and DOM-event simulators, not WeChat developer tools or physical devices. `report.json` binds each screenshot to its bundle hash. Copied PNG bytes are unchanged; report paths have been made repository-relative.

The loading and package-failure captures show actual Chinese glyphs, including the retry button; tests assert rendered pixels rather than relying only on intercepted text labels. Package failure preserves the equipped harbor scene, and explicit retry then loads that scene. Default/custom startup, one on-screen canvas, BGM startup before artwork readiness, shop pagination/classic previews, lifecycle and missing loadSubpackage capability are covered.

Reproduce after a production build with `node scripts/verify-static-art-host.mjs`. A later evidence-only commit can change the build's recorded commit while keeping the same verified source SHA; final distribution should bind the exact final HEAD separately.
