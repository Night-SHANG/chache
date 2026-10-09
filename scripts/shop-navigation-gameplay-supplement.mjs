/** Bounded v22 gameplay regression supplement. All product changes use native pointers. */
import assert from 'node:assert/strict';
import {createPlayableRun,applyPlayableCommand,findPlayableMoves,playableChecksum} from '../src/domain/playable.ts';
import {scaledScoreV18} from '../src/domain/v18/content.ts';
import {permanentRushFixtureStorage} from './host-permanent-rush.mjs';
import {physicalRect} from './refinement-host-support.mjs';
import {assertNoStorageChanges} from './dialog-feedback-host-protocol.mjs';
import {SHOP_NATIVE_VIEWPORTS} from './shop-navigation-host-protocol.mjs';
const snapshot=d=>({entries:[...d.h.storage].sort(([a],[b])=>a.localeCompare(b)),writeCount:d.h.operations.filter(row=>['set','remove'].includes(row.kind)).length});
const visible=(d,text)=>assert.ok(d.h.labels.some(row=>row.text===text),`Native gameplay text missing: ${text}`);
const pixel=(d,x,y)=>{const p=physicalRect(d.h,{x,y,w:0,h:0});return [...d.h.context.getImageData(Math.round(p.x),Math.round(p.y),1,1).data];};

/** Independent fixed inset contract plus actual native hit/cancel and pixels. */
export function probeNativeModeStartEdges(d){
 const rows=[],starts=d.controls().filter(c=>c.action.type==='newRun');assert.ok(starts.length===3||starts.length===4);
 for(const [index,c]of starts.entries()){
  const saved=snapshot(d),r=c.rect;assert.equal(r.x+r.w,910,'Both mode menus must end38 logical pixels before common card edge948');assert.equal(r.h,144);assert.equal(r.w,d.screen==='inboundMenu'?230:180);
  const button=pixel(d,r.x+r.w-32,r.y+22),inset=pixel(d,928,r.y+22);assert.notDeepEqual(button,inset,'Native button fill must stop before the card edge');
  for(const x of [r.x-2,r.x+r.w+2]){d.h.tap(x,r.y+r.h/2);d.frame(0);assert.ok(!d.h.labels.some(row=>row.text==='选择携带道具'),'Outside native start edge must not launch preparation');assertNoStorageChanges(saved,snapshot(d));}
  const point={x:index%2?r.x+r.w-2:r.x+2,y:r.y+r.h/2};d.action(c.action,{point});visible(d,'选择携带道具');assertNoStorageChanges(saved,snapshot(d));d.action({type:'back'});assertNoStorageChanges(saved,snapshot(d));
  rows.push({action:c.action,rect:r,insidePoint:point,outsidePoints:[r.x-2,r.x+r.w+2],buttonPixel:button,insetPixel:inset,inset:38});
 }
 return rows;
}

