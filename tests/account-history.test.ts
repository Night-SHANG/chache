import test from 'node:test';
import assert from 'node:assert/strict';
import { stageHistory, readHistory, serializeAccount, accountBytes, assertAccountCapacity, collectOrphanHistory, accountDigest, canonicalStringify } from '../src/application/history-store.ts';
import { commitAccount, ACCOUNT_KEYS, encodeAccount } from '../src/application/account-store.ts';
import { makeAccountFixture, makeAccountRun, FaultStorage } from './helpers/account-fixtures.ts';
import type { GameCommand } from '../src/domain/playable.ts';
const command=(n:number):GameCommand=>({type:'place',pieceId:`piece.${n}`,origin:{x:0,y:0}});
const identity=makeAccountRun().identity;
const initial=()=>({seed:42,runConfigId:identity.runConfigId,head:null,totalCommands:0,tail:[]});

test('127, 128, 129 and 256 commands seal immutable 128-command chunks and replay in order',()=>{
 const storage=new FaultStorage(),commands=Array.from({length:256},(_,i)=>command(i));
 const a=stageHistory(storage,identity,initial(),commands.slice(0,127),127);assert.equal(a.tail.length,127);
 const b=stageHistory(storage,identity,a.cursor,[...a.tail,commands[127]],128);assert.equal(b.tail.length,0);const saved=new Map(storage.values);
 const c=stageHistory(storage,identity,b.cursor,[commands[128]],129);assert.equal(c.tail.length,1);
 const d=stageHistory(storage,identity,c.cursor,commands.slice(128),256);assert.equal(d.tail.length,0);
 assert.deepEqual([...readHistory(storage,identity,d.cursor,d.tail)],commands);assert.equal(JSON.parse(storage.values.get(b.cursor.head!.key)!).commands.length,128);
 for(const [key,raw] of saved)assert.equal(storage.values.get(key),raw);
 assert.equal(storage.operations.filter(op=>op.kind==='set'&&saved.has(op.key)).length,1);
});
test('tampered content, identity, index, previous links, missing blocks and cyclic references are rejected',()=>{
 for(const field of ['commands','runId','firstCommandIndex','previous','digest']){
  const storage=new FaultStorage(),a=stageHistory(storage,identity,initial(),Array.from({length:128},(_,i)=>command(i)),128),key=a.cursor.head!.key;
  const chunk=JSON.parse(storage.values.get(key)!);chunk[field]=field==='commands'?[]:field==='firstCommandIndex'?1:field==='previous'?a.cursor.head:'tampered';storage.values.set(key,JSON.stringify(chunk));assert.throws(()=>[...readHistory(storage,identity,a.cursor,[])]);
 }
 const storage=new FaultStorage(),a=stageHistory(storage,identity,initial(),Array.from({length:128},(_,i)=>command(i)),128);storage.values.delete(a.cursor.head!.key);assert.throws(()=>[...readHistory(storage,identity,a.cursor,[])]);
});
test('before and after every sealed-block I/O either fail safely or preserve exact commands',()=>{
 const commands=Array.from({length:128},(_,i)=>command(i)),baseline=new FaultStorage();stageHistory(baseline,identity,initial(),commands,128);
 for(let at=1;at<=baseline.operations.length;at++)for(const timing of ['before','after'] as const){const storage=new FaultStorage();storage.resetFault({at,timing});let result;try{result=stageHistory(storage,identity,initial(),commands,128);}catch{}storage.resetFault();if(result)assert.deepEqual([...readHistory(storage,identity,result.cursor,result.tail)],commands);assert.equal([...storage.values.values()].every(raw=>JSON.parse(raw).commands.length===128),true);}
});
test('serialization stores one tail and measures real UTF-8 bytes while reserving closing space',()=>{
 const run=makeAccountRun();const commands=[{type:'place' as const,pieceId:'piece.0',origin:{x:0,y:0}}];run.state={...run.state,commandIndex:1,commands};run.history={...run.history,totalCommands:1,tail:commands};
 const account=makeAccountFixture({nextRunSerial:2,run});const body=JSON.parse(serializeAccount(account));assert.equal('commands' in body.run.state,false);assert.deepEqual(body.run.history.tail,commands);assert.equal(accountBytes(account),new TextEncoder().encode(serializeAccount(account)).length);
 const huge=makeAccountFixture({migration:{version:1,legacySerialCeiling:0,legacySerials:{},sourceDigests:{}},dailyPaid:Object.fromEntries(Array.from({length:6000},(_,i)=>[`day.${i}`,{bestBase:55,paid:110}]))});
 const storage=new FaultStorage();assert.throws(()=>assertAccountCapacity(storage,huge,false));
 assert.equal(accountDigest(canonicalStringify({b:1,a:'中文'})),accountDigest(canonicalStringify({a:'中文',b:1})));
});
test('ordinary commits leave total quota for both closing copies and closing remains possible',()=>{
 const storage=new FaultStorage(),account=makeAccountFixture({generation:1,lastOperation:{operationId:'start',expectedGeneration:0,requestDigest:'x',committedGeneration:1}});
 storage.limitBytes=new TextEncoder().encode(encodeAccount(account)).length*4+64*1024;
 assert.equal(commitAccount(storage,null,account,()=>{}).status,'acknowledged');
 const normal={...account,generation:2,wallet:1,lastOperation:{operationId:'normal',expectedGeneration:1,requestDigest:'x',committedGeneration:2}};
 assertAccountCapacity(storage,normal,false);
 const closing={...normal,generation:3,closedThroughSerial:1,nextRunSerial:2,lastOperation:{operationId:'close',expectedGeneration:2,requestDigest:'x',committedGeneration:3}};
 assertAccountCapacity(storage,closing,true);assert.equal(commitAccount(storage,account,normal,()=>{}).status,'acknowledged');assert.equal(commitAccount(storage,normal,closing,()=>{}).status,'acknowledged');
 const insufficient=new FaultStorage();insufficient.limitBytes=new TextEncoder().encode(encodeAccount(account)).length*2;assert.throws(()=>assertAccountCapacity(insufficient,account,false));
});
test('orphan collection keeps both generations and closed-result references and fails closed on any read error',()=>{
 const storage=new FaultStorage();storage.values.set('warehouse.run.v1','legacy');const orphan=stageHistory(storage,identity,initial(),Array.from({length:128},(_,i)=>command(i)),128);assert.ok(orphan.cursor.head);
 const empty=makeAccountFixture();storage.values.set(ACCOUNT_KEYS.a,encodeAccount(empty));storage.values.set(ACCOUNT_KEYS.b,encodeAccount(empty));
 assert.equal(collectOrphanHistory(storage).removed,1);assert.equal(storage.values.get('warehouse.run.v1'),'legacy');
 stageHistory(storage,identity,initial(),Array.from({length:128},(_,i)=>command(i)),128);storage.resetFault({at:1,timing:'before'});assert.equal(collectOrphanHistory(storage).removed,0);assert.equal(storage.operations.some(op=>op.kind==='remove'),false);
});
test('real v9/v10 accepted traces persist, recover and replay across 127/128/129 with exact checksums',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createRunV9,applyCommandV9}=await import('../src/domain/v9/engine.ts');
 const {checksumV9,replayV9}=await import('../src/domain/v9/replay.ts');
 const {createRunV10,applyCommandV10}=await import('../src/domain/v10/engine.ts');
 const {checksumV10,replayV10}=await import('../src/domain/v10/replay.ts');
 const {verifyAccountReferences}=await import('../src/application/history-store.ts');const {loadAccount}=await import('../src/application/account-store.ts');
 const inbound=JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json',import.meta.url),'utf8')) as {options:import('../src/domain/v9/types.ts').StartV9;commands:import('../src/domain/v9/types.ts').InboundCommandV9[]}[];
 const outbound=JSON.parse(readFileSync(new URL('./fixtures/outbound-v10-golden.json',import.meta.url),'utf8')) as {long:{seed:number;difficulty:import('../src/domain/types.ts').OutboundDifficulty;commands:import('../src/domain/v10/types.ts').OutboundEndlessCommandV10[]}};
 const runs=[{state:createRunV9(inbound[1].options),commands:inbound[1].commands},{state:createRunV10(outbound.long.seed,outbound.long.difficulty),commands:outbound.long.commands}];
 for(const trace of runs){let state=trace.state;const storage=new FaultStorage(),id:import('../src/application/account-types.ts').RunIdentity={runId:`real.${state.rulesetVersion}`,serial:1,rulesetVersion:state.rulesetVersion,runConfigId:state.runConfigId,mode:state.rulesetVersion===9?'endless':'outboundEndless',economyVersion:1,...state.rulesetVersion===10?{difficultyId:state.difficultyId}:{}};let history={seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]} as import('../src/application/account-types.ts').HistoryCursor;let previous:import('../src/application/account-types.ts').AccountSnapshot|null=null;
  for(const command of trace.commands){const result=state.rulesetVersion===9?applyCommandV9(state,command as import('../src/domain/v9/types.ts').InboundCommandV9):applyCommandV10(state,command as import('../src/domain/v10/types.ts').OutboundEndlessCommandV10);assert.equal(result.error,undefined);state=result.state;
   const staged=stageHistory(storage,id,history,state.commands,state.commandIndex);history=staged.cursor;state={...state,commands:staged.tail,commandBaseIndex:staged.commandBaseIndex} as typeof state;
   const run=makeAccountRun({identity:id,state,history});const account=makeAccountFixture({nextRunSerial:2,run});assert.doesNotThrow(()=>verifyAccountReferences(storage,account),`version ${state.rulesetVersion}, index ${state.commandIndex}`);
   if([127,128,129,trace.commands.length].includes(state.commandIndex)){const generation:number=(previous?.generation??0)+1,next:import('../src/application/account-types.ts').AccountSnapshot={...account,generation,lastOperation:{operationId:`save.${generation}`,expectedGeneration:generation-1,requestDigest:'real',committedGeneration:generation}};assert.equal(commitAccount(storage,previous,next,loaded=>verifyAccountReferences(storage,loaded)).status,'acknowledged');const recovered=loadAccount(storage,loaded=>verifyAccountReferences(storage,loaded));assert.equal(recovered.status,'ready');assert.deepEqual(recovered.account,next);previous=next;}
  }
  const commands=[...readHistory(storage,id,history,history.tail)];assert.deepEqual(commands,trace.commands);assert.ok(accountBytes(previous!)<=512*1024);
  const replay=state.rulesetVersion===9?replayV9(inbound[1].options,commands as import('../src/domain/v9/types.ts').InboundCommandV9[]).state:replayV10(outbound.long.seed,outbound.long.difficulty,commands as import('../src/domain/v10/types.ts').OutboundEndlessCommandV10[]);
  assert.equal(state.rulesetVersion===9?checksumV9(state):checksumV10(state),replay.rulesetVersion===9?checksumV9(replay):checksumV10(replay));
 }
});

