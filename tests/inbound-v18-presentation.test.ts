import test from 'node:test';import assert from 'node:assert/strict';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createAccountService,type AccountRequest} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {FaultStorage,makeAccountFixture} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {findPlayableMoves,previewPlayablePlacement} from '../src/domain/playable.ts';
import {getEconomyControls,resultEarnedCoins} from '../src/presentation/economy-ui.ts';
test('daily18 cleanup exposes successful-placement wording',()=>{
 const state=createRunV18({seed:7,mode:'daily'}),view=sessionHost().session.view;view.screen='game';assert.ok(getEconomyControls(state,view).some(c=>c.label==='定期清扫 · 每成功放置6次，清除1格废弃箱'));
});
for(const inboundDifficulty of ['hard','expert'] as const)test(`actual ${inboundDifficulty}18 result displays exactly the recorded coin entitlement`,()=>{
 const storage=new FaultStorage(),raw=encodeAccount(makeAccountFixture({wallet:321}));storage.values.set(ACCOUNT_KEYS.a,raw);storage.values.set(ACCOUNT_KEYS.b,raw);const service=createAccountService(storage,{status:'held',release(){}},()=>0);let id=0;const tx=(body:Record<string,unknown>)=>{const r=service.transact({operationId:`reward.${++id}`,...body} as AccountRequest,service.getSnapshot()!.generation);assert.equal(r.status,'acknowledged',r.message);return r.account!;};
 let account=tx({type:'start',intent:{spec:{family:'inbound',mode:'endless',rulesetVersion:18,seed:7,inboundDifficulty,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},guide:'direct',items:[]}});
 const runId=account.run!.identity.runId;
 for(let i=0;i<20&&account.run!.state.score===0&&account.run!.state.phase==='input';i++){const state=account.run!.state;const moves=findPlayableMoves(state);moves.sort((a,b)=>previewPlayablePlacement(state,b.pieceId,b.origin).shipments.length-previewPlayablePlacement(state,a.pieceId,a.origin).shipments.length);assert.ok(moves[0]);account=tx({type:'command',runId,command:{type:'place',...moves[0]}});}
 assert.ok(account.run!.state.score>0);account=tx({type:'command',runId,command:{type:'finish'}});const state=account.run!.state;account=tx({type:'close',runId,reason:'retired'});const view={...sessionHost().session.view,account,accountRunId:undefined};const coins=resultEarnedCoins(state,view);assert.deepEqual(coins,{earnedCoins:Math.floor(state.score/120),wallet:account.wallet});assert.equal(account.wallet,321+Math.floor(state.score/120));assert.equal(resultEarnedCoins({...state,score:state.score+1},view),null);
});
test('shared current help omits the redundant mode exclusion and retains the exact rush countdown',async()=>{
 const {createCanvas}=await import('@napi-rs/canvas'),{render}=await import('../src/presentation/renderer.ts');const state=createRunV18({seed:7,mode:'standard'}),view={...sessionHost().session.view,screen:'helpDetails' as const,helpTopic:'inbound' as const,helpFromHome:true};const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,labels:string[]=[];ctx.fillText=s=>labels.push(s);render(ctx,state,view);assert.ok(!labels.some(s=>s.includes('入库五班和无限模式')));assert.ok(!labels.some(s=>s.includes('普通、无限')));assert.ok(labels.includes('加急数字按后续成功放置次数倒数，不是倒计时'));
});
