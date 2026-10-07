import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_KEYS, loadAccount, commitAccount, repairAccount, encodeAccount } from '../src/application/account-store.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { makeAccountFixture, FaultStorage } from './helpers/account-fixtures.ts';
const verify=assertAccountSnapshot;
function nextAccount(previous=makeAccountFixture(),patch={}){return {...previous,...patch,generation:previous.generation+1,lastOperation:{operationId:`op.${previous.generation+1}`,expectedGeneration:previous.generation,requestDigest:'request',committedGeneration:previous.generation+1}};}
function saved(){const storage=new FaultStorage(),account=nextAccount();const committed=commitAccount(storage,null,account,verify);assert.equal(committed.status,'acknowledged');storage.resetFault();return {storage,account};}

test('commit acknowledges only verified identical copies, and refuses malformed envelopes',()=>{
 const {storage,account}=saved();assert.deepEqual([storage.get(ACCOUNT_KEYS.a),storage.get(ACCOUNT_KEYS.b)],[encodeAccount(account),encodeAccount(account)]);
 assert.equal(loadAccount(storage,verify).status,'ready');
 const invalid={...account,wallet:-1};assert.throws(()=>assertAccountSnapshot(invalid));
 storage.values.set(ACCOUNT_KEYS.b,encodeAccount({...account,wallet:1}));assert.equal(loadAccount(storage,verify).status,'unknown');
 const writes=storage.operations.filter(x=>x.kind==='set').length;assert.equal(repairAccount(storage,verify).status,'unknown');assert.equal(storage.operations.filter(x=>x.kind==='set').length,writes);
 storage.values.set(ACCOUNT_KEYS.b,JSON.stringify({formatVersion:2}));assert.equal(loadAccount(storage,verify).status,'unknown');
});
test('one unreadable root blocks mutation and cannot become a new empty account',()=>{
 const {storage,account}=saved();storage.resetFault({at:2,timing:'before'});assert.equal(loadAccount(storage,verify).status,'unavailable');
 storage.resetFault({at:1,timing:'before'});assert.equal(commitAccount(storage,account,nextAccount(account),verify).status,'unknown');assert.equal(storage.operations.some(x=>x.kind==='set'),false);
});
test('first verified newer generation commits and mirror failures never write the old generation back',()=>{
 const {storage,account}=saved();const next=nextAccount(account,{wallet:80});
 const originalSet=storage.set.bind(storage);storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror unavailable');originalSet(key,value);};
 const result=commitAccount(storage,account,next,verify);assert.equal(result.status,'committed_unmirrored');assert.equal(result.account?.wallet,80);
 assert.equal(loadAccount(storage,verify).status,'degraded');assert.equal(loadAccount(storage,verify).account?.generation,next.generation);
 assert.equal(storage.operations.filter(x=>x.kind==='set'&&x.value===encodeAccount(account)).length,0);
 storage.set=originalSet;assert.equal(repairAccount(storage,verify).status,'acknowledged');
});
test('retries recognize only the same operation and body and reject stale generation requests',()=>{
 const {storage,account}=saved();const next=nextAccount(account,{wallet:80});assert.equal(commitAccount(storage,account,next,verify).status,'acknowledged');
 storage.resetFault();assert.equal(commitAccount(storage,account,next,verify).status,'acknowledged');assert.equal(storage.operations.some(x=>x.kind==='set'),false);
 assert.equal(commitAccount(storage,account,{...next,wallet:81},verify).status,'not_committed');
 assert.equal(commitAccount(storage,account,{...next,lastOperation:{...next.lastOperation,operationId:'different'}},verify).status,'not_committed');
});
test('before and after faults at every root I/O preserve an intact old or new account across six operation snapshots',()=>{
 const patches=[{wallet:80,inventory:{rotate:1,clear:0,wildcard:0}},{nextRunSerial:2},{wallet:55},{inventory:{rotate:0,clear:0,wildcard:0}},{closedThroughSerial:1,nextRunSerial:2},{legacyImported:true}];
 for(const patch of patches){const baseline=saved(),next=nextAccount(baseline.account,patch);assert.equal(commitAccount(baseline.storage,baseline.account,next,verify).status,'acknowledged');const count=baseline.storage.operations.length;
  for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){const {storage,account}=saved();storage.resetFault({at,timing});commitAccount(storage,account,next,verify);storage.resetFault();const recovered=loadAccount(storage,verify);assert.ok(['ready','degraded'].includes(recovered.status),`${at}/${timing}`);assert.ok(recovered.account?.generation===account.generation||recovered.account?.generation===next.generation);assert.deepEqual(recovered.account,recovered.account?.generation===account.generation?account:next);}
 }
});
test('known corrupt copy is repaired only from verified valid root while future formats remain untouched',()=>{
 const {storage,account}=saved();storage.values.set(ACCOUNT_KEYS.b,'broken');const before=storage.values.get(ACCOUNT_KEYS.b);assert.equal(loadAccount(storage,verify).status,'degraded');assert.equal(storage.values.get(ACCOUNT_KEYS.b),before);
 assert.equal(repairAccount(storage,verify).status,'acknowledged');assert.equal(storage.values.get(ACCOUNT_KEYS.b),encodeAccount(account));
 storage.values.set(ACCOUNT_KEYS.b,'{"formatVersion":999}');storage.resetFault();assert.equal(repairAccount(storage,verify).status,'unknown');assert.equal(storage.operations.some(x=>x.kind==='set'),false);
});

