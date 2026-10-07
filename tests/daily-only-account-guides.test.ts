import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountService,type AccountRequest} from '../src/application/account-service.ts';
import {assertAccountSnapshot} from '../src/application/account-profile.ts';
import {ACCOUNT_KEYS,encodeAccount,loadAccount,repairAccount} from '../src/application/account-store.ts';
import {accountDigest,canonicalStringify} from '../src/application/history-store.ts';
import {upgradeEconomy} from '../src/application/economy.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {advanceGuide,guideOverlay,isGuideComplete} from '../src/application/tutorials.ts';
import {createRunV16,applyCommandV16} from '../src/domain/v16/engine.ts';
import {findLegalMovesV16} from '../src/domain/v16/board.ts';
import type {AccountSnapshot,GuideProgress,GuideTrack} from '../src/application/account-types.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
const fresh=():GuideProgress=>({learned:[],skipped:false,authoredStartConsumed:false});
const daily='daily' as GuideTrack;
const held=()=>({status:'held' as const,release(){}});
const wall=()=>Date.parse('2026-10-07T00:00:00Z');
function setup(account:AccountSnapshot){const storage=new FaultStorage(),raw=encodeAccount(account);storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);return {storage,service:createAccountService(storage,held(),wall)};}
function mutate(service:ReturnType<typeof createAccountService>,request:Record<string,unknown>){return service.transact({operationId:`test.${service.getSnapshot()!.generation}`,...request} as AccountRequest,service.getSnapshot()!.generation);}
function envelope(account:unknown){return canonicalStringify({formatVersion:1,generation:(account as AccountSnapshot).generation,digest:accountDigest(canonicalStringify(account)),account});}

// Catches either preparer downgrading the new account or copying old rush facts into daily.
for(const version of [1,2,3] as const)test(`format${version} reads unchanged and first transaction atomically adds independent daily guide in format4`,()=>{
 let old=makeAccountFixture({wallet:1800,inventory:{rotate:2,clear:1,wildcard:1},dailyPaid:{'2026-10-06':{bestBase:45,paid:90}}});
 old.guides.inbound={learned:['place','order','route','rushTimer','expired','sweepChoice'],skipped:true,authoredStartConsumed:true};old.guides.outbound={learned:['place'],skipped:false,authoredStartConsumed:true};
 old.profile.cosmetics={theme:'night',cargo:'outline',forklift:'red'};
 if(version>=2)old=upgradeEconomy(old);if(version===3)old=retainAccountCosmetics(old);
 const {storage,service}=setup(old),raw=new Map(storage.values);storage.resetFault();service.refresh();assert.deepEqual(storage.values,raw);assert.equal(storage.operations.filter(op=>op.kind!=='get'&&op.kind!=='list').length,0);
 const result=mutate(service,{type:'setSettings',patch:{sound:false}});assert.equal(result.status,'acknowledged');const next=result.account!;
 assert.equal(next.formatVersion,4);assert.equal(next.economyVersion,2);assert.deepEqual(next.guides.inbound,old.guides.inbound);assert.deepEqual(next.guides.outbound,old.guides.outbound);assert.deepEqual(next.guides[daily],fresh());assert.equal(next.wallet,old.wallet);assert.deepEqual(next.inventory,old.inventory);assert.deepEqual(next.dailyPaid,old.dailyPaid);assert.ok(next.profile.ownedCosmetics?.includes('forklift.red'));assert.equal(next.profile.cargoOutline,true);assert.deepEqual(next.run,old.run);assert.equal(next.generation,old.generation+1);
 for(const request of [{type:'setCargoOutline',enabled:false},{type:'setSettings',patch:{sound:true}},{type:'resetResults'}]){assert.equal(mutate(service,request).status,'acknowledged');assert.equal(service.getSnapshot()?.formatVersion,4);assert.deepEqual(service.getSnapshot()?.guides[daily],fresh());}
 assert.equal(createAccountService(storage,held(),wall).getSnapshot()?.formatVersion,4);
});

