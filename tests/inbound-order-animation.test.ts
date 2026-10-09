import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createRunV18,applyCommandV18,findLegalMovesV18,previewPlacementV18} from '../src/domain/v18/engine.ts';
import {checksumV18} from '../src/domain/v18/replay.ts';
import type {InboundRunV18} from '../src/domain/v18/types.ts';
import type {GameRun,InboundRun} from '../src/domain/playable.ts';
import {createRun,applyCommand} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import {GameSession} from '../src/application/session.ts';
import {storeLegacyRun} from './helpers/legacy-session-fixtures.ts';
import {legacyState} from './helpers/session-fixtures.ts';
import {createRunV21,applyCommandV21,findLegalMovesV21} from '../src/domain/v21/engine.ts';
import {checksumV21} from '../src/domain/v21/replay.ts';
import {makeV9Fixture} from './helpers/v9-fixtures.ts';
import {applyCommandV9} from '../src/domain/v9/engine.ts';
import {shipmentGate,shipmentTiming} from '../src/presentation/motion.ts';
import {orderPresentation} from '../src/presentation/order-presentation.ts';
import {CARGO,DOCKS} from '../src/domain/content.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {render} from '../src/presentation/renderer.ts';
import {orderFeedback} from '../src/presentation/order-feedback.ts';
import {makeAccountRun} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';

function host(state:InboundRun){
 state.runSerial=1;
 const run=makeAccountRun({state,identity:{runId:'test.order-animation',serial:1,rulesetVersion:state.rulesetVersion,...('inboundDifficulty' in state?{inboundDifficulty:state.inboundDifficulty}:{}),runConfigId:state.runConfigId,mode:state.mode,economyVersion:state.rulesetVersion>=12?2:1},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands}});
 const h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});h.session.resume();
 assert.equal(h.session.view.accountBlocked,false,h.session.view.saveStatus);
 let now=0;
 return {...h,advance:(ms=1000)=>{now+=ms;h.time(now);h.session.tick(now);}};
}
function natural(stepCount=17){
 const h=host(createRunV18({seed:75,mode:'standard',inboundDifficulty:'hard'}));
 let before=h.session.state as InboundRunV18;
 for(let step=1;step<=stepCount;step++){
  before=h.session.state as InboundRunV18;
  const command={type:'place' as const,...findLegalMovesV18(before)[0]},expected=applyCommandV18(before,command);
  assert.equal(expected.error,undefined);h.session.dispatch(command);
  assert.equal(checksumV18(h.session.state as InboundRunV18),checksumV18(expected.state));
  if(step<stepCount)while(h.session.view.animation)h.advance();
 }
 return {...h,before};
}
function frame(state:GameRun,view:ViewState){
 const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),labels:{text:string;x:number;y:number}[]=[],fill=ctx.fillText.bind(ctx);
 ctx.fillText=(text,x,y)=>{if(y>=357&&y<=492)labels.push({text,x,y});fill(text,x,y);};
 render(ctx as unknown as CanvasRenderingContext2D,state,view);
 const pixel=(x:number,y:number)=>Array.from(ctx.getImageData(x,y,1,1).data);
 return {labels:labels.map(item=>item.text),cards:[pixel(60,400),pixel(554,400)],gates:{north:pixel(560,537),east:pixel(997,1000)}};
}
function readyPair(seed=1){
 const state=createRunV18({seed,mode:'standard',inboundDifficulty:'hard'});
 state.orders[0]={...state.orders[0],cargo:'cargo.food',amount:4};
 state.orders[1]={...state.orders[1],cargo:'cargo.chem',amount:4};
 for(const cell of [7,8,9,10])state.board[cell]='cargo.food';
 for(const cell of [28,29,30,31])state.board[cell]='cargo.chem';
 state.candidates[0]={...state.candidates[0],cargo:'cargo.food',shapeId:'shape.single'};
 return state;
}
function placeCorner(h:ReturnType<typeof host>){
 const before=h.session.state as InboundRunV18,command={type:'place' as const,pieceId:before.candidates[0].id,origin:{x:6,y:6}};
 const expected=applyCommandV18(before,command);assert.equal(expected.error,undefined);
 h.session.dispatch(command);assert.equal(checksumV18(h.session.state as InboundRunV18),checksumV18(expected.state));
 return expected.events.filter(event=>event.type==='shipment');
}

