import test from 'node:test';
import assert from 'node:assert/strict';
import {COSMETIC_PREVIEW_RECT,cosmeticShopPage,getShopControls} from '../src/presentation/economy-ui.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
const sections=['theme','cargo','forklift'] as const;

test('inline appearance keeps the original 816 by 232 preview banner',()=>{
 assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
});
test('three direct categories retain inline selection and explicit four-tile page controls',()=>{
 const {session:s}=sessionHost({wallet:3000});s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 assert.equal(s.view.shopSection,'theme');
 s.action({type:'selectShopSection',section:'cargo'});s.action({type:'previewCosmetic',kind:'cargo',id:'wood'});
 assert.equal(s.view.shopItemDetail,undefined);
 assert.deepEqual(getShopControls(s.view).filter(c=>c.action.type==='selectShopSection').map(c=>c.label),['场景','货箱','叉车']);
 assert.equal(getShopControls(s.view).filter(c=>c.action.type==='previewCosmetic').length,4);
 assert.deepEqual(getShopControls(s.view).find(c=>c.action.type==='selectCosmeticPage'&&c.action.page===1)?.rect,{x:708,y:1450,w:240,h:150});
 assert.equal(getShopControls(s.view).some(c=>['previewCosmeticSet','selectCosmeticSetPage','closeShopDetail','previewCosmeticSetMember'].includes(c.action.type)),false);
});
test('category counts and page totals match the reduced catalog, including the last partial forklift page',()=>{
 const {session:s}=sessionHost();s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 for(const section of sections){
  s.action({type:'selectShopSection',section});const pages=section==='forklift'?4:3,ids:string[]=[];
  for(let page=0;page<pages;page++){s.action({type:'selectCosmeticPage',page});const current=cosmeticShopPage(s.view);assert.equal(current.pages,pages);ids.push(...current.items.map(item=>item.id));}
  assert.equal(ids.length,section==='forklift'?14:12);assert.equal(new Set(ids).size,ids.length);
 }
});
test('page navigation cancels a pending old-page pointer in every category',()=>{
 for(const section of sections){
  const {session:s}=sessionHost();s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectShopSection',section});
  const old=getShopControls(s.view).find(c=>c.action.type==='previewCosmetic')!;
  const point={x:old.rect.x+old.rect.w/2,y:old.rect.y+old.rect.h/2};s.input.down(point,7);
  s.action({type:'selectCosmeticPage',page:1});const before=structuredClone(s.view);s.input.up(point,7);assert.deepEqual(s.view,before);
 }
});
