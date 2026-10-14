# v1.0.21 / Android versionCode 11: effect volume only

The Android button is the reference. Its PCM asset and existing playback gain stay unchanged. The twelve quieter game-effect WAVs receive a separate build-time scalar gain. Browser and WeChat audio assets, all background music, waveform frequencies, envelopes, durations, silence, gameplay, sound triggers, and runtime volume/lifecycle controls remain unchanged.

## Reviewed additional Android asset gain

| Cue | Additional dB |
| --- | ---: |
| pick | 9.5 |
| place | 6 |
| invalid | 9 |
| route_ready | 9 |
| forklift | 14.5 |
| ship | 5.5 |
| chain2 | 3.5 |
| chain3 | 4.5 |
| chain4 | 4 |
| upgrade | 6 |
| shift | 7 |
| fail | 8 |

These values are relative to the common v1.0.20 assets, including place's existing common +2 dB. They are **asset gains**, not runtime volume changes. Ordinary Android effects still play at 0.45. Android's prior button playback boost stays in force; no extra button asset gain is applied.

Calibration uses each cue's loudest sliding 50 ms RMS after its unchanged playback gain. The button reference is approximately -20.34 dBFS. Every adjusted cue falls from +0.008 to +2.53 dB relative to that reference. Place, invalid, and fail have a modest scalar allowance for their bass-heavy source; this is a limited mix decision, not an EQ or a measured speaker correction. Forklift's larger dB increase starts from a much quieter original asset. Its resulting source peak remains about 0.345. No perceptual equality or audibility on a particular phone is established by these offline metrics.

## Build and isolation

`loadSoundAsset` always starts with a fresh common asset, then applies a single target-specific PCM16 gain with rounding and clipping rejection. Android staging first builds unmodified formal browser/WeChat media, copies it into a fresh directory, and replaces only the twelve Android effect WAVs with the Android loader outputs. Rebuilding never amplifies an earlier staged file.

The Android manifest separately records `soundEffects.androidAdditionalAssetGainDb` and the unchanged `androidVolume`. Its place metadata records total asset gain (+8 dB, including the existing common +2 dB) and the additional Android +6 dB. The button metadata continues to describe its existing playback gain.

No `src/`, original audio/image assets, native production Java, audio engine, event timing, or gameplay source is changed. Root and Android shell version metadata advance together; their dependency graphs remain identical. The signed-candidate workflow uses v1.0.21/vc11 while preserving its existing branch, permissions, secrets isolation and private-delivery gates.

## Verification boundaries

Focused regressions verify every PCM sample, untouched headers and silent samples, deterministic generation, cross-platform source hashes, short-window levels, truthful staging metadata, preserved static media and repeated full staging. Full-suite results and exact exit status belong in `qa/v121/README.md`; the two known missing original-art checks remain enabled.

The original eight modeled gameplay timelines have at least 5.25 dB conservative absolute-sample-sum headroom including the loudest source BGM sample. Three additional rapid reduced-motion scenarios have a minimum of approximately 0.68 dB under the same conservative bound. A synthetic all-thirteen-cues-at-once case can clip and is not established as an ordinary reachable game state. These are finite offline scenarios, not a guarantee for every possible host latency or arbitrary overlap. No limiter, scheduling change or background-music reduction is introduced.

A staged web directory is not a signed APK. Compilation, signing, packaged-byte checks and runtime CI need their own receipts. Physical-phone listening remains unverified and is the final check of perceived volume.