// Mutation target: reading final refreshed orders against an earlier wave's board.
test('natural seed75 preserves exact old slots east then north until both waves end',()=>{
 const h=natural(),{session:s}=h,committed=checksumV18(s.state as InboundRunV18);
 assert.equal(committed,'31c7e4cc');assert.equal(s.state.completedOrders,5);
 assert.deepEqual(h.before.orders.map(order=>order.id),['order.10','order.23']);
 assert.deepEqual(s.state.orders.map(order=>order.id),['order.25','order.26']);
 for(const [index,id] of ['order.23','order.10'].entries()){
  const animation=s.view.animation!;assert.equal(animation.shipment.orderId,id);
  assert.deepEqual(animation.orders,h.before.orders);
  assert.deepEqual(animation.completedOrderIds,index?['order.23']:[]);
  assert.equal(orderFeedback(s.state,h.before.orders[index?0:1],s.view).shipping?.orderId,id);
  assert.equal(orderFeedback(s.state,s.state.orders[index?0:1],s.view).shipping,undefined,'a refreshed same-dock order never owns the old shipment');
  if(!index)assert.equal(orderFeedback(s.state,h.before.orders[0],s.view).status.status,'blocked');
  else assert.equal(orderFeedback(s.state,h.before.orders[1],s.view).label,'已出货');
  assert.equal(checksumV18(s.state as InboundRunV18),committed);h.advance();
 }
 assert.equal(s.view.animation,null);assert.equal(checksumV18(s.state as InboundRunV18),committed);
 assert.deepEqual(s.state.orders.map(order=>order.cargo),['cargo.machine','cargo.chem']);
});

// Mutation targets: all-ready bright panels, swapped labels, and final-state gate colors.
test('natural seed75 Canvas keeps old cargo labels, one strong active card and matching gate colors',()=>{
 const h=natural(),s=h.session;
 const first=frame(s.state,s.view);
 assert.deepEqual(first.labels.filter(label=>['机械','化工'].includes(label)),['化工','机械']);
 assert.ok(first.labels.includes('叉车接货中 · +247'));
 assert.notDeepEqual(first.cards[0],first.cards[1]);
 assert.deepEqual(first.gates.north,[239,185,56,255]);assert.deepEqual(first.gates.east,[118,167,77,255]);
 h.advance();const second=frame(s.state,s.view);
 assert.deepEqual(second.labels.filter(label=>['机械','化工'].includes(label)),['化工','机械']);
 assert.ok(second.labels.includes('已出货'));assert.ok(second.labels.includes('叉车接货中 · +264'));
 assert.notDeepEqual(second.cards[0],second.cards[1]);assert.deepEqual(first.cards[1],second.cards[0]);
 assert.deepEqual(second.gates.north,[239,185,56,255]);assert.deepEqual(second.gates.east,[75,83,91,255]);
 h.advance();const final=frame(s.state,s.view);
 assert.deepEqual(final.labels.filter(label=>['机械','化工'].includes(label)),['机械','化工']);
 assert.deepEqual(final.gates.north,[118,167,77,255]);assert.deepEqual(final.gates.east,[239,185,56,255]);
 assert.equal(checksumV18(s.state as InboundRunV18),'31c7e4cc');
});

test('two truly ready old orders both complete while only the active panel is strongly green',()=>{
 const state=readyPair(),h=host(state),shipments=placeCorner(h),s=h.session;
 assert.deepEqual(shipments.map(event=>event.orderId),state.orders.map(order=>order.id));
 assert.equal(s.state.completedOrders,2);
 assert.equal(orderFeedback(s.state,state.orders[1],s.view).status.status,'ready');
 assert.equal(orderFeedback(s.state,state.orders[1],s.view).label,'待出货');
 assert.equal(orderFeedback(s.state,state.orders[1],s.view).shipping,undefined);
 const first=frame(s.state,s.view);assert.notDeepEqual(first.cards[0],first.cards[1]);
 h.advance();assert.equal(orderFeedback(s.state,state.orders[0],s.view).label,'已出货');
 assert.equal(orderFeedback(s.state,state.orders[1],s.view).shipping?.orderId,state.orders[1].id);
 h.advance();assert.equal(s.view.animation,null);assert.equal(s.state.completedOrders,2);
});

