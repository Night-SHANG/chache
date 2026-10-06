import test from 'node:test';
import assert from 'node:assert/strict';
import { makeV9Fixture } from './helpers/v9-fixtures.ts';
import { UPGRADES_V9 } from '../src/domain/v9/content.ts';
import { eligibleUpgradesV9,enqueueThresholdsV9,generateOfferV9,chooseUpgradeV9,reducedOrderAmountV9,shipmentBonusV9 } from '../src/domain/v9/upgrades.ts';
const offered=(id:'candidate_slots'|'light_orders'|'side_gate'|'cargo_supply')=>makeV9Fixture({completedOrders:12,pendingThresholds:[12],upgradeChoices:[id,'order_bonus','small_parcels'],phase:'upgrade'});
test('earned threshold queues are ordered, distinct, and exclude already claimed rewards',()=>{
 const s=makeV9Fixture({completedOrders:27});assert.deepEqual(enqueueThresholdsV9(s,23).pendingThresholds,[24,26]);
 s.claimedThresholds=[24];assert.deepEqual(enqueueThresholdsV9(s,23).pendingThresholds,[26]);assert.deepEqual(enqueueThresholdsV9(makeV9Fixture({completedOrders:60,claimedThresholds:[4,8,12,16,20,24,26]}),29).pendingThresholds,[]);
});
test('offers persist unchanged and always contain three unique types with two functional types',()=>{
 for(const mode of ['standard','daily','endless'] as const){const s=generateOfferV9(makeV9Fixture({mode,completedOrders:4,pendingThresholds:[4]}));assert.equal(s.upgradeChoices.length,3);assert.equal(new Set(s.upgradeChoices).size,3);assert.ok(s.upgradeChoices.filter(id=>UPGRADES_V9.find(u=>u.id===id)!.functional).length>=2);assert.deepEqual(generateOfferV9(s),s);
 s.levels.small_parcels=2;s.levels.cargo_supply=2;assert.ok(!eligibleUpgradesV9(s).includes('small_parcels'));assert.ok(eligibleUpgradesV9(s).includes('light_orders'));}
});
test('every reachable seven-choice level sequence retains offer capacity via real eligibility',()=>{
 const seen=new Set<string>();function visit(s:ReturnType<typeof makeV9Fixture>,depth:number){if(depth===7)return;const key=Object.values(s.levels).join(',')+':'+depth;if(seen.has(key))return;seen.add(key);s.completedOrders=[4,8,12,16,20,24,26][depth];const ids=eligibleUpgradesV9(s);assert.ok(ids.length>=3);assert.ok(ids.filter(id=>UPGRADES_V9.find(u=>u.id===id)!.functional).length>=2);for(const id of ids){const next=structuredClone(s);next.levels[id]++;visit(next,depth+1);}}
 visit(makeV9Fixture(),0);assert.ok(seen.size>1000);
});
test('supply requires unlocked first cargo and locks later levels; each reward is recorded once',()=>{
 const s=offered('cargo_supply');assert.equal(chooseUpgradeV9(s,'cargo_supply').state,s);assert.equal(chooseUpgradeV9(s,'cargo_supply','cargo.cold').state,s);
 const first=chooseUpgradeV9(s,'cargo_supply','cargo.food').state;assert.equal(first.supplyCargo,'cargo.food');assert.equal(first.levels.cargo_supply,1);assert.deepEqual(first.claimedThresholds,[12]);
 first.pendingThresholds=[16];first.upgradeChoices=['cargo_supply','order_bonus','small_parcels'];first.phase='upgrade';first.completedOrders=16;
 assert.ok(chooseUpgradeV9(first,'cargo_supply','cargo.machine').error);assert.equal(chooseUpgradeV9(first,'cargo_supply').state.supplyCargo,'cargo.food');
});
test('candidate grant preserves old slots, grows 3→4→5 and pending offer uses updated levels',()=>{
 const s=offered('candidate_slots');s.candidates=[s.candidates[0],{...s.candidates[0],id:'b'},{...s.candidates[0],id:'c'}];s.pendingThresholds=[12,16];
 const next=chooseUpgradeV9(s,'candidate_slots').state;assert.equal(next.candidates.length,4);assert.deepEqual(next.candidates.slice(0,3),s.candidates);assert.deepEqual(next.pendingThresholds,[16]);assert.equal(next.upgradeChoices.length,3);
 next.upgradeChoices=['candidate_slots','order_bonus','small_parcels'];const last=chooseUpgradeV9(next,'candidate_slots').state;assert.equal(last.candidates.length,5);assert.deepEqual(last.candidates.slice(0,4),next.candidates);
});
test('light orders and gate apply immediate non-shipping effects and bonuses remain additive',()=>{
 assert.deepEqual([2,3,4,7].map(n=>reducedOrderAmountV9(n,1)),[2,3,3,6]);const s=offered('light_orders');const reduced=chooseUpgradeV9(s,'light_orders');assert.equal(reduced.state.orders[0].amount,3);assert.ok(!reduced.events.some(e=>e.type==='shipment'));
 const gate=offered('side_gate');gate.board[42]='cargo.food';const opened=chooseUpgradeV9(gate,'side_gate');assert.equal(opened.state.board[42],null);assert.equal(opened.state.score,0);
 const bonus=makeV9Fixture();bonus.levels.order_bonus=1;bonus.levels.overfill_bonus=1;bonus.levels.chain_bonus=1;assert.equal(shipmentBonusV9(bonus,6,4,2),170);assert.equal(Math.floor((100+24+10)*1.25)+shipmentBonusV9(bonus,6,4,2),337);
 bonus.levels.order_bonus=0;bonus.levels.overfill_bonus=0;assert.equal(shipmentBonusV9(bonus,4,4,2)+shipmentBonusV9(bonus,4,4,3),200);
});
