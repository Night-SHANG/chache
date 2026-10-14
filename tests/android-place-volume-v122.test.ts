import test from 'node:test';
import assert from 'node:assert/strict';
import {androidFixture,androidHost} from './helpers/android-platform-fixture.ts';
import {SOUND_NAMES} from '../src/platform/types.ts';

const placeVolume=.45*10**(4.5/20);
const clickVolume=.45*(.2428740327036814*10**(6/20));
// Regressions: retaining place=0.45 or 1, changing any other cue, or compounding gain.
test('Android place plays at the approved common-source +3.56dB level on every reuse while all other cue volumes stay unchanged',()=>{
 const f=androidFixture();try{
  for(let pass=0;pass<30;pass++)for(const name of SOUND_NAMES){
   f.platform.playSound(name);const audio=f.audio.find(item=>item.src===`assets/${name}.wav`);assert.ok(audio);
   assert.equal(audio.volume,name==='place'?placeVolume:name==='ui_click'?clickVolume:.45,name);
   assert.equal(audio.plays,pass+1);assert.equal(audio.currentTime,0);audio.currentTime=.06;
  }
 }finally{f.restore();}
});

test('Android approved-volume place preserves music gain, position and playback',()=>{
 const f=androidFixture();try{
  f.platform.setMusicState?.(true,false);const music=f.audio[0];music.currentTime=23;
  f.platform.playSound('place');assert.equal(f.audio[1].volume,placeVolume);
  assert.equal(music.volume,.18*10**(-2/20));assert.equal(music.currentTime,23);assert.equal(music.plays,1);
  f.platform.setMusicState?.(true,false,true);f.platform.playSound('place');
  assert.equal(music.volume,.12*10**(-2/20));assert.equal(music.currentTime,23);assert.equal(music.plays,1);
 }finally{f.restore();}
});

test('Android approved-volume place still stops on hide or owner loss and never replays on show',()=>{
 const f=androidFixture();try{
  f.platform.playSound('place');const place=f.audio[0];assert.equal(place.volume,placeVolume);place.currentTime=.06;
  f.updateHost({...androidHost,active:false});assert.equal(place.audible,false);assert.equal(place.currentTime,0);
  f.platform.playSound('place');assert.equal(place.plays,1);f.updateHost(androidHost);assert.equal(place.plays,1);
  f.platform.playSound('place');assert.equal(place.plays,2);assert.equal(place.volume,placeVolume);
  f.updateHost({...androidHost,owner:false});assert.equal(place.audible,false);f.platform.playSound('place');assert.equal(place.plays,2);
 }finally{f.restore();}
});
