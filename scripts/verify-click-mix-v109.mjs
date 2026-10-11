/** Offline numerical mix verification. Requires ffmpeg for decoding, never substitutes for device audition. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {AUDIO_LEVELS} from '../src/shared/audio-levels.ts';
import {UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const out=resolve(arg('--out')??'qa/v109/mix');
const wav=await readFile('assets/audio/ui-click/ui_click.wav'),music=await readFile('assets/audio/bgm.mp3'),hash=x=>createHash('sha256').update(x).digest('hex');
const pcm=execFileSync('ffmpeg',['-v','error','-i','assets/audio/bgm.mp3','-ar','44100','-ac','2','-f','f32le','-'],{maxBuffer:100*1024*1024});
const b=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4),c=Float64Array.from({length:8253*2},(_,i)=>wav.readInt16LE(44+i*2)/32768*UI_CLICK_GAIN),frames=b.length/2;
const rms=x=>Math.sqrt(x.reduce((sum,v)=>sum+v*v,0)/x.length),peak=x=>x.reduce((p,v)=>Math.max(p,Math.abs(v)),0),db=x=>20*Math.log10(x);
const p=peak(c),energy=new Float64Array(frames+1);let bpeak=0;
for(let i=0;i<frames;i++){energy[i+1]=energy[i]+(b[i*2]**2+b[i*2+1]**2)/2;bpeak=Math.max(bpeak,Math.abs(b[i*2]),Math.abs(b[i*2+1]));}
const windows=[];for(let offset=0;offset+8253<=frames;offset+=441)windows.push({offset,rms:Math.sqrt((energy[offset+8253]-energy[offset])/8253)*AUDIO_LEVELS.music});
const sorted=windows.map(row=>row.rms).sort((a,b)=>a-b),q=f=>sorted[Math.floor((sorted.length-1)*f)];
assert.ok(Math.abs(p-0.24)<.00001);assert.equal(hash(music),'63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da');
const report={kind:'Offline PCM math, full decoded BGM, aligned 187.143ms windows every 10ms',limitations:['No physical-device or real-browser audition. RMS ratios do not determine perceived loudness. Single-click+BGM bounds do not certify arbitrary simultaneous business sounds.'],sourceClickSha256:hash(wav),bgmSha256:hash(music),frames:8253,sampleRate:44100,bgmFrames:frames,bgmSeconds:frames/44100,assetGain:1,clickOnlyPlaybackGain:UI_CLICK_GAIN,effectiveClickPeak:p,effectiveClickRms:rms(c),gainVsV108Amplitude:4,gainVsV108Db:db(4),musicVolume:AUDIO_LEVELS.music,bgmMixedPeak:bpeak*AUDIO_LEVELS.music,musicWindowRms:{p50:q(.5),p90:q(.9),p99:q(.99),max:q(1)},platforms:[]};
for(const [platform,master]of [['browser',AUDIO_LEVELS.browserEffects],['wechat',AUDIO_LEVELS.wechatEffects]]){
 const bound=p*master+bpeak*AUDIO_LEVELS.music;assert.ok(bound<1);
 let sampledMixedPeak=0;for(const {offset}of windows)for(let i=0;i<c.length;i++)sampledMixedPeak=Math.max(sampledMixedPeak,Math.abs(b[offset*2+i]*AUDIO_LEVELS.music+c[i]*master));
 report.platforms.push({platform,master,assignedPlaybackVolume:master*UI_CLICK_GAIN,clickRmsVsMusicDb:{p50:db(rms(c)*master/q(.5)),p90:db(rms(c)*master/q(.9)),max:db(rms(c)*master/q(1))},conservativeMixedPeakUpperBound:bound,headroomDb:-db(bound),sampledMixedPeak});
}
report.status='PASS';await mkdir(out,{recursive:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
