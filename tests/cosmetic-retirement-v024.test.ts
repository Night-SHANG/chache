import assert from 'node:assert/strict';
import test from 'node:test';
import { COSMETIC_CATALOG, HISTORICAL_COSMETIC_CATALOG, FREE_COSMETICS, accountCosmeticState, getCosmetic, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { COSMETIC_SETS, SHOP_COSMETIC_SETS, getCosmeticSet, quoteCosmeticSetPurchase } from '../src/application/cosmetic-sets.ts';
import { createAccountService, type AccountRequest, type TransactionResult } from '../src/application/account-service.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount } from '../src/application/account-store.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const retired = ['theme.express_sorting', 'cargo.taped', 'forklift.compact'];
function fixture(version:3|4=4, mask=7, all=false) {
  let account=retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet:4200,inventory:{rotate:2,clear:1,wildcard:1}})));
  if(version===4)account=upgradeAccountGuides(account);
  account.profile.ownedCosmetics=[...new Set([...FREE_COSMETICS,'theme.night','cargo.insulated','forklift.white',...(all?HISTORICAL_COSMETIC_CATALOG.map(item=>item.key):[]),...retired.filter((_,i)=>all||(mask&(1<<i)))])].sort();
  account.profile.cosmetics={theme:mask&1?'express_sorting':'night',cargo:mask&2?'taped':'insulated',forklift:mask&4?'compact':'white'};
  account.profile.cargoOutline=true;
  const storage=new FaultStorage(),raw=encodeAccount(account);
  for(const key of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b])storage.values.set(key,raw);
  const service=createAccountService(storage,{status:'held',release(){}},()=>0);
  storage.resetFault();return {account,storage,raw,service};
}
const normalize=(mask:number)=>({theme:mask&1?'day':'night',cargo:mask&2?'classic':'insulated',forklift:mask&4?'yellow':'white'});

test('original retired set and exclusive members stay absent from the current active catalog',()=>{
  assert.equal(COSMETIC_CATALOG.length,29);assert.equal(HISTORICAL_COSMETIC_CATALOG.length,53);assert.ok(Object.isFrozen(HISTORICAL_COSMETIC_CATALOG));
  assert.deepEqual(['theme','cargo','forklift'].map(kind=>COSMETIC_CATALOG.filter(item=>item.kind===kind).length),[9,9,11]);
  assert.equal(COSMETIC_SETS.length,7);assert.equal(SHOP_COSMETIC_SETS.length,8);
  assert.equal(getCosmeticSet('express_sorting'),undefined);
  assert.equal(quoteCosmeticSetPurchase('express_sorting',{ownedCosmetics:[]}),null);
  for(const key of retired){const [kind,id]=key.split('.');assert.equal(getCosmetic(kind,id),undefined);}
});

