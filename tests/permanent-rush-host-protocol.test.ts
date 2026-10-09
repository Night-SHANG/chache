import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPlayableRun,applyPlayableCommand} from '../src/domain/playable.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {rebindWinningTier18Trace} from '../scripts/host-static-help.mjs';
import {createAccountService} from '../src/application/account-service.ts';
import * as qa from '../scripts/host-permanent-rush.mjs';

const binding=()=>({commit:'a'.repeat(40),expectedCommit:'a'.repeat(40),sourceSha256:'b'.repeat(64),expectedSourceSha256:'b'.repeat(64),manifestSourceSha256:'b'.repeat(64),gameJsSha256:'c'.repeat(64),expectedGameJsSha256:'c'.repeat(64)});
const view={screen:'game' as const,paused:false,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
const mapPort=(values:Map<string,string>)=>({get:(key:string)=>values.get(key)??null,set:(key:string,value:string)=>{values.set(key,value);},remove:(key:string)=>{values.delete(key);},listKeys:(prefix:string)=>[...values.keys()].filter(key=>key.startsWith(prefix))});
test('permanent rush runner requires complete owner commit source and actual bytes',()=>{
 assert.doesNotThrow(()=>qa.verifyPermanentRushBinding(binding()));
 for(const key of Object.keys(binding()) as (keyof ReturnType<typeof binding>)[])assert.throws(()=>qa.verifyPermanentRushBinding({...binding(),[key]:''}),/hash|commit|source|game/i);
});
test('current cleanup witness includes rules19 and accepts non-string Canvas fills',()=>{
 assert.deepEqual(qa.permanentRushPaintLabels({label:'ignored',action:{type:'chooseCleanup',branch:'placements'}},19),['定期清扫','每成功放置6次，','清除1格废弃箱']);
 for(const fill of [null,undefined,{addColorStop(){}},{setTransform(){}}])assert.equal(qa.isPermanentRushGridFill(fill),false);
 assert.equal(qa.isPermanentRushGridFill('#56636A'),true);
});
test('actual result controls use one 132/28 stack and compact settings use 144/36 including recovery',()=>{
 for(const tier of ['hard','expert'] as const)for(const mode of ['standard','endless','rush'] as const){
  const common={family:'inbound' as const,seed:17,inboundDifficulty:tier,guided:false as const,toolCharges:{rotate:0 as const,clear:0 as const,wildcard:0 as const}};
  const state=createPlayableRun(mode==='rush'?{...common,mode,rulesetVersion:19}:{...common,mode,rulesetVersion:18});state.phase='result';state.result='won';state.shift=5;state.completedOrders=30;
  const controls=getUiControls(state,view);assert.equal(controls.length,mode==='standard'?4:2);assert.doesNotThrow(()=>qa.assertUniformStack(controls,132,28));
 }
 const state=createPlayableRun({family:'inbound',mode:'standard',rulesetVersion:18,seed:17,inboundDifficulty:'hard',guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}});
 for(const profileNeedsRecovery of [false,true]){const controls=getUiControls(state,{...view,screen:'settings',profileNeedsRecovery});assert.equal(controls.length,profileNeedsRecovery?6:5);assert.doesNotThrow(()=>qa.assertUniformStack(controls,144,36));}
 const bad=[{rect:{x:0,y:0,w:500,h:132}},{rect:{x:0,y:159,w:500,h:132}}];assert.throws(()=>qa.assertUniformStack(bad,132,28),/gap/);
});
test('constructed rush near-wins keep strict identity history score and honest provenance for both tiers',()=>{
 for(const tier of ['hard','expert'] as const){const fixture=qa.constructedRushBoundary(tier);assert.match(fixture.label,/^CONSTRUCTED:/);const storage=qa.permanentRushFixtureStorage(fixture.spec,[],{constructedState:fixture.state,label:fixture.label});const account=validateResumeStorage(storage).account!;assert.equal(account.run?.identity.mode,'rush');assert.equal(account.run?.identity.rulesetVersion,19);assert.equal(account.run?.identity.inboundDifficulty,tier);assert.equal(account.run?.identity.challengeDay,undefined);const result=applyPlayableCommand(account.run!.state,fixture.next);assert.equal(result.error,undefined);assert.equal(result.state.result,'won');assert.equal(result.state.completedOrders,30);assert.ok('rawScore' in result.state);assert.equal(result.state.rawScore,6000);assert.equal(result.state.score,tier==='hard'?9000:12000);assert.throws(()=>qa.permanentRushFixtureStorage(fixture.spec,[],{constructedState:fixture.state}),/CONSTRUCTED/);}
});
test('rush tool and blocked fixtures validate before native execution and have a finite rescue plan',()=>{
 for(const kind of ['clear','rotate','wildcard','rescue','failure'] as const){const f=qa.constructedRushToolFixture(kind);const a=validateResumeStorage(qa.permanentRushFixtureStorage(f.spec,[],{constructedState:f.state,label:f.label})).account!;assert.equal(a.run?.state.rulesetVersion,19);assert.equal(applyPlayableCommand(a.run!.state,f.next).error,undefined);if(kind==='failure')assert.equal(applyPlayableCommand(a.run!.state,f.next).state.result,'failed');if(kind==='rescue')assert.ok(f.rescuePlan?.length);}
});
test('all ordinary failure boundaries and carried-tool winning prefixes have strict account roots',async()=>{
 for(const mode of ['standard','endless'] as const){const f=qa.constructedRushToolFixture('failure'),spec={family:'inbound' as const,mode,rulesetVersion:18 as const,seed:17,inboundDifficulty:'hard' as const,guided:false,toolCharges:{rotate:0 as const,clear:0 as const,wildcard:0 as const}},base=createPlayableRun(spec),state={...f.state,rulesetVersion:18,runConfigId:base.runConfigId,mode,cleanup:null,commands:[],commandIndex:0,commandBaseIndex:0};const account=validateResumeStorage(qa.permanentRushFixtureStorage(spec,[],{constructedState:state as typeof base,label:f.label})).account!;assert.equal(applyPlayableCommand(account.run!.state,f.next).state.result,'failed');}
 const proof=rebindWinningTier18Trace(JSON.parse(await readFile('artifacts/v0120-order-quantity-study/cases/B-greedy-s21.json','utf8')),'expert'),spec={...proof.spec,toolCharges:{rotate:0 as const,clear:1 as const,wildcard:0 as const}};
 assert.equal(validateResumeStorage(qa.permanentRushFixtureStorage(spec,proof.commands.slice(0,-1))).account?.run?.reserved[0],'clear');
});
test('two separately labeled rush boundaries preserve the first physical account history and pay independent rewards',()=>{
 let storage:Map<string,string>|undefined,wallet=0;
 for(const serial of [1,2]){const f=qa.constructedRushBoundary('expert',{rotate:0,clear:0,wildcard:1},17+serial);storage=qa.permanentRushFixtureStorage(f.spec,[],{constructedState:f.state,label:f.label,storage});const service=createAccountService(mapPort(storage),{status:'held',release(){}},()=>Date.parse('2026-10-07T12:00:00Z'));let account=service.getSnapshot()!;const runId=account.run!.identity.runId;
  if(serial===2){const used=service.transact({type:'command',operationId:'fixture.actual.use',runId,command:{type:'wildcard',pieceId:account.run!.state.candidates[1].id}},account.generation);assert.equal(used.status,'acknowledged');account=used.account!;}
  const won=service.transact({type:'command',operationId:`fixture.win.${serial}`,runId,command:f.next},account.generation);assert.equal(won.status,'acknowledged');assert.equal(won.account!.wallet-wallet,300);const closed=service.transact({type:'close',operationId:`fixture.close.${serial}`,runId,reason:'decline_overtime'},won.account!.generation);assert.equal(closed.status,'acknowledged');wallet=closed.account!.wallet;assert.equal(validateResumeStorage(storage).account!.profile.results[`inbound.rush.v19.expert.${serial===1?'plain':'tools'}`].wins,1);
 }
 assert.equal(wallet,600);
});
test('unbound run refuses execution and preserves its first failure',async()=>{
 const out=await mkdtemp(join(tmpdir(),'permanent-rush-unbound-'));try{await assert.rejects(qa.runPermanentRushHostQA({out}),/hash|commit/);const first=JSON.parse(await readFile(join(out,'first-failure.json'),'utf8'));assert.equal(first.executedScenarios,0);await qa.writePermanentRushReport(out,{status:'FAIL',error:'later'});assert.deepEqual(JSON.parse(await readFile(join(out,'first-failure.json'),'utf8')),first);}finally{await rm(out,{recursive:true,force:true});}
});
