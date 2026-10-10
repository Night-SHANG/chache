import test from 'node:test';
import assert from 'node:assert/strict';
import {getShopControls} from '../src/presentation/economy-ui.ts';
import {COSMETIC_CATALOG,retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {SHOP_COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});
test('v24 every ordinary and set-member cosmetic state has Back left and primary right',()=>{
 for(const item of COSMETIC_CATALOG)for(const wallet of [0,9000])for(const owned of [false,true])for(const equipped of [false,true])for(const parent of [undefined,'cold_chain']){
  const account=retainAccountCosmetics(makeAccountFixture({wallet}));
  if(owned){account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics!,item.key])].sort();if(equipped&&!item.overlay)account.profile.cosmetics[item.kind]=item.id;}
  const controls=getShopControls(view({account,shopSection:item.kind,cosmeticPreview:{[item.kind]:item.id},cosmeticReturnSet:parent}));
  const back=controls.find(c=>c.action.type==='back')!,primary=controls.find(c=>c.buttonRole==='primary')!;
  assert.ok(back&&primary,item.key);assert.deepEqual(back.rect,{x:132,y:1640,w:264,h:150});assert.deepEqual(primary.rect,{x:420,y:1640,w:528,h:150});
  assert.ok(back.rect.x+back.rect.w<primary.rect.x);assert.equal(back.label,parent?'返回套装':'返回');
 }
});
test('v24 set and classic details keep Back left and primary right; lists never invent primary purchase',()=>{
 for(const set of SHOP_COSMETIC_SETS){
  const controls=getShopControls(view({shopSection:'sets',cosmeticSetPreview:set.id,account:retainAccountCosmetics(makeAccountFixture({wallet:9000}))}));
  const back=controls.find(c=>c.action.type==='closeShopDetail')!,primary=controls.find(c=>c.buttonRole==='primary')!;
  assert.deepEqual(back.rect,{x:132,y:1692,w:396,h:150});assert.deepEqual(primary.rect,{x:552,y:1692,w:396,h:150});
 }
 const controls=getShopControls(view({shopSection:'sets'}));assert.equal(controls.filter(c=>c.action.type==='back').length,1);assert.equal(controls.some(c=>c.buttonRole==='primary'),false);
});
