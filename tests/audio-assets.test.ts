import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import type {SoundName} from '../src/platform/types.ts';
import {generateSound} from '../scripts/audio.ts';

const names:SoundName[]=['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail'];
const durations:Record<string,number>={pick:0.085,place:0.115,invalid:0.14,route_ready:0.17,forklift:0.27,ship:0.26,chain2:0.28,chain3:0.28,chain4:0.28,upgrade:0.3,shift:0.38,fail:0.25};
function samples(wav:Buffer):number[]{return Array.from({length:(wav.length-44)/2},(_,i)=>wav.readInt16LE(44+i*2)/32768);}
function peak(values:number[]):number{return Math.max(...values.map(Math.abs));}
function energy(values:number[]):number{return values.reduce((sum,value)=>sum+value*value,0)/values.length;}
function toneEnergy(values:number[],frequency:number):number{
 let real=0,imaginary=0;
 for(let i=0;i<values.length;i++){const angle=2*Math.PI*frequency*i/22050;real+=values[i]*Math.cos(angle);imaginary+=values[i]*Math.sin(angle);}
 return (real*real+imaginary*imaginary)/(values.length*values.length);
}

test('all 12 original WAVs have complete mono PCM headers and the specified short durations',()=>{
 for(const name of names){
  const wav=generateSound(name),count=Math.round(22050*durations[name]);
  assert.equal(wav.toString('ascii',0,4),'RIFF',name);assert.equal(wav.readUInt32LE(4),wav.length-8,name);
  assert.equal(wav.toString('ascii',8,16),'WAVEfmt ',name);assert.equal(wav.readUInt32LE(16),16,name);
  assert.equal(wav.readUInt16LE(20),1,name);assert.equal(wav.readUInt16LE(22),1,name);
  assert.equal(wav.readUInt32LE(24),22050,name);assert.equal(wav.readUInt32LE(28),44100,name);
  assert.equal(wav.readUInt16LE(32),2,name);assert.equal(wav.readUInt16LE(34),16,name);
  assert.equal(wav.toString('ascii',36,40),'data',name);assert.equal(wav.readUInt32LE(40),count*2,name);
  assert.equal(wav.length,44+count*2,name);
 }
});
test('short audio has silent endpoints, smooth attack/release and moderate unclipped peaks',()=>{
 for(const name of names){
  const values=samples(generateSound(name)),maximum=peak(values);
  assert.equal(values[0],0,name);assert.equal(values[values.length-1],0,name);
  assert.ok(maximum>=0.04&&maximum<=0.32,`${name}: moderate non-silent peak ${maximum}`);
  assert.ok(peak(values.slice(0,44))<maximum*0.16,`${name}: 2ms attack`);
  assert.ok(peak(values.slice(-44))<maximum*0.06,`${name}: 2ms release`);
  assert.ok(peak(values.slice(1).map((value,i)=>value-values[i]))<0.15,`${name}: no hard sample discontinuity`);
 }
});
test('audio generation is byte-deterministic, independent of order and distinct for each cue',()=>{
 const first=new Map(names.map(name=>[name,generateSound(name)]));
 for(const name of [...names].reverse())assert.deepEqual(generateSound(name),first.get(name),name);
 assert.equal(new Set([...first.values()].map(wav=>wav.toString('base64'))).size,12);
});
test('chain family keeps bell harmonics while ascending in pitch and adding layers',()=>{
 for(const [name,frequency] of [['chain2',660],['chain3',880],['chain4',1100]] as const){
  const values=samples(generateSound(name));
  assert.ok(toneEnergy(values,frequency)>toneEnergy(values,frequency*0.9)*20,`${name}: intended rising fundamental`);
  assert.ok(toneEnergy(values,frequency*2)>toneEnergy(values,frequency*1.9)*10,`${name}: shared bell second harmonic`);
  if(name!=='chain2')assert.ok(toneEnergy(values,frequency*1.25)>toneEnergy(values,frequency*1.15)*10,`${name}: extra third layer`);
  if(name==='chain4')assert.ok(toneEnergy(values,frequency*1.5)>toneEnergy(values,frequency*1.4)*10,`${name}: extra fifth layer`);
 }
});
test('forklift movement remains lighter than shipment and chain signals',()=>{
 const forklift=samples(generateSound('forklift'));
 for(const name of ['ship','chain2','chain3','chain4'] as const){const other=samples(generateSound(name));assert.ok(peak(forklift)<peak(other)*0.5);assert.ok(energy(forklift)<energy(other)*0.4);}
});
test('both build targets contain exactly the same 12 generated local WAVs on repeated builds',()=>{
 const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);
 const sourceHash=createHash('sha256');for(const file of [...files('src'),...files('scripts'),'package.json','package-lock.json'].sort()){sourceHash.update(file);sourceHash.update(readFileSync(file));}const expectedHash=sourceHash.digest('hex');
 let previous:Map<string,Buffer>|undefined;
 for(let pass=0;pass<2;pass++){
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  const current=new Map<string,Buffer>();
  for(const target of ['browser','wechat']){
   const manifest=JSON.parse(readFileSync(`build/${target}/build-manifest.json`,'utf8')) as {sourceSha256:string};assert.equal(manifest.sourceSha256,expectedHash,'build provenance includes audio generation and build configuration');
   const folder=`build/${target}/assets`;
   assert.deepEqual(readdirSync(folder).filter(name=>name.endsWith('.wav')).sort(),names.map(name=>`${name}.wav`).sort());
   for(const name of names){const bytes=readFileSync(`${folder}/${name}.wav`);if(current.has(name))assert.deepEqual(bytes,current.get(name),`${name}: equal target bytes`);current.set(name,bytes);if(previous)assert.deepEqual(bytes,previous.get(name),`${name}: equal rebuild bytes`);}
  }
  previous=current;
 }
});