test('each wave owns independent old orders, completed IDs, queued IDs, boards and traits',()=>{
 const state=readyPair();state.cellTraits[7]={kind:'pallet'};state.cellTraits[10]={kind:'wildcard'};state.cellTraits[28]={kind:'hazard'};
 const h=host(state);placeCorner(h);const first=h.session.view.animation!;
 assert.deepEqual(first.orders,state.orders);assert.notEqual(first.orders,state.orders);assert.notEqual(first.orders![0],state.orders[0]);
 assert.deepEqual(first.queuedOrderIds,state.orders.map(order=>order.id));
 h.advance();const second=h.session.view.animation!;
 assert.notEqual(first.orders,second.orders);assert.notEqual(first.orders![0],second.orders![0]);
 assert.notEqual(first.completedOrderIds,second.completedOrderIds);assert.notEqual(first.queuedOrderIds,second.queuedOrderIds);
 assert.notEqual(first.board,second.board);assert.notEqual(first.cellTraits,second.cellTraits);assert.notEqual(first.cellTraits![28],second.cellTraits![28]);
 assert.equal(first.board[7],'cargo.food');assert.deepEqual(first.cellTraits![7],{kind:'pallet'});
 assert.equal(second.board[7],null);assert.equal(second.cellTraits![7],null);
 assert.equal(first.completedOrderIds!.length,0);assert.deepEqual(second.completedOrderIds,[state.orders[0].id]);
 assert.deepEqual(second.queuedOrderIds,[state.orders[1].id]);
 const committed=checksumV18(h.session.state as InboundRunV18);
 first.orders![0].cargo='cargo.cold';first.completedOrderIds!.push('external');first.queuedOrderIds!.length=0;first.cellTraits![28]!.kind='pallet';
 assert.equal(second.orders![0].cargo,'cargo.food');assert.deepEqual(second.completedOrderIds,[state.orders[0].id]);
 assert.deepEqual(second.cellTraits![28],{kind:'hazard'});assert.equal(checksumV18(h.session.state as InboundRunV18),committed);
});

test('same-cargo replacement still waits for the batch to end before taking the old slot',()=>{
 const state=readyPair(5),h=host(state);placeCorner(h);const s=h.session;
 assert.deepEqual(s.state.orders.map(order=>order.cargo),state.orders.map(order=>order.cargo));
 assert.notDeepEqual(s.state.orders.map(order=>order.id),state.orders.map(order=>order.id));
 h.advance();assert.deepEqual(orderPresentation(s.state,s.view).orders,state.orders);
 assert.equal(orderFeedback(s.state,state.orders[0],s.view).label,'已出货');
 assert.equal(orderFeedback(s.state,s.state.orders[1],s.view).shipping,undefined);
 h.advance();assert.deepEqual(orderPresentation(s.state,s.view).orders,s.state.orders);
});

for(const count of [3,4])test(`${count} old cards retain their original positions across every legitimate shipment`,()=>{
 const state=readyPair();state.completedOrders=count===3?12:18;state.shift=count===3?3:4;
 state.board.fill(null);state.orders=Array.from({length:count},(_,i)=>({id:`order.old.${i}`,dockId:DOCKS[i].id,cargo:CARGO[i].id,amount:4,baseScore:100}));
 const groups=[[7,8,9,10],[12,13,19,20],[28,29,35,36],[32,33,39,40]];
 state.orders.forEach((order,i)=>groups[i].forEach(cell=>state.board[cell]=order.cargo));
 const h=host(state),shipments=placeCorner(h),s=h.session;
 assert.equal(shipments.length,count);assert.equal(s.state.completedOrders,state.completedOrders+count);
 for(let i=0;i<count;i++){
  assert.deepEqual(orderPresentation(s.state,s.view).orders,state.orders);
  assert.deepEqual(s.view.animation!.completedOrderIds,shipments.slice(0,i).map(event=>event.orderId));
  const cards=state.orders.map(order=>orderFeedback(s.state,order,s.view));
  assert.equal(cards.filter(card=>card.shipping).length,1);assert.equal(cards.filter(card=>card.label==='已出货').length,i);
  const drawn=frame(s.state,s.view);assert.equal(drawn.labels.filter(label=>label.includes('叉车接货中')).length,1);
  h.advance();
 }
 assert.equal(s.view.animation,null);assert.equal(orderPresentation(s.state,s.view).orders.length,count);
});

