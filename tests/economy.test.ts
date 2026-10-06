import test from 'node:test';
import assert from 'node:assert/strict';
import { baseCoins, dailyAward, ITEM_PRICES } from '../src/application/economy.ts';
import { awardsForAttempts } from './helpers/account-fixtures.ts';

test('coin formula respects score caps and thirty-unit milestones',()=>{
 assert.deepEqual([[10,3000],[30,10000],[30,30000],[60,20000]].map(([n,s])=>baseCoins('inbound',n,s)),[13,55,60,110]);
 assert.equal(baseCoins('outbound',30,2000),55);assert.equal(baseCoins('inbound',1,999999),1);
 assert.deepEqual([29,30,60].map(n=>baseCoins('inbound',n,0)),[29,45,90]);
 assert.deepEqual(ITEM_PRICES,{rotate:80,clear:120,wildcard:160});
});
test('daily bonuses pay only improvement and cap the shared day at 120',()=>{
 assert.deepEqual(awardsForAttempts([13,55,55]),[39,139,55]);
 assert.equal(dailyAward(100,{bestBase:55,paid:110}).extra,10);
 assert.equal(dailyAward(55,{bestBase:55,paid:110}).extra,0);
 assert.deepEqual(dailyAward(1,{bestBase:100,paid:120}),{extra:0,next:{bestBase:100,paid:120}});
});
test('invalid or overflowing economic values cannot be coerced into balances',()=>{
 for(const value of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>baseCoins('inbound',value,0));assert.throws(()=>baseCoins('outbound',1,value));assert.throws(()=>dailyAward(value,{bestBase:0,paid:0}));
 }
 assert.throws(()=>baseCoins('inbound',Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER));
 assert.throws(()=>dailyAward(1,{bestBase:0,paid:121}));
});
