import {AUDIO_LEVELS} from './audio-levels.ts';
/** v1.0.10: the same -2 dB applies to normal and paused BGM; lifecycle policy is unchanged. */
export const MUSIC_GAIN = 10**(-2/20);
export const MUSIC_LEVELS = Object.freeze({normal:AUDIO_LEVELS.music*MUSIC_GAIN,paused:0.12*MUSIC_GAIN});
