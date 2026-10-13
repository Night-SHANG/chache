# v1.0.20 / Android versionCode 10

## Scope and sequence

Android retains the original system splash overlay while the underlying attached WebView draws. The exit listener restores the existing edge-to-edge policy before publishing a new geometry generation. No pre-draw condition blocks JavaScript or Canvas rendering.

The ordinary menu initially needs two PNG resources: its committed scene and selected forklift. Other initial views use their existing core resource set. Successful resource preparation advances immediately. A four-second deadline bounds decode failure only; expired promises cannot promote late images. Failed initial keys stay failed until an explicit requirements change. Other shared atlases continue preparing in the background.

After the actual game render, JavaScript submits the complete current native host snapshot. Native code accepts only the current active owner and geometry generation, posts a WebView visual-state callback, revalidates that generation, and removes the original splash overlay. Startup touches, including gestures begun before reveal, are consumed. Back/background and destruction cancel stale callbacks. A fifteen-second foreground watchdog exposes an actual startup error rather than holding the icon indefinitely.

Missing Android scene PNGs use a finite, full-screen fallback with the same band geometry as the ready background. Browser and WeChat retain their existing paths. No media bytes or v1.0.19 audio levels change.

## Evidence and limits

Formal native-Canvas tests compare entire rendered frames for all 9 scenes × 11 forklifts: 99 normal combinations, 297 scene/forklift/both failure combinations, and two deadline/late-completion sequences. The first visible menu remains pixel-identical when optional atlases arrive. Background continuity additionally covers 72 cases and 216 frames across four aspect ratios.

The Chromium harness records sequential bootstrap, PNG completion, rendering, geometry-generation and simulated native visual-callback events. Its screenshots show WebView-equivalent browser content, not the Android system splash. Local sandbox launch is restricted; a successful CI receipt is required before claiming those cases executed.

Pure Java state tests exercise handoff races and watchdog lifecycle. Android compilation, API 31/32 behavior, and actual native continuous frames require separate platform evidence. No source, Canvas, or Chromium result is represented as a physical-phone acceptance test.

Full-suite counts and actual exit codes are recorded in `qa/v120`. The two pre-existing missing-authoring-art checks remain enabled and must be disclosed if still failing.
