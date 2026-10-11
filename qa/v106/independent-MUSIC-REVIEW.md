# v1.0.6 startup music independent review

PASS: read-only review of music.ts, its exact four-line behavior diff, platform adapters, Session.syncMusic call order and background-music.test.ts. Independent rerun: 59 related tests passed. Four additional startup promise/refusal race cases passed (music-races.json).

The controller requests normal host play when session state permits, including before the first gesture. Persisted mute, pause, hidden/recovery/account-blocked states remain effective. A rejected attempt blocks frame retries until a new real pointer-down; gesture callbacks can disable playback before the retry. active prevents duplicate plays/contexts. Generation checks prevent stale rejections from cancelling newer playback; delayed success cannot restart a currently unwanted player. Hide/show and pause/resume retain their existing semantics.

No browser-security flags, autoplay policies or OS settings are changed. The code does not guarantee audible playback when the host refuses automatic sound. Evidence is unit tests and simulated audio host outcomes, not real-browser/physical-WeChat sound verification.

Final immutable combined bundle/background screenshot binding is separate; this report does not re-use the old screenshot bundle SHA for the audio-modified bundle.
