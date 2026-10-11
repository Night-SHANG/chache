/** Offline PCM gain/headroom verification; no claim of physical-device audition. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {AUDIO_LEVELS} from '../src/shared/audio-levels.ts';
import {MUSIC_GAIN,MUSIC_LEVELS} from '../src/shared/music-levels.ts';
import {UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';
import {SOUND_NAMES} from '../src/platform/types.ts';
import {loadSoundAsset,PLACE_ASSET_GAIN} from './sound-assets.ts';
import {generateSound} from './audio.ts';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const out=resolve(arg('--out')??'qa/v110/audio-mix'),build=arg('--build');
const hash=x=>createHash('sha256').update(x).digest('hex'),pcm=x=>Array.from({length:(x.length-44)/2},(_,i)=>x.readInt16LE(44+i*2)),peak=x=>x.reduce((p,v)=>Math.max(p,Math.abs(v)),0),rms=x=>Math.sqrt(x.reduce((sum,v)=>sum+v*v,0)/x.length),db=x=>20*Math.log10(x);
const oldPlace=generateSound('place'),place=loadSoundAsset('place'),a=pcm(oldPlace),b=pcm(place),click=loadSoundAsset('ui_click'),music=await readFile('assets/audio/bgm.mp3');
assert.deepEqual(place.subarray(0,44),oldPlace.subarray(0,44));assert.equal(a.length,b.length);
for(let i=0;i<a.length;i++)assert.equal(b[i],Math.round(a[i]*PLACE_ASSET_GAIN)||0);
const gainDb=db(rms(b)/rms(a));assert.ok(Math.abs(gainDb-2)<.001);assert.ok(peak(b)<32767);
assert.equal(hash(click),'64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512');assert.equal(UI_CLICK_GAIN,.2428740327036814);
assert.equal(hash(music),'63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da');
assert.ok(Math.abs(db(MUSIC_LEVELS.normal/.18)+2)<1e-12);assert.ok(Math.abs(db(MUSIC_LEVELS.paused/.12)+2)<1e-12);
const unchangedCues=[];for(const name of SOUND_NAMES)if(name!=='place'&&name!=='ui_click'){const bytes=loadSoundAsset(name);assert.deepEqual(bytes,generateSound(name));unchangedCues.push({name,sha256:hash(bytes)});}
const decoded=execFileSync('ffmpeg',['-v','error','-i','assets/audio/bgm.mp3','-ar','44100','-ac','2','-f','f32le','-'],{maxBuffer:100*1024*1024}),musicSamples=new Float32Array(decoded.buffer,decoded.byteOffset,decoded.length/4),musicPeak=peak(musicSamples);
const report={status:'PASS',kind:'Exact PCM16 place gain plus full-track decoded BGM peak bounds',limits:['No physical-device or real-browser audition. Sample peak bounds concern one effect plus BGM, not arbitrary simultaneous effects. PCM16 quantization introduces sub-LSB relative rounding differences.'],bgm:{sha256:hash(music),gain:MUSIC_GAIN,normalVolume:MUSIC_LEVELS.normal,pausedVolume:MUSIC_LEVELS.paused,normalGainDb:db(MUSIC_LEVELS.normal/.18),pausedGainDb:db(MUSIC_LEVELS.paused/.12),decodedFrames:musicSamples.length/2,decodedPeak:musicPeak},place:{sha256:hash(place),baselineSha256:hash(oldPlace),assetGain:PLACE_ASSET_GAIN,measuredRmsGainDb:gainDb,peak:peak(b)/32768,frames:b.length,sampleRate:place.readUInt32LE(24),channels:place.readUInt16LE(22),clippedSamples:b.filter(x=>Math.abs(x)>=32767).length,headerIdentical:true,everySampleMatchesSingleGain:true},uiClick:{sha256:hash(click),gain:UI_CLICK_GAIN,unchanged:true},unchangedOtherCues:unchangedCues,platforms:[]};
for(const [target,master] of [['browser',AUDIO_LEVELS.browserEffects],['wechat',AUDIO_LEVELS.wechatEffects]]){
 const bound=peak(b)/32768*master+musicPeak*MUSIC_LEVELS.normal;assert.ok(master>=0&&master<=1);assert.ok(bound<1);
 const row={target,placeRuntimeVolume:master,uiClickRuntimeVolume:master*UI_CLICK_GAIN,placePlusBgmPeakBound:bound,headroomDb:-db(bound)};
 if(build){const manifest=JSON.parse(await readFile(resolve(build,target,'build-manifest.json'),'utf8'));assert.equal(manifest.backgroundMusic.defaultVolume,MUSIC_LEVELS.normal);assert.equal(manifest.backgroundMusic.pausedVolume,MUSIC_LEVELS.paused);assert.equal(manifest.placeSound.assetGain,PLACE_ASSET_GAIN);for(const name of SOUND_NAMES)assert.deepEqual(await readFile(resolve(build,target,`assets/${name}.wav`)),loadSoundAsset(name));assert.deepEqual(await readFile(resolve(build,target,'assets/bgm.mp3')),music);row.bundleSha256=hash(await readFile(resolve(build,target,target==='browser'?'app.js':'game.js')));row.sourceSha256=manifest.sourceSha256;}
 report.platforms.push(row);
}
await mkdir(out,{recursive:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
