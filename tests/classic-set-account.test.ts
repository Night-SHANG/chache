import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as sets from '../src/application/cosmetic-sets.ts';
import {COSMETIC_CATALOG,retainAccountCosmetics,accountCosmeticState} from '../src/application/cosmetics.ts';
import {createAccountService,type AccountRequest} from '../src/application/account-service.ts';
import {upgradeAccountGuides} from '../src/application/account-guides.ts';
import {upgradeEconomy} from '../src/application/economy.ts';
import {ACCOUNT_KEYS,encodeAccount,loadAccount} from '../src/application/account-store.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {FaultStorage,makeAccountFixture,makeAccountRun} from './helpers/account-fixtures.ts';

function setup(owned:string[]=[],factory=createAccountService,active=false){
 const account=upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet:1800,inventory:{rotate:2,clear:1,wildcard:1},...(active?{run:makeAccountRun(),nextRunSerial:2}:{})}))));
 account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics!,'theme.harbor','cargo.wood','forklift.electric',...owned])].sort();
 account.profile.cosmetics={theme:'harbor',cargo:'wood',forklift:'electric'};account.profile.cargoOutline=true;
 const storage=new FaultStorage(),raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);
 const service=factory(storage,{status:'held',release(){}},()=>0);storage.resetFault();return {account,storage,service,raw};
}
const request=(selection:unknown={theme:'night',cargo:'outline',forklift:'yellow'},operationId='classic.once')=>({type:'equipClassicSet',selection,operationId}) as AccountRequest;

test('classic is one pinned configurable display preset over the active 50 items and fourteen fixed bundles',()=>{
 assert.equal(COSMETIC_CATALOG.length,50);assert.equal(sets.COSMETIC_SETS.length,14);
 assert.deepEqual(sets.CLASSIC_COSMETIC_SET,{id:'classic',name:'经典套装',theme:'day',cargo:'classic',forklift:'yellow'});
 assert.deepEqual(sets.SHOP_COSMETIC_SETS,[sets.CLASSIC_COSMETIC_SET,...sets.COSMETIC_SETS]);assert.equal(sets.SHOP_COSMETIC_SETS.length,15);
 assert.equal(sets.getCosmeticSet('classic'),sets.CLASSIC_COSMETIC_SET);assert.equal(sets.quoteCosmeticSetPurchase('classic',{ownedCosmetics:[]}),null);
 assert.deepEqual(sets.DEFAULT_CLASSIC_SET_SELECTION,{theme:'day',cargo:'classic',forklift:'yellow'});
 assert.ok(Object.isFrozen(sets.CLASSIC_COSMETIC_SET));assert.ok(Object.isFrozen(sets.SHOP_COSMETIC_SETS));assert.ok(Object.isFrozen(sets.DEFAULT_CLASSIC_SET_SELECTION));
});

test('all sixteen owned classic choices atomically equip three slots and the exact outline flag',()=>{
 for(const theme of ['day','night'])for(const cargo of ['classic','outline'])for(const forklift of ['yellow','blue','red','white'])for(const active of [false,true]){
  const {account,storage,service}=setup(['forklift.blue','forklift.red','forklift.white'],createAccountService,active),selection={theme,cargo,forklift};
  const result=service.transact(request(selection),0);assert.equal(result.status,'acknowledged',`${theme}/${cargo}/${forklift}: ${result.message}`);
  const expected=structuredClone(account);expected.generation=1;expected.lastOperation=result.account!.lastOperation;expected.profile.cosmetics={theme,cargo:'classic',forklift} as typeof expected.profile.cosmetics;expected.profile.cargoOutline=cargo==='outline';
  assert.deepEqual(service.getSnapshot(),expected);assert.equal(storage.operations.filter(op=>op.kind==='set').length,2);assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));
  storage.resetFault();assert.equal(service.transact(request(selection),0).status,'acknowledged');assert.equal(service.transact(request(selection,'classic.fresh'),1).status,'acknowledged');
  assert.deepEqual(service.getSnapshot(),expected);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
 }
});

