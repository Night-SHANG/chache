import test from 'node:test';
import assert from 'node:assert/strict';
import {GameSession} from '../src/application/session.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {makeAccountRun} from './helpers/account-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {playableChecksum,findPlayableMoves,previewPlayablePlacement} from '../src/domain/playable.ts';
import {createRunV14,applyCommandV14} from '../src/domain/v14/engine.ts';

const completedDay='2026-10-06';
const completedAccount=()=>({formatVersion:2 as const,economyVersion:2 as const,dailyRewards:{[completedDay]:{completedRunId:'test.finished',bonusPaid:0}}});
const rushButton=(s:GameSession)=>getUiControls(s.state,s.view).find(c=>c.action.type==='newRun'&&c.action.mode==='rush')!;

test('completed historical daily keeps rush unlocked and preparation leaves its ledger unchanged',()=>{
 const h=sessionHost(completedAccount()),s=h.session;s.action({type:'chooseInbound'});
 assert.equal(s.view.dailyLocked,true);assert.notEqual(rushButton(s).disabled,true);assert.equal(rushButton(s).label,'开始');
 const before=[...h.data],rewards=structuredClone(s.view.account!.dailyRewards);
 s.action({type:'newRun',mode:'daily'});assert.equal(s.view.screen,'prepareTools');assert.equal(s.view.prepareIntent?.spec.family==='inbound'&&s.view.prepareIntent.spec.mode,'rush');assert.deepEqual([...h.data],before);
 s.action({type:'back'});assert.equal(s.view.screen,'inboundMenu');assert.deepEqual([...h.data],before);
 startInbound(s,'rush');assert.equal(s.state.rulesetVersion,21);assert.equal(s.view.account?.run?.identity.challengeDay,undefined);assert.deepEqual(s.view.account?.dailyRewards,rewards);assert.equal(s.view.account?.wallet,0);
 const seed=s.state.seed;s.restart();assert.equal(s.view.confirmation?.kind,'newRun');s.action({type:'confirm'});assert.equal(s.view.screen,'prepareTools');s.action({type:'prepareNext'});assert.equal(s.state.phase,'cleanup');assert.notEqual(s.state.seed,seed);assert.deepEqual(s.view.account?.dailyRewards,rewards);assert.equal(s.view.account?.wallet,0);
});

test('Shanghai midnight updates historical availability without locking or dating new rush starts',()=>{
 const h=sessionHost(completedAccount()),s=h.session;s.action({type:'chooseInbound'});
 assert.notEqual(rushButton(s).disabled,true);assert.equal(s.view.dailyLocked,true);
 h.platform.wallTime=()=>Date.parse('2026-10-06T16:00:00Z');s.tick(1);
 assert.equal(s.view.dailyLabel,'2026-10-07');assert.equal(s.view.dailyLocked,false);assert.notEqual(rushButton(s).disabled,true);
 s.hide();s.show();assert.equal(s.view.dailyLocked,false);
 startInbound(s,'rush');assert.equal(s.view.account?.run?.identity.challengeDay,undefined);assert.equal(s.view.account?.run?.identity.economyVersion,2);assert.equal(s.view.account?.dailyRewards?.[completedDay]?.completedRunId,'test.finished');
});

test('rush switch from a live board requires confirmation and cancellation remains byte stable despite old daily completion',()=>{
 const h=sessionHost(completedAccount()),s=h.session;startInbound(s,'endless');
 const before=[...h.data],checksum=playableChecksum(s.state),runId=s.view.accountRunId;
 s.action({type:'newRun',mode:'daily'});assert.equal(s.view.confirmation?.kind,'newRun');assert.equal(s.view.confirmation?.mode,'rush');assert.equal(s.view.accountRunId,runId);s.action({type:'cancel'});
 assert.equal(playableChecksum(s.state),checksum);assert.deepEqual([...h.data],before);
 s.restart();assert.equal(s.view.confirmation?.kind,'newRun');s.action({type:'cancel'});
 assert.equal(playableChecksum(s.state),checksum);assert.deepEqual([...h.data],before);
});

