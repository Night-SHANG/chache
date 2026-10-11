# v1.0.8 independent review: selected C recording and pause BGM

Verdict: No blocking product defect found in the reviewed candidate. License, asset transformation, playback policy, preservation and production-host checks passed. The final committed product and its rebuild were verified, including fresh production-host reruns.

## Exact reviewed product

- Candidate: the selected C production build (earlier synthesized candidates are superseded).
- Final product Git: `882238d02515687fa724ce5efad8ad062a20f8e2`
- Product tree: `2357552095afacc857b98d226ec2b898633857b8`
- Baseline Git: `958e270007163ce3efd0f02bcc9e745b88e900e1`
- Source SHA-256: `5b4501f44c9c735a3e32cb79d7f8a4077f13928bfb183d1f6b60cb53a3e114d2`
- Browser app.js: `3aaf2a8dc620acf2f49c97f13e31200a808f137bc338521bc4e3703b08181917`
- WeChat game.js: `cac1ce0e31888666f10bd65613a5d0e51c81c1c59fa626a5c9d518251f2d9c09`
- Selected ui_click.wav, both platforms: `539e8b026387c21867af9beb295c5dc018bc7078aec7c5d7f4901c34307e9e88`
- Version 1.0.8; paid production; developer diagnostics false.
- The full source manifest was independently recomputed and matches both production manifests. JS bundle hashes alone do not distinguish the superseded sound: the WAV and source hashes above are required.

## License and source provenance

