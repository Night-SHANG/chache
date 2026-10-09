import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {createAccountService} from '../src/application/account-service.ts';
import {GameSession} from '../src/application/session.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {inboundGroups,inboundDocks,inboundPieceCells} from '../src/presentation/inbound-helpers.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {findPlayableMoves,playableChecksum,type GameCommand} from '../src/domain/playable.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
const trace=JSON.parse(readFileSync(new URL('./helpers/daily-v16-trace.json',import.meta.url),'utf8')) as {wallTime:number;seed:number;commands:GameCommand[]};
function host(){const h=sessionHost();h.platform.wallTime=()=>trace.wallTime;return h;}
function start(s:GameSession,mode:'standard'|'endless'|'daily'){s.action({type:'newRun',mode});assert.notEqual(s.view.screen,'guideOffer');if(s.view.screen==='prepareTools')s.action({type:'prepareNext'});assert.equal(s.view.screen,'game');assert.equal(s.view.accountBlocked,false);}
function settle(h:ReturnType<typeof host>){for(let frames=0;frames<10;frames++){const now=h.session.state.commandIndex*100000+frames*10000;h.time(now);h.session.tick(now);}}
function labels(s:GameSession){const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,words:string[]=[];const text=ctx.fillText.bind(ctx);ctx.fillText=(word,x,y)=>{words.push(word);text(word,x,y);};render(ctx,s.state,s.view);return words;}

for(const mode of ['standard','endless','daily'] as const)test(`new ${mode} uses its current rules and only the rush alias has untimed mandatory cleanup`,()=>{
 const h=host(),s=h.session;start(s,mode);assert.equal(s.state.rulesetVersion,mode==='daily'?21:18);assert.equal('inboundDifficulty' in s.state&&s.state.inboundDifficulty,mode==='daily'?'normal':'hard');assert.equal(s.state.phase,mode==='daily'?'cleanup':'input');assert.equal(s.state.commandIndex,0);
 h.time(200);s.tick(200);assert.equal(s.view.elapsed,mode==='daily'?0:200);
 if(mode==='daily'){assert.equal(s.view.guideTrack,'daily');assert.equal(s.view.account?.run?.identity.mode,'rush');assert.equal('guided' in s.state&&s.state.guided,false);assert.equal(s.view.account?.run?.identity.challengeDay,undefined);assert.equal(s.view.account?.run?.history.seed,s.state.seed);assert.equal(s.view.guide,null);assert.equal(getUiControls(s.state,s.view).some(c=>c.action.type==='skipTutorial'),false);assert.equal(getUiControls(s.state,s.view).filter(c=>c.action.type==='chooseCleanup').length,2);}
 else {assert.equal('cleanup' in s.state&&s.state.cleanup,null);assert.equal(s.state.candidates.length,3);assert.ok(!labels(s).some(word=>/清扫/.test(word)));s.action({type:'help'});s.action({type:'helpDetails'});assert.ok(labels(s).includes('加急模式'));assert.ok(!labels(s).some(text=>text.includes('入库五班和无限模式没有加急货')));s.action({type:'help'});s.action({type:'toolsHelp'});assert.ok(labels(s).includes('最多携带2种，每种1件'));assert.ok(labels(s).includes('确认使用才消耗；取消不扣，未用的结束后退回'));}
});

test('standard18 accepts free random placements and retired skip leaves pause and board unchanged',()=>{
 const h=host(),s=h.session;start(s,'standard');const initial=playableChecksum(s.state);assert.equal(s.view.guide,null);assert.equal('guided' in s.state&&s.state.guided,false);
 for(let n=0;n<2;n++){const move=findPlayableMoves(s.state)[0];assert.ok(move);s.dispatch({type:'place',...move});settle(h);assert.equal(s.state.commandIndex,n+1);assert.equal(s.view.guide,null);}
 assert.ok(s.view.account?.guides.inbound.learned.includes('place'));assert.deepEqual(s.view.account?.guides.daily?.learned,[]);assert.deepEqual(s.view.account?.guides.outbound.learned,[]);assert.notEqual(playableChecksum(s.state),initial);
 s.togglePause();const before=playableChecksum(s.state),account=structuredClone(s.view.account),bytes=[...h.data];h.storage.resetFault();assert.equal(getUiControls(s.state,s.view).some(c=>c.action.type==='skipTutorial'),false);s.action({type:'skipTutorial'});
 assert.equal(s.view.paused,true);assert.equal(playableChecksum(s.state),before);assert.deepEqual(s.view.account,account);assert.deepEqual([...h.data],bytes);assert.equal(h.storage.operations.filter(o=>o.kind==='set'||o.kind==='remove').length,0);
});