test('resuming a prior-day attempt preserves its bound day without taking the current day',()=>{
 const state=applyCommandV14(createRunV14({seed:91,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;state.runSerial=1;
 const run=makeAccountRun({state,identity:{runId:'test.midnight',serial:1,rulesetVersion:14,runConfigId:state.runConfigId,mode:'daily',challengeDay:'2026-10-05',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:[...state.commands]}});
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run}),s=h.session;
 const before=playableChecksum(s.state);s.resume();assert.equal(playableChecksum(s.state),before);assert.equal(s.view.dailyLabel,completedDay);assert.equal(s.view.dailyLocked,false);assert.equal(s.view.account?.run?.identity.challengeDay,'2026-10-05');
 s.action({type:'home'});s.action({type:'cancel'});s.hide();s.show();s.resume();assert.equal(s.view.account?.run?.identity.challengeDay,'2026-10-05');assert.equal(s.view.dailyLocked,false);
});

test('unknown rush start survives background and retry with one run and one reservation of each selected tool',()=>{
 const h=sessionHost({wallet:70,inventory:{rotate:1,clear:1,wildcard:1}}),s=h.session,original=h.storage.set.bind(h.storage);let broken=true;
 h.storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a&&broken)throw Error('mirror');original(key,value);};
 s.action({type:'newRun',mode:'daily'});assert.equal(s.view.screen,'prepareTools');s.action({type:'toggleItem',item:'rotate'});s.action({type:'toggleItem',item:'clear'});s.action({type:'prepareNext'});assert.equal(s.view.accountBlocked,true);assert.equal(Boolean(s.view.account?.run),false);assert.deepEqual(s.view.account?.inventory,{rotate:1,clear:1,wildcard:1});
 const before=s.view.account;s.hide();s.show();s.tick(5000);assert.equal(s.view.account,before);
 broken=false;s.action({type:'retrySave'});assert.equal(s.view.account?.run?.identity.economyVersion,2);assert.equal(s.view.account?.run?.identity.mode,'rush');assert.equal(s.view.account?.run?.identity.rulesetVersion,21);assert.deepEqual(s.view.account?.run?.reserved,['rotate','clear']);assert.deepEqual(s.view.account?.inventory,{rotate:0,clear:0,wildcard:1});assert.equal(s.view.account?.wallet,70);assert.equal(s.state.phase,'cleanup');
 const generation=s.view.account!.generation,runId=s.view.accountRunId;s.action({type:'retrySave'});assert.equal(s.view.account?.generation,generation);assert.equal(s.view.accountRunId,runId);assert.equal(s.view.account?.nextRunSerial,2);assert.deepEqual(s.view.account?.inventory,{rotate:0,clear:0,wildcard:1});
});

test('one confirmed tool after cancel and background consumes one cursor without rescaling score or coins',()=>{
 const h=sessionHost({wallet:500,inventory:{rotate:1,clear:0,wildcard:0}}),s=h.session;startInbound(s,'endless',['rotate']);
 const candidate=s.state.candidates.find(p=>!['shape.single','shape.square'].includes(p.shapeId))!;assert.ok(candidate);
 const before=playableChecksum(s.state),generation=s.view.account!.generation,score=s.state.score,wallet=s.view.account!.wallet,commandIndex=s.state.commandIndex;
 s.action({type:'tool',item:'rotate'});s.action({type:'toolPiece',pieceId:candidate.id});s.action({type:'toolRotate'});s.action({type:'toolCancel'});assert.equal(playableChecksum(s.state),before);assert.equal(s.view.account?.generation,generation);
 s.action({type:'tool',item:'rotate'});s.hide();s.show();s.resume();assert.equal(s.view.toolSelection,null);
 s.action({type:'tool',item:'rotate'});s.action({type:'toolPiece',pieceId:candidate.id});s.action({type:'toolRotate'});s.action({type:'toolConfirm'});s.action({type:'toolConfirm'});
 assert.equal(s.state.commandIndex,commandIndex+1);assert.equal(s.state.score,score);assert.equal(s.view.account?.wallet,wallet);assert.deepEqual(s.view.account?.run?.reserved,[]);assert.equal(s.view.account?.inventory.rotate,0);
});