test('normal byte ceiling reserves 16KiB for closing and counts multibyte provenance keys',()=>{
 const huge=makeAccountFixture({migration:{version:1,legacySerialCeiling:0,legacySerials:{},sourceDigests:{['warehouse.'+'中'.repeat(170000)]:'12345678'}}});const storage=new FaultStorage();
 assert.ok(accountBytes(huge)>serializeAccount(huge).length);assert.ok(accountBytes(huge)>496*1024);assert.ok(accountBytes(huge)<512*1024);
 assert.throws(()=>assertAccountCapacity(storage,huge,false),/496KiB/);assert.doesNotThrow(()=>assertAccountCapacity(storage,huge,true));
});

test('sealed and tail commands use the same strict shape validation as the game codec',()=>{
 const storage=new FaultStorage(),id={...identity,rulesetVersion:9 as const,runConfigId:'run.inbound_v9',mode:'standard' as const,difficultyId:undefined};
 const cursor={...initial(),runConfigId:id.runConfigId};
 for(const command of [{type:'rotate',pieceId:'piece.1',quarterTurns:'1'},{type:'clear',cells:[1,2,3]}])assert.throws(()=>stageHistory(storage,id,cursor,[command as unknown as GameCommand],1));
});

test('storage foundation works in a plain JavaScript host without TextEncoder or structuredClone',()=>{
 const encoder=globalThis.TextEncoder,clone=globalThis.structuredClone;
 try{Object.defineProperty(globalThis,'TextEncoder',{value:undefined,configurable:true,writable:true});Object.defineProperty(globalThis,'structuredClone',{value:undefined,configurable:true,writable:true});const values=new Map<string,string>(),storage={get:(key:string)=>values.get(key)??null,set:(key:string,value:string)=>{values.set(key,value);},remove:(key:string)=>{values.delete(key);}};
 const staged=stageHistory(storage,identity,initial(),Array.from({length:128},(_,i)=>command(i)),128);assert.equal([...readHistory(storage,identity,staged.cursor,staged.tail)].length,128);
 const account=makeAccountFixture({generation:1,lastOperation:{operationId:'portable',expectedGeneration:0,requestDigest:'host',committedGeneration:1}});assert.equal(commitAccount(storage,null,account,()=>{}).status,'acknowledged');
 }finally{Object.defineProperty(globalThis,'TextEncoder',{value:encoder,configurable:true,writable:true});Object.defineProperty(globalThis,'structuredClone',{value:clone,configurable:true,writable:true});}
});