/** The pre-win geometry is constructed, not a naturally reached or replay-derived win. */
export function constructedFiveContinuation(tier){
 assert.ok(['hard','expert'].includes(tier));const spec={family:'inbound',mode:'standard',rulesetVersion:18,seed:17,guided:false,inboundDifficulty:tier,toolCharges:{rotate:0,clear:0,wildcard:0}},state=createPlayableRun(spec);
 state.completedOrders=29;state.shift=5;state.rawScore=5400;state.score=scaledScoreV18(state.rawScore,tier);state.candidates[0]={id:'boundary.last',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
 state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`boundary.order.${index}`,dockId,cargo:['cargo.food','cargo.machine','cargo.chem','cargo.electronic'][index],amount:index===0?4:6,baseScore:200}));for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const next={type:'place',pieceId:'boundary.last',origin:{x:4,y:1}},expected=applyPlayableCommand(state,next);assert.equal(expected.error,undefined);assert.equal(expected.state.result,'won');assert.equal(expected.state.endReason,'completed');
 const label=`CONSTRUCTED: valid rules18 ${tier} orders29/raw5400 near-win boundary; native last placement, five record and same-run overtime are observed. Not natural reachability or balance evidence.`;
 return {storage:permanentRushFixtureStorage(spec,[],{constructedState:state,label}),next,label,tier};
}
export async function runShopGameplaySupplement({mode,run,driver,capture}){
 await run('gameplay-launch-tools-resume',async()=>{
  const scenarios=[{name:'inbound-hard',family:'inbound',tier:'hard',mode:'standard',rules:18},{name:'inbound-expert',family:'inbound',tier:'expert',mode:'standard',rules:18},{name:'outbound-normal',family:'outbound',variant:'normal',rules:12},{name:'outbound-endless',family:'outbound',variant:'endless',rules:13},{name:'rush',family:'inbound',mode:'rush',rules:21}],rows=[];
  for(const scenario of scenarios){
   const d=await driver(undefined,{viewport:SHOP_NATIVE_VIEWPORTS[0]}),original=structuredClone(d.account());
   if(scenario.family==='inbound'){d.action({type:'chooseInbound'});if(scenario.tier)d.action({type:'selectInboundDifficulty',inboundDifficulty:scenario.tier});d.action({type:'newRun',mode:scenario.mode,...(scenario.tier?{inboundDifficulty:scenario.tier}:{})});}
   else{d.action({type:'chooseColorTier'});d.action({type:'selectOutboundMode',mode:scenario.variant});d.action({type:'newRun',mode:'color_exit',difficultyId:'hard',outboundMode:scenario.variant});}
   visible(d,'选择携带道具');d.action({type:'toggleItem',item:'clear'});d.action({type:'prepareNext'});assert.equal(d.account().run.identity.rulesetVersion,scenario.rules);assert.deepEqual(d.account().run.reserved,['clear']);assert.equal(d.account().inventory.clear,original.inventory.clear-1);assert.equal(d.state().toolCharges.clear,1);
   if(scenario.mode==='rush'){assert.equal(d.state().phase,'cleanup');assert.equal(d.state().commandIndex,0);await d.command({type:'chooseCleanup',branch:'placements'});assert.equal(d.state().cleanup.branch,'placements');assert.equal(d.state().inboundDifficulty,'normal');}
   assert.equal(d.state().phase,'input');if(scenario.tier)assert.equal(d.state().inboundDifficulty,scenario.tier);const identity=structuredClone(d.account().run.identity),move=findPlayableMoves(d.state()).find(candidate=>applyPlayableCommand(d.state(),{type:'place',...candidate}).state.board.some(Boolean));assert.ok(move,'At least one legal placement retains cargo for the native clear test');await d.command({type:'place',...move});
   const cell=d.state().board.findIndex(Boolean);assert.ok(cell>=0,'Actual first placement must supply a tool target');await d.command({type:'clear',cells:[cell]});assert.equal(d.state().toolCharges.clear,0);assert.ok(d.state().usedToolIds.includes('clear'));assert.ok(!d.account().run.reserved.includes('clear'));assert.equal(d.account().inventory.clear,original.inventory.clear-1);
   const checksum=playableChecksum(d.state()),history=structuredClone(d.account().run.history);d.pause();visible(d,'已暂停');d.action({type:'continue'});assert.equal(playableChecksum(d.state()),checksum);assert.deepEqual(d.account().run.identity,identity);assert.deepEqual(d.account().run.history,history);
   d.h.callbacks.hide();d.paused=true;d.h.callbacks.show();d.frame(0);visible(d,'已暂停');d.action({type:'continue'});assert.equal(playableChecksum(d.state()),checksum);assert.deepEqual(d.account().run.identity,identity);d.h.callbacks.hide();d.paused=true;d.frame(0);const stored=structuredClone(d.account());
   const reboot=await driver(new Map(d.h.storage),{viewport:SHOP_NATIVE_VIEWPORTS[0]});visible(reboot,'继续上次游戏？');reboot.resume();assert.deepEqual(reboot.account().run.identity,identity);assert.equal(playableChecksum(reboot.state()),checksum);assert.deepEqual(reboot.account().run.history,history);assert.deepEqual(reboot.account().inventory,stored.inventory);if(scenario.tier)assert.equal(reboot.state().inboundDifficulty,scenario.tier);await capture(reboot,`${mode}-${scenario.name}-native-tool-used-resumed`);
   rows.push({...scenario,identity,commandIndex:reboot.state().commandIndex,checksum,tool:'clear',consumedExactlyOnce:true,pauseContinue:true,hideShow:true,reloadResume:true,inventory:reboot.account().inventory});
  }return {rows,source:'Fresh actual UI starts; no active-state injection or fabricated gameplay path'};
 });
 await run('five-win-continue-endless',async()=>{
  const rows=[];for(const tier of ['hard','expert']){const fixture=constructedFiveContinuation(tier),d=await driver(fixture.storage,{viewport:SHOP_NATIVE_VIEWPORTS[0]});d.provenance=fixture.label;d.resume();const identity=structuredClone(d.account().run.identity);await d.command(fixture.next);assert.equal(d.state().result,'won');assert.equal(d.state().completedOrders,30);const key=`inbound.standard.v18.${tier}.plain`,five=structuredClone(d.account().profile.results[key]);assert.ok(five);assert.equal(five.wins,1);const before=structuredClone(d.state()),wallet=d.account().wallet;await capture(d,`${mode}-${tier}-constructed-five-native-win`);
   const expected=applyPlayableCommand(before,{type:'continueOvertime'});assert.equal(expected.error,undefined);d.action({type:'continueOvertime'});d.frame(0);assert.equal(playableChecksum(d.state()),playableChecksum(expected.state));assert.equal(d.state().overtime,true);assert.equal(d.state().mode,'standard');assert.equal(d.state().inboundDifficulty,tier);assert.deepEqual(d.account().run.identity,identity);assert.deepEqual(d.account().profile.results[key],five);assert.equal(d.account().wallet,wallet);
   const move=findPlayableMoves(d.state())[0];assert.ok(move);await d.command({type:'place',...move});assert.deepEqual(d.account().run.identity,identity);assert.deepEqual(d.account().profile.results[key],five);const checksum=playableChecksum(d.state());d.h.callbacks.hide();d.paused=true;d.frame(0);const restored=await driver(new Map(d.h.storage),{viewport:SHOP_NATIVE_VIEWPORTS[0]});restored.provenance=fixture.label;restored.resume();assert.equal(restored.state().overtime,true);assert.equal(restored.state().inboundDifficulty,tier);assert.equal(playableChecksum(restored.state()),checksum);assert.deepEqual(restored.account().run.identity,identity);assert.deepEqual(restored.account().profile.results[key],five);await capture(restored,`${mode}-${tier}-same-run-overtime-restored`);rows.push({tier,provenance:fixture.label,identity,fiveRecord:five,overtime:true,checksum,reloadIdentityRetained:true,continuationCost:0});
  }return {rows,constructed:true,naturalWinClaim:false};
 });
}
