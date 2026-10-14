import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {loadSoundAsset} from '../scripts/sound-assets.ts';
import {SOUND_NAMES} from '../src/platform/types.ts';

const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const baseline=JSON.parse(readFileSync(new URL('./fixtures/android-audio-v120-sha256.json',import.meta.url),'utf8'));
const samples=(wav:Buffer)=>Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2));
const peak=(values:number[])=>Math.max(...values.map(Math.abs));

// Regression target: leaving any quiet Android cue unchanged, changing its waveform,
// clipping, compounding gain, or leaking the Android gain into another platform.
test('Android raises every non-button effect only by unclipped scalar PCM gain',()=>{
 for(const name of SOUND_NAMES){
  const before=loadSoundAsset(name,'browser'),after=loadSoundAsset(name,'android');
  if(name==='ui_click'){assert.deepEqual(after,before);continue;}
  assert.deepEqual(after.subarray(0,44),before.subarray(0,44),`${name}: identical format and duration`);
  assert.equal(after.length,before.length,name);
  const original=samples(before),actual=samples(after);
  assert.ok(peak(actual)>peak(original),`${name}: Android asset must be louder`);
  assert.ok(peak(actual)<32767,`${name}: no clipped samples`);
  const gain=actual.reduce((sum,value,i)=>sum+value*original[i],0)/original.reduce((sum,value)=>sum+value*value,0);
  assert.ok(gain>1,name);
  for(let i=0;i<original.length;i++){
   assert.ok(Math.abs(actual[i]-original[i]*gain)<.52,`${name}: sample ${i} retains the original waveform`);
   if(original[i]===0)assert.equal(actual[i],0,`${name}: sample ${i} retains silence`);
  }
  assert.equal(actual[0],0,name);assert.equal(actual[actual.length-1],0,name);
 }
});

test('Android regeneration never compounds gain or mutates the retained source buffer',()=>{
 for(const name of SOUND_NAMES){
  const first=loadSoundAsset(name,'android'),before=Buffer.from(first);
  for(let pass=0;pass<3;pass++){
   assert.deepEqual(loadSoundAsset(name,'android'),before,name);
   for(const target of ['wechat','browser'] as const)loadSoundAsset(name,target);
   assert.deepEqual(first,before,`${name}: retained buffer unchanged`);
  }
 }
});

test('all browser and WeChat WAVs, the chosen button recording and music retain v120 bytes',()=>{
 for(const target of ['browser','wechat'] as const)for(const name of SOUND_NAMES){
  assert.equal(hash(loadSoundAsset(name,target)),baseline[target][name],`${target}/${name}`);
 }
 assert.equal(hash(loadSoundAsset('ui_click','android')),baseline.browser.ui_click);
 assert.equal(hash(readFileSync('assets/audio/bgm.mp3')),'63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da');
});

const expectedGainDb={pick:9.5,place:6,invalid:9,route_ready:9,forklift:14.5,ship:5.5,chain2:3.5,chain3:4.5,chain4:4,upgrade:6,shift:7,fail:8};
function max50msRms(wav:Buffer):number {
 const channels=wav.readUInt16LE(22),window=Math.floor(wav.readUInt32LE(24)*.05),values=samples(wav);
 const power=Array.from({length:values.length/channels},(_,frame)=>values.slice(frame*channels,(frame+1)*channels).reduce((sum,value)=>sum+(value/32768)**2,0)/channels);
 let running=power.slice(0,window).reduce((sum,value)=>sum+value,0),maximum=running;
 for(let i=window;i<power.length;i++){running+=power[i]-power[i-window];maximum=Math.max(maximum,running);}
 return Math.sqrt(maximum/window);
}
// This is the frozen v121 asset-calibration reference at 0.45, not current Android
// playback loudness: v122 place uses its separate approved gain, verified by android-place-volume-v122.test.ts.
test('Android retains v121 asset gains and their frozen 0.45 short-window calibration reference',()=>{
 const click=loadSoundAsset('ui_click','android'),reference=max50msRms(click)*.45*.2428740327036814*10**(6/20);
 for(const name of SOUND_NAMES){
  if(name==='ui_click')continue;
  const before=loadSoundAsset(name,'browser'),after=loadSoundAsset(name,'android'),gain=10**(expectedGainDb[name]/20);
  for(let offset=44;offset<before.length;offset+=2)assert.equal(after.readInt16LE(offset),Math.round(before.readInt16LE(offset)*gain)||0,`${name}: exact approved scalar gain`);
  const relativeDb=20*Math.log10(max50msRms(after)*.45/reference);
  assert.ok(relativeDb>=0&&relativeDb<3,`${name}: strongest 50ms is button reference +${relativeDb.toFixed(3)} dB`);
  assert.ok(peak(samples(after))/32768*.45<.28,`${name}: effective individual sample peak cap`);
 }
});