test('v3/v4 accept all eight historical subsets and all 53 rights; projection normalizes only retired slots without mutation or writes',()=>{
  for(const version of [3,4] as const)for(let mask=0;mask<8;mask++)for(const all of [false,true]){
    const {account,storage,raw,service}=fixture(version,mask,all),before=structuredClone(account);
    assert.doesNotThrow(()=>assertAccountSnapshot(account));assert.equal(service.getStatus(),'ready');
    if(all)assert.equal(account.profile.ownedCosmetics!.length,53);
    for(let browse=0;browse<3;browse++){
      const state=accountCosmeticState(service.getSnapshot());
      assert.deepEqual(state.cosmetics,normalize(mask));assert.equal(state.cargoOutline,true);
      assert.deepEqual(state.ownedCosmetics,account.profile.ownedCosmetics);
    }
    assert.deepEqual(account,before);assert.deepEqual(service.getSnapshot(),before);
    assert.deepEqual([...storage.values.values()],[raw,raw]);assert.equal(storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
    const restarted=createAccountService(storage,{status:'held',release(){}},()=>0);
    assert.deepEqual(restarted.getSnapshot(),before);assert.deepEqual(accountCosmeticState(restarted.getSnapshot()).cosmetics,normalize(mask));
  }
});

test('retired purchase/equip/set requests reject even historical owners without mutating either root',()=>{
  for(const version of [3,4] as const){
    const {account,storage,service,raw}=fixture(version);
    const requests:AccountRequest[]=[...retired.flatMap(key=>{const [kind,id]=key.split('.') as ['theme'|'cargo'|'forklift',string];return [{type:'purchaseCosmetic',kind,id},{type:'setCosmetic',kind,id}];}),{type:'equipCosmeticSet',id:'express_sorting'},{type:'purchaseCosmeticSet',id:'express_sorting',quotedKeys:retired,quotedPrice:1440}].map((request,i)=>({...request,operationId:`retired.${i}`} as AccountRequest));
    for(const request of requests)assert.equal(service.transact(request,0).status,'not_committed');
    assert.deepEqual(service.getSnapshot(),account);assert.deepEqual([...storage.values.values()],[raw,raw]);assert.equal(storage.operations.some(op=>op.kind==='set'),false);
  }
});

test('unknown, unsorted, duplicate, unowned, and overlength historical ownership remains strictly invalid',()=>{
  for(const version of [3,4] as const)for(const mutation of ['unknown','unsorted','duplicate','unowned','overlength','equipped'] as const){
    const {account}=fixture(version,7,true);
    if(mutation==='unknown')account.profile.ownedCosmetics=[...account.profile.ownedCosmetics!.filter(key=>key!=='theme.harbor'),'theme.unknown'].sort();
    if(mutation==='unsorted')account.profile.ownedCosmetics!.reverse();
    if(mutation==='duplicate')account.profile.ownedCosmetics![1]=account.profile.ownedCosmetics![0];
    if(mutation==='unowned')account.profile.ownedCosmetics=account.profile.ownedCosmetics!.filter(key=>key!=='cargo.taped');
    if(mutation==='overlength')account.profile.ownedCosmetics!.push('zz.unknown');
    if(mutation==='equipped')(account.profile.cosmetics as {theme:string}).theme='unknown';
    assert.throws(()=>assertAccountSnapshot(account),`${version}/${mutation}`);
  }
});

test('degraded A/B historical loads remain read-only and project the same safe fallback',()=>{
  for(const version of [3,4] as const)for(const broken of [ACCOUNT_KEYS.a,ACCOUNT_KEYS.b]){
    const {account,storage}=fixture(version);storage.values.set(broken,'broken');storage.resetFault();
    const loaded=loadAccount(storage,assertAccountSnapshot);assert.equal(loaded.status,'degraded');assert.deepEqual(loaded.account,account);
    assert.deepEqual(accountCosmeticState(loaded.account).cosmetics,normalize(7));assert.equal(storage.operations.some(op=>op.kind==='set'),false);
  }
});

test('every before/after transaction fault preserves rights and normalizes only within the next atomic commit; exact retry and restart converge once',()=>{
  const request:AccountRequest={type:'purchase',item:'rotate',operationId:'retirement.next'};
  for(const version of [3,4] as const){
    const baseline=fixture(version),success=baseline.service.transact(request,0);assert.equal(success.status,'acknowledged');
    const expected=success.account!,count=baseline.storage.operations.length;
    assert.deepEqual(expected.profile.cosmetics,normalize(7));assert.deepEqual(expected.profile.ownedCosmetics,baseline.account.profile.ownedCosmetics);assert.equal(expected.profile.cargoOutline,true);
    for(let at=1;at<=count;at++)for(const timing of ['before','after'] as const){
      const {account,storage,service}=fixture(version);storage.resetFault({at,timing});
      const attempted=service.transact(request,0);if(attempted.status!=='acknowledged')assert.deepEqual(service.getSnapshot(),account);
      storage.resetFault();const recovered=loadAccount(storage,assertAccountSnapshot);assert.ok(['ready','degraded'].includes(recovered.status));assert.deepEqual(recovered.account,recovered.account?.generation===0?account:expected);
      const retried:TransactionResult=service.getPendingOperationId()?service.retryPending(request.operationId!):service.transact(request,0);assert.equal(retried.status,'acknowledged',`${version}/${at}/${timing}: ${retried.message}`);
      assert.deepEqual(service.getSnapshot(),expected);assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));
      const restarted=createAccountService(storage,{status:'held',release(){}},()=>0);assert.deepEqual(restarted.getSnapshot(),expected);assert.equal(restarted.transact(request,0).status,'acknowledged');assert.deepEqual(restarted.getSnapshot(),expected);
    }
  }
});

