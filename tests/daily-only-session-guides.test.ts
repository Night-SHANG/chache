import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas} from '@napi-rs/canvas';
import {GameSession} from '../src/application/session.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {inboundGroups,inboundDocks,inboundPieceCells} from '../src/presentation/inbound-helpers.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {playableChecksum,type GameCommand} from '../src/domain/playable.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
const trace=JSON.parse(readFileSync(new URL('./helpers/daily-v16-trace.json',import.meta.url),'utf8')) as {wallTime:number;seed:number;commands:GameCommand[]};
function host(){const h=sessionHost();h.platform.wallTime=()=>trace.wallTime;return h;}
function start(s:GameSession,mode:'standard'|'endless'|'daily',guided=false){s.action({type:'newRun',mode});if(s.view.screen==='guideOffer')s.action(guided?{type:'guidedStart',track:'inbound'}:{type:'directStart'});if(s.view.screen==='prepareTools')s.action({type:'prepareNext'});assert.equal(s.view.screen,'game');assert.equal(s.view.accountBlocked,false);}
function settle(h:ReturnType<typeof host>){for(let frames=0;frames<10;frames++){const now=h.session.state.commandIndex*100000+frames*10000;h.time(now);h.session.tick(now);}}
function labels(s:GameSession){const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,words:string[]=[];const text=ctx.fillText.bind(ctx);ctx.fillText=(word,x,y)=>{words.push(word);text(word,x,y);};render(ctx,s.state,s.view);return words;}

for(const mode of ['standard','endless','daily'] as const)test(`new ${mode} uses rules16 and only daily has untimed mandatory cleanup`,()=>{
 const h=host(),s=h.session;start(s,mode);assert.equal(s.state.rulesetVersion,16);assert.equal(s.state.phase,mode==='daily'?'cleanup':'input');assert.equal(s.state.commandIndex,0);
 h.time(200);s.tick(200);assert.equal(s.view.elapsed,mode==='daily'?0:200);
 if(mode==='daily'){assert.equal(s.view.guideTrack,'daily');assert.equal(s.view.account?.run?.identity.mode,'daily');assert.equal('guided' in s.state&&s.state.guided,false);assert.equal(s.state.seed,trace.seed);assert.equal(s.view.guide?.step,'sweepChoice');const skip=getUiControls(s.state,s.view).find(c=>c.action.type==='skipTutorial');assert.deepEqual(skip?.rect,{x:210,y:1420,w:660,h:144});assert.equal(getUiControls(s.state,s.view).filter(c=>c.action.type==='chooseCleanup').length,2);}
 else {assert.equal('cleanup' in s.state&&s.state.cleanup,null);assert.equal(s.state.candidates.length,3);assert.ok(!labels(s).some(word=>/清扫/.test(word)));s.action({type:'help'});s.action({type:'helpDetails'});assert.ok(!labels(s).some(word=>/加急|清扫|废物|废弃/.test(word)));}
});

test('basic16 completes after the two real drags and pause skip is accessible without changing the board',()=>{
 const h=host(),s=h.session;start(s,'standard',true);const initial=playableChecksum(s.state);assert.deepEqual(s.view.guide?.expectedCommand,{type:'place',pieceId:'piece.4',origin:{x:1,y:1}});assert.ok(!getUiControls(s.state,s.view).some(c=>c.action.type==='skipTutorial'));
 s.togglePause();const skip=getUiControls(s.state,s.view).find(c=>c.action.type==='skipTutorial');assert.deepEqual(skip?.rect,{x:246,y:900,w:588,h:144});s.action({type:'continue'});
 s.dispatch(s.view.guide!.expectedCommand!);settle(h);assert.equal(s.state.commandIndex,1);assert.ok(labels(s).includes('同图标相连凑单，留空路让叉车接货'));
 s.dispatch(s.view.guide!.expectedCommand!);settle(h);assert.equal(s.state.commandIndex,2);assert.equal(s.state.completedOrders,1);assert.equal(s.view.guide,null);assert.deepEqual(s.view.account?.guides.inbound.learned,['place','order','route']);assert.deepEqual(s.view.account?.guides.daily?.learned,[]);assert.deepEqual(s.view.account?.guides.outbound.learned,[]);assert.notEqual(playableChecksum(s.state),initial);
 const other=host();start(other.session,'standard',true);const before=playableChecksum(other.session.state);other.session.togglePause();other.session.action({type:'skipTutorial'});assert.equal(other.session.view.paused,true);assert.equal(playableChecksum(other.session.state),before);assert.equal(other.session.view.guide,null);assert.ok(!other.session.view.message.includes('第2阶段'));assert.deepEqual(other.session.view.account?.guides.inbound.learned,[]);
});