test('failed rush attempt credits base score coins and offers another unique attempt',()=>{
 const h=sessionHost({wallet:70}),s=h.session;startInbound(s,'daily');const runId=s.view.accountRunId,seed=s.state.seed;let now=0;
 for(let turn=0;turn<100&&s.view.account?.run;turn++){
  const moves=findPlayableMoves(s.state);assert.ok(moves.length);
  const move=turn<4?moves.reduce((best,move)=>previewPlayablePlacement(s.state,move.pieceId,move.origin).shipments.reduce((sum,event)=>sum+event.score,0)>previewPlayablePlacement(s.state,best.pieceId,best.origin).shipments.reduce((sum,event)=>sum+event.score,0)?move:best):moves.find(move=>!previewPlayablePlacement(s.state,move.pieceId,move.origin).shipments.length)??moves[0];
  s.dispatch({type:'place',...move});while(s.view.animation){now+=10000;h.time(now);s.tick(now);}
 }
 assert.equal(s.state.result,'failed');assert.equal(Boolean(s.view.account?.run),false);assert.equal(s.view.dailyLocked,false);assert.equal(s.view.account?.lastClosedResult?.earnedCoins,Math.floor(s.state.score/120));assert.equal(s.view.account?.wallet,70+Math.floor(s.state.score/120));
 s.view.noticeFx=null;assert.equal(rushButton(s).label,'再来一局');assert.notEqual(rushButton(s).disabled,true);
 s.restart();assert.equal(s.view.screen,'prepareTools');s.action({type:'prepareNext'});assert.equal(s.state.phase,'cleanup');assert.equal(s.view.account?.run?.identity.mode,'rush');assert.notEqual(s.view.accountRunId,runId);assert.notEqual(s.state.seed,seed);
});

import {refreshOrdersV14} from '../src/domain/v14/generation.ts';
import {resultEarnedCoins} from '../src/presentation/economy-ui.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {encodeAccount} from '../src/application/account-store.ts';
function completedRun(day=completedDay){
 const started=applyCommandV14(createRunV14({seed:1,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;
 const state=refreshOrdersV14({...started,runSerial:1,score:1445,completedOrders:30,shift:5,phase:'result',result:'won',endReason:'completed'});
 return makeAccountRun({state,identity:{runId:'test.daily-win',serial:1,rulesetVersion:14,runConfigId:state.runConfigId,mode:'daily',challengeDay:day,economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:[...state.commands]}});
}

test('restored daily victory closes once and new rush preparation cannot repay or replace its historical reward',()=>{
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,wallet:700,run:completedRun()}),s=h.session;
 assert.equal(s.state.result,'won');assert.equal(s.state.score,1445);assert.equal(s.view.account?.wallet,736);assert.deepEqual(resultEarnedCoins(s.state,s.view),{earnedCoins:36,wallet:736});
 assert.equal(s.view.dailyLocked,true);assert.notEqual(rushButton(s).disabled,true);const before=[...h.data],rewards=structuredClone(s.view.account!.dailyRewards),records=structuredClone(s.view.account!.profile.results);
 s.restart();assert.equal(s.view.screen,'prepareTools');assert.deepEqual([...h.data],before);s.action({type:'back'});assert.equal(s.view.account?.lastClosedResult?.identity.runId,'test.daily-win');
 s.hide();s.show();s.resume();assert.deepEqual(resultEarnedCoins(s.state,s.view),{earnedCoins:36,wallet:736});
 const restored=new GameSession(h.platform,{seed:9,mode:'standard'});restored.action({type:'chooseInbound'});assert.notEqual(rushButton(restored).disabled,true);assert.equal(restored.view.account?.wallet,736);
 startInbound(restored,'rush');assert.equal(restored.state.rulesetVersion,21);assert.deepEqual(restored.view.account?.dailyRewards,rewards);assert.deepEqual(restored.view.account?.profile.results,records);assert.equal(restored.view.account?.wallet,736);
});

test('yesterday daily victory closes after midnight and starts undated rush without multiplying the paid result again',()=>{
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,wallet:700,run:completedRun('2026-10-05')}),s=h.session;
 assert.equal(s.view.dailyLocked,false);assert.equal(rushButton(s).label,'再来一局');assert.deepEqual(resultEarnedCoins(s.state,s.view),{earnedCoins:36,wallet:736});const rewards=structuredClone(s.view.account!.dailyRewards);
 s.restart();assert.equal(s.view.screen,'prepareTools');s.action({type:'prepareNext'});assert.equal(s.view.account?.run?.identity.mode,'rush');assert.equal(s.view.account?.run?.identity.challengeDay,undefined);assert.equal(s.view.account?.wallet,736);assert.deepEqual(s.view.account?.dailyRewards,rewards);
});

