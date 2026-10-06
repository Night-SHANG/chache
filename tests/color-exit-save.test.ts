import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as saves from '../src/application/save.ts';
import type { RunState } from '../src/domain/types.ts';
import { createRun, applyCommand } from '../src/domain/engine.ts';

const api=saves;
const load=saves.loadRun,save=saves.saveRun,preserve=saves.preserveCorrupt;
function storage(){const data=new Map<string,string>();return {data,get:(key:string)=>data.get(key)??null,set:(key:string,value:string)=>{data.set(key,value);},remove:(key:string)=>{data.delete(key);}};}
function colorRun():RunState{return {rulesetVersion:4,runConfigId:'run.color_exit_p0_v4',seed:19,mode:'color_exit',rngState:[1,2,3,4],board:Array(49).fill(null),candidates:[{id:'piece.1',shapeId:'shape.single',cargo:'cargo.food'},{id:'piece.2',shapeId:'shape.domino_h',cargo:'cargo.chem'},{id:'piece.3',shapeId:'shape.single',cargo:'cargo.machine'}],orders:[{id:'exit.food',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:0},{id:'exit.chem',dockId:'dock.east',cargo:'cargo.chem',amount:4,baseScore:0},{id:'exit.machine',dockId:'dock.west',cargo:'cargo.machine',amount:4,baseScore:0}],phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:4,result:null,cellTraits:Array(49).fill(null),generatedPieces:3,overtime:false,endReason:null} as RunState;}
function changed(change:(state:RunState)=>void):RunState {const state=colorRun();change(state);return state;}
function envelope(state:RunState,schemaVersion=4):string {const body=JSON.stringify(state);let hash=2166136261;for(let i=0;i<body.length;i++){hash^=body.charCodeAt(i);hash=Math.imul(hash,16777619);}return JSON.stringify({schemaVersion,digest:(hash>>>0).toString(16).padStart(8,'0'),state});}

