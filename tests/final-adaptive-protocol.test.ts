import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function support(){
 assert.ok(existsSync(new URL('../scripts/final-adaptive-support.mjs',import.meta.url)),'Final adaptive protocol support exists');
 // @ts-expect-error Bounded validation CLI intentionally remains JavaScript.
 return import('../scripts/final-adaptive-support.mjs');
}
const source={sha256:'a'.repeat(64),files:{'test-source.ts':'b'.repeat(64)}};

test('final adaptive preregistration fixes all 288 distinct cases and rejects invalid caps',async()=>{
 const s=await support(),cases=s.buildFinalCases();
 assert.equal(cases.length,288);assert.equal(new Set(cases.map((c:{id:string})=>c.id)).size,288);
 assert.equal(cases.filter((c:{mode:string})=>c.mode==='endless').length,32);
 assert.equal(cases.filter((c:{mode:string})=>c.mode==='standard').length,128);
 assert.equal(cases.filter((c:{mode:string})=>c.mode==='daily').length,128);
 for(const cap of [0,-1,1.5,NaN,Infinity,301])assert.throws(()=>s.validatePlacementCap(cap,'standard'),/cap/);
 for(const cap of [0,-1,1.5,NaN,Infinity,121])assert.throws(()=>s.validatePlacementCap(cap,'endless'),/cap/);
 assert.equal(s.validatePlacementCap(300,'standard'),300);assert.equal(s.validatePlacementCap(120,'endless'),120);
});

test('checkpoint resume verifies prior records and never reruns or duplicates completed cases',async()=>{
 const s=await support(),out=mkdtempSync(join(tmpdir(),'final-adaptive-')),cases=s.buildFinalCases().slice(0,3),executed:string[]=[],verified:string[]=[];
 try{
  const runCase=(spec:{id:string})=>{executed.push(spec.id);return {id:spec.id,trace:[],finalChecksum:'00000000'};};
  const verifyCase=(record:{id:string})=>verified.push(record.id);
  const first=s.runCheckpointed({out,cases,source,runCase,verifyCase,stopAfter:1});assert.equal(first.status,'paused');assert.equal(first.records.length,1);
  const resumed=s.runCheckpointed({out,cases,source,runCase,verifyCase});assert.equal(resumed.status,'complete');assert.equal(resumed.records.length,3);
  assert.deepEqual(executed,cases.map((c:{id:string})=>c.id));assert.equal(verified.filter(id=>id===cases[0].id).length,2);
  const path=join(out,'cases',cases[0].id+'.json'),record=JSON.parse(readFileSync(path,'utf8'));record.finalChecksum='tampered';writeFileSync(path,JSON.stringify(record));
  assert.throws(()=>s.runCheckpointed({out,cases,source,runCase,verifyCase}),/evidence|hash/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('source binding prevents mixed-source resume and logs exact seed and pending command on faults',async()=>{
 const s=await support(),out=mkdtempSync(join(tmpdir(),'final-adaptive-')),cases=s.buildFinalCases().slice(0,1),command={type:'place',pieceId:'piece.4',origin:{x:1,y:2}};
 try{
  assert.throws(()=>s.runCheckpointed({out,cases,source,runCase:(_spec:{id:string},context:{command:unknown;trace:unknown[]})=>{context.command=command;context.trace.push({command:{type:'chooseCleanup',branch:'orders'},checksum:'12345678'});throw Error('Injected transition failure');},verifyCase:()=>{}}),/Injected/);
  const fault=JSON.parse(readFileSync(join(out,'fault.json'),'utf8'));assert.equal(fault.source.sha256,source.sha256);assert.equal(fault.current.seed,1);assert.deepEqual(fault.current.command,command);assert.equal(fault.current.trace.length,1);
  assert.throws(()=>s.runCheckpointed({out,cases,source:{...source,sha256:'c'.repeat(64)},runCase:()=>({}),verifyCase:()=>{}}),/source|binding/);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('source drift during a case prevents publishing that case as completed',async()=>{
 const s=await support(),out=mkdtempSync(join(tmpdir(),'final-adaptive-')),cases=s.buildFinalCases().slice(0,1);let current=source;
 try{
  assert.throws(()=>s.runCheckpointed({out,cases,source,readSource:()=>current,runCase:(spec:{id:string})=>{current={...source,sha256:'d'.repeat(64)};return {id:spec.id};},verifyCase:()=>{}}),/source|drift/);
  assert.equal(existsSync(join(out,'cases',cases[0].id+'.json')),false);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('rush accounting keeps partial shipment, later expiry, and cleanup-empty triggers distinct',async()=>{
 const s=await support(),ledger=s.createRushLedger(),piece={id:'piece.7',shapeId:'shape.line3',trait:'rush'};
 s.observeGenerated(ledger,[piece],()=>3);s.observeGenerated(ledger,[piece],()=>3);
 const before={candidates:[piece],successfulPlacements:0,cleanup:{branch:'placements',progress:5}};
 const after={candidates:[],successfulPlacements:1,cellTraits:[]};
 s.observeTransition(ledger,before,after,{type:'place',pieceId:piece.id},[{type:'placed',pieceId:piece.id,cells:[1,2,3]},{type:'shipment',cells:[1],extraClearedCells:[]}],{placements:6,orders:2});
 s.observeTransition(ledger,{candidates:[{id:'ordinary'}],successfulPlacements:3,cleanup:{branch:'placements',progress:2}},{...after,successfulPlacements:4},{type:'place',pieceId:'ordinary'},[{type:'placed',pieceId:'ordinary',cells:[4]},{type:'rushExpired',cells:[2,3]}],{placements:6,orders:2});
 let result=s.summarizeRush(ledger);assert.equal(result.generatedPieces,1);assert.equal(result.generatedCells,3);assert.equal(result.shippedPieces,1);assert.equal(result.shippedCells,1);assert.equal(result.fullyShippedPieces,0);assert.equal(result.expiredPieces,1);assert.equal(result.expiredCells,2);assert.equal(result.remainingWasteCells,2);assert.equal(result.cleanupTriggers,1);assert.equal(result.cleanupEmptyTriggers,1);
 s.observeTransition(ledger,{candidates:[{id:'ordinary2'}],successfulPlacements:5,cleanup:{branch:'placements',progress:5}},{...after,successfulPlacements:6},{type:'place',pieceId:'ordinary2'},[{type:'placed',pieceId:'ordinary2',cells:[5]},{type:'cleanup',cells:[2],triggers:1}],{placements:6,orders:2});
 result=s.summarizeRush(ledger);assert.equal(result.remainingWasteCells,1);assert.equal(result.cleanupHitCells,1);assert.equal(result.cleanupEmptyTriggers,1);assert.equal(result.placedPieces,1);
});