- The [official Dustyroom page](https://dustyroom.com/free-casual-game-sounds/) declares the whole pack CC0 and supplies the [original ZIP](https://dustyroom.com/casualgamesounds/DM-CGS.zip). The contained license PDF independently confirms commercial use and optional attribution. The [CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en) permits modification and commercial redistribution; no author endorsement is claimed.
- ZIP integrity passed. Original DM-CGS-32.wav and license PDF match their ZIP entries byte-for-byte, and the source checkout retains those exact bytes.
- Original WAV SHA-256: `718a8f04c9eecc0466dd865fcc64884988df66e18f3fd96ad7e291f2b9b0bd9a`
- Official ZIP SHA-256: `7ffc649a641a8b8ee0136d431b5dd69bcf9eeabc250a18285ad984ad09bd4a4f`
- Original license PDF SHA-256: `fa3693afc38aac134361b33d0b73cd7bc1300fdca8c87af813c64fa91b218cca`
- Both production targets carry the matching notice, original license PDF and CC0 text.

## Transformation and audio measurements

- The final asset keeps every original frame: 8,253 frames, 44.1kHz, stereo, 187.143ms. No synthesis, EQ, pitch shift, fade, truncation or audition repeats.
- An independent PCM24 parser and calculation reproduced every final sample exactly: one constant gain `0.06071850817592035` then rounding to PCM16. Maximum conversion error is at most half an output sample unit.
- Measured peak 0.059998, RMS 0.013833, power spectral centroid 362.21Hz, middle 95% of energy spans 26.984ms. First/last output frames are zero; no clipping; maximum adjacent-sample change per channel 0.005402.
- Relative to v1.0.7: peak −1.94dB, integrated energy +0.46dB. A lower peak/RMS alone is not proof that the whole sound is quieter or subjectively more comfortable.
- At/after 60ms only 0.0001553% of its energy remains; maximum remaining peak and worst restart jump are 0.0001831 (about −74.75dBFS before platform gain). An eight-tap, exact-60ms cached-restart waveform model has zero boundary jump after PCM quantization, with no self-layering.
- Browser and WeChat retain SFX gains 0.45 and 1, producing click peaks 0.0270 and 0.0600 respectively. Click peak and per-channel integrated energy are below each of the original 12 effects. Compared with pick/place, click energy is 12.51%/4.96%; the same-activation business cue still takes precedence. These checks support the mix but cannot prove subjective non-masking.

## Fresh independent tests

- 10 original-production-host groups passed, 5 per target, through actual DOM/wx input callbacks and native Canvas. No product exports or runtime state were injected.
- Coverage: startup, pause → help → pause, pause → settings → pause, music and SFX switches, 12 rapid pause/resume cycles, 8 exact-60ms UI sound replays using one cached UI handle on each platform, background silence, foreground low-volume pause menu, explicit resume, saved-run needsResume silence, music-disabled cold start, autoplay rejection and bounded gesture retry, home, actual endless retirement/result, and corrupt A/B-account blocking without writes.
- BGM stays at 0.18 normally and 0.12 paused (−3.52dB). Pause/help/settings/continue change only gain: same handle, same src, same simulated position, no added play/pause calls. Background and explicit music-disable still pause. Failed volume assignment does not interrupt music or create frame-by-frame retries.
- 85 focused tests independently rerun: 85 pass, 0 fail, 0 skipped. This includes asset license/conversion/tail tests and frozen-gameplay protection.
- 5 independently authored semantic checks pass: actual lost writer causes accountBlocked suspension; volume exceptions are bounded; pending playback survives 100 gain-toggle pairs with one request; 60ms sound throttling does not drop actions; business-cue precedence and silent mute/unmute gestures remain.
- 187 untouched src/assets files match baseline. Five runtime source edits are limited to music-state forwarding/controller/adapters. Original 12 game WAVs and BGM match baseline and both targets exactly. The old 12-cue synthesis source is identical after removing the UI entry and normalizing type-only narrowing.
- Game rules, UI layout/feedback policy, wallet, inventory, cosmetics, account codec and save schema are unchanged. The production-host pause loops preserve board checksum, wallet, inventory and cosmetics.

## Review findings and limits

- No blocking code or licensing finding remains in this bound candidate.
- Two minor wording clarifications were requested and resolved in the final product commit: sound throttling must not be described as dropping button actions; canceled/disabled UI clicks must not imply all invalid gameplay signals are silent. No outstanding review change remains.
- Real browser GUI, WeChat developer tools, iPhone/Android hardware and final in-game subjective listening were not run. User selection of C approves the sound choice; it does not establish final device mixing.
- Gain-setter rejection safely keeps the previous audible level until a different target gain triggers another attempt. A host that rejects gain writes cannot be promised to duck.
- Earlier lifecycle/scene sound stops retain their previous behavior. The near-silent-tail result applies to cached UI retriggers at or after 60ms, not an assertion that arbitrary forced early stops never interrupt audio.
- Final aggregate raw log was inspected: 2,857/2,859 passed; two historical source-artwork inputs are missing, with zero skipped or cancelled tests. The two same inputs are absent in the baseline, and their tests were not changed. This is not an all-green repository result.

## Evidence

- `host-audio-browser.json`, `host-audio-wechat.json`
- `focused-independent.tap`, `independent-semantics.json`
- `independent-licensed-click-dsp.json`, `independent-binding.json`
- `independent-dustyroom-license.json`
- Reproducible checks: `independent-host-audio.mjs`, `independent-semantics.mjs`, `independent-licensed-click-dsp.py`
- Earlier synthesized candidates and audition artifacts are excluded from this final technical evidence set.

## Final-commit verification

The product commit and tree above were read directly from Git. Product files were clean; only uncommitted QA evidence remained. Both rebuilt production manifests identify the exact product commit and reviewed source hash. Both rebuilt bundles, selected WAV, BGM and license files are byte-identical to the reviewed C candidate. The 10 production-host groups, 5 independent semantic checks and exact PCM conversion/asset checks were freshly rerun against that final rebuild and passed.

Aggregate failures are unchanged missing files `artifacts/v0200-art-source/cargo-wood-generated.png` and `artifacts/v0210-art-source/cargo-harbor_container-generated.png`; runtime atlases and normal production builds remain available.