test('daily skip preserves mandatory cleanup and all legal input; restore retains choice and later live-rush fact',()=>{
 const h=host(),s=h.session;start(s,'daily');const initial=playableChecksum(s.state);s.action({type:'skipTutorial'});assert.equal(s.view.account?.guides.daily?.skipped,true);assert.equal(s.view.account?.guides.inbound.skipped,false);assert.deepEqual(s.view.account?.guides.daily?.learned,[]);assert.equal(playableChecksum(s.state),initial);assert.equal(s.state.phase,'cleanup');assert.equal(getUiControls(s.state,s.view).filter(c=>c.action.type==='chooseCleanup').length,2);
 let restored=new GameSession(h.platform,{seed:0,mode:'standard'});assert.equal(restored.state.phase,'cleanup');assert.equal(restored.state.commandIndex,0);restored.resume();restored.action({type:'chooseCleanup',branch:'orders'});assert.equal(restored.state.commandIndex,1);restored=new GameSession(h.platform,{seed:0,mode:'standard'});assert.equal(restored.state.phase,'input');assert.deepEqual('cleanup' in restored.state&&restored.state.cleanup,{branch:'orders',progress:0});assert.equal(restored.state.commandIndex,1);assert.equal(restored.view.guide,null);
 const fresh=host(),d=fresh.session;start(d,'daily');
 for(const command of trace.commands.slice(0,27)){d.dispatch(command);settle(fresh);assert.equal(d.view.accountBlocked,false);if(d.state.commandIndex<27)assert.equal(d.view.guide,null);}
 assert.equal(d.state.commandIndex,27);assert.equal(d.view.guide?.text,'加急数字按后续成功放置倒数，不是秒');assert.equal(d.view.guide?.expectedCommand,undefined);assert.equal(d.view.guide?.allowedOrigins,undefined);assert.ok(labels(d).includes('加急数字按后续成功放置倒数，不是秒'));assert.ok(!d.view.message.includes('加急'));
 const generation=d.view.account!.generation;const resumed=new GameSession(fresh.platform,{seed:0,mode:'standard'});assert.equal(resumed.view.guide?.step,'rushTimer');assert.equal(resumed.view.account?.generation,generation);resumed.resume();resumed.dispatch(trace.commands[27]);assert.deepEqual(resumed.view.account?.guides.daily?.learned,['sweepChoice','rushTimer']);assert.equal(resumed.view.guide,null);assert.deepEqual(resumed.view.account?.guides.inbound.learned,[]);
});

test('daily with no live rush can be skipped from pause and confirmation prevents underlying skip',()=>{
 const h=host(),s=h.session;start(s,'daily');s.action({type:'chooseCleanup',branch:'orders'});assert.equal(s.view.guide,null);s.togglePause();assert.ok(getUiControls(s.state,s.view).some(c=>c.action.type==='skipTutorial'));s.action({type:'home'});assert.ok(s.view.confirmation);assert.ok(getUiControls(s.state,s.view).every(c=>c.action.type==='cancel'||c.action.type==='confirm'));const before=new Map(h.storage.values);s.action({type:'cancel'});assert.deepEqual(h.storage.values,before);assert.equal(s.view.paused,true);s.action({type:'skipTutorial'});assert.equal(s.view.paused,true);assert.equal(s.view.account?.guides.daily?.skipped,true);assert.deepEqual(s.view.account?.guides.daily?.learned,['sweepChoice']);
});

test('rules16 presentation dispatches native geometry and tool reducer while leaving preview state untouched',()=>{
 const state=createRunV16({seed:1,mode:'standard',toolCharges:{clear:1,rotate:0,wildcard:0}});state.board[0]='cargo.food';const before=structuredClone(state);assert.ok(inboundGroups(state,'cargo.food').length);assert.deepEqual(inboundDocks(state).map(d=>d.entry),[{x:3,y:0},{x:6,y:3},{x:3,y:6},{x:0,y:3}]);assert.equal(inboundPieceCells({id:'rotated',shapeId:'shape.i3_h',cargo:'cargo.food',quarterTurns:1},16).length,3);const preview=toolPreview(state,{type:'clear',cells:[0]});assert.equal(preview.error,undefined);assert.equal(preview.state.rulesetVersion,16);assert.equal(preview.state.board[0],null);assert.deepEqual(state,before);
});

test('old basic facts prevent a new basic offer without marking either daily lesson learned',()=>{
 const h=sessionHost({guides:{inbound:{learned:['place','order','route'],skipped:false,authoredStartConsumed:false},outbound:{learned:[],skipped:false,authoredStartConsumed:false}}}),s=h.session;const before=new Map(h.storage.values);
 s.action({type:'newRun',mode:'standard'});assert.equal(s.view.screen,'prepareTools');s.action({type:'back'});assert.deepEqual(h.storage.values,before);
 s.action({type:'newRun',mode:'daily'});assert.equal(s.view.screen,'game');assert.equal(s.view.guide?.step,'sweepChoice');assert.deepEqual(s.view.account?.guides.daily?.learned,[]);assert.equal(s.view.account?.guides.daily?.skipped,false);
});

test('rules16 help lists only the current mode mechanics and cleanup cards name successful placements',()=>{
 for(const mode of ['standard','endless','daily'] as const){const h=host(),s=h.session;start(s,mode);if(mode==='daily')assert.ok(labels(s).includes('每成功放置6次，'));
  s.action({type:'help'});s.action({type:'helpDetails'});const text=labels(s).join('\n');assert.match(text,/托盘|双倍箱/);assert.match(text,/危险品/);assert.match(text,/万能/);
  if(mode==='daily'){assert.match(text,/加急.*不是秒/);assert.match(text,/清扫二选一/);assert.doesNotMatch(text,/旋转改朝向|最多带2种工具/);}else{assert.doesNotMatch(text,/加急|清扫|废物|废弃/);assert.match(text,/旋转改朝向/);}
 }
});
