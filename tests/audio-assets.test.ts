import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import type {SoundName} from '../src/platform/types.ts';
import {UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';
import {loadSoundAsset} from '../scripts/sound-assets.ts';

const names:SoundName[]=['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail','ui_click'];
const legacyNames=names.filter((name):name is Exclude<SoundName,'ui_click'>=>name!=='ui_click');
const durations:Record<string,number>={pick:0.085,place:0.115,invalid:0.14,route_ready:0.17,forklift:0.27,ship:0.26,chain2:0.28,chain3:0.28,chain4:0.28,upgrade:0.3,shift:0.38,fail:0.25,ui_click:8253/44100};
function samples(wav:Buffer):number[]{return Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2)/32768);}
function peak(values:number[]):number{return Math.max(...values.map(Math.abs));}
function energy(values:number[]):number{return values.reduce((sum,value)=>sum+value*value,0)/values.length;}
function toneEnergy(values:number[],frequency:number):number{
 let real=0,imaginary=0;
 for(let i=0;i<values.length;i++){const angle=2*Math.PI*frequency*i/22050;real+=values[i]*Math.cos(angle);imaginary+=values[i]*Math.sin(angle);}
 return (real*real+imaginary*imaginary)/(values.length*values.length);
}

test('all 12 original WAVs retain complete mono PCM headers and their exact short durations',()=>{
 for(const name of legacyNames){
  const wav=loadSoundAsset(name),count=Math.round(22050*durations[name]);
  assert.equal(wav.toString('ascii',0,4),'RIFF',name);assert.equal(wav.readUInt32LE(4),wav.length-8,name);
  assert.equal(wav.toString('ascii',8,16),'WAVEfmt ',name);assert.equal(wav.readUInt32LE(16),16,name);
  assert.equal(wav.readUInt16LE(20),1,name);assert.equal(wav.readUInt16LE(22),1,name);
  assert.equal(wav.readUInt32LE(24),22050,name);assert.equal(wav.readUInt32LE(28),44100,name);
  assert.equal(wav.readUInt16LE(32),2,name);assert.equal(wav.readUInt16LE(34),16,name);
  assert.equal(wav.toString('ascii',36,40),'data',name);assert.equal(wav.readUInt32LE(40),count*2,name);
  assert.equal(wav.length,44+count*2,name);
 }
});
test('12 legacy cues retain silent endpoints, smooth attack/release and moderate unclipped peaks',()=>{
 for(const name of legacyNames){
  const values=samples(loadSoundAsset(name)),maximum=peak(values);
  assert.equal(values[0],0,name);assert.equal(values[values.length-1],0,name);
  assert.ok(maximum>=0.04&&maximum<=0.32,`${name}: moderate non-silent peak ${maximum}`);
  assert.ok(peak(values.slice(0,44))<maximum*0.16,`${name}: 2ms attack`);
  assert.ok(peak(values.slice(-44))<maximum*0.06,`${name}: 2ms release`);
  assert.ok(peak(values.slice(1).map((value,i)=>value-values[i]))<0.15,`${name}: no hard sample discontinuity`);
 }
});
test('audio asset loading is byte-deterministic, independent of order and distinct for each cue',()=>{
 const first=new Map(names.map(name=>[name,loadSoundAsset(name)]));
 for(const name of [...names].reverse())assert.deepEqual(loadSoundAsset(name),first.get(name),name);
 assert.equal(new Set([...first.values()].map(wav=>wav.toString('base64'))).size,13);
});
test('chain family keeps bell harmonics while ascending in pitch and adding layers',()=>{
 for(const [name,frequency] of [['chain2',660],['chain3',880],['chain4',1100]] as const){
  const values=samples(loadSoundAsset(name));
  assert.ok(toneEnergy(values,frequency)>toneEnergy(values,frequency*0.9)*20,`${name}: intended rising fundamental`);
  assert.ok(toneEnergy(values,frequency*2)>toneEnergy(values,frequency*1.9)*10,`${name}: shared bell second harmonic`);
  if(name!=='chain2')assert.ok(toneEnergy(values,frequency*1.25)>toneEnergy(values,frequency*1.15)*10,`${name}: extra third layer`);
  if(name==='chain4')assert.ok(toneEnergy(values,frequency*1.5)>toneEnergy(values,frequency*1.4)*10,`${name}: extra fifth layer`);
 }
});
test('forklift movement remains lighter than shipment and chain signals',()=>{
 const forklift=samples(loadSoundAsset('forklift'));
 for(const name of ['ship','chain2','chain3','chain4'] as const){const other=samples(loadSoundAsset(name));assert.ok(peak(forklift)<peak(other)*0.5);assert.ok(energy(forklift)<energy(other)*0.4);}
});
test('licensed UI click uses the approved effective 0.24 peak while pick is unchanged and place uses its approved 2dB gain',()=>{
 const click=samples(loadSoundAsset('ui_click')).map(value=>value*UI_CLICK_GAIN);
 assert.ok(Math.abs(peak(click)-0.24)<0.00001,`effective UI click peak ${peak(click)}`);
 for(const [name,expectedPeak] of [['pick',0.16],['place',0.22*10**(2/20)]] as const){const other=samples(loadSoundAsset(name));assert.ok(Math.abs(peak(other)-expectedPeak)<0.00004,`${name}: approved peak`);}
 // Business cue priority is independently exercised by ui-feedback-policy-v107.test.ts; it does not depend on UI amplitude.
});
test('UI click is the selected short source recording in 44.1kHz stereo PCM',()=>{
 const wav=loadSoundAsset('ui_click');assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.readUInt16LE(22),2);assert.equal(wav.readUInt16LE(34),16);assert.equal(wav.length,44+8253*2*2);
 const click=samples(wav),maximum=peak(click);assert.ok(maximum>0.98&&maximum<1,`original-amplitude UI click peak ${maximum}`);assert.ok(Math.abs(maximum*UI_CLICK_GAIN-0.24)<0.00001);assert.ok(Math.sqrt(energy(click))*UI_CLICK_GAIN<0.056);
});
test('both build targets contain the 13 verified platform-specific local WAVs on repeated builds',()=>{
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).filter(entry=>entry.name!=='__pycache__'&&!entry.name.endsWith('.pyc')).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
 const version=(JSON.parse(readFileSync('package.json','utf8')) as {version:string}).version;
 const sourceHash=createHash('sha256');for(const file of [...files('src'),...files('scripts'),...files('assets'),'package.json','package-lock.json'].sort()){sourceHash.update(file);sourceHash.update(readFileSync(file));}const expectedHash=sourceHash.digest('hex');
 let previous:Map<string,Buffer>|undefined;
 for(let pass=0;pass<2;pass++){
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const current=new Map<string,Buffer>();
  for(const target of ['browser','wechat'] as const){
   const manifest=JSON.parse(readFileSync(`build/${target}/build-manifest.json`,'utf8')) as {version:string;sourceSha256:string;rulesetVersion:number;supportedRulesets:number[];modes:{orders:{rulesetVersion:number;difficulties:string[];overtimeDifficulties:string[];scoreMultipliers:Record<string,number[]>};legacy_daily:{rulesetVersion:number;inboundDifficulty:string};rush:{rulesetVersion:number;runConfigId:string;inboundDifficulty:string;orderRanges:number[][];scoreMultiplier:number[];difficulties?:string[];scoreMultipliers?:Record<string,number[]>;tools:boolean;repeatable:boolean;winCoinMultiplier:number};legacy_rush:{rulesetVersion:number;difficulties:string[];scoreMultipliers:Record<string,number[]>};inbound_endless:{rulesetVersion:number;difficulties:string[]}};help:{topics:string[];specialCargoOnly:boolean};cosmetics:{catalogSize:number;setCount:number;navigation:string;sections:string[];columns:number}};assert.equal(manifest.sourceSha256,expectedHash,'build provenance includes audio generation and build configuration');
   assert.equal(manifest.version,`${version}-dev`);assert.equal(manifest.rulesetVersion,21);assert.ok(manifest.supportedRulesets.includes(21));assert.ok(manifest.supportedRulesets.includes(20));assert.ok(manifest.supportedRulesets.includes(19));assert.ok(manifest.supportedRulesets.includes(18));assert.ok(!manifest.supportedRulesets.includes(17));assert.equal(manifest.modes.orders.rulesetVersion,18);assert.deepEqual(manifest.modes.orders.difficulties,['hard','expert']);assert.deepEqual(manifest.modes.orders.overtimeDifficulties,['hard','expert']);assert.deepEqual(manifest.modes.orders.scoreMultipliers,{hard:[3,2],expert:[2,1]});assert.equal(manifest.modes.legacy_daily.rulesetVersion,18);assert.equal(manifest.modes.legacy_daily.inboundDifficulty,'hard');assert.equal(manifest.modes.rush.rulesetVersion,21);assert.equal(manifest.modes.rush.runConfigId,'run.rush_v21.base');assert.equal(manifest.modes.rush.inboundDifficulty,'normal');assert.deepEqual(manifest.modes.rush.orderRanges,[[3,4],[3,5],[4,5],[4,6],[5,7]]);assert.deepEqual(manifest.modes.rush.scoreMultiplier,[1,1]);assert.equal(manifest.modes.rush.difficulties,undefined);assert.equal(manifest.modes.rush.scoreMultipliers,undefined);assert.equal(manifest.modes.legacy_rush.rulesetVersion,19);assert.deepEqual(manifest.modes.legacy_rush.difficulties,['hard','expert']);assert.deepEqual(manifest.modes.legacy_rush.scoreMultipliers,{hard:[3,2],expert:[2,1]});assert.deepEqual(manifest.help.topics,['inbound','outbound','tools']);assert.equal(manifest.help.specialCargoOnly,true);assert.equal(manifest.cosmetics.catalogSize,38);assert.deepEqual(manifest.cosmetics,{catalogSize:38,setCount:0,navigation:'sections-pagination-inline-preview',sections:['theme','cargo','forklift'],columns:2,pageSize:4});assert.equal(manifest.modes.rush.tools,true);assert.equal(manifest.modes.rush.repeatable,true);assert.equal(manifest.modes.rush.winCoinMultiplier,1);assert.equal(manifest.modes.inbound_endless.rulesetVersion,18);assert.deepEqual(manifest.modes.inbound_endless.difficulties,['hard','expert']);
   assert.deepEqual(readFileSync(`build/${target}/assets/bgm.mp3`),readFileSync('assets/audio/bgm.mp3'));assert.match(readFileSync(`build/${target}/MUSIC_NOTICE.txt`,'utf8'),/MintoDog/);
   const folder=`build/${target}/assets`;
   assert.deepEqual(readdirSync(folder).filter(name=>name.endsWith('.wav')).sort(),names.map(name=>`${name}.wav`).sort());
   for(const name of names){const bytes=readFileSync(`${folder}/${name}.wav`);assert.deepEqual(bytes,loadSoundAsset(name,target),`${target}/${name}: intended platform asset`);const key=`${target}/${name}`;current.set(key,bytes);if(previous)assert.deepEqual(bytes,previous.get(key),`${key}: equal rebuild bytes`);}
  }
  previous=current;
 }
});
