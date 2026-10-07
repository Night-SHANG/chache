import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function support(){
 assert.ok(existsSync(new URL('../scripts/stage-five-study-support.mjs',import.meta.url)),'Stage-five protocol support exists');
 // @ts-expect-error The bounded study CLI is intentionally JavaScript.
 return import('../scripts/stage-five-study-support.mjs');
}
const source={sha256:'a'.repeat(64),files:{'source.ts':'b'.repeat(64)}};

test('stage-five matrix retains exactly 256 cases, four pilot cases, and 64 per mode/version arm',async()=>{
 const s=await support(),cases=s.buildStageFiveCases();
 assert.equal(cases.length,256);assert.equal(new Set(cases.map((c:{id:string})=>c.id)).size,256);
 assert.deepEqual(cases.slice(0,4).map((c:{id:string})=>c.id),['v14-standard-route-orders-s1','v15-standard-route-orders-s1','v14-daily-route-orders-s1','v15-daily-route-orders-s1']);
 for(const version of [14,15])for(const mode of ['standard','daily'])assert.equal(cases.filter((c:{version:number;mode:string})=>c.version===version&&c.mode===mode).length,64);
 assert.deepEqual([...new Set(cases.map((c:{seed:number})=>c.seed))],Array.from({length:16},(_,i)=>i+1));
 for(const cap of [0,-1,1.5,NaN,Infinity,301])assert.throws(()=>s.validateStageFiveCap(cap),/cap/);
 assert.equal(s.validateStageFiveCap(300),300);
});

test('visible policy view omits all future RNG and command identity while retaining original v14 scorer identity',async()=>{
 const s=await support(),view=s.stageFiveVisibleObservation({rulesetVersion:15,boardSize:7,board:[null],cellTraits:[null],candidates:[],orders:[],phase:'input',shift:5,levels:{},rngState:['SECRET'],seed:7,nextId:4,commands:[],generatedPieces:3});
 assert.equal(view.rulesetVersion,14);assert.deepEqual(Object.keys(view).sort(),['board','boardSize','candidates','cellTraits','levels','orders','phase','rulesetVersion','shift'].sort());
 assert.equal(JSON.stringify(view).includes('SECRET'),false);
 assert.deepEqual(s.withoutRulesetIdentity({rulesetVersion:15,runConfigId:'run.inbound_v15',rngState:[1],score:3}),{rngState:[1],score:3});
});

test('paired prefix check catches pre-stage-five state or command drift and counts terminal no-draw separately',async()=>{
 const s=await support(),base={initialPrefixHash:'same',trace:[{index:1,command:{type:'chooseCleanup'},prefixHash:'after1',newGeneratedAtStage:1,events:[]},{index:2,command:{type:'place',pieceId:'x'},prefixHash:'after2',newGeneratedAtStage:5,events:[{type:'shift',shift:5}]}],stageFive:{firstGenerationCommand:2},status:'failed'};
 assert.equal(s.verifyPairedPrefix(base,structuredClone(base)).matchedStates,2);
 const bad=structuredClone(base);bad.trace[0].prefixHash='wrong';assert.throws(()=>s.verifyPairedPrefix(base,bad),/prefix/);
 const changed=structuredClone(base);changed.trace[1].command.pieceId='y';assert.throws(()=>s.verifyPairedPrefix(base,changed),/command/);
 const terminal={...structuredClone(base),stageFive:{firstGenerationCommand:null},status:'won',trace:[{...base.trace[0]},{...base.trace[1],newGeneratedAtStage:null,terminalSkippedRefill:true,prefixHash:'different'}]};
 assert.equal(s.verifyPairedPrefix(base,terminal).intentionalTerminalNoDraw,true);
});