test('a nearly full total quota refuses normal writes while the reserved close transaction still commits',async()=>{
 const {createRunV10}=await import('../src/domain/v10/engine.ts');const {verifyAccountReferences}=await import('../src/application/history-store.ts');const state=createRunV10(7,'easy');const run=makeAccountRun({state,identity:{runId:'quota.run',serial:1,rulesetVersion:10,runConfigId:state.runConfigId,mode:'outboundEndless',difficultyId:'easy',economyVersion:1},history:{seed:7,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}});const storage=new FaultStorage();
 const previous=makeAccountFixture({nextRunSerial:2,run,generation:1,lastOperation:{operationId:'start',expectedGeneration:0,requestDigest:'x',committedGeneration:1}});assert.equal(commitAccount(storage,null,previous,a=>verifyAccountReferences(storage,a)).status,'acknowledged');storage.limitBytes=storage.byteUsage()+100;
 const next={...previous,generation:2,wallet:1,lastOperation:{operationId:'normal',expectedGeneration:1,requestDigest:'x',committedGeneration:2}};storage.resetFault();assert.equal(commitAccount(storage,previous,next,a=>verifyAccountReferences(storage,a)).status,'not_committed');assert.equal(storage.operations.some(op=>op.kind==='set'),false);
 const closing={...next,wallet:0,run:null,closedThroughSerial:1,lastClosedResult:{identity:run.identity,reason:'abandoned' as const,commandIndex:0,units:0,score:0,maxChain:0,result:null,coinDelta:0,earnedCoins:0,returned:[],history:run.history},lastOperation:{operationId:'close',expectedGeneration:1,requestDigest:'x',committedGeneration:2}};assert.equal(commitAccount(storage,previous,closing,a=>verifyAccountReferences(storage,a)).status,'acknowledged');
});
test('orphan collection preserves different-generation roots and every last-closed history',()=>{
 const storage=new FaultStorage();const other={...identity,runId:'other.run'};const a=stageHistory(storage,identity,initial(),Array.from({length:128},(_,i)=>command(i)),128);const b=stageHistory(storage,other,initial(),Array.from({length:128},(_,i)=>command(i+128)),128);const orphan=stageHistory(storage,{...identity,runId:'orphan'},initial(),Array.from({length:128},(_,i)=>command(i+256)),128);
 function account(id:typeof identity,cursor:typeof a.cursor,generation:number){return makeAccountFixture({generation,nextRunSerial:2,closedThroughSerial:1,lastClosedResult:{identity:id,reason:'abandoned',commandIndex:128,units:0,score:0,maxChain:0,result:null,coinDelta:0,earnedCoins:0,returned:[],history:cursor},lastOperation:{operationId:`close.${generation}`,expectedGeneration:generation-1,requestDigest:'x',committedGeneration:generation}});}
 storage.values.set(ACCOUNT_KEYS.a,encodeAccount(account(identity,a.cursor,2)));storage.values.set(ACCOUNT_KEYS.b,encodeAccount(account(other,b.cursor,1)));assert.equal(collectOrphanHistory(storage).removed,1);assert.equal(storage.values.has(orphan.cursor.head!.key),false);assert.equal(storage.values.has(a.cursor.head!.key),true);assert.equal(storage.values.has(b.cursor.head!.key),true);
});
test('bounded storage-only 16384-command measurement retains every command with a small root',()=>{
 const storage=new FaultStorage(),commands=Array.from({length:16384},(_,i)=>command(i));const staged=stageHistory(storage,identity,initial(),commands,commands.length);assert.equal(storage.values.size,128);assert.deepEqual([...readHistory(storage,identity,staged.cursor,staged.tail)],commands);
 const account=makeAccountFixture({nextRunSerial:2,closedThroughSerial:1,lastClosedResult:{identity,reason:'abandoned',commandIndex:commands.length,units:0,score:0,maxChain:0,result:null,coinDelta:0,earnedCoins:0,returned:[],history:staged.cursor}});assert.ok(accountBytes(account)<4096);assert.ok(storage.byteUsage()<2*1024*1024);
});
