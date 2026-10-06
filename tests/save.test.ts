import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRun, decodeRun, saveRun, loadRun, preserveCorrupt, SAVE_KEYS } from '../src/application/save.ts';
import type { RunState } from '../src/domain/types.ts';
import { P0_CONFIG } from '../src/domain/content.ts';
import { createRun, applyCommand } from '../src/domain/engine.ts';

const fixture = (): RunState => ({rulesetVersion:1,runConfigId:P0_CONFIG.runConfigId,seed:1,mode:'standard',rngState:[1,2,3,4],board:Array(49).fill(null),candidates:[{id:'p1',shapeId:'shape.single',cargo:'cargo.food'}],orders:[{id:'o1',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}],phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:2,result:null});
function storage() { const data=new Map<string,string>(); return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}}; }
test('round trip includes exact deterministic snapshot',()=>{const state=fixture();assert.deepEqual(decodeRun(encodeRun(state)),state);});
test('unknown future schema fails closed',()=>{const raw=JSON.parse(encodeRun(fixture()));raw.schemaVersion=99;assert.throws(()=>decodeRun(JSON.stringify(raw)),/版本/);});
test('checksum detects valid JSON with changed score',()=>{const raw=JSON.parse(encodeRun(fixture()));raw.state.score=900;assert.throws(()=>decodeRun(JSON.stringify(raw)),/校验/);});
test('invalid payload cannot be encoded',()=>{const state=fixture();state.board=[];assert.throws(()=>encodeRun(state),/棋盘/);});
test('save verifies temp then stores previous valid backup',()=>{const s=storage();assert.equal(saveRun(s,fixture()).ok,true);const next=fixture();next.score=500;assert.equal(saveRun(s,next).ok,true);assert.equal(loadRun(s).state?.score,500);assert.equal(decodeRun(s.data.get(SAVE_KEYS.backup)!).score,0);assert.equal(s.data.has(SAVE_KEYS.temp),false);});
test('corrupt primary recovers valid backup without overwriting bytes',()=>{const s=storage();s.set(SAVE_KEYS.main,'broken');s.set(SAVE_KEYS.backup,encodeRun(fixture()));assert.equal(loadRun(s).source,'backup');assert.equal(s.get(SAVE_KEYS.main),'broken');assert.equal(saveRun(s,fixture()).ok,false);assert.equal(s.get(SAVE_KEYS.main),'broken');});
test('corrupt primary and backup remain intact when neither can load',()=>{const s=storage();s.set(SAVE_KEYS.main,'bad1');s.set(SAVE_KEYS.backup,'bad2');assert.equal(loadRun(s).source,'corrupt');assert.equal(s.get(SAVE_KEYS.main),'bad1');assert.equal(s.get(SAVE_KEYS.backup),'bad2');});
test('failed final write preserves previous primary and returns error',()=>{const s=storage();saveRun(s,fixture());const previous=s.get(SAVE_KEYS.main);const failing={...s,set:(key:string,value:string)=>{if(key===SAVE_KEYS.main)throw Error('quota');s.set(key,value);}};const next=fixture();next.score=5;assert.equal(saveRun(failing,next).ok,false);assert.equal(s.get(SAVE_KEYS.main),previous);});
test('storage read denial is shown and never masquerades as empty',()=>{const denied={get:()=>{throw Error('denied');},set:()=>{},remove:()=>{}};assert.equal(loadRun(denied).source,'unavailable');assert.equal(saveRun(denied,fixture()).ok,false);});
test('explicit recovery preserves corrupt raw data before replacing',()=>{const s=storage();s.set(SAVE_KEYS.main,'broken原文');assert.equal(preserveCorrupt(s).ok,true);assert.equal(s.get(SAVE_KEYS.main),null);assert.ok([...s.data.values()].includes('broken原文'));assert.equal(saveRun(s,fixture()).ok,true);});
test('abandoned temporary write never supersedes stable primary',()=>{const s=storage();saveRun(s,fixture());const newer=fixture();newer.score=90;s.set(SAVE_KEYS.temp,encodeRun(newer));assert.equal(loadRun(s).state?.score,0);});
test('winning terminal snapshot with every old order shipped remains saveable',()=>{
 const state=createRun(1);state.shift=5;state.completedOrders=26;
 state.board=Array(49).fill(null);
 const cargos=['cargo.food','cargo.machine','cargo.chem','cargo.electronic'] as const;
 const groups=[[8,9,10,15,16],[12,13,19,20,26],[31,32,33,38,39],[22,23,29,36,37]];
 state.orders=cargos.map((cargo,i)=>({id:`order.${i+100}`,dockId:['dock.north','dock.east','dock.south','dock.west'][i],cargo,amount:5,baseScore:100}));
 groups.forEach((group,i)=>group.forEach(cell=>state.board[cell]=cargos[i]));
 state.candidates[0]={id:'piece.final',shapeId:'shape.single',cargo:'cargo.cold'};
 const result=applyCommand(state,{type:'place',pieceId:'piece.final',origin:{x:0,y:0}});
 assert.equal(result.state.result,'won');assert.equal(result.state.orders.length,0);
 assert.deepEqual(decodeRun(encodeRun(result.state)),result.state);
});
test('saving a valid result cannot erase a corrupt or future-version backup',()=>{
 const s=storage(),state=fixture();state.phase='result';state.result='failed';s.set(SAVE_KEYS.main,encodeRun(state));const original='{"schemaVersion":99,"futureData":"original bytes must survive"}';s.set(SAVE_KEYS.backup,original);
 assert.equal(saveRun(s,state).ok,true);assert.ok([...s.data.values()].includes(original));
});