test('unconfirmed daily closing publishes its credited reward once after retry and background',()=>{
 const h=sessionHost(),account=makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},generation:1,nextRunSerial:2,wallet:700,run:completedRun(),lastOperation:{operationId:'fixture',expectedGeneration:0,committedGeneration:1,requestDigest:'fixture'}}),raw=encodeAccount(account);
 h.data.set(ACCOUNT_KEYS.a,raw);h.data.set(ACCOUNT_KEYS.b,raw);
 const original=h.storage.set.bind(h.storage);let broken=true;h.storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a&&broken)throw Error('mirror');original(key,value);};
 const s=new GameSession(h.platform,{seed:9,mode:'standard'});assert.equal(s.view.accountBlocked,true);assert.equal(s.view.account?.wallet,700);
 s.hide();s.show();s.tick(9000);assert.deepEqual(getUiControls(s.state,s.view).map(c=>c.action.type),['retrySave']);
 broken=false;s.action({type:'retrySave'});assert.equal(s.view.account?.wallet,736);assert.equal(s.view.dailyLocked,true);assert.deepEqual(resultEarnedCoins(s.state,s.view),{earnedCoins:36,wallet:736});
 const generation=s.view.account!.generation;s.action({type:'retrySave'});s.restart();assert.equal(s.view.account?.generation,generation);assert.equal(s.view.account?.wallet,736);
});

import {createRunV12} from '../src/domain/v12/engine.ts';
import {pieceCellsV14} from '../src/domain/v14/board.ts';
test('outbound clear shipment credits displayed-score delta once through preview, unknown commit and restore',()=>{
 const state=createRunV12(1,'normal',{rotate:0,clear:1,wildcard:0});state.runSerial=1;state.rawScore=100;state.score=125;
 for(const cell of [4,13,22,31])state.board[cell]='cargo.food';
 for(let cell=36;cell<=44;cell++)state.board[cell]=cell%2?'cargo.chem':'cargo.machine';
 const run=makeAccountRun({state,identity:{runId:'test.scaled-clear',serial:1,rulesetVersion:12,runConfigId:state.runConfigId,mode:'outbound',difficultyId:'normal',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},reserved:['clear'],creditedBase:4,earnedCoins:4});
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,wallet:704,run}),s=h.session;s.resume();
 s.action({type:'tool',item:'clear'});s.action({type:'toolCell',cell:40});assert.equal(s.view.toolSelection?.preview?.score,175);assert.equal(s.state.score,125);assert.equal(s.view.account?.wallet,704);
 const original=h.storage.set.bind(h.storage);let broken=true;h.storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a&&broken)throw Error('mirror');original(key,value);};
 s.action({type:'toolConfirm'});assert.equal(s.view.accountBlocked,true);assert.equal(s.state.score,125);s.hide();s.show();broken=false;s.action({type:'retrySave'});
 assert.equal(s.state.score,175);assert.equal(s.view.account?.wallet,705);assert.equal(s.view.account?.run?.creditedBase,5);assert.equal(s.view.animation?.shipment.score,50);
 const generation=s.view.account!.generation;s.action({type:'toolConfirm'});s.action({type:'retrySave'});assert.equal(s.view.account?.generation,generation);
 s.hide();const restored=new GameSession(h.platform,{seed:9,mode:'standard'});restored.resume();assert.equal(restored.state.score,175);assert.equal(restored.view.account?.wallet,705);assert.deepEqual(restored.view.account?.run?.reserved,[]);
});

