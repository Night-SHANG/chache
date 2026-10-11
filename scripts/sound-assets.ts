import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {SoundName} from '../src/platform/types.ts';
import {generateSound} from './audio.ts';
export const UI_CLICK_SHA256='539e8b026387c21867af9beb295c5dc018bc7078aec7c5d7f4901c34307e9e88';
/** Build-time asset loading only. The selected recording is never synthesized at runtime. */
export function loadSoundAsset(name:SoundName):Buffer {
 if(name!=='ui_click')return generateSound(name);
 const bytes=readFileSync(new URL('../assets/audio/ui-click/ui_click.wav',import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!==UI_CLICK_SHA256)throw Error('Unverified licensed UI click');
 return bytes;
}
