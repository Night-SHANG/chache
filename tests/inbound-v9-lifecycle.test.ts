import test from 'node:test';import assert from 'node:assert/strict';import {makeV9Fixture} from './helpers/v9-fixtures.ts';import {createRunV9,applyCommandV9,settlePhaseV9} from '../src/domain/v9/engine.ts';
test('pending rewards precede victory and blockage; expansion can rescue a full board',()=>{
 const s=makeV9Fixture({completedOrders:30,pendingThresholds:[26],phase:'upgrade',upgradeChoices:['warehouse_expand','order_bonus','small_parcels'],shift:5});s.board.fill('cargo.machine');const pending=settlePhaseV9(s);assert.equal(pending.result,null);assert.equal(pending.phase,'upgrade');const earned=applyCommandV9(s,{type:'upgrade',upgradeId:'warehouse_expand'}).state;assert.equal(earned.boardSize,8);assert.equal(earned.result,'won');assert.equal(earned.completedOrders,30);
 const pre=makeV9Fixture({completedOrders:27,pendingThresholds:[24,26],shift:5});pre.board.fill('cargo.machine');assert.equal(settlePhaseV9(pre).phase,'upgrade');
});
test('standard overtime preserves all identity, upgrades and held charges, daily cannot continue',()=>{
 const s=makeV9Fixture({phase:'result',result:'won',endReason:'completed',completedOrders:31,shift:5,toolCharges:{rotate:1,clear:0,wildcard:0}});s.levels.small_parcels=1;const r=applyCommandV9(s,{type:'continueOvertime'});assert.ok(!r.error);assert.equal(r.state.seed,s.seed);assert.equal(r.state.completedOrders,31);assert.deepEqual(r.state.levels,s.levels);assert.deepEqual(r.state.toolCharges,s.toolCharges);assert.ok(r.state.overtime);assert.ok(applyCommandV9({...s,mode:'daily'},{type:'continueOvertime'}).error);
 const finished=applyCommandV9(r.state,{type:'finish'}).state;assert.equal(finished.result,'won');assert.equal(finished.endReason,'retired');assert.ok(applyCommandV9(finished,{type:'finish'}).error);assert.ok(applyCommandV9(finished,{type:'place',pieceId:finished.candidates[0].id,origin:{x:0,y:0}}).error);
});
test('endless never wins at thirty; finish ends rescue exactly once and facts can overshoot thirty',()=>{
 const endless=settlePhaseV9(makeV9Fixture({mode:'endless',completedOrders:60,shift:5}));assert.equal(endless.result,null);const rescue=makeV9Fixture({phase:'rescue',toolCharges:{rotate:0,clear:1,wildcard:0}});const ended=applyCommandV9(rescue,{type:'finish'});assert.equal(ended.state.endReason,'retired');assert.ok(applyCommandV9(ended.state,{type:'clear',cells:[0]}).error);
 const s=makeV9Fixture({completedOrders:29,shift:5,claimedThresholds:[4,8,12,16,20,24,26]});s.orders=[{id:'a',dockId:'dock.north',cargo:'cargo.food',amount:3,baseScore:100},{id:'b',dockId:'dock.east',cargo:'cargo.machine',amount:3,baseScore:100}];for(const i of [8,9,10])s.board[i]='cargo.food';for(const i of [22,23,24])s.board[i]='cargo.machine';const r=applyCommandV9(s,{type:'place',pieceId:s.candidates[0].id,origin:{x:6,y:6}});assert.equal(r.state.completedOrders,31);assert.equal(r.state.result,'won');
});
test('guided stage two opens cleanup with no retrospective orders or placements',()=>{
 const s=createRunV9({seed:17,mode:'standard',guided:true});assert.equal(s.phase,'input');assert.equal(s.candidates.length,3);assert.equal(s.cleanup,null);const stage2=settlePhaseV9({...s,shift:2,completedOrders:6,successfulPlacements:10});assert.equal(stage2.phase,'cleanup');const chosen=applyCommandV9(stage2,{type:'chooseCleanup',branch:'placements'}).state;assert.equal(chosen.cleanup!.progress,0);assert.equal(chosen.successfulPlacements,10);assert.deepEqual(chosen.candidates,stage2.candidates);
});

test('finish cannot discard a cleanup or earned upgrade decision',()=>{
 for(const phase of ['cleanup','upgrade'] as const){const s=makeV9Fixture({phase,pendingThresholds:phase==='upgrade'?[4]:[],upgradeChoices:phase==='upgrade'?['small_parcels','candidate_slots','order_bonus']:[]});const r=applyCommandV9(s,{type:'finish'});assert.equal(r.state,s);assert.deepEqual(r.events,[]);assert.ok(r.error);}
});
test('direct domain creation rejects fractional, unsafe and out-of-supported-range seeds',()=>{
 for(const seed of [1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER,4294967296,-2147483649])assert.throws(()=>createRunV9({seed,mode:'standard'}));
 for(const seed of [-2147483648,2147483647,4294967295,0])assert.equal(createRunV9({seed,mode:'standard'}).seed,seed);
});
