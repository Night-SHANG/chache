import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSoundAsset} from '../scripts/sound-assets.ts';
import {SOUND_NAMES} from '../src/platform/types.ts';
const boosted=new Set(['place','route_ready','forklift','ship','chain2','chain3','chain4','shift']);
const gain=10**(2/20);
// Removing the target gain, applying it to a protected cue, clipping, or changing PCM headers must fail.
test('WeChat action cues gain exactly 2dB in PCM while retaining headers and unclipped endpoints',()=>{
 for(const name of SOUND_NAMES){
  const original=loadSoundAsset(name),actual=loadSoundAsset(name,'wechat');
  assert.equal(actual.length,original.length,name);
  assert.deepEqual(actual.subarray(0,44),original.subarray(0,44),name);
  if(!boosted.has(name)){assert.deepEqual(actual,original,name);continue;}
  let before=0,after=0,peak=0;
  for(let offset=44;offset<original.length;offset+=2){
   const a=original.readInt16LE(offset),b=actual.readInt16LE(offset);
   assert.equal(b,Math.round(a*gain)||0,`${name} sample ${offset}`);
   before+=a*a;after+=b*b;peak=Math.max(peak,Math.abs(b));
  }
  assert.ok(Math.abs(10*Math.log10(after/before)-2)<.001,name);
  assert.ok(peak<32767,name);
  assert.equal(actual.readInt16LE(44),0,name);assert.equal(actual.readInt16LE(actual.length-2),0,name);
  assert.deepEqual(loadSoundAsset(name,'wechat'),actual,`${name} never compounds gain`);
 }
});
test('explicit browser and Android audio remain byte-identical to the unmodified common loader',()=>{
 for(const name of SOUND_NAMES){
  const baseline=loadSoundAsset(name);
  assert.deepEqual(loadSoundAsset(name,'browser'),baseline,name);
  assert.deepEqual(loadSoundAsset(name,'android'),baseline,name);
 }
});