test('v4 snapshots round-trip in schema four while old snapshot bytes are unchanged',()=>{
 const color=colorRun();assert.deepEqual(saves.decodeRun(saves.encodeRun(color)),color);assert.equal(JSON.parse(saves.encodeRun(color)).schemaVersion,4);
 for(const version of [1,2,3]){const state=createRun(19,'standard',version);const raw=envelope(state,version);assert.equal(saves.encodeRun(state),raw);assert.equal(saves.encodeRun(saves.decodeRun(raw)),raw);}
});
test('two explicit save key families and automatic mode routing cannot overwrite each other',()=>{
 assert.equal(typeof api.saveKeysFor,'function');assert.deepEqual(api.saveKeysFor('orders'),saves.SAVE_KEYS);assert.deepEqual(api.saveKeysFor('color_exit'),api.COLOR_EXIT_SAVE_KEYS);
 const all=[...Object.values(saves.SAVE_KEYS),...Object.values(api.COLOR_EXIT_SAVE_KEYS)];assert.equal(new Set(all).size,6);
 const s=storage(),orders=createRun(2,'standard',3),color=colorRun();assert.equal(save(s,orders).ok,true);const old=s.get(saves.SAVE_KEYS.main);assert.equal(save(s,color).ok,true);assert.equal(s.get(saves.SAVE_KEYS.main),old);assert.deepEqual(load(s).state,orders);assert.deepEqual(load(s,'color_exit').state,color);
});
test('explicit cross-slot saves reject before changing any bytes',()=>{
 const s=storage();for(const [state,slot] of [[colorRun(),'orders'],[createRun(2,'standard',3),'color_exit']] as const){const before=[...s.data];assert.equal(save(s,state,slot).ok,false);assert.deepEqual([...s.data],before);}
});
test('v4 mode version config and envelope must all agree',()=>{
 for(const state of [changed(s=>{s.mode='standard';}),changed(s=>{s.runConfigId='run.standard_v3';}),changed(s=>{s.rulesetVersion=3;s.runConfigId='run.standard_v3';})])assert.throws(()=>saves.decodeRun(envelope(state)));
 for(const version of [1,2,3]){const state=createRun(2,'standard',version);state.mode='color_exit' as RunState['mode'];assert.throws(()=>saves.encodeRun(state));}
 assert.throws(()=>saves.decodeRun(envelope(colorRun(),3)),/版本/);
});
test('v4 rejects changed targets, extra cargo, special pieces, upgrades and non-place commands',()=>{
 const edits:Array<(s:RunState)=>void>=[s=>{s.orders[0].amount=3;},s=>{s.orders[0].baseScore=40;},s=>{s.orders[0].id='order.dynamic';},s=>{s.orders[0].dockId='dock.south';},s=>{s.orders[0].cargo='cargo.machine';},s=>{s.orders.reverse();},s=>{s.orders.pop();},s=>{s.board[0]='cargo.cold';},s=>{s.candidates[0].cargo='cargo.electronic';},s=>{s.candidates[0].trait='pallet';},s=>{s.candidates[0].rushTurns=2;},s=>{s.cellTraits![0]={kind:'pallet'};},s=>{delete s.cellTraits;},s=>{s.upgrades=['upgrade.compact_routes'];},s=>{s.upgradeChoices=['upgrade.compact_routes'];},s=>{s.commands=[{type:'continueOvertime'}];s.commandIndex=1;},s=>{s.commands=[{type:'upgrade',upgradeId:'upgrade.compact_routes'}];s.commandIndex=1;}];
 for(const edit of edits){const state=changed(edit);assert.throws(()=>saves.encodeRun(state),error=>error instanceof Error&&!/版本/.test(error.message));assert.throws(()=>saves.decodeRun(envelope(state)),error=>error instanceof Error&&!/版本/.test(error.message));}
});
test('v4 validates counters, phases, three candidates and bounded terminal batches',()=>{
 const edits:Array<(s:RunState)=>void>=[s=>{s.candidates.pop();},s=>{s.candidates.push({...s.candidates[0],id:'piece.4'});},s=>{s.candidates[1].id=s.candidates[0].id;},s=>{s.phase='upgrade';},s=>{s.shift=6;},s=>{s.completedOrders=33;},s=>{s.completedOrders=30;},s=>{s.score=11;},s=>{s.lastChain=4;},s=>{s.maxChain=4;},s=>{s.overtime=true;},s=>{delete s.overtime;},s=>{s.endReason='blocked';},s=>{delete s.endReason;},s=>{delete s.generatedPieces;},s=>{s.generatedPieces=2;},s=>{s.commandIndex=1;},s=>{s.challengeId='daily.2026-10-06.v4';},s=>{s.challengeDay='2026-10-06';}];
 for(const edit of edits)assert.throws(()=>saves.encodeRun(changed(edit)),error=>error instanceof Error&&!/版本/.test(error.message));
 const won=changed(s=>{s.phase='result';s.result='won';s.endReason='completed';s.completedOrders=32;s.shift=5;s.candidates.pop();});assert.deepEqual(saves.decodeRun(saves.encodeRun(won)),won);
 const failed=changed(s=>{s.phase='result';s.result='failed';s.endReason='blocked';});assert.deepEqual(saves.decodeRun(saves.encodeRun(failed)),failed);
 for(const edit of [(s:RunState)=>{s.endReason='retired';},(s:RunState)=>{s.endReason='blocked';},(s:RunState)=>{s.completedOrders=29;}]){const state=structuredClone(won);edit(state);assert.throws(()=>saves.encodeRun(state));}
});
test('misfiled snapshots are corrupt and recovery archives their exact foreign bytes',()=>{
 const s=storage();const order=saves.encodeRun(createRun(3,'standard',3)),color=saves.encodeRun(colorRun());s.set(saves.SAVE_KEYS.main,color);s.set(api.COLOR_EXIT_SAVE_KEYS.main,order);
 assert.equal(load(s).source,'corrupt');assert.equal(load(s,'color_exit').source,'corrupt');assert.equal(save(s,colorRun()).ok,false);const untouched=s.get(saves.SAVE_KEYS.main);
 assert.equal(preserve(s,'color_exit').ok,true);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),null);assert.equal(s.get(saves.SAVE_KEYS.main),untouched);assert.ok([...s.data].some(([key,raw])=>key.startsWith(api.COLOR_EXIT_SAVE_KEYS.main+'.corrupt.')&&raw===order));
});
test('color corruption chooses only its own valid backup and preserves all bytes until explicit repair',()=>{
 const s=storage();save(s,createRun(3,'standard',3));const color=saves.encodeRun(colorRun());s.set(api.COLOR_EXIT_SAVE_KEYS.main,'broken-color');s.set(api.COLOR_EXIT_SAVE_KEYS.backup,color);const before=[...s.data];
 assert.equal(load(s,'color_exit').source,'backup');assert.deepEqual([...s.data],before);assert.equal(save(s,colorRun()).ok,false);assert.deepEqual([...s.data],before);assert.equal(preserve(s,'color_exit').ok,true);assert.equal(save(s,colorRun()).ok,true);assert.equal(load(s,'color_exit').source,'main');assert.ok([...s.data.values()].includes('broken-color'));
});
test('empty strings and foreign backups are protected corruption in the color slot',()=>{
 const s=storage();s.set(api.COLOR_EXIT_SAVE_KEYS.main,'');s.set(api.COLOR_EXIT_SAVE_KEYS.backup,saves.encodeRun(createRun(1,'standard',3)));const before=[...s.data];assert.equal(load(s,'color_exit').source,'corrupt');assert.equal(save(s,colorRun()).ok,false);assert.deepEqual([...s.data],before);assert.equal(preserve(s,'color_exit').ok,true);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),null);assert.ok([...s.data].some(([key,raw])=>key.includes('.corrupt.')&&raw===''));
});
test('abandoned color temp is never loaded or used as another slot fallback',()=>{
 const s=storage();s.set(api.COLOR_EXIT_SAVE_KEYS.temp,saves.encodeRun(colorRun()));assert.equal(load(s,'color_exit').source,'empty');assert.equal(load(s).source,'empty');s.set(api.COLOR_EXIT_SAVE_KEYS.main,'bad');assert.equal(load(s,'color_exit').source,'corrupt');
});
test('color temp readback failure preserves both slots stable snapshots',()=>{
 const s=storage();save(s,colorRun());save(s,createRun(1,'standard',3));const main=s.get(api.COLOR_EXIT_SAVE_KEYS.main),orders=s.get(saves.SAVE_KEYS.main);const fault={...s,get:(key:string)=>key===api.COLOR_EXIT_SAVE_KEYS.temp?'bad read':s.get(key)};assert.equal(save(fault,changed(s=>{s.score=10;})).ok,false);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),main);assert.equal(s.get(saves.SAVE_KEYS.main),orders);
});
test('color main write or readback failure restores both prior stable color copies',()=>{
 for(const kind of ['write','read']){const s=storage();save(s,colorRun());save(s,changed(s=>{s.score=10;}));save(s,createRun(1,'standard',3));const main=s.get(api.COLOR_EXIT_SAVE_KEYS.main),backup=s.get(api.COLOR_EXIT_SAVE_KEYS.backup),orders=s.get(saves.SAVE_KEYS.main);let writes=0;
 const fault={...s,set:(key:string,value:string)=>{if(key===api.COLOR_EXIT_SAVE_KEYS.main&&++writes===1&&kind==='write')throw Error('quota');s.set(key,value);},get:(key:string)=>key===api.COLOR_EXIT_SAVE_KEYS.main&&writes===1&&kind==='read'?'bad read':s.get(key)};assert.equal(save(fault,changed(s=>{s.score=20;})).ok,false);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),main);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.backup),backup);assert.equal(s.get(saves.SAVE_KEYS.main),orders);}
});
test('color archive failure and storage denial fail closed without clearing corrupt bytes',()=>{
 const s=storage();s.set(api.COLOR_EXIT_SAVE_KEYS.main,'bad');const fault={...s,set:(key:string,value:string)=>{if(key.includes('.corrupt.'))throw Error('quota');s.set(key,value);}};assert.equal(preserve(fault,'color_exit').ok,false);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),'bad');
 const denied={get:()=>{throw Error('denied');},set:()=>{},remove:()=>{}};assert.equal(load(denied,'color_exit').source,'unavailable');assert.equal(save(denied,colorRun()).ok,false);
});

