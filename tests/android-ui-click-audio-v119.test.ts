import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {androidFixture,androidHost} from './helpers/android-platform-fixture.ts';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform,type WechatHost} from '../src/platform/wechat.ts';
import {SOUND_NAMES,type SoundName} from '../src/platform/types.ts';
import {GameSession} from '../src/application/session.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {loadSoundAsset} from '../scripts/sound-assets.ts';

const originalClickGain=0.2428740327036814,boost=10**(6/20),androidClickVolume=.45*originalClickGain*boost;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

// Regression targets: use the old level, boost every cue, exceed volume=1,
// compound gain on cached handles, change shared assets, or bypass saved mute.
test('Android raises only ui_click by 6dB at playback and never compounds gain on reuse',()=>{
 const f=androidFixture();try{
  for(let pass=0;pass<30;pass++)for(const name of SOUND_NAMES){
   f.platform.playSound(name);const audio=f.audio.find(audio=>audio.src===`assets/${name}.wav`);assert.ok(audio);
   const expected=name==='ui_click'?androidClickVolume:.45;
   assert.ok(Math.abs(audio.volume-expected)<1e-12,`${name}: volume ${audio.volume}, expected ${expected}`);
   assert.ok(audio.volume>=0&&audio.volume<=1);assert.equal(audio.currentTime,0);assert.equal(audio.plays,pass+1);audio.currentTime=.06;
  }
  f.platform.playSound('unknown' as SoundName);assert.equal(f.audio.length,SOUND_NAMES.length);
  f.platform.stopSounds?.();assert.ok(f.audio.every(audio=>!audio.audible&&audio.currentTime===0));
  f.platform.playSound('ui_click');const click=f.audio.find(audio=>audio.src==='assets/ui_click.wav')!;
  assert.ok(Math.abs(click.volume-androidClickVolume)<1e-12);assert.equal(click.plays,31);
 }finally{f.restore();}
});

test('Android retains the chosen PCM bytes and keeps its boosted click below full scale',()=>{
 const f=androidFixture();try{
  f.platform.playSound('ui_click');const volume=f.audio[0].volume;
  const wav=loadSoundAsset('ui_click','android');assert.equal(sha(wav),'64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512');
  assert.deepEqual(wav,loadSoundAsset('ui_click','browser'));assert.deepEqual(wav,loadSoundAsset('ui_click','wechat'));
  const samples=Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2)/32768),sourcePeak=Math.max(...samples.map(Math.abs));
  assert.equal(sourcePeak,.9881591796875);assert.ok(Math.abs(20*Math.log10(volume/(.45*originalClickGain))-6)<1e-12);
  assert.ok(Math.abs(sourcePeak*volume-.2154867182751448)<1e-12);
  assert.ok(samples.every(sample=>Math.abs(sample*volume)<1),'no standalone click sample reaches full scale');
  // Even a full-scale BGM signal at the unchanged normal gain retains numeric headroom.
  assert.ok(sourcePeak*volume+.18*10**(-2/20)<1);
  assert.equal(sha(readFileSync('assets/audio/bgm.mp3')),'63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da');
 }finally{f.restore();}
});

test('browser and WeChat retain their existing click and other cue volumes',()=>{
 const f=androidFixture();try{
  const browser=createBrowserPlatform(f.canvas);for(const name of SOUND_NAMES)browser.playSound(name);
  for(const audio of f.audio)assert.equal(audio.volume,.45*(audio.src==='assets/ui_click.wav'?originalClickGain:1));
  const rows:{src:string;volume?:number}[]=[];
  const host={createCanvas:()=>f.canvas,getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),createInnerAudioContext:()=>{const row={src:'',play(){},stop(){},destroy(){}};rows.push(row);return row;}} as unknown as WechatHost;
  const wechat=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});for(const name of SOUND_NAMES)wechat.playSound(name);
  assert.equal(rows.length,SOUND_NAMES.length);for(const row of rows)assert.equal(row.volume,row.src==='assets/ui_click.wav'?originalClickGain:1);
 }finally{f.restore();}
});

test('Android click leaves normal, paused and disabled BGM levels and playback untouched',()=>{
 const f=androidFixture();try{
  f.platform.setMusicState?.(true,false);const music=f.audio[0];music.currentTime=23;
  f.platform.playSound('ui_click');assert.equal(music.volume,.18*10**(-2/20));assert.equal(music.plays,1);assert.equal(music.currentTime,23);assert.equal(music.audible,true);
  f.platform.setMusicState?.(true,false,true);f.platform.playSound('ui_click');assert.equal(music.volume,.12*10**(-2/20));assert.equal(music.plays,1);assert.equal(music.currentTime,23);
  f.platform.setMusicState?.(false,false);f.platform.playSound('ui_click');assert.equal(music.audible,false);assert.equal(music.plays,1);
 }finally{f.restore();}
});

test('Android boosted click stops on hide or owner loss and never replays on show',()=>{
 const f=androidFixture();try{
  f.platform.playSound('ui_click');const click=f.audio[0];click.currentTime=.06;
  f.updateHost({...androidHost,active:false});assert.equal(click.audible,false);assert.equal(click.currentTime,0);
  f.platform.playSound('ui_click');assert.equal(click.plays,1);f.updateHost(androidHost);assert.equal(click.plays,1);
  f.platform.playSound('ui_click');assert.equal(click.plays,2);assert.ok(Math.abs(click.volume-androidClickVolume)<1e-12);
  f.updateHost({...androidHost,owner:false});f.platform.playSound('ui_click');assert.equal(click.audible,false);assert.equal(click.plays,2);
 }finally{f.restore();}
});

test('Android settings mute and reload still suppress boosted button clicks',()=>{
 const f=androidFixture();try{
  let now=100;f.platform.now=()=>now;let session=new GameSession(f.platform,{seed:123,mode:'standard'});
  const tap=(type:UiAction['type'])=>{now+=100;const control=getUiControls(session.state,session.view).find(control=>control.action.type===type&&!control.disabled);assert.ok(control,type);const point={x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2};session.input.down(point);session.input.up(point);};
  const clicks=()=>f.audio.filter(audio=>audio.src==='assets/ui_click.wav').reduce((total,audio)=>total+audio.plays,0);
  tap('settings');assert.equal(clicks(),1);assert.ok(Math.abs(f.audio.find(audio=>audio.src==='assets/ui_click.wav')!.volume-androidClickVolume)<1e-12);
  tap('toggleSound');assert.equal(session.profile.settings.sound,false);assert.equal(clicks(),1);
  tap('back');tap('settings');assert.equal(clicks(),1);
  session=new GameSession(f.platform,{seed:124,mode:'standard'});assert.equal(session.profile.settings.sound,false);tap('settings');assert.equal(clicks(),1);
  tap('toggleSound');assert.equal(session.profile.settings.sound,true);assert.equal(clicks(),1);
  tap('back');assert.equal(clicks(),2);
 }finally{f.restore();}
});
