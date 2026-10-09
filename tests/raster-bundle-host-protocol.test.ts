import test from 'node:test';
import assert from 'node:assert/strict';
import * as protocol from '../scripts/raster-art-host-protocol.mjs';
import {accountDigest,canonicalStringify} from '../src/application/history-store.ts';
const set={id:'forest_depot',theme:'forest_depot',cargo:'wood',forklift:'timber'};
const kinds=['theme','cargo','forklift'] as const;
const root=(mask:number)=>({generation:4,wallet:2000,inventory:{rotate:1,clear:0,wildcard:0},lastOperation:null as unknown,profile:{ownedCosmetics:['theme.day','cargo.classic','forklift.yellow',...kinds.filter((_,i)=>mask&(1<<i)).map(kind=>`${kind}.${set[kind]}`)].sort(),cosmetics:{theme:'day',cargo:'classic',forklift:'yellow'},cargoOutline:false}});

test('independent native bundle oracle covers all eight owned subsets and both compile policies',()=>{
 assert.equal(typeof protocol.rasterBundleQuote,'function','Native bundle pricing oracle is required');
 for(const mode of ['free','paid'])for(let mask=0;mask<8;mask++){
  const before=root(mask),missing=kinds.filter((_,i)=>!(mask&(1<<i))),original=missing.reduce((sum,kind)=>sum+{theme:900,cargo:300,forklift:600}[kind],0);
  assert.deepEqual(protocol.rasterBundleQuote(set,before,mode),{missingKeys:missing.map(kind=>`${kind}.${set[kind]}`),originalPrice:original,price:mode==='free'?0:Math.ceil(original*4/5)});
 }
});
test('native bundle receipt proves one generation, exact missing rights, price and unchanged unrelated state',()=>{
 assert.equal(typeof protocol.assertRasterBundleCommit,'function','Native bundle atomic receipt oracle is required');
 for(const mode of ['free','paid'])for(let mask=0;mask<7;mask++){
  const before=root(mask),quote=protocol.rasterBundleQuote(set,before,mode),after=structuredClone(before),operationId=`bundle.${mode}.${mask}`;
  after.generation++;after.wallet-=quote.price;after.profile.ownedCosmetics=[...new Set([...before.profile.ownedCosmetics,...quote.missingKeys])].sort();
  const request={type:'purchaseCosmeticSet',id:set.id,quotedKeys:quote.missingKeys,quotedPrice:quote.price,operationId};
  after.lastOperation={operationId,expectedGeneration:before.generation,committedGeneration:after.generation,requestDigest:accountDigest(canonicalStringify({request,expectedGeneration:before.generation}))};
  protocol.assertRasterBundleCommit(before,after,set,mode);
  for(const mutate of [(row:typeof after)=>row.generation++,(row:typeof after)=>row.wallet--,(row:typeof after)=>row.profile.ownedCosmetics.pop(),(row:typeof after)=>row.profile.cosmetics.cargo='wood',(row:typeof after)=>row.inventory.rotate++,(row:typeof after)=>row.lastOperation={...(row.lastOperation as object),requestDigest:'00000000'}]){
   const wrong=structuredClone(after);mutate(wrong);assert.throws(()=>protocol.assertRasterBundleCommit(before,wrong,set,mode));
  }
 }
});
test('fully owned bundle confirmation cannot manufacture a no-cost generation or receipt',()=>{
 assert.equal(typeof protocol.assertRasterBundleCommit,'function');
 const before=root(7);protocol.assertRasterBundleCommit(before,structuredClone(before),set,'paid');
 assert.throws(()=>protocol.assertRasterBundleCommit(before,{...before,generation:5},set,'paid'));
});


test('v021 acceptance retains all 106 prior native cases and refuses duplicate or dropped evidence',()=>{
 assert.equal(typeof protocol.assertRasterPriorCaseCoverage,'function');
 assert.deepEqual(Object.fromEntries(Object.entries(protocol.RASTER_PRIOR_CASES).map(([mode,names])=>[mode,names.length])),{free:87,paid:19});
 for(const mode of ['free','paid']){
  const cases=protocol.RASTER_PRIOR_CASES[mode].map(name=>({name,status:'PASS'}));
  assert.deepEqual(protocol.assertRasterPriorCaseCoverage(cases,mode),{retained:cases.length,added:0});
  assert.throws(()=>protocol.assertRasterPriorCaseCoverage(cases.slice(1),mode));
  assert.throws(()=>protocol.assertRasterPriorCaseCoverage([...cases,cases[0]],mode));
  assert.deepEqual(protocol.assertRasterPriorCaseCoverage([...cases,{name:'new-bundle-case',status:'PASS'}],mode),{retained:cases.length,added:1});
 }
});

test('protected original day and night native board pixels require exact v020 frozen hashes',()=>{
 assert.equal(typeof protocol.assertRasterProtectedBoardHash,'function');
 const hashes={day:{inbound:'e164af4f2966d62b4229cf22f17ab79b55a7db7254322d39d26a10558b34343f',outbound:'9e18577d548f6df1d0df4ec8e204fa31c4d12996858994ef9fac22e4f6c877d2'},night:{inbound:'1f0aa59c5ea4042de4959d3ba70dea47124e2a2cf1e05648f9ae31544991182b',outbound:'a0907dfdfd1850ea2067532abe64eb471505c3506a1c40793f6157f89b6aeae3'}};
 for(const [theme,rows] of Object.entries(hashes))for(const [family,hash] of Object.entries(rows)){
  protocol.assertRasterProtectedBoardHash(theme,family,hash);
  assert.throws(()=>protocol.assertRasterProtectedBoardHash(theme,family,'0'.repeat(64)));
 }
});
