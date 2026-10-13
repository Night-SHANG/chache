import test from 'node:test';
import assert from 'node:assert/strict';
import {getShopControls} from '../src/presentation/economy-ui.ts';
import {COSMETIC_CATALOG,retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {createProfile} from '../src/application/profile.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});
test('every inline cosmetic state, including a stale legacy return origin, has Back left and primary right',()=>{
 for(const item of COSMETIC_CATALOG)for(const wallet of [0,9000])for(const owned of [false,true])for(const equipped of [false,true])for(const parent of [undefined,'cold_chain']){
  const account=retainAccountCosmetics(makeAccountFixture({wallet}));
  if(owned){account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics!,item.key])].sort();if(equipped&&item.overlay)account.profile.cargoOutline=true;if(equipped&&!item.overlay)account.profile.cosmetics={...account.profile.cosmetics,[item.kind]:item.id};}
  const controls=getShopControls(view({account,shopSection:item.kind,cosmeticPreview:{[item.kind]:item.id},cosmeticReturnSet:parent}));
  const back=controls.find(c=>c.action.type==='back')!,primary=controls.find(c=>c.buttonRole==='primary')!;
  assert.ok(back&&primary,item.key);assert.deepEqual(back.rect,{x:132,y:1640,w:264,h:150});assert.deepEqual(primary.rect,{x:420,y:1640,w:528,h:150});
  assert.ok(back.rect.x+back.rect.w<primary.rect.x);assert.equal(back.label,'返回');
 }
});
test('stale set or classic detail state renders only the current inline category action and Back',()=>{
 for(const id of ['classic','cold_chain','harbor']){
  const controls=getShopControls(view({shopSection:'sets',cosmeticSetPreview:id,account:retainAccountCosmetics(makeAccountFixture({wallet:9000}))}));
  const back=controls.find(c=>c.action.type==='back')!,primary=controls.find(c=>c.buttonRole==='primary')!;
  assert.ok(back&&primary);assert.deepEqual(back.rect,{x:132,y:1640,w:264,h:150});assert.deepEqual(primary.rect,{x:420,y:1640,w:528,h:150});
  assert.deepEqual(primary.action,{type:'equipCosmetic',kind:'theme',id:'day'});
  assert.equal(controls.filter(c=>c.action.type==='previewCosmetic').length,4);
  assert.equal(controls.some(c=>['closeShopDetail','previewCosmeticSet','selectClassicSetVariant','purchaseCosmeticSet','equipCosmeticSet','equipClassicSet'].includes(c.action.type)),false);
 }
});
