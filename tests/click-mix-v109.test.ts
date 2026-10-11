import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareUiClick} from '../scripts/prepare-ui-click.mjs';
import {loadSoundAsset} from '../scripts/sound-assets.ts';
import {createBrowserPlatform} from '../src/platform/browser.ts';
import {createWechatPlatform,type WechatHost} from '../src/platform/wechat.ts';
import {SOUND_NAMES,type Platform} from '../src/platform/types.ts';
import {AUDIO_LEVELS} from '../src/shared/audio-levels.ts';
import * as clickLevel from '../src/shared/ui-click-level.ts';
const CLICK_GAIN=0.2428740327036814;
const source=()=>readFileSync(new URL('../assets/audio/ui-click/DM-CGS-32.wav',import.meta.url));
function originalSamples():number[]{
 const b=source();for(let offset=12;offset+8<=b.length;){const size=b.readUInt32LE(offset+4);if(b.toString('ascii',offset,offset+4)==='data')return Array.from({length:size/3},(_,i)=>b.readIntLE(offset+8+i*3,3)/8388608);offset+=8+size+(size%2);}throw Error('source PCM missing');
}
// Mutations: baked attenuation, dropped frames, repeated gain, changed master levels, or first play before gain.
test('v109 preserves original amplitude during exact full-source PCM24 to PCM16 conversion',()=>{
 const result=prepareUiClick(source()),samples=originalSamples();assert.equal(result.gain,1,'PCM conversion must not bake in a gain');
 assert.equal(result.wav.length,44+8253*4);assert.equal(result.wav.readUInt16LE(22),2);assert.equal(result.wav.readUInt32LE(24),44100);
 for(let i=0;i<samples.length;i++)assert.equal(result.wav.readInt16LE(44+i*2),(Math.round(samples[i]*32768)||0),`original sample ${i}`);
 assert.deepEqual(result.wav,loadSoundAsset('ui_click'));
});
test('v109 keeps fixed masters and exposes one bounded click-only gain',()=>{
 assert.deepEqual(AUDIO_LEVELS,{music:0.18,browserEffects:0.45,wechatEffects:1});assert.equal(Reflect.get(clickLevel,'UI_CLICK_GAIN'),CLICK_GAIN);
});
test('v109 reaches effective peak 0.24 without clipping the original-amplitude asset',()=>{
 const wav=loadSoundAsset('ui_click'),samples=Array.from({length:8253*2},(_,i)=>wav.readInt16LE(44+i*2)/32768),maximum=Math.max(...samples.map(Math.abs));
 assert.ok(maximum>0.98&&maximum<1,`original asset peak ${maximum}`);assert.ok(Math.abs(maximum*CLICK_GAIN-0.24)<0.00001,`effective peak ${maximum*CLICK_GAIN}`);
 const original=originalSamples();const sourcePeak=Math.max(...original.map(Math.abs));assert.ok(Math.abs(sourcePeak-maximum)<=.5/32768);
});
type Sound={src:string;volume:number;currentTime:number;plays:number[];stop:()=>void;play:()=>Promise<void>;pause:()=>void;destroy:()=>void};
function fixture(kind:'browser'|'wechat'):{platform:Platform;sounds:Sound[];restore:()=>void}{
 const sounds:Sound[]=[],create=(src='')=>{const row:Sound={src,volume:1,currentTime:0,plays:[],stop(){this.currentTime=0;},play(){this.plays.push(this.volume);return Promise.resolve();},pause(){},destroy(){}};sounds.push(row);return row;};
 const canvas={width:0,height:0,getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:1080,height:1920})};
 if(kind==='wechat'){const host={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),createInnerAudioContext:create} as unknown as WechatHost;return {platform:createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0}),sounds,restore(){}};}
 const previous=['window','Audio'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener(){}}});Object.defineProperty(globalThis,'Audio',{configurable:true,value:function(src:string){return create(src);}});
 return {platform:createBrowserPlatform(canvas as unknown as HTMLCanvasElement),sounds,restore(){for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}};
}
for(const kind of ['browser','wechat'] as const)test(`${kind} assigns click-only gain before first and every repeated play without changing other cues`,()=>{
 const f=fixture(kind),master=kind==='browser'?0.45:1;
 try{
  for(let pass=0;pass<50;pass++)for(const name of SOUND_NAMES){const old=f.sounds.find(x=>x.src===`assets/${name}.wav`);if(old){old.volume=.99;old.currentTime=.06;}f.platform.playSound(name);}
  assert.equal(f.sounds.length,13);
  for(const row of f.sounds){const expected=master*(row.src==='assets/ui_click.wav'?CLICK_GAIN:1);assert.equal(row.currentTime,0);assert.equal(row.plays.length,50);assert.ok(row.plays.every(volume=>volume===expected),`${row.src} playback volumes ${row.plays.slice(0,4)}`);}
 }finally{f.restore();}
});
