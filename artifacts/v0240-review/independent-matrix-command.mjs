// Archival copy of the exact JavaScript body executed with node --input-type=module via stdin.
// Original execution used repository root as cwd. This file was not rerun during archival.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {makeAccountFixture,FaultStorage} from './tests/helpers/account-fixtures.ts';
import {getUiControls} from './src/presentation/ui.ts';
import {createRunV8} from './src/domain/v8/engine.ts';
import {createProfile} from './src/application/profile.ts';
const retired=['theme.express_sorting','cargo.taped','forklift.compact'];let cases=0;
for(const free of [false,true]){
 const built=await build({stdin:{contents:"export * from './src/application/account-service.ts';export * from './src/application/cosmetics.ts';export * from './src/application/account-store.ts';export * from './src/application/economy.ts';export * from './src/application/account-guides.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{__PLAYTEST_FREE_SHOP__:String(free)}});
 const api=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
 for(const version of [3,4])for(let mask=0;mask<8;mask++)for(const outline of [false,true]){
  let account=api.retainAccountCosmetics(api.upgradeEconomy(makeAccountFixture({wallet:4567,inventory:{rotate:2,clear:3,wildcard:4}})));
  if(version===4)account=api.upgradeAccountGuides(account);
  account.profile.ownedCosmetics=[...new Set([...api.FREE_COSMETICS,'cargo.wood','forklift.white',...retired.filter((_,i)=>mask&(1<<i))])].sort();
  account.profile.cosmetics={theme:mask&1?'express_sorting':'night',cargo:mask&2?'taped':'wood',forklift:mask&4?'compact':'white'};account.profile.cargoOutline=outline;
  const storage=new FaultStorage(),raw=api.encodeAccount(account);storage.values.set(api.ACCOUNT_KEYS.a,raw);storage.values.set(api.ACCOUNT_KEYS.b,raw);
  const service=api.createAccountService(storage,{status:'held',release(){}},()=>0);storage.resetFault();
  const requests=retired.flatMap(key=>{const [kind,id]=key.split('.');return [{type:'purchaseCosmetic',kind,id},{type:'setCosmetic',kind,id}];});requests.push({type:'purchaseCosmeticSet',id:'express_sorting',quotedKeys:retired,quotedPrice:free?0:1440},{type:'equipCosmeticSet',id:'express_sorting'});
  for(const [i,request] of requests.entries())assert.equal(service.transact({...request,operationId:`reject.${i}`},0).status,'not_committed');
  assert.equal(storage.operations.filter(x=>x.kind==='set'||x.kind==='remove').length,0);assert.deepEqual(service.getSnapshot(),account);
  const normalized={theme:mask&1?'day':'night',cargo:mask&2?'classic':'wood',forklift:mask&4?'yellow':'white'};
  const result=service.transact({type:'setSettings',patch:{sound:false},operationId:'normalize.settings'},0);assert.equal(result.status,'acknowledged');
  const expected=api.upgradeAccountGuides(structuredClone(account));expected.profile.cosmetics=normalized;expected.profile.settings.sound=false;expected.generation=1;expected.lastOperation=result.account.lastOperation;
  assert.deepEqual(result.account,expected);assert.equal(storage.values.get(api.ACCOUNT_KEYS.a),storage.values.get(api.ACCOUNT_KEYS.b));cases++;
 }
}
for(const kind of ['purchase','purchaseCosmetic','purchaseCosmeticSet']){
 const controls=getUiControls(createRunV8(1,'normal'),{screen:'shop',profile:createProfile(),confirmation:{kind}});
 assert.equal(controls[0].action.type,'cancel');assert.equal(controls[1].action.type,'confirm');assert.ok(controls[0].rect.x+controls[0].rect.w<controls[1].rect.x);
}
console.log(`Independent compiled paid/free retirement matrix passed: ${cases} accounts, 512 retired requests, 64 atomic no-refund settings commits, 3 confirmation layouts.`);
