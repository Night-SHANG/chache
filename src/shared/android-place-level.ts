import {AUDIO_LEVELS} from './audio-levels.ts';

/** Android place retains its +6 dB asset gain; net gain is +3.564 dB versus
 * the common asset, 1 dB above pick. Other cue playback levels stay unchanged. */
export const ANDROID_PLACE_VOLUME = AUDIO_LEVELS.browserEffects * 10 ** (4.5 / 20);