test('an unreadable newest history cannot resurrect a readable older wallet',async()=>{
 const {stageHistory,verifyAccountReferences}=await import('../src/application/history-store.ts');
 const {makeAccountRun}=await import('./helpers/account-fixtures.ts');
 const {storage,account}=saved();const run=makeAccountRun();const commands=Array.from({length:128},(_,i)=>({type:'place' as const,pieceId:`piece.${i}`,origin:{x:0,y:0}}));
 const staged=stageHistory(storage,run.identity,run.history,commands,128);run.history=staged.cursor;run.state={...run.state,commands,commandIndex:128};
 const next=nextAccount(account,{wallet:80,nextRunSerial:2,run});storage.values.set(ACCOUNT_KEYS.b,encodeAccount(next));
 const read=storage.get.bind(storage);storage.get=(key)=>{if(key.startsWith('warehouse.account.history.s1.'))throw Error('I/O denied');return read(key);};
 const recovered=loadAccount(storage,loaded=>verifyAccountReferences(storage,loaded));assert.equal(recovered.status,'unavailable');assert.equal(recovered.account,null);
 storage.resetFault();assert.equal(repairAccount(storage,loaded=>verifyAccountReferences(storage,loaded)).status,'unknown');assert.equal(storage.operations.some(x=>x.kind==='set'),false);
});

test('a future account payload version blocks repair even behind a valid envelope checksum',async()=>{
 const {accountDigest,canonicalStringify}=await import('../src/application/history-store.ts');const {storage,account}=saved();const future={...account,formatVersion:3,economyVersion:3};const raw=canonicalStringify({formatVersion:1,generation:account.generation,digest:accountDigest(canonicalStringify(future)),account:future});storage.values.set(ACCOUNT_KEYS.b,raw);storage.resetFault();assert.equal(loadAccount(storage,verify).status,'unknown');assert.equal(repairAccount(storage,verify).status,'unknown');assert.equal(storage.operations.some(op=>op.kind==='set'),false);
});

test('retaining a last closed result does not let later shop or settings transactions use closing-only bytes',async()=>{
 const {makeAccountRun}=await import('./helpers/account-fixtures.ts');const run=makeAccountRun();const base=makeAccountFixture({nextRunSerial:2,closedThroughSerial:1,lastClosedResult:{identity:run.identity,reason:'abandoned',commandIndex:0,units:0,score:0,maxChain:0,result:null,coinDelta:0,earnedCoins:0,returned:[],history:run.history}});const storage=new FaultStorage(),previous=nextAccount(base);assert.equal(commitAccount(storage,null,previous,verify).status,'acknowledged');
 const next=nextAccount(previous,{migration:{version:1,legacySerialCeiling:0,legacySerials:{},sourceDigests:{['warehouse.'+'中'.repeat(170000)]:'12345678'}}});storage.resetFault();assert.equal(commitAccount(storage,previous,next,verify).status,'not_committed');assert.equal(storage.operations.some(op=>op.kind==='set'),false);
});
test('a future referenced history format cannot roll back to the older readable wallet',async()=>{
 const {stageHistory,verifyAccountReferences,accountDigest,canonicalStringify}=await import('../src/application/history-store.ts');const {makeAccountRun}=await import('./helpers/account-fixtures.ts');const {storage,account}=saved();const run=makeAccountRun(),staged=stageHistory(storage,run.identity,run.history,Array.from({length:128},(_,i)=>({type:'place' as const,pieceId:`piece.${i}`,origin:{x:0,y:0}})),128);const old=JSON.parse(storage.values.get(staged.cursor.head!.key)!);const {digest:oldDigest,...rest}=old;void oldDigest;const body={...rest,formatVersion:2},digest=accountDigest(canonicalStringify(body)),key=`warehouse.account.history.s1.${run.identity.runId}.0.${digest}`;storage.values.set(key,canonicalStringify({...body,digest}));const history={...staged.cursor,head:{key,digest,commandCount:128}};
 const next=nextAccount(account,{wallet:80,nextRunSerial:2,closedThroughSerial:1,lastClosedResult:{identity:run.identity,reason:'abandoned',commandIndex:128,units:0,score:0,maxChain:0,result:null,coinDelta:0,earnedCoins:0,returned:[],history}});storage.values.set(ACCOUNT_KEYS.b,encodeAccount(next));storage.resetFault();assert.equal(loadAccount(storage,a=>verifyAccountReferences(storage,a)).status,'unknown');assert.equal(repairAccount(storage,a=>verifyAccountReferences(storage,a)).status,'unknown');assert.equal(storage.operations.some(op=>op.kind==='set'),false);
});