test('natural multishape rush candidates and placed cells never tick from waiting, invalid input, pause or restore',()=>{
 const state=applyCommandV14(createRunV14({seed:1,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;state.runSerial=1;
 const rush=state.candidates.find(piece=>piece.trait==='rush'&&pieceCellsV14(piece).length>1);assert.ok(rush,'seed 1 naturally supplies a multishape rush candidate');
 const run=makeAccountRun({state,identity:{runId:'test.rush-clock',serial:1,rulesetVersion:14,runConfigId:state.runConfigId,mode:'daily',challengeDay:completedDay,economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:[...state.commands]}});
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run}),s=h.session;s.resume();s.tick(90000);assert.equal(s.state.candidates.find(p=>p.id===rush.id)?.rushTurns,3);
 const move=findPlayableMoves(s.state).find(m=>m.pieceId===rush.id&&!previewPlayablePlacement(s.state,m.pieceId,m.origin).shipments.length)!;assert.ok(move);s.dispatch({type:'place',...move});
 const clocks=s.state.cellTraits?.filter(t=>t?.kind==='rush');assert.equal(clocks?.length,pieceCellsV14(rush).length);assert.ok(clocks?.every(t=>t?.remaining===3));const before=playableChecksum(s.state);
 s.tick(900000);s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:-10,y:-10}});s.togglePause();s.dispatch({type:'place',...findPlayableMoves(s.state)[0]});s.hide();s.show();assert.equal(playableChecksum(s.state),before);
 const restored=new GameSession(h.platform,{seed:9,mode:'standard'});restored.resume();assert.equal(playableChecksum(restored.state),before);assert.deepEqual(restored.state.cellTraits,s.state.cellTraits);
});

import {createProfile,encodeProfile,PROFILE_KEYS,localDailyChallenge} from '../src/application/profile.ts';
import {createRun} from '../src/domain/engine.ts';
import {encodeRun,SAVE_KEYS} from '../src/application/save.ts';
test('unmigrated explicit legacy daily victory cannot lock rush and cancelling its start preserves the old normal run',()=>{
 const h=sessionHost({},false),profile=createProfile(),day=localDailyChallenge(h.platform.wallTime!(),3),old=createRun(91,'standard',3);old.runSerial=1;profile.nextRunSerial=2;
 profile.dailyHistory[day.id]={day:day.day,seed:day.seed,rulesetVersion:3,score:9000,orders:30,won:true};
 h.data.set(PROFILE_KEYS.main,encodeProfile(profile));h.data.set(SAVE_KEYS.main,encodeRun(old));const before=[...h.data];
 const s=new GameSession(h.platform,{seed:9,mode:'standard'});assert.equal(s.view.account,null);assert.equal(s.view.dailyLocked,true);assert.equal(s.view.needsResume,true);assert.deepEqual([...h.data],before);
 s.action({type:'newRun',mode:'daily'});assert.equal(s.view.confirmation?.kind,'newRun');s.action({type:'cancel'});assert.equal(s.view.account,null);assert.deepEqual([...h.data],before);
 s.resume();assert.equal(s.view.needsResume,false);assert.equal(s.state.rulesetVersion,3);assert.equal(s.state.seed,old.seed);assert.equal(s.state.commandIndex,old.commandIndex);assert.equal(s.view.account,null);assert.equal(h.data.has(ACCOUNT_KEYS.a)||h.data.has(ACCOUNT_KEYS.b),false);
 s.view.screen='inboundMenu';assert.notEqual(rushButton(s).disabled,true);const afterResume=[...h.data];s.action(rushButton(s).action);assert.equal(s.view.confirmation?.kind,'newRun');s.action({type:'cancel'});assert.deepEqual([...h.data],afterResume);
 h.platform.wallTime=()=>Date.parse('2026-10-06T16:00:00Z');s.show();assert.equal(s.view.dailyLocked,false);assert.notEqual(rushButton(s).disabled,true);assert.deepEqual(s.profile.dailyHistory,profile.dailyHistory);
});

test('unmigrated daily records without an explicit same-day win keep rush available',()=>{
 for(const won of [false,true]){
  const h=sessionHost({},false),profile=createProfile(),day=localDailyChallenge(Date.parse(won?'2026-10-05T12:00:00Z':'2026-10-06T12:00:00Z'),3);
  profile.dailyHistory[day.id]={day:day.day,seed:day.seed,rulesetVersion:3,score:9000,orders:30,won};h.data.set(PROFILE_KEYS.main,encodeProfile(profile));const before=[...h.data];
  const s=new GameSession(h.platform,{seed:9,mode:'standard'});s.action({type:'chooseInbound'});assert.equal(s.view.account,null);assert.equal(s.view.dailyLocked,false);assert.notEqual(rushButton(s).disabled,true);assert.deepEqual([...h.data],before);
 }
});
