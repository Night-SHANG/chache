/** DM-CGS-32 stays at original amplitude in the asset. Apply this click-only gain once at playback. */
export const UI_CLICK_GAIN = 0.2428740327036814;
/** Android only: +6 dB over the shared click mix, applied once. At master 0.45,
 * HTMLAudio volume is about 0.218 and the original PCM peak becomes about 0.215. */
export const ANDROID_UI_CLICK_BOOST_DB = 6;
export const ANDROID_UI_CLICK_GAIN = UI_CLICK_GAIN * 10**(ANDROID_UI_CLICK_BOOST_DB/20);
