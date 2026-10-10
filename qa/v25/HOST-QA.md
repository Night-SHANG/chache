# v0.25 batch tool quantity: original-bundle host QA

Result: **62/62 passed**, 0 failures, on commit `692573585ec0757ab52dec2e3a214b71560430f1`.
Source SHA-256: `2bf499e0f46105cf23ee546698ad3ce63d9d3db6526987a54aebc8cdc86463ae`.
Both pricing modes passed 31 cases each: total 34 native wx/Canvas cases, 26 original app.js DOM-event cases, and 2 source preservation checks. Begin/end commit, source and four bundle hashes matched the owner freeze.

## Verified
- 320×720, 360×800 and 540×960 in free and production pricing, using untouched game.js and app.js.
- All three tools: initial quantity 1; lower bound; quantity 3 with correct free/paid total; transient +/-; cancel leaves storage unchanged; reopening resets to 1.
- One confirmation changes wallet and selected inventory in exactly one account generation. Duplicate release and rapid repeated taps neither charge again nor open an underlying tool modal. Restart retains the batch.
- Capacity bound and full-stock disabled confirmation; paid affordability bound and exact-wallet purchase down to zero; insufficient-wallet shop row is inert.
- Modal isolation and cancelled pointer input are inert. Newly batch-owned stock still allows at most two carried tool types and one item of each type.
- Native before/after-write failures on both A/B roots recover one complete batch without partial wallet/inventory state or duplicate purchase.
- A stale second writer causes no purchase, visibly asks for reconfirmation, and reopening starts at quantity 1. Four supplemental screenshots also verify the notice clears on reopen.
- Frozen catalog remains 50 cosmetics / 15 displayed sets; no catalog/art changes are made by the harness.

## Evidence and visual review
- Main report: `host-final/report.json`; command log: `host-final-run.txt`.
- 98 current primary screenshots with labels, geometry, pixel and storage evidence; four extra stale-feedback screenshots in `host-final/stale-visible/`.
- Supplemental capture source: `capture-stale-feedback.mjs`.
- Representative screenshots inspected at 320/360/540: free quantity 3, paid quantity 3, exact wallet, full-stock disabled controls, and stale-account notice. Quantity and total are readable, controls remain separate, the paid primary action is yellow, and unavailable actions are grey.
- Earlier 46/62 run is retained in `host-initial/`: it found missing visible stale feedback, subsequently fixed, plus an overly strict full-stock row expectation, corrected to match the existing row-to-modal design.

## Limits
This is real native Canvas pixel rendering driven by original-bundle callbacks, with wx/DOM host simulations. It is **not** a real browser GUI, WeChat developer-tools run, physical-device test, or human acceptance. Browser storage-fault injection was not performed. Funded/high-stock accounts are isolated validated QA fixtures. Catalog/carry preservation checks do not constitute a fresh run of every historical gameplay or cosmetic suite. No historical passes are counted.