test('cross-stage new gate and order stay hidden until the old batch finishes',()=>{
 const state=readyPair();state.completedOrders=5;state.shift=1;
 const h=host(state);placeCorner(h);const s=h.session;
 assert.equal(s.state.shift,2);assert.equal(s.state.orders.length,3);
 for(let i=0;i<2;i++){
  const visible=orderPresentation(s.state,s.view);assert.equal(visible.orders.length,2);
  assert.equal(visible.gates.some(gate=>gate.dockId==='dock.south'),false);h.advance();
 }
 assert.equal(orderPresentation(s.state,s.view).orders.length,3);
 assert.ok(orderPresentation(s.state,s.view).gates.some(gate=>gate.dockId==='dock.south'));
});

test('last winning shipment keeps its old card and colored door even when final orders are empty',()=>{
 const state=readyPair();state.completedOrders=26;state.shift=5;state.board.fill(null);
 state.orders=Array.from({length:4},(_,i)=>({id:`order.old.${i}`,dockId:DOCKS[i].id,cargo:CARGO[i].id,amount:4,baseScore:100}));
 const groups=[[7,8,9,10],[12,13,19,20],[28,29,35,36],[32,33,39,40]];
 state.orders.forEach((order,i)=>groups[i].forEach(cell=>state.board[cell]=order.cargo));
 const h=host(state);placeCorner(h);const s=h.session;
 assert.equal(s.state.result,'won');assert.deepEqual(s.state.orders,[]);
 assert.deepEqual(orderPresentation(s.state,s.view).orders,state.orders);
 assert.equal(orderFeedback(s.state,state.orders[0],s.view).shipping?.orderId,state.orders[0].id);
 const drawn=frame(s.state,s.view);assert.ok(drawn.labels.includes('食品'));assert.deepEqual(drawn.gates.north,[233,88,75,255]);
 h.advance();h.advance();h.advance();
 assert.equal(s.view.animation!.shipment.orderId,state.orders[3].id);assert.equal(orderPresentation(s.state,s.view).orders.length,4);
 assert.deepEqual(orderPresentation(s.state,s.view).gates,[{dockId:'dock.west',cargo:'cargo.electronic'}]);
 h.advance();assert.equal(s.view.animation,null);assert.deepEqual(orderPresentation(s.state,s.view).orders,[]);
});

test('natural refreshed-ready order waits for another legal move, with exact-ID preview',()=>{
 const h=natural(16),s=h.session;while(s.view.animation)h.advance();
 const state=s.state as InboundRunV18,order=state.orders.find(order=>order.id==='order.23')!,committed=checksumV18(state);
 assert.ok(order);assert.equal(orderFeedback(state,order,s.view).label,'已就绪 · 等待放置');
 const invalid={type:'place' as const,pieceId:state.candidates[0].id,origin:{x:1,y:0}};
 assert.ok(applyCommandV18(state,invalid).error);s.dispatch(invalid);
 assert.equal(s.view.animation,null);assert.equal(checksumV18(s.state as InboundRunV18),committed);
 const move=findLegalMovesV18(state)[0],preview=previewPlacementV18(state,move.pieceId,move.origin);
 s.view.preview=preview;assert.deepEqual(preview.shipments.map(event=>event.orderId),['order.23','order.10']);
 assert.equal(orderFeedback(state,order,s.view).previewShipment?.orderId,order.id);
 assert.equal(orderFeedback(state,{...order,id:'unrelated.same.cargo'},s.view).previewShipment,undefined);
 s.dispatch({type:'place',...move});assert.equal((s.view as ViewState).animation?.shipment.orderId,'order.23');assert.equal(s.view.preview,null);
});