test('classic validates allowed values, exact shape and selected ownership without fallback or partial writes',()=>{
 for(const selection of [null,[],{},'classic',{theme:'day',cargo:'classic'}, {theme:'harbor',cargo:'classic',forklift:'yellow'},{theme:'day',cargo:'wood',forklift:'yellow'},{theme:'day',cargo:'classic',forklift:'electric'},{theme:'day',cargo:'classic',forklift:'yellow',cargoOutline:true},...['blue','red','white'].map(forklift=>({theme:'night',cargo:'outline',forklift}))]){
  const {account,storage,service,raw}=setup();assert.equal(service.transact(request(selection),0).status,'not_committed',JSON.stringify(selection));assert.deepEqual(service.getSnapshot(),account);assert.deepEqual([...storage.values.values()],[raw,raw]);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
 }
 for(const type of ['purchaseCosmeticSet','equipCosmeticSet']){
  const {account,storage,service}=setup();const malformed={type,id:'classic',...(type==='purchaseCosmeticSet'?{quotedKeys:[],quotedPrice:0}:{}),operationId:'classic.no-bundle'} as AccountRequest;
  assert.equal(service.transact(malformed,0).status,'not_committed');assert.deepEqual(service.getSnapshot(),account);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
 }
});

test('classic status compares selected ownership, every slot and outline without changing the source',()=>{
 assert.equal(typeof sets.classicSetStatus,'function');assert.equal(typeof sets.classicSetDefinition,'function');
 const {account}=setup(['forklift.white']),selection={theme:'night',cargo:'outline',forklift:'white'} as const,appearance=accountCosmeticState(account),before=structuredClone(appearance);
 assert.deepEqual(sets.classicSetDefinition(selection),{id:'classic',name:'经典套装',theme:'night',cargo:'classic',forklift:'white'});
 assert.deepEqual(sets.classicSetStatus(selection,appearance),{ownedCount:3,complete:true,equipped:false});
 const equipped={...appearance,cosmetics:{theme:'night',cargo:'classic',forklift:'white'} as const,cargoOutline:true};assert.equal(sets.classicSetStatus(selection,equipped).equipped,true);
 assert.equal(sets.classicSetStatus({...selection,cargo:'classic'},equipped).equipped,false);
 assert.deepEqual(sets.classicSetStatus({...selection,forklift:'red'},appearance),{ownedCount:2,complete:false,equipped:false});assert.deepEqual(appearance,before);
});

test('every classic apply storage fault retains a whole old or new four-field state and exact retry commits once',()=>{
 const baseline=setup(['forklift.white']),operation=request({theme:'night',cargo:'classic',forklift:'white'}),success=baseline.service.transact(operation,0);assert.equal(success.status,'acknowledged');const expected=success.account!,count=baseline.storage.operations.length;
 for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){
  const {account,storage,service}=setup(['forklift.white']);storage.resetFault({at,timing});const attempted=service.transact(operation,0);
  if(attempted.status!=='acknowledged')assert.deepEqual(service.getSnapshot(),account,`${at}/${timing} publication`);
  storage.resetFault();const loaded=loadAccount(storage,assertAccountSnapshot);assert.ok(['ready','degraded'].includes(loaded.status));assert.deepEqual(loaded.account,loaded.account?.generation===0?account:expected,`${at}/${timing} partial state`);
  const retry=service.getPendingOperationId()?service.retryPending('classic.once'):service.transact(operation,0);assert.equal(retry.status,'acknowledged',`${at}/${timing}: ${retry.message}`);assert.deepEqual(service.getSnapshot(),expected);assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));
 }
});

test('production classic choices retain blue/red achievement locks and white individual 600-coin purchase',()=>{
 const {service}=setup();for(const id of ['blue','red'])assert.equal(service.transact({type:'purchaseCosmetic',kind:'forklift',id,operationId:`classic.lock.${id}`},0).status,'not_committed');
 assert.equal(service.transact(request({theme:'day',cargo:'classic',forklift:'white'}),0).status,'not_committed');
 const before=service.getSnapshot()!;assert.equal(service.transact({type:'purchaseCosmetic',kind:'forklift',id:'white',operationId:'classic.white.buy'},0).status,'acknowledged');
 const bought=service.getSnapshot()!;assert.equal(bought.wallet,before.wallet-600);assert.deepEqual(bought.profile.cosmetics,before.profile.cosmetics);assert.equal(bought.profile.cargoOutline,before.profile.cargoOutline);
 assert.equal(service.transact(request({theme:'day',cargo:'classic',forklift:'white'},'classic.white.apply'),1).status,'acknowledged');assert.equal(service.getSnapshot()?.wallet,bought.wallet);assert.deepEqual(service.getSnapshot()?.profile.cosmetics,{theme:'day',cargo:'classic',forklift:'white'});
});