test('retired tutorial skip preserves rush mandatory cleanup; restore retains choice and real live-rush fact',()=>{
 const h=host(),s=h.session;start(s,'daily');const initial=playableChecksum(s.state);s.action({type:'skipTutorial'});assert.equal(s.view.account?.guides.daily?.skipped,false);assert.equal(s.view.account?.guides.inbound.skipped,false);assert.deepEqual(s.view.account?.guides.daily?.learned,[]);assert.equal(playableChecksum(s.state),initial);assert.equal(s.state.phase,'cleanup');assert.equal(getUiControls(s.state,s.view).filter(c=>c.action.type==='chooseCleanup').length,2);
 let restored=new GameSession(h.platform,{seed:0,mode:'standard'});assert.equal(restored.state.phase,'cleanup');assert.equal(restored.state.commandIndex,0);restored.resume();restored.action({type:'chooseCleanup',branch:'orders'});assert.equal(restored.state.commandIndex,1);restored=new GameSession(h.platform,{seed:0,mode:'standard'});assert.equal(restored.state.phase,'input');assert.deepEqual('cleanup' in restored.state&&restored.state.cleanup,{branch:'orders',progress:0});assert.equal(restored.state.commandIndex,1);assert.equal(restored.view.guide,null);
 const fresh=host(),service=createAccountService(fresh.storage,fresh.platform.writerLease!,()=>trace.wallTime),started=service.transact({type:'start',operationId:'fixture.old.daily16',intent:{spec:{family:'inbound',rulesetVersion:16,mode:'daily',seed:trace.seed,inboundDifficulty:'normal',guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide:'direct'}},service.getSnapshot()!.generation);assert.equal(started.status,'acknowledged');const d=new GameSession(fresh.platform,{seed:0,mode:'standard'});fresh.session=d;d.resume();assert.equal(d.state.rulesetVersion,16);assert.equal(d.state.seed,trace.seed);
 for(const command of trace.commands.slice(0,27)){d.dispatch(command);settle(fresh);assert.equal(d.view.accountBlocked,false);if(d.state.commandIndex<27)assert.equal(d.view.guide,null);}
 assert.equal(d.state.commandIndex,27);assert.equal(d.view.guide,null);assert.ok(!labels(d).includes('加急数字按后续成功放置倒数，不是秒'));assert.ok(!d.view.message.includes('加急'));
 const generation=d.view.account!.generation;const resumed=new GameSession(fresh.platform,{seed:0,mode:'standard'});assert.equal(resumed.view.guide,null);assert.equal(resumed.view.account?.generation,generation);resumed.resume();resumed.dispatch(trace.commands[27]);assert.deepEqual(resumed.view.account?.guides.daily?.learned,['sweepChoice','rushTimer']);assert.equal(resumed.view.guide,null);assert.deepEqual(resumed.view.account?.guides.inbound.learned,[]);
});

test('rush pause and confirmation expose no skip action and retired skip preserves guide facts',()=>{
 const h=host(),s=h.session;start(s,'daily');s.action({type:'chooseCleanup',branch:'orders'});assert.equal(s.view.guide,null);s.togglePause();assert.equal(getUiControls(s.state,s.view).some(c=>c.action.type==='skipTutorial'),false);s.action({type:'home'});assert.ok(s.view.confirmation);assert.ok(getUiControls(s.state,s.view).every(c=>c.action.type==='cancel'||c.action.type==='confirm'));const before=new Map(h.storage.values);s.action({type:'cancel'});assert.deepEqual(h.storage.values,before);assert.equal(s.view.paused,true);s.action({type:'skipTutorial'});assert.equal(s.view.paused,true);assert.equal(s.view.account?.guides.daily?.skipped,false);assert.deepEqual(s.view.account?.guides.daily?.learned,['sweepChoice']);
});

test('rules16 presentation dispatches native geometry and tool reducer while leaving preview state untouched',()=>{
 const state=createRunV16({seed:1,mode:'standard',toolCharges:{clear:1,rotate:0,wildcard:0}});state.board[0]='cargo.food';const before=structuredClone(state);assert.ok(inboundGroups(state,'cargo.food').length);assert.deepEqual(inboundDocks(state).map(d=>d.entry),[{x:3,y:0},{x:6,y:3},{x:3,y:6},{x:0,y:3}]);assert.equal(inboundPieceCells({id:'rotated',shapeId:'shape.i3_h',cargo:'cargo.food',quarterTurns:1},16).length,3);const preview=toolPreview(state,{type:'clear',cells:[0]});assert.equal(preview.error,undefined);assert.equal(preview.state.rulesetVersion,16);assert.equal(preview.state.board[0],null);assert.deepEqual(state,before);
});

test('old basic facts stay intact while new standard and rush alias omit offers',()=>{
 const h=sessionHost({guides:{inbound:{learned:['place','order','route'],skipped:false,authoredStartConsumed:false},outbound:{learned:[],skipped:false,authoredStartConsumed:false}}}),s=h.session;const before=new Map(h.storage.values);
 s.action({type:'newRun',mode:'standard'});assert.equal(s.view.screen,'prepareTools');s.action({type:'back'});assert.deepEqual(h.storage.values,before);
 s.action({type:'newRun',mode:'daily'});assert.equal(s.view.screen,'prepareTools');assert.deepEqual(h.storage.values,before);s.action({type:'prepareNext'});assert.equal(s.view.screen,'game');assert.equal(s.view.guide,null);assert.deepEqual(s.view.account?.guides.daily?.learned,[]);assert.equal(s.view.account?.guides.daily?.skipped,false);
});

test('current help includes complete rush mechanics in every mode and cleanup cards name successful placements',()=>{
 for(const mode of ['standard','endless','daily'] as const){const h=host(),s=h.session;start(s,mode);if(mode==='daily')assert.ok(labels(s).includes('每成功放置6次，'));
  s.action({type:'help'});s.action({type:'helpDetails'});const text=labels(s).join('\n');assert.match(text,/托盘|双倍箱/);assert.match(text,/危险品/);assert.match(text,/万能/);
  assert.match(text,/加急数字按后续成功放置次数倒数，不是倒计时/);assert.match(text,/开局选择清扫：每完成2单，或每成功放置6次/);assert.doesNotMatch(text,/入库五班和无限模式没有加急货/);assert.doesNotMatch(text,/旋转|清障|最多携带/);s.action({type:'help'});s.action({type:'toolsHelp'});const tools=labels(s).join('\n');assert.match(tools,/旋转选中的待放货件，改变朝向/);assert.match(tools,/最多携带2种，每种1件/);assert.match(tools,/确认使用才消耗；取消不扣，未用的结束后退回/);
 }
});