test('winning color result has exactly two candidates because victory must not consume RNG',()=>{const won=changed(s=>{s.phase='result';s.result='won';s.endReason='completed';s.completedOrders=30;s.shift=5;});assert.throws(()=>saves.encodeRun(won),/候选/);won.candidates.pop();assert.deepEqual(saves.decodeRun(saves.encodeRun(won)),won);});

test('every naturally played color snapshot through a 54-command victory round-trips exactly',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/color-exit-natural-win.json',import.meta.url),'utf8')) as {seed:number;commands:RunState['commands'];expected:{score:number;batches:number;generatedPieces:number;nextId:number}};
 let state=createRun(fixture.seed,'color_exit',4);const s=storage();
 for(const command of fixture.commands){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(save(s,state).ok,true);assert.deepEqual(load(s,'color_exit').state,state);assert.equal(saves.encodeRun(saves.decodeRun(saves.encodeRun(state))),saves.encodeRun(state));}
 assert.equal(state.result,'won');assert.equal(state.candidates.length,2);assert.equal(state.score,fixture.expected.score);assert.equal(state.completedOrders,fixture.expected.batches);assert.equal(state.generatedPieces,fixture.expected.generatedPieces);assert.equal(state.nextId,fixture.expected.nextId);assert.equal(load(s).source,'empty');
});
test('every single color save storage fault preserves prior stable copies or confirms the exact new snapshot',()=>{
 for(let failAt=1;failAt<=20;failAt++){const s=storage();save(s,createRun(2,'standard',3));save(s,colorRun());save(s,changed(s=>{s.score=10;}));const main=s.get(api.COLOR_EXIT_SAVE_KEYS.main),backup=s.get(api.COLOR_EXIT_SAVE_KEYS.backup),orders=s.get(saves.SAVE_KEYS.main);let count=0;
 const fault:saves.StoragePort={get:key=>{if(++count===failAt)throw Error('read');return s.get(key);},set:(key,value)=>{if(++count===failAt)throw Error('write');s.set(key,value);},remove:key=>{if(++count===failAt)throw Error('remove');s.remove(key);}};
 const next=changed(s=>{s.score=20;}),result=save(fault,next);if(result.ok)assert.deepEqual(saves.decodeRun(s.get(api.COLOR_EXIT_SAVE_KEYS.main)!),next);else{assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),main,`fault ${failAt}`);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.backup),backup,`fault ${failAt}`);}assert.equal(s.get(saves.SAVE_KEYS.main),orders);}
});
test('a foreign color backup is archived before normal save replaces it',()=>{
 const s=storage();save(s,colorRun());const foreign=saves.encodeRun(createRun(2,'standard',3));s.set(api.COLOR_EXIT_SAVE_KEYS.backup,foreign);assert.equal(save(s,changed(s=>{s.score=10;})).ok,true);assert.ok([...s.data].some(([key,raw])=>key.startsWith(api.COLOR_EXIT_SAVE_KEYS.backup+'.corrupt.')&&raw===foreign));assert.equal(load(s,'color_exit').state?.score,10);
});
test('archive collisions stop color recovery and preserve every original raw byte',()=>{
 const s=storage();s.set(api.COLOR_EXIT_SAVE_KEYS.main,'bad main');s.set(api.COLOR_EXIT_SAVE_KEYS.backup,'bad backup');const fault={...s,get:(key:string)=>key.includes('.corrupt.')?'other existing raw bytes':s.get(key)};assert.equal(preserve(fault,'color_exit').ok,false);assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.main),'bad main');assert.equal(s.get(api.COLOR_EXIT_SAVE_KEYS.backup),'bad backup');
});