test('free playtest classic still requires an explicit existing-item claim before atomic equip',async()=>{
 const built=await build({stdin:{contents:"export {createAccountService} from './src/application/account-service.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{__PLAYTEST_FREE_SHOP__:'true'}});
 const api=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`) as {createAccountService:typeof createAccountService};
 for(const theme of ['day','night'])for(const cargo of ['classic','outline'])for(const forklift of ['yellow','blue','red','white']){
  const {account,service}=setup([],api.createAccountService);let generation=0;
  if(forklift!=='yellow'){
   assert.equal(service.transact(request({theme,cargo,forklift}),0).status,'not_committed');
   assert.equal(service.transact({type:'purchaseCosmetic',kind:'forklift',id:forklift,operationId:'classic.claim'},0).status,'acknowledged');generation=1;assert.equal(service.getSnapshot()?.wallet,account.wallet);assert.deepEqual(service.getSnapshot()?.profile.cosmetics,account.profile.cosmetics);
  }
  assert.equal(service.transact(request({theme,cargo,forklift},'classic.apply'),generation).status,'acknowledged');assert.equal(service.getSnapshot()?.wallet,account.wallet);assert.deepEqual(service.getSnapshot()?.profile.cosmetics,{theme,cargo:'classic',forklift});assert.equal(service.getSnapshot()?.profile.cargoOutline,cargo==='outline');
 }
});


test('classic outline replaces ice crystal with classic cargo and classic choice explicitly clears the outline',()=>{
 const {service}=setup(['cargo.ice_crystal']);
 assert.equal(service.transact({type:'setCargoOutline',enabled:false,operationId:'ice.outline.off'},0).status,'acknowledged');
 assert.equal(service.transact({type:'setCosmetic',kind:'cargo',id:'ice_crystal',operationId:'ice.equip'},1).status,'acknowledged');
 const icy=service.getSnapshot()!;assert.equal(icy.profile.cosmetics.cargo,'ice_crystal');assert.equal(icy.profile.cargoOutline,false);
 assert.equal(service.transact(request({theme:'night',cargo:'outline',forklift:'yellow'},'ice.classic.outline'),2).status,'acknowledged');
 assert.deepEqual(service.getSnapshot()?.profile.cosmetics,{theme:'night',cargo:'classic',forklift:'yellow'});assert.equal(service.getSnapshot()?.profile.cargoOutline,true);
 assert.equal(service.transact(request({theme:'day',cargo:'classic',forklift:'yellow'},'ice.classic.plain'),3).status,'acknowledged');
 assert.deepEqual(service.getSnapshot()?.profile.cosmetics,{theme:'day',cargo:'classic',forklift:'yellow'});assert.equal(service.getSnapshot()?.profile.cargoOutline,false);assert.equal(service.getSnapshot()?.wallet,icy.wallet);assert.deepEqual(service.getSnapshot()?.profile.ownedCosmetics,icy.profile.ownedCosmetics);
});

test('restart repairs a pending classic outfit with the original outline and no partial publication',()=>{
 const {account,storage,service}=setup(['forklift.white']),set=storage.set.bind(storage),operation=request({theme:'night',cargo:'classic',forklift:'white'});
 storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror');set(key,value);};assert.equal(service.transact(operation,0).status,'committed_unmirrored');assert.deepEqual(service.getSnapshot(),account);
 const restarted=createAccountService(storage,{status:'held',release(){}},()=>0);assert.equal(restarted.getSnapshot(),null);assert.equal(restarted.getPendingOperationId(),'classic.once');storage.set=set;
 assert.equal(restarted.retryPending('classic.once').status,'acknowledged');assert.deepEqual(restarted.getSnapshot()?.profile.cosmetics,{theme:'night',cargo:'classic',forklift:'white'});assert.equal(restarted.getSnapshot()?.profile.cargoOutline,false);assert.equal(restarted.getSnapshot()?.wallet,account.wallet);assert.equal(restarted.getSnapshot()?.formatVersion,4);
 storage.resetFault();assert.equal(restarted.transact(operation,0).status,'acknowledged');assert.equal(storage.operations.some(op=>op.kind==='set'),false);
});