test('real shop browsing and retired preview requests preserve historical equipped roots across restart',async()=>{
  const {sessionHost}=await import('./helpers/session-fixtures.ts');
  const {GameSession}=await import('../src/application/session.ts');
  const {getUiControls}=await import('../src/presentation/ui.ts');
  for(const version of [3,4] as const)for(let mask=0;mask<8;mask++){
    const {account}=fixture(version,mask,true),host=sessionHost(account),session=host.session;
    const before=structuredClone(session.view.account),roots=new Map(host.data);host.storage.resetFault();
    session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
    for(const section of ['sets','theme','cargo','forklift'] as const){
      session.action({type:'selectShopSection',section});
      for(let page=0;page<5;page++){
        session.action(section==='sets'?{type:'selectCosmeticSetPage',page}:{type:'selectCosmeticPage',page});
        for(const control of getUiControls(session.state,session.view)){
          const action=control.action;
          if(action.type==='previewCosmetic'){
            assert.equal(retired.includes(`${action.kind}.${action.id}`),false);session.action(action);
          }
          if(action.type==='previewCosmeticSet'){assert.notEqual(action.id,'express_sorting');session.action(action);}
        }
      }
    }
    session.action({type:'previewCosmeticSet',id:'express_sorting'});
    for(const key of retired){const [kind,id]=key.split('.') as ['theme'|'cargo'|'forklift',string];session.action({type:'previewCosmetic',kind,id});}
    assert.deepEqual(session.view.account,before);assert.deepEqual(host.data,roots);assert.equal(host.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
    const restarted=new GameSession(host.platform,{seed:71,mode:'standard'});assert.deepEqual(restarted.view.account,before);assert.deepEqual(accountCosmeticState(restarted.view.account??null).cosmetics,normalize(mask));
  }
});

test('mirror failure keeps historical roots private until restarted exact retry normalizes all slots and preserves rights',()=>{
  for(const version of [3,4] as const){
    const {account,storage,service}=fixture(version,7,true),set=storage.set.bind(storage);
    storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror offline');set(key,value);};
    const request:AccountRequest={type:'purchase',item:'rotate',operationId:'retirement.mirror'};
    assert.equal(service.transact(request,0).status,'committed_unmirrored');assert.deepEqual(service.getSnapshot(),account);
    const restarted=createAccountService(storage,{status:'held',release(){}},()=>0);
    assert.equal(restarted.getSnapshot(),null);assert.equal(restarted.getPendingOperationId(),request.operationId);
    storage.set=set;assert.equal(restarted.retryPending(request.operationId!).status,'acknowledged');
    const after=restarted.getSnapshot()!;assert.deepEqual(after.profile.cosmetics,normalize(7));assert.equal(after.profile.ownedCosmetics!.length,53);assert.deepEqual(after.profile.ownedCosmetics,account.profile.ownedCosmetics);assert.equal(after.profile.cargoOutline,true);
    assert.equal(restarted.transact(request,0).status,'acknowledged');assert.deepEqual(restarted.getSnapshot(),after);assert.equal(storage.values.get(ACCOUNT_KEYS.a),storage.values.get(ACCOUNT_KEYS.b));
  }
});
