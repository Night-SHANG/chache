import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunV9, applyCommandV9 } from '../src/domain/v9/engine.ts';
import { RULES_V9_CONFIG, emptyLevelsV9 } from '../src/domain/v9/content.ts';
import { refreshOrdersV9 } from '../src/domain/v9/generation.ts';
import { assertGameRun } from '../src/application/game-codec.ts';
import { baseCoins } from '../src/application/economy.ts';

/** Reachability bound for frozen v9, not a general statement about future rules:
 * the last threshold is 26; a placement resolves only its <=4 existing orders.
 * While 26 is unclaimed, the placement must begin at <=25, and hence ends <=29.
 * Upgrade phase then rejects another placement until all thresholds are claimed. */
test('legacy daily9 cannot reach thirty while its last upgrade is still pending',()=>{
 const lastThreshold=Math.max(...RULES_V9_CONFIG.upgradeThresholds),maxOrders=Math.max(...RULES_V9_CONFIG.docksByShift);
 assert.equal(lastThreshold,26);assert.equal(maxOrders,4);assert.equal(lastThreshold-1+maxOrders,29);
 let state=applyCommandV9(createRunV9({seed:17,mode:'daily'}),{type:'chooseCleanup',branch:'orders'}).state;
 state={...state,completedOrders:25,shift:5,levels:{...emptyLevelsV9(),side_gate:1,small_parcels:2,light_orders:1,pallet_rate:2},claimedThresholds:[4,8,12,16,20,24],pendingThresholds:[],orders:[]};
 state=refreshOrdersV9(state);assert.equal(state.orders.length,4);
 const groups=[[0,1,7],[5,6,13],[35,42,43],[41,47,48]];
 state.orders=state.orders.map((order,index)=>{for(const cell of groups[index])state.board[cell]=order.cargo;return {...order,amount:3};});
 state.candidates[0]={id:state.candidates[0].id,cargo:'cargo.food',shapeId:'shape.single',quarterTurns:0};
 assertGameRun(state);
 const moved=applyCommandV9(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:3,y:3}});
 assert.equal(moved.error,undefined);assert.equal(moved.events.filter(event=>event.type==='shipment').length,4);
 assert.equal(moved.state.completedOrders,29);assert.equal(moved.state.phase,'upgrade');assert.deepEqual(moved.state.pendingThresholds,[26]);assertGameRun(moved.state);
 const blocked=applyCommandV9(moved.state,{type:'place',pieceId:moved.state.candidates[0].id,origin:{x:0,y:0}});
 assert.ok(blocked.error);assert.deepEqual(blocked.state,moved.state);
 const upgrade=moved.state.upgradeChoices.find(choice=>choice!=='cargo_supply')!;
 const chosen=applyCommandV9(moved.state,{type:'upgrade',upgradeId:upgrade});assert.equal(chosen.error,undefined);
 assert.equal(chosen.state.phase,'input');assert.deepEqual(chosen.state.pendingThresholds,[]);assert.equal(chosen.state.completedOrders,29);
});

test('frozen daily economy has disjoint failed and won base ranges',()=>{
 for(let orders=0;orders<30;orders++)assert.ok(baseCoins('inbound',orders,Number.MAX_SAFE_INTEGER,1)<=43);
 assert.equal(baseCoins('inbound',29,Number.MAX_SAFE_INTEGER,1),43);
 assert.equal(baseCoins('inbound',30,0,1),45);
});
