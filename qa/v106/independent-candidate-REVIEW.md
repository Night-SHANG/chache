# v1.0.6 finite-frame candidate review

Result: no blocker found for sending candidate screenshots to the user. User visual approval is still required before packaging or publishing. This is not a release sign-off.

## Exact candidate
`../scene-width-current/v106-review/paid-candidate`
- Browser: `9640351051de7bb9136ab22daa3f5058e37cbf52fb49e742f48dbc302bc2a3b2`
- WeChat: `5cbc2a4e740ffaff998792e13002ad62efc1b2e02961d78fecca9b7eef3242a0`

## Correct acceptance rule
Use the classic source artwork's finite envelope, [-57,1148], width 1205. Draw each new theme once with translate(-57,0), scale(1205/1080,1), leaving the internal helper at 1080×1920. Vertical horizons/floors remain in place. Restore before drawing UI/board. Preserve outer platform color #0c131c.

This replaces v1.0.5's full-viewport gradient and v1.0.4's mirrored scenes. Non-default background pixels are expected to change; preserving them was not the correct goal for this requested width alignment.

## Visual evidence reviewed
- Read both user-supplied 1385×676 classic/cold-chain shop screenshots.
- Viewed candidate classic/cold-chain shop at identical size, plus railway menu 1356×660, cold-chain 446×694/390×844 phones, ice-vault 768×1024 and all 14 theme wide contact sheet.
- The scene itself now occupies the classic finite width; outside remains deep background. No full scene is repeated or spread across the whole viewport.
- Cold-chain fan circles become mildly elliptical from the approved 11.6% horizontal background expansion. At original screenshot scale this did not look excessive to the reviewer, but is explicitly for user visual confirmation. UI text/buttons are not stretched.
- On narrow phones the finite frame is clipped by the usable viewport, consistent with the classic approach; this is not a responsive layout rescale.

## Independently executed checks
- 136 production scene frames; default day/night entire frames unchanged, text/bounds and account snapshots unchanged.
- 112 non-default frame checks: exact expected classic envelope after viewport clipping; zero painted pixels outside it.
- 8 gameplay board-interior image comparisons: zero changed pixels.
- 32 shop preview cases at 1385×676: complete frames, controls and accounts equal to baseline.
- 72 actual source-platform DPR 1/2/3 resize/orientation round-trip and pointer-map checks, including landscape→portrait→landscape. Render transforms restored correctly.
- 97 related tests passed.
- 12 equipped-theme shop screenshots, browser/wx, six themes at 1385×676.

## Files to show before any package
- `shop-evidence/browser-day-1385x676-shop.png`
- `shop-evidence/browser-cold_chain-1385x676-shop.png`
- `shop-evidence/classic-shop-comparison-1385x676.png`
- `candidate/evidence/classic-baseline-1356x660.png`
- `candidate/evidence/classic-baseline-446x694.png`
- `candidate/evidence/classic-baseline-390x844.png`

## Machine evidence and limits
`REVIEW.json`, `frame-boundary.json`, `board-comparison.json`, `resize-input.json`, `focused-tests.log`, scene/preview reports and original PNGs. Production screenshots use native Canvas/DOM-event host simulations; no real Chromium or physical WeChat claim. Physical orientation was not tested. No repository changes, release package or publication were performed by this reviewer.