for(const side of ['a','b'] as const)for(const defect of ['missing daily','unknown step','duplicate step','wrong learned type','extra guide key','unknown owned'] as const)test(`digest-valid format4 ${defect} at root ${side} blocks rollback and writes across restart`,()=>{
 const old=retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet:1800}))),{storage}=setup(old);
 const newer=structuredClone(old) as AccountSnapshot;Object.assign(newer,{formatVersion:4,generation:1,lastOperation:{operationId:'new',expectedGeneration:0,requestDigest:'new',committedGeneration:1}});Object.assign(newer.guides,{daily:fresh()});
 const data=newer as unknown as {guides:Record<string,Record<string,unknown>>;profile:{ownedCosmetics:string[]}};
 if(defect==='missing daily')delete data.guides.daily;else if(defect==='unknown step')data.guides.daily.learned=['future'];else if(defect==='duplicate step')data.guides.daily.learned=['rushTimer','rushTimer'];else if(defect==='wrong learned type')data.guides.daily.learned=[['rushTimer']];else if(defect==='extra guide key')data.guides.future={};else data.profile.ownedCosmetics.push('theme.future');
 storage.values.set(ACCOUNT_KEYS[side],envelope(newer));const before=new Map(storage.values);storage.resetFault();assert.equal(loadAccount(storage,assertAccountSnapshot).status,'unknown');assert.equal(repairAccount(storage,assertAccountSnapshot).status,'unknown');
 for(let restart=0;restart<2;restart++){const service=createAccountService(storage,held(),wall);assert.equal(service.getStatus(),'unknown');assert.equal(service.getSnapshot(),null);assert.equal(service.transact({operationId:'blocked',type:'setSettings',patch:{sound:false}},0).status,'unknown');}
 assert.deepEqual(storage.values,before);assert.equal(storage.operations.filter(op=>op.kind==='set'||op.kind==='remove').length,0);
});

test('basic16 authored two-command facts complete before victory with combined order-route explanation',()=>{
 let state=createRunV16({seed:1,mode:'standard',guided:true}),progress=fresh();
 const commands=[{type:'place' as const,pieceId:'piece.4',origin:{x:1,y:1}},{type:'place' as const,pieceId:'piece.3',origin:{x:3,y:1}}];
 for(const [index,command] of commands.entries()){
  const overlay=guideOverlay('inbound',progress,state);assert.deepEqual(overlay?.expectedCommand,command);
  if(index===1)assert.match(overlay!.text,/同图标相连凑单.*留空路让叉车接货/);
  const result=applyCommandV16(state,command);assert.equal(result.error,undefined);progress=advanceGuide('inbound',progress,state,command,result);state=result.state;
  if(index===0){assert.deepEqual(progress.learned,['place']);assert.equal(state.completedOrders,0);}
 }
 assert.deepEqual(progress.learned,['place','order','route']);assert.equal(isGuideComplete('inbound',progress,16),true);assert.equal(guideOverlay('inbound',progress,state),null);assert.equal(state.completedOrders,1);assert.notEqual(state.phase,'result');
 assert.equal(isGuideComplete('inbound',progress,15),false);assert.equal(isGuideComplete(daily,progress,16),false);
});

