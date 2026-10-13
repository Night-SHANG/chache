import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {SoundName} from '../src/platform/types.ts';
import {generateSound} from './audio.ts';
export const WECHAT_ACTION_GAIN_DB=2;
export const WECHAT_ACTION_CUES:readonly SoundName[]=Object.freeze(['place','route_ready','forklift','ship','chain2','chain3','chain4','shift']);
export const PLACE_ASSET_GAIN=10**(2/20);
export const UI_CLICK_SHA256='64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512';
/** Build-time asset loading only. The selected recording is never synthesized at runtime. */
export function loadSoundAsset(name:SoundName,target:'browser'|'wechat'|'android'='browser'):Buffer {
 const wav=loadCommonSoundAsset(name);
 if(target==='wechat'&&WECHAT_ACTION_CUES.includes(name)){
  const gain=10**(WECHAT_ACTION_GAIN_DB/20);
  for(let offset=44;offset<wav.length;offset+=2){
   const sample=Math.round(wav.readInt16LE(offset)*gain);
   if(sample< -32768||sample>32767)throw Error(`WeChat ${name} gain would clip PCM16`);
   wav.writeInt16LE(sample,offset);
  }
 }
 return wav;
}
function loadCommonSoundAsset(name:SoundName):Buffer {
 if(name!=='ui_click'){
  const wav=generateSound(name);
  // Boost only place in PCM, keeping runtime volume in the legal 0..1 range on both hosts.
  if(name==='place')for(let offset=44;offset<wav.length;offset+=2){
   const sample=Math.round(wav.readInt16LE(offset)*PLACE_ASSET_GAIN);
   if(sample< -32768||sample>32767)throw Error('Place gain would clip PCM16');
   wav.writeInt16LE(sample,offset);
  }
  return wav;
 }
 const bytes=readFileSync(new URL('../assets/audio/ui-click/ui_click.wav',import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!==UI_CLICK_SHA256)throw Error('Unverified licensed UI click');
 return bytes;
}