async function twoGenerationHistory(){
 const {stageHistory,verifyAccountReferences}=await import('../src/application/history-store.ts');const {makeAccountRun}=await import('./helpers/account-fixtures.ts');
 const {storage,account}=saved(),previous=nextAccount(account,{wallet:80});assert.equal(commitAccount(storage,account,previous,verify).status,'acknowledged');
 const run=makeAccountRun(),commands=Array.from({length:128},(_,i)=>({type:'place' as const,pieceId:`piece.${i}`,origin:{x:0,y:0}}));
 const history=stageHistory(storage,run.identity,run.history,commands,128).cursor;
 const next=nextAccount(previous,{wallet:0,nextRunSerial:2,closedThroughSerial:1,lastClosedResult:{identity:run.identity,reason:'abandoned' as const,commandIndex:128,units:0,score:0,maxChain:0,result:null,coinDelta:0,earnedCoins:0,returned:[],history}});
 storage.values.set(ACCOUNT_KEYS.b,encodeAccount(next));storage.resetFault();return {storage,previous,next,key:history.head!.key,check:(a:Parameters<typeof verifyAccountReferences>[1])=>verifyAccountReferences(storage,a)};
}

test('a single stale-null history read cannot repair a newer paid wallet back to the older one',async()=>{
 const {storage,previous,next,key,check}=await twoGenerationHistory(),get=storage.get.bind(storage);let stale=true;
 storage.get=k=>{if(k===key&&stale){stale=false;return null;}return get(k);};
 const result=repairAccount(storage,check);assert.equal(result.status,'unknown');assert.equal(result.account,null);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
 assert.equal(storage.values.get(ACCOUNT_KEYS.a),encodeAccount(previous));assert.equal(storage.values.get(ACCOUNT_KEYS.b),encodeAccount(next));
 storage.get=get;assert.equal(repairAccount(storage,check).account?.wallet,0);
});

test('an intact newer ledger with a broken referenced chunk blocks old-wallet fallback',async()=>{
 for(const corruption of ['missing','damaged'] as const){const {storage,next,key,check}=await twoGenerationHistory();if(corruption==='missing')storage.values.delete(key);else storage.values.set(key,'broken-history');
  const before=new Map(storage.values);assert.equal(loadAccount(storage,check).status,'unknown');assert.equal(repairAccount(storage,check).status,'unknown');assert.deepEqual(storage.values,before);assert.equal(storage.values.get(ACCOUNT_KEYS.b),encodeAccount(next));
 }
});

test('a committed operation retry with an uncertain reference never returns the older wallet',async()=>{
 const {storage,previous,next,key,check}=await twoGenerationHistory();storage.values.set(ACCOUNT_KEYS.a,encodeAccount(next));storage.resetFault();const get=storage.get.bind(storage);let once=true;
 storage.get=k=>{if(k===key&&once){once=false;throw Error('history temporarily unreadable');}return get(k);};
 const result=commitAccount(storage,previous,next,check);assert.equal(result.status,'unknown');assert.equal(result.account,null);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
 storage.get=get;assert.equal(commitAccount(storage,previous,next,check).status,'acknowledged');assert.equal(loadAccount(storage,check).account?.wallet,0);
});