for(const reduced of [false,true])test(`order snapshots use the unchanged ${reduced?'80':'1000'}ms shipment duration`,()=>{
 const h=host(readyPair());if(reduced)h.session.action({type:'toggleMotion'});placeCorner(h);
 const s=h.session,committed=checksumV18(s.state as InboundRunV18),duration=shipmentTiming(reduced).totalMs;
 const first=s.view.animation!.shipment.orderId;h.advance(duration-1);assert.equal(s.view.animation!.shipment.orderId,first);
 h.advance(1);assert.notEqual(s.view.animation!.shipment.orderId,first);assert.deepEqual(s.view.animation!.completedOrderIds,[first]);
 h.advance(duration-1);assert.ok(s.view.animation);h.advance(1);assert.equal(s.view.animation,null);
 assert.equal(checksumV18(s.state as InboundRunV18),committed);
 if(reduced)assert.equal(h.sounds.includes('forklift'),false);
});

for(const interruption of ['pause','settings','background'] as const)test(`${interruption} discards both wave contexts and resume restores only committed orders`,()=>{
 const h=host(readyPair());placeCorner(h);const s=h.session;h.advance(700);
 const committed=checksumV18(s.state as InboundRunV18),orders=structuredClone(s.state.orders);
 if(interruption==='pause')s.togglePause();else if(interruption==='settings')s.action({type:'settings'});else s.hide();
 assert.equal(s.view.animation,null);assert.deepEqual(orderPresentation(s.state,s.view).orders,orders);
 const deliveries=h.sounds.filter(sound=>['ship','chain2'].includes(sound)).length;
 if(interruption==='settings')s.action({type:'back'});if(interruption==='background')s.show();s.resume();h.advance(9000);
 assert.equal(s.view.animation,null);assert.equal(h.sounds.filter(sound=>['ship','chain2'].includes(sound)).length,deliveries);
 assert.equal(checksumV18(s.state as InboundRunV18),committed);
 const restored=new GameSession(h.platform,{seed:1,mode:'standard'});restored.resume();
 assert.equal(restored.view.animation,null);assert.deepEqual(orderPresentation(restored.state,restored.view).orders,orders);
 assert.equal(checksumV18(restored.state as InboundRunV18),committed);
});

test('legacy Session also retains old exact IDs and side-gate path through refresh',()=>{
 const state=createRun(1,'standard',3);state.upgrades=['upgrade.side_gate'];state.orders=[{...state.orders[0],cargo:'cargo.food',amount:3}];
 state.board.fill(null);for(const cell of [35,36,37])state.board[cell]='cargo.food';state.board[3]='cargo.machine';
 state.candidates[0]={id:state.candidates[0].id,cargo:'cargo.chem',shapeId:'shape.single'};
 const h=sessionHost({},false);storeLegacyRun(h.data,state,true);const s=new GameSession(h.platform,{seed:1,mode:'standard'});s.resume();
 const command={type:'place' as const,pieceId:state.candidates[0].id,origin:{x:6,y:6}},expected=applyCommand(legacyState(s),command);
 assert.equal(expected.error,undefined);s.dispatch(command);assert.equal(checksum(legacyState(s)),checksum(expected.state));
 assert.deepEqual(s.view.animation!.orders,state.orders);assert.deepEqual(s.view.animation!.shipment.path[0],{x:0,y:6});
 assert.deepEqual(shipmentGate(s.view.animation!.shipment),{x:96,y:1340});
 assert.equal(orderFeedback(s.state,state.orders[0],s.view).shipping?.orderId,state.orders[0].id);
 const committed=checksum(legacyState(s));h.time(1000);s.tick(1000);assert.equal(s.view.animation,null);assert.equal(checksum(legacyState(s)),committed);
});

