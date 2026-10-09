import test from 'node:test';
import assert from 'node:assert/strict';
import {COSMETIC_PREVIEW_RECT,COSMETIC_SET_PREVIEW_RECT,cosmeticSetCardRect,cosmeticSetShopPage,getShopControls} from '../src/presentation/economy-ui.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

test('v23 restores v21 same-screen item banner and standard set preview geometry',()=>{
 assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
 assert.deepEqual(COSMETIC_SET_PREVIEW_RECT,{x:132,y:646,w:816,h:840});
});
test('v23 four direct tabs retain old inline item selection and explicit page controls',()=>{
 const {session:s}=sessionHost({wallet:3000});s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 assert.equal(getShopControls(s.view).filter(c=>c.action.type==='previewCosmeticSet').length,4);
 assert.ok(getShopControls(s.view).some(c=>c.action.type==='selectCosmeticSetPage'));
 s.action({type:'selectShopSection',section:'cargo'});s.action({type:'previewCosmetic',kind:'cargo',id:'wood'});
 assert.equal(s.view.shopItemDetail,undefined);
 assert.deepEqual(getShopControls(s.view).filter(c=>c.action.type==='selectShopSection').map(c=>c.label),['套装','场景','货箱','叉车']);
 assert.equal(getShopControls(s.view).filter(c=>c.action.type==='previewCosmetic').length,4);
 assert.deepEqual(getShopControls(s.view).find(c=>c.action.type==='selectCosmeticPage'&&c.action.page===1)?.rect,{x:708,y:1450,w:240,h:150});
});
test('v23 set member Back restores originating set and page after member page changes',()=>{
 const {session:s}=sessionHost({wallet:3000});s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectCosmeticSetPage',page:3});
 const set=cosmeticSetShopPage(s.view).items[0];s.action({type:'previewCosmeticSet',id:set.id});s.action({type:'previewCosmeticSetMember',kind:'cargo'});
 assert.equal(s.view.shopItemDetail,undefined);s.action({type:'selectCosmeticPage',page:0});s.action({type:'back'});
 assert.equal(s.view.cosmeticSetPreview,set.id);s.action({type:'closeCosmeticSet'});assert.equal(cosmeticSetShopPage(s.view).page,3);
});
test('v23 paginates all sixteen sets including classic in four old-size cards',()=>{
 const page=cosmeticSetShopPage({cosmeticSetPage:0} as ViewState);
 assert.equal(page.pages,4);assert.equal(page.items.length,4);assert.equal(page.items[0].id,'classic');
 assert.deepEqual(cosmeticSetCardRect(3),{x:552,y:1032,w:396,h:366});
 const ids=Array.from({length:page.pages},(_,cosmeticSetPage)=>cosmeticSetShopPage({cosmeticSetPage} as ViewState).items).flat().map(item=>item.id);
 assert.equal(ids.length,16);assert.equal(new Set(ids).size,16);
});
test('v23 page navigation cancels a pending old-page pointer in the same section',()=>{
 for(const section of ['sets','cargo'] as const){
  const {session:s}=sessionHost();s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectShopSection',section});
  const old=getShopControls(s.view).find(c=>c.action.type===(section==='sets'?'previewCosmeticSet':'previewCosmetic'))!;
  const point={x:old.rect.x+old.rect.w/2,y:old.rect.y+old.rect.h/2};s.input.down(point,7);
  s.action(section==='sets'?{type:'selectCosmeticSetPage',page:1}:{type:'selectCosmeticPage',page:1});
  const before=structuredClone(s.view);s.input.up(point,7);assert.deepEqual(s.view,before);
 }
});
