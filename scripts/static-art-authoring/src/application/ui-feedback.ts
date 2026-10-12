import type {Platform,SoundName} from '../platform/types.ts';
import type {Profile} from './profile.ts';
/** Transient user-activation feedback. No state here is persisted or part of a game replay. */
export class UiFeedback {
 private lastSound=-Infinity;
 private lastVibration=-Infinity;
 private soundSerial=0;
 private platform:Platform;
 private settings:()=>Profile['settings'];
 private blocked:()=>boolean;
 constructor(platform:Platform,settings:()=>Profile['settings'],blocked:()=>boolean){this.platform=platform;this.settings=settings;this.blocked=blocked;}
 sound(name:SoundName):void {if(this.settings().sound){this.soundSerial++;this.platform.playSound(name);}}
 activate(act:()=>void,major:boolean):void {
  const before=this.settings(),soundEnabled=before.sound,vibrationEnabled=before.vibration!==false,serial=this.soundSerial;
  act();
  const after=this.settings(),now=this.platform.now();
  if(soundEnabled&&after.sound&&serial===this.soundSerial&&now-this.lastSound>=60){this.lastSound=now;this.sound('ui_click');}
  if(major&&vibrationEnabled&&after.vibration!==false&&!this.blocked()&&now-this.lastVibration>=120){this.lastVibration=now;try{this.platform.vibrate?.();}catch{/* Optional host feedback never gates the action. */}}
 }
}

export function controlSettingsPatch(type:'toggleMusic'|'toggleSound'|'toggleVibration'|'toggleMotion',settings:Profile['settings']):Partial<Profile['settings']> {
 return type==='toggleMusic'?{music:settings.music===false}:type==='toggleSound'?{sound:!settings.sound}:type==='toggleVibration'?{vibration:settings.vibration===false}:{reducedMotion:!settings.reducedMotion};
}