test('growth shipment keeps its explicit side gate and path instead of moving to its order Dock',()=>{
 const state=makeV9Fixture({completedOrders:8,shift:2,claimedThresholds:[4,8]});state.levels.side_gate=1;state.levels.small_parcels=1;
 state.orders.push({id:'order.extra',dockId:'dock.south',cargo:'cargo.machine',amount:4,baseScore:100});
 for(const cell of [35,36,37,38])state.board[cell]='cargo.food';
 const h=host(state),s=h.session,command={type:'place' as const,pieceId:state.candidates[0].id,origin:{x:6,y:6}},expected=applyCommandV9(state,command);
 assert.equal(expected.error,undefined);s.dispatch(command);const animation=s.view.animation!;
 assert.equal('gateId' in animation.shipment&&animation.shipment.gateId,'dock.side');assert.equal(animation.shipment.dockId,'dock.north');
 assert.deepEqual(animation.shipment.path[0],{x:0,y:6});assert.deepEqual(shipmentGate(animation.shipment),{x:96,y:1340});
 assert.deepEqual(animation.orders,state.orders);assert.ok(frame(s.state,s.view).labels.includes('食品'));
});

test('rush, pallet, wildcard, and hazard extras keep pre-wave traits separate from final expiry and cleanup',()=>{
 let state=applyCommandV21(createRunV21({seed:1,mode:'rush'}),{type:'chooseCleanup',branch:'placements'}).state;
 for(let i=0;i<3;i++)state=applyCommandV21(state,{type:'place',...findLegalMovesV21(state)[0]}).state;
 state.board.fill(null);state.cellTraits.fill(null);
 state.completedOrders=12;state.shift=3;state.successfulPlacements=3;state.cleanup={branch:'placements',progress:5};
 state.orders=[{...state.orders[0],cargo:'cargo.food',amount:4},{...state.orders[1],cargo:'cargo.chem',amount:4},{id:'order.extra',dockId:'dock.south',cargo:'cargo.electronic',amount:4,baseScore:100}];
 for(const cell of [7,8,9])state.board[cell]='cargo.food';state.cellTraits[7]={kind:'pallet'};state.board[9]='cargo.machine';state.cellTraits[9]={kind:'wildcard'};state.cellTraits[8]={kind:'hazard'};
 for(const cell of [28,29,30,31])state.board[cell]='cargo.chem';
 for(const cell of [0,16]){state.board[cell]='cargo.cold';state.cellTraits[cell]={kind:'waste'};}
 state.board[40]='cargo.cold';state.cellTraits[40]={kind:'rush',remaining:1,bornAtPlacement:1};
 state.candidates[0]={...state.candidates[0],shapeId:'shape.single',cargo:'cargo.food',trait:'rush',rushTurns:3};
 const h=host(state),s=h.session,command={type:'place' as const,pieceId:state.candidates[0].id,origin:{x:6,y:6}},expected=applyCommandV21(state,command);
 assert.equal(expected.error,undefined);s.dispatch(command);const first=s.view.animation!;
 const shipments=expected.events.filter(event=>event.type==='shipment');assert.equal(shipments.length,2);assert.deepEqual(shipments[0].extraClearedCells,[0]);
 assert.deepEqual(s.state.cellTraits![40],{kind:'waste'});assert.equal(s.state.board[16],null);
 assert.equal(orderFeedback(s.state,state.orders[0],s.view).status.count,4);assert.deepEqual(first.cellTraits![40],state.cellTraits[40]);assert.equal(first.cellTraits![48]!.remaining,3);
 h.advance();const second=s.view.animation!;assert.equal(second.board[0],null);assert.equal(second.cellTraits![0],null);assert.equal(second.board[16],'cargo.cold');
 assert.deepEqual(second.cellTraits![40],state.cellTraits[40]);assert.notEqual(first.cellTraits![40],second.cellTraits![40]);assert.deepEqual(second.orders,state.orders);
 assert.equal(checksumV21(s.state as typeof state),checksumV21(expected.state));h.advance();assert.equal(s.view.animation,null);
});
