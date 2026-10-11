import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateSound} from '../scripts/audio.ts';
import {loadSoundAsset} from '../scripts/sound-assets.ts';
import {SOUND_NAMES} from '../src/platform/types.ts';
import {createMusicController} from '../src/platform/music.ts';
import {createWechatPlatform,type WechatHost} from '../src/platform/wechat.ts';
import {UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';
const DOWN=10**(-2/20),UP=10**(2/20),NORMAL=.18*DOWN,PAUSED=.12*DOWN;
const samples=(wav:Buffer)=>Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2));
const rms=(values:number[])=>Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length);
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
// Mutations: only duck normal music, alter lifecycle, boost runtime volume above 1, scale another cue, or apply place gain twice.
test('v110 attenuates normal and paused music by exactly 2dB without restarting the same handle',()=>{
 let created=0,plays=0,pauses=0,volume=1;const levels:number[]=[];
 const music=createMusicController(()=>{created++;return {play(){plays++;levels.push(volume);},pause(){pauses++;},setVolume(value:number){volume=value;}};});
 music.setState(true,false);assert.equal(volume,NORMAL);assert.deepEqual(levels,[NORMAL]);
 music.setState(true,false,true);assert.equal(volume,PAUSED);assert.equal(plays,1);assert.equal(pauses,0);
 for(let i=0;i<50;i++){music.setState(true,false);music.setState(true,false,true);}assert.equal(plays,1);assert.equal(created,1);assert.equal(volume,PAUSED);
 music.hide();assert.equal(pauses,1);music.show();assert.deepEqual(levels,[NORMAL,PAUSED]);
 assert.ok(Math.abs(20*Math.log10(NORMAL/.18)+2)<1e-12);assert.ok(Math.abs(20*Math.log10(PAUSED/.12)+2)<1e-12);
});
test('v110 place gains 2dB only in PCM, with exact header/duration/tone and no clipped samples',()=>{
 const original=generateSound('place'),actual=loadSoundAsset('place'),a=samples(original),b=samples(actual);
 assert.deepEqual(actual.subarray(0,44),original.subarray(0,44));assert.equal(actual.length,original.length);
 for(let i=0;i<a.length;i++)assert.equal(b[i],Math.round(a[i]*UP)||0,`place sample ${i}`);
 const gainDb=20*Math.log10(rms(b)/rms(a));assert.ok(Math.abs(gainDb-2)<.001,`place RMS gain ${gainDb}dB`);
 assert.ok(Math.max(...b.map(Math.abs))<32767);assert.equal(b[0],0);assert.equal(b[b.length-1],0);assert.deepEqual(loadSoundAsset('place'),actual,'repeated loads never compound gain');
});
test('v110 preserves all other cue bytes, selected UI gain and unchanged BGM asset',()=>{
 for(const name of SOUND_NAMES)if(name!=='place'&&name!=='ui_click')assert.deepEqual(loadSoundAsset(name),generateSound(name),name);
 assert.equal(sha(loadSoundAsset('ui_click')),'64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512');assert.equal(UI_CLICK_GAIN,0.2428740327036814);
 assert.equal(sha(readFileSync('assets/audio/bgm.mp3')),'63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da');
});
test('v110 WeChat keeps legal per-handle volumes and reuses place at master 1',()=>{
 const rows:{src:string;volume:number;played:number[]}[]=[];
 const host={createCanvas:()=>({getContext:()=>({})}),getWindowInfo:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),createInnerAudioContext:()=>{let volume=1;const row={src:'',get volume(){return volume;},set volume(v:number){assert.ok(v>=0&&v<=1,`invalid WeChat volume ${v}`);volume=v;},played:[] as number[],stop(){},play(){this.played.push(volume);},destroy(){}};rows.push(row);return row;}} as unknown as WechatHost;
 const platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
 for(let pass=0;pass<20;pass++)for(const name of SOUND_NAMES)platform.playSound(name);
 assert.equal(rows.length,13);for(const row of rows){const expected=row.src==='assets/ui_click.wav'?UI_CLICK_GAIN:1;assert.ok(row.played.every(value=>value===expected),row.src);assert.equal(row.played.length,20);}
});