test('resuming retains pilot cases, validates hashes, and cannot duplicate completed cases',async()=>{
 const s=await support(),out=mkdtempSync(join(tmpdir(),'stage-five-')),cases=s.buildStageFiveCases().slice(0,6),executed:string[]=[];
 try{
  const runCase=(spec:{id:string})=>{executed.push(spec.id);return {trace:[],finalChecksum:'00000000'};},verifyCase=()=>{};
  const pilot=s.runStageFiveCheckpointed({out,cases,source,runCase,verifyCase,pilotOnly:true});assert.equal(pilot.status,'pilot-complete');assert.equal(pilot.records.length,4);
  const full=s.runStageFiveCheckpointed({out,cases,source,runCase,verifyCase});assert.equal(full.status,'complete');assert.equal(full.records.length,6);assert.deepEqual(executed,cases.map((c:{id:string})=>c.id));
  const path=join(out,'cases',cases[0].id+'.json'),bad=JSON.parse(readFileSync(path,'utf8'));bad.finalChecksum='tampered';writeFileSync(path,JSON.stringify(bad));
  assert.throws(()=>s.runStageFiveCheckpointed({out,cases,source,runCase,verifyCase}),/hash/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('study source drift stops and dumps the exact pending command without publishing case',async()=>{
 const s=await support(),out=mkdtempSync(join(tmpdir(),'stage-five-')),cases=s.buildStageFiveCases().slice(0,1),command={type:'place',pieceId:'x',origin:{x:1,y:2}};let current=source;
 try{
  assert.throws(()=>s.runStageFiveCheckpointed({out,cases,source,readSource:()=>current,runCase:(_spec:unknown,context:{command:unknown;trace:unknown[]})=>{context.command=command;current={...source,sha256:'c'.repeat(64)};return {trace:[]};},verifyCase:()=>{}}),/drift/);
  assert.equal(existsSync(join(out,'cases',cases[0].id+'.json')),false);
  const fault=JSON.parse(readFileSync(join(out,'fault.json'),'utf8'));assert.equal(fault.current.seed,1);assert.deepEqual(fault.current.command,command);
  assert.throws(()=>s.runStageFiveCheckpointed({out,cases,source:{...source,sha256:'d'.repeat(64)},runCase:()=>({}),verifyCase:()=>{}}),/binding/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('case budget stops at finite boundary and persists spent runtime across resume',async()=>{
 const s=await support(),out=mkdtempSync(join(tmpdir(),'stage-five-')),cases=s.buildStageFiveCases().slice(0,6);let clock=0,calls=0;
 try{
  const runCase=()=>{clock+=20;calls++;return {trace:[]};},args={out,cases,source,runCase,verifyCase:()=>{},now:()=>clock,budgetMs:10};
  assert.equal(s.runStageFiveCheckpointed({...args,pilotOnly:true}).records.length,4);
  const result=s.runStageFiveCheckpointed(args);assert.equal(result.status,'budget-exhausted');assert.equal(result.records.length,5);assert.equal(calls,5);
  const resumed=s.runStageFiveCheckpointed(args);assert.equal(resumed.records.length,5);assert.equal(resumed.status,'budget-exhausted');assert.equal(calls,5);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('stage-five cohort accounting separates old tray/board from new rush generation and post-entry expiry',async()=>{
 const s=await support(),piece=(id:string,trait='rush')=>({id,trait,shapeId:'shape.line2',cargo:'cargo.red'}),old=piece('old'),fresh=piece('fresh');
 const tracker=s.createStageFiveTracker(),before={shift:4,successfulPlacements:10,commandIndex:11,candidates:[old,{...piece('placed'),trait:'normal'}],cellTraits:[{kind:'rush'},null],cleanup:{branch:'placements',progress:5}};
 s.observeStageFiveCandidates(tracker,before,()=>2);
 const after={...before,shift:5,successfulPlacements:11,commandIndex:12,candidates:[old,fresh],cellTraits:[{kind:'rush'},{kind:'rush'}],result:null};
 s.observeStageFiveTransition(tracker,before,after,{type:'place',pieceId:'placed'},[{type:'placed',cells:[3]}],()=>2,{placements:6,orders:2},()=>50);
 assert.deepEqual(tracker.entry.preexistingCandidateIds,['old']);assert.equal(tracker.entry.preexistingBoardRushCells,2);assert.equal(tracker.placements,0);assert.equal(tracker.cleanupTriggers,0);assert.equal(tracker.generated.get('fresh').stage,5);
 s.observeStageFiveTransition(tracker,after,{...after,successfulPlacements:12,commandIndex:13,candidates:[old,piece('fresh2')]},{type:'place',pieceId:'fresh'},[{type:'placed',cells:[4,5]},{type:'rushExpired',cells:[0]}],()=>2,{placements:6,orders:2},()=>60);
 assert.equal(tracker.placements,1);assert.equal(tracker.placedRush.length,1);assert.equal(tracker.placedRush[0].sourceStage,5);assert.equal(tracker.expiredCells,1);assert.equal(tracker.cleanupTriggers,1);assert.equal(tracker.cleanupEmptyTriggers,1);
});