test('daily16 learns choice and later real tick only; surviving on-board rush is the only input hint',()=>{
 let state=createRunV16({seed:1,mode:'daily'}),progress=fresh();assert.equal(guideOverlay(daily,progress,state)?.step,'sweepChoice');
 const choice={type:'chooseCleanup' as const,branch:'orders' as const},chosen=applyCommandV16(state,choice);progress=advanceGuide(daily,progress,state,choice,chosen);state=chosen.state;assert.deepEqual(progress.learned,['sweepChoice']);
 let observed=false,ticked=false;
 for(let step=0;step<45&&state.phase==='input';step++){
  const onBoard=state.cellTraits.some(trait=>trait?.kind==='rush'),hint=guideOverlay(daily,progress,state);
  if(!onBoard)assert.equal(hint,null);else if(!progress.learned.includes('rushTimer')){assert.equal(hint?.text,'加急数字按后续成功放置倒数，不是秒');assert.equal(hint?.allowedOrigins,undefined);assert.equal(hint?.expectedCommand,undefined);assert.equal(hint?.selectedPieceId,undefined);observed=true;}
  const moves=findLegalMovesV16(state),move=moves.find(move=>state.candidates.find(p=>p.id===move.pieceId)?.trait==='rush')??moves[0];if(!move)break;
  const command={type:'place' as const,...move},result=applyCommandV16(state,command);assert.equal(result.error,undefined);const before=progress;progress=advanceGuide(daily,progress,state,command,result);
  if(!before.learned.includes('rushTimer')&&progress.learned.includes('rushTimer')){assert.ok(result.events.some(e=>e.type==='rushTick'));assert.ok(onBoard);ticked=true;}
  assert.ok(progress.learned.every(step=>step==='sweepChoice'||step==='rushTimer'));state=result.state;
 }
 assert.equal(observed,true);assert.equal(ticked,true);assert.equal(isGuideComplete(daily,progress,16),true);
});

test('format1/2/3 migration preserves the exact old15 run economy, history, reservations and ledgers',()=>{
 const created=setup(makeAccountFixture({wallet:1000,inventory:{rotate:1,clear:1,wildcard:1}}));
 assert.equal(mutate(created.service,{type:'start',intent:{spec:{family:'inbound',rulesetVersion:15,mode:'standard',seed:7,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:['rotate'],guide:'direct'}}).status,'acknowledged');
 const id=created.service.getSnapshot()!.run!.identity.runId;
 assert.equal(mutate(created.service,{type:'command',runId:id,command:{type:'chooseCleanup',branch:'placements'}}).status,'acknowledged');
 for(const version of [1,2,3] as const){const old=structuredClone(created.service.getSnapshot()!) as AccountSnapshot;old.formatVersion=version;old.economyVersion=version===1?1:2;delete old.guides.daily;old.run!.identity.economyVersion=1;old.dailyPaid['2026-10-06']={bestBase:45,paid:90};if(version===1)delete old.dailyRewards;if(version<3){delete old.profile.ownedCosmetics;delete old.profile.cargoOutline;}
  assertAccountSnapshot(old);const {service}=setup(old);assert.deepEqual(service.getSnapshot(),old);const result=mutate(service,{type:'setSettings',patch:{sound:false}});assert.equal(result.status,'acknowledged');assert.equal(result.account?.formatVersion,4);assert.deepEqual(result.account?.run,old.run);assert.deepEqual(result.account?.inventory,old.inventory);assert.deepEqual(result.account?.dailyPaid,old.dailyPaid);assert.equal(result.account?.wallet,old.wallet);assert.equal(result.account?.nextRunSerial,old.nextRunSerial);assert.equal(result.account?.closedThroughSerial,old.closedThroughSerial);
 }
});

for(const side of ['a','b'] as const)for(const version of [['4'],'4',[[4]],{value:4}] as const)test(`non-primitive payload version ${JSON.stringify(version)} at root ${side} must fail closed`,()=>{
 const old=retainAccountCosmetics(upgradeEconomy(makeAccountFixture({wallet:1800}))),{storage}=setup(old),malformed={...old,formatVersion:version,guides:{...old.guides,daily:fresh()}};
 storage.values.set(ACCOUNT_KEYS[side],envelope(malformed));const before=new Map(storage.values);storage.resetFault();assert.equal(loadAccount(storage,assertAccountSnapshot).status,'unknown');assert.equal(repairAccount(storage,assertAccountSnapshot).status,'unknown');const restarted=createAccountService(storage,held(),wall);assert.equal(restarted.getStatus(),'unknown');assert.equal(restarted.transact({type:'setSettings',operationId:'no.rollback',patch:{sound:false}},0).status,'unknown');assert.deepEqual(storage.values,before);assert.equal(storage.operations.filter(op=>op.kind==='set'||op.kind==='remove').length,0);
});
