# Android v1.0.14 startup host validation

## Evidence boundaries

- `../host-canvas/canvas-receipt.json` records execution of the exact staged `build/android/app.js` bytes in Node VM with test-only native/DOM doubles and real `@napi-rs/canvas` PNG decoding and rendering. The receipt binds the bundle SHA-256, loaded asset SHA-256 values, assertions, render trace, and output image hashes.
- Rendered PNGs are under ignored `artifacts/android-v114-startup/`. These are actual game-renderer Canvas images, not Chromium screenshots. The HTML cover is a DOM test double in this harness; no screenshot claims are made for it.
- `host-receipt.json` is the separate Chromium host-suite result. A BLOCKED receipt with NOT RUN cases and zero screenshots is not a visual acceptance pass.
- Neither host proves Android WebView, Java/native storage, device lifecycle, splash screen, or phone acceptance.

## Reproduce

After the final combined staging build:

```sh
npm run build:android
node scripts/verify-android-startup-canvas.mjs
node scripts/verify-android-startup-host.mjs
```

The Chromium suite defaults to `/usr/bin/chromium` and `/opt/codex/cua_node/lib/node_modules/playwright`. `CHROMIUM_PATH` and `PLAYWRIGHT_MODULE` may select the equivalent locally installed tools. Chromium's sandbox is always enabled. All requests are intercepted: `https://localhost` receives the exact staged bytes, except for the expressly labeled asset-failure and parse-failure injections. Unexpected origins fail the run. No TLS certificate warning is bypassed.

The browser suite is designed to capture twelve views covering the unchanged initial cover, one pending asset, complete first frame, held and fresh input, foreground resume, fast assets, actual resource failure/retry, and CSS fallback before/after twelve seconds. It snapshots canvas pixels synchronously immediately before the first hidden write, then compares them against the first complete browser screenshot.

## Current environment blockers

Chromium launch fails at `chrome/browser/process_singleton_posix.cc:297` with `socket() failed: Operation not permitted (1)`. The same launch with `chromiumSandbox:true` was retried through the standard reviewed `require_escalated` path and failed identically. The browser sandbox was not disabled.

The supported existing cloud Chromium was also inspected. Its browser API provides navigation, screenshots, and read-only DOM evaluation, but no request interception or init-script injection for the exact-origin bridge harness. A request to display the unchanged staged HTML as a `data:` URL was explicitly denied because that browser permits only `http:` and `https:` navigation. No alternate protocol or undocumented handle was used after that denial.

Therefore Chromium-rendered startup and CSS twelve-second fallback screenshots remain NOT RUN here. The Node Canvas evidence is a useful independent lower-level check and must retain that label.
