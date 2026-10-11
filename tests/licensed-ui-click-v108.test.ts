import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareUiClick} from '../scripts/prepare-ui-click.mjs';
import {UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';
import {loadSoundAsset} from '../scripts/sound-assets.ts';
const root=new URL('../assets/audio/ui-click/',import.meta.url);
const bytes=(name:string)=>readFileSync(new URL(name,root));
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
test('selected Dustyroom recording and original pack license are preserved with verified bytes',()=>{
 assert.ok(existsSync(new URL('DM-CGS-32.wav',root)),'selected original DM-CGS-32.wav is retained');
 assert.equal(sha(bytes('DM-CGS-32.wav')),'718a8f04c9eecc0466dd865fcc64884988df66e18f3fd96ad7e291f2b9b0bd9a');
 assert.equal(sha(bytes('LICENSE.pdf')),'fa3693afc38aac134361b33d0b73cd7bc1300fdca8c87af813c64fa91b218cca');
 assert.match(bytes('CC0-1.0.txt').toString(),/CC0/);assert.match(bytes('NOTICE.txt').toString(),/https:\/\/dustyroom.com\/free-casual-game-sounds\//);
});
test('click provenance binds source and final waveform with constant gain only and no repeated audition',()=>{
 assert.ok(existsSync(new URL('provenance.json',root)),'source and conversion provenance is retained');
 const meta=JSON.parse(bytes('provenance.json').toString());assert.equal(meta.source.filename,'DM-CGS-32.wav');assert.equal(meta.source.sha256,sha(bytes('DM-CGS-32.wav')));assert.equal(meta.output.sha256,sha(bytes('ui_click.wav')));
 assert.equal(meta.output.sampleRate,44100);assert.equal(meta.output.channels,2);assert.equal(meta.output.samples,8253);assert.equal(meta.processing.constantGainOnly,true);assert.equal(meta.processing.gainLinear,1);assert.equal(meta.playback.effectiveTargetPeak,0.24);assert.equal(meta.playback.clickOnlyGainLinear,UI_CLICK_GAIN);assert.equal(meta.license.spdx,'CC0-1.0');
});
test('licensed conversion is deterministic constant-gain adaptation of every original frame',()=>{
 const source=bytes('DM-CGS-32.wav'),before=Buffer.from(source),first=prepareUiClick(source),again=prepareUiClick(source),meta=JSON.parse(bytes('provenance.json').toString());
 assert.deepEqual(source,before);assert.deepEqual(first.wav,again.wav);assert.deepEqual(first.wav,bytes('ui_click.wav'));assert.deepEqual(loadSoundAsset('ui_click'),first.wav);assert.equal(first.gain,meta.processing.gainLinear);
 assert.equal(first.wav.readUInt32LE(40),8253*2*2);const invalid=Buffer.from(source);invalid[100]^=1;assert.throws(()=>prepareUiClick(invalid),/Unverified original/);
});
test('full original tail fits the existing 60ms retrigger policy without delaying actions or editing audio',()=>{
 const wav=bytes('ui_click.wav'),all=Array.from({length:8253*2},(_,i)=>wav.readInt16LE(44+i*2)/32768*UI_CLICK_GAIN),tail=all.slice(Math.floor(0.06*44100)*2),energy=(values:number[])=>values.reduce((sum,value)=>sum+value*value,0);
 assert.equal(wav.length,44+8253*4);assert.ok(Math.max(...tail.map(Math.abs))<=0.001);assert.ok(energy(tail)/energy(all)<0.00001);
 // Browser seeking and WeChat stop/play reuse their existing per-cue handle; both restart near zero.
 assert.ok(Math.max(Math.abs(all[0]),Math.abs(all[1]))<0.00004);
});
