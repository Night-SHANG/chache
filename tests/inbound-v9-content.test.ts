import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES_V9, RULES_V9_CONFIG, getStageV9, validToolChargesV9 } from '../src/domain/v9/content.ts';

test('v9 content pins ten types, twenty levels, seven functional upgrades and unlocks',()=>{
  assert.equal(UPGRADES_V9.length,10);
  assert.equal(UPGRADES_V9.reduce((sum,u)=>sum+u.maxStack,0),20);
  assert.equal(UPGRADES_V9.filter(u=>u.functional).length,7);
  assert.deepEqual(UPGRADES_V9.map(u=>[u.id,u.maxStack,u.unlockOrders]),[
    ['candidate_slots',2,4],['warehouse_expand',1,12],['side_gate',1,8],
    ['small_parcels',2,4],['cargo_supply',2,4],['light_orders',1,4],
    ['pallet_rate',2,12],['order_bonus',3,4],['overfill_bonus',3,4],['chain_bonus',3,4],
  ]);
  assert.ok(Object.isFrozen(UPGRADES_V9)&&UPGRADES_V9.every(Object.isFrozen));
});
test('v9 stage and tuning remain fixed at stage five for long runs',()=>{
  assert.deepEqual([5,6,29,60].map(getStageV9),[1,2,5,5]);
  assert.deepEqual(RULES_V9_CONFIG.upgradeThresholds,[4,8,12,16,20,24,26]);
  assert.deepEqual(RULES_V9_CONFIG.orderMinByShift,[4,4,4,4,5]);
  assert.deepEqual(RULES_V9_CONFIG.orderMaxByShift,[4,5,5,6,7]);
  assert.deepEqual(RULES_V9_CONFIG.cargoByShift,[3,3,4,5,5]);
  assert.deepEqual(RULES_V9_CONFIG.docksByShift,[2,3,3,4,4]);
  assert.deepEqual(RULES_V9_CONFIG.toolPrices,{rotate:80,clear:120,wildcard:160});
  assert.ok(Object.isFrozen(RULES_V9_CONFIG)&&Object.isFrozen(RULES_V9_CONFIG.upgradeThresholds));
});
test('tool charges allow at most two unique tools and forbid daily inventory',()=>{
  assert.ok(validToolChargesV9({rotate:1,clear:1,wildcard:0},'standard'));
  assert.ok(!validToolChargesV9({rotate:1,clear:1,wildcard:1},'endless'));
  assert.ok(!validToolChargesV9({rotate:2,clear:0,wildcard:0},'standard'));
  assert.ok(!validToolChargesV9({rotate:0,clear:1,wildcard:0},'daily'));
});
