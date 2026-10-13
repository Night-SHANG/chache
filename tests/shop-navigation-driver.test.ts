import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseShopDriver} from './helpers/shop-navigation-driver-harness.mjs';
for(const scenario of ['root','items','retired-sets','scroll','transactions','root-reset'])test(`current three-category native-driver pointer intent agrees with real source session: ${scenario}`,()=>{
 const result=exerciseShopDriver(scenario);assert.equal(result.status,'PASS');assert.equal(result.nativeAcceptance,false,'Driver preparation tests must not claim frozen game.js acceptance');
});
