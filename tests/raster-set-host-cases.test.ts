import test from 'node:test';
import assert from 'node:assert/strict';
import {runRasterSetCases,returnRasterSetListToFirstPage} from '../scripts/raster-set-host-runtime.mjs';
import {RASTER_PRIOR_CASES} from '../scripts/raster-art-host-protocol.mjs';

test('prepared package matrix retains thirteen prior shop cases and adds all ownership subsets and failure routes per policy',async()=>{
 for(const mode of ['free','paid']){
  const names:string[]=[];
  // Enumerate scenarios only. This focused test never executes a game.js package or claims native acceptance.
  await runRasterSetCases({mode,run:async(name:string)=>{names.push(name);}});
  assert.equal(new Set(names).size,names.length);
  const previous=RASTER_PRIOR_CASES[mode].filter(name=>name.startsWith(`${mode}-set-`));assert.equal(previous.length,13);
  for(const name of previous)assert.ok(names.includes(name),name);
  for(let mask=0;mask<8;mask++)assert.ok(names.includes(`${mode}-v021-bundle-all-fifteen-owned-subset-${mask.toString(2).padStart(3,'0')}`));
  for(const suffix of ['atomic-before-first-root-retry','atomic-before-mirror-root-retry','atomic-after-first-root-retry','atomic-after-mirror-root-retry','unknown-readback-same-receipt-repair','stale-quote-other-native-writer','insufficient-or-free-zero-wallet'])assert.ok(names.includes(`${mode}-v021-bundle-${suffix}`));
  assert.equal(names.length,28);
 }
});


test('archived v21 page-return protocol retains adjacent traversal without account writes',async()=>{
 const {sessionHost}=await import('./helpers/session-fixtures.ts');
 const {getShopControls}=await import('./helpers/archived-v021-economy-ui.ts');
 for(const start of [3,2,1,0]){
  const h=sessionHost({wallet:2000}),s=h.session; s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectCosmeticSetPage',page:start});
  const before=[...h.data],appearance=structuredClone(s.view.account?.profile.cosmetics),visited:number[]=[];h.storage.resetFault();
  const driver={get cosmeticSetPage(){return s.view.cosmeticSetPage;},action(action:{type:'selectCosmeticSetPage';page:number},options?:{disabled:boolean}){
   const control=getShopControls(s.view).find(row=>row.action.type===action.type&&row.action.page===action.page);assert.ok(control,`Actual adjacent set-page control ${action.page} must exist from ${s.view.cosmeticSetPage}`);assert.equal(!!control.disabled,!!options?.disabled);
   if(!options?.disabled){s.action(action);visited.push(action.page);}
  }};
  returnRasterSetListToFirstPage(driver);assert.equal(s.view.cosmeticSetPage,0);assert.deepEqual(visited,Array.from({length:start},(_,index)=>start-index-1));assert.deepEqual([...h.data],before);assert.deepEqual(s.view.account?.profile.cosmetics,appearance);assert.equal(h.storage.operations.some(row=>row.kind==='set'||row.kind==='remove'),false);
 }
});
