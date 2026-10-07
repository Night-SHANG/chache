import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableRun,applyPlayableCommand,type RunSpec} from '../src/domain/playable.ts';
import {assertGameRun,decodeGameRun,encodeGameRun} from '../src/application/game-codec.ts';
import type {InboundRunV11} from '../src/domain/v11/types.ts';

const start=(seed=17,guided=false):InboundRunV11=>createPlayableRun({family:'inbound',rulesetVersion:11,seed,mode:'standard',guided,toolCharges:{rotate:0,clear:0,wildcard:0}} as RunSpec) as InboundRunV11;

test('rules11 starts a fixed seven-square warehouse with a pending cleanup and no upgrade abilities',()=>{
 const state=start();
 assert.equal(state.rulesetVersion,11);assert.equal(state.runConfigId,'run.inbound_v11');assert.equal(state.boardSize,7);
 assert.equal(state.board.length,49);assert.equal(state.phase,'cleanup');assert.equal(state.cleanup,null);assert.deepEqual(state.candidates,[]);
 assert.ok(Object.values(state.levels).every(level=>level===0));assert.equal(Object.keys(state.levels).length,10);
 assert.deepEqual([state.upgradeChoices,state.pendingThresholds,state.claimedThresholds],[[],[],[]]);assert.equal(state.supplyCargo,null);
 const next=applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'});
 assert.equal(next.error,undefined);assert.equal(next.state.commandIndex,1);assert.equal(next.state.candidates.length,3);
 assertGameRun(next.state);assert.deepEqual(decodeGameRun(encodeGameRun(next.state)),next.state);
});

test('rules11 restores three-unit first-stage orders across seeded actual starts',()=>{
 const amounts=new Set<number>();
 for(let seed=1;seed<=80;seed++)for(const order of start(seed).orders){assert.ok(order.amount>=3&&order.amount<=4);amounts.add(order.amount);}
 assert.deepEqual([...amounts].sort(),[3,4]);
});

test('rules11 rejects an upgrade command without changing state, history or random stream',()=>{
 const state=applyPlayableCommand(start(),{type:'chooseCleanup',branch:'orders'}).state;
 const before=JSON.stringify(state),result=applyPlayableCommand(state,{type:'upgrade',upgradeId:'candidate_slots'});
 assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);assert.equal(JSON.stringify(state),before);
});

test('all seven old reward milestones resolve directly without offers, gifted levels or extra candidate slots',()=>{
 for(const threshold of [4,8,12,16,20,24,26]){
  const state=applyPlayableCommand(start(),{type:'chooseCleanup',branch:'orders'}).state as InboundRunV11;
  state.completedOrders=threshold-1;state.shift=Math.min(5,Math.floor(state.completedOrders/6)+1) as InboundRunV11['shift'];
  state.orders=[{id:'order.milestone',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100}];
  for(const cell of [8,9,10])state.board[cell]='cargo.food';
  state.candidates[0]={id:'piece.milestone',shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0};
  const result=applyPlayableCommand(state,{type:'place',pieceId:'piece.milestone',origin:{x:6,y:6}});
  assert.equal(result.error,undefined);const next=result.state as InboundRunV11;
  assert.equal(next.completedOrders,threshold);assert.equal(next.phase,'input');assert.equal(next.boardSize,7);assert.equal(next.candidates.length,3);
  assert.ok(Object.values(next.levels).every(level=>level===0));assert.deepEqual([next.upgradeChoices,next.pendingThresholds,next.claimedThresholds],[[],[],[]]);
  assert.ok(result.events.every(event=>event.type!=='upgrade'&&event.type!=='upgradeChosen'));
 }
});
