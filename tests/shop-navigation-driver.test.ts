import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseShopDriver} from './helpers/shop-navigation-driver-harness.mjs';
for(const scenario of ['root','items','sets','scroll','transactions','classic'])test(`v24 paginated native-driver pointer intent agrees with real source session: ${scenario}`,()=>{
 const result=exerciseShopDriver(scenario);assert.equal(result.status,'PASS');assert.equal(result.nativeAcceptance,false,'Driver preparation tests must not claim frozen game.js acceptance');
});
