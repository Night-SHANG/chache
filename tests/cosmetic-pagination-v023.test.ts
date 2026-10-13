import {prepareViewArt} from './helpers/static-art-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {COSMETIC_PREVIEW_RECT,cosmeticShopPage,selectedShopCosmetic} from '../src/presentation/economy-ui.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {GameSession} from '../src/application/session.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import type {UiControl} from '../src/presentation/ui.ts';
import type {Rect} from '../src/presentation/layout.ts';

// These public-behavior regressions intentionally reject v22's six-card scrolling
// list and separate ordinary-item detail. Imports resolve after copying into tests/.
const kinds=['theme','cargo','forklift'] as const;
const sections=kinds;
const act=(s:GameSession,action:UiAction)=>s.action(action);
const controls=(s:GameSession)=>getUiControls(s.state,s.view);
const itemTiles=(s:GameSession)=>controls(s).filter(c=>c.action.type==='previewCosmetic');
const ids=(list:UiControl[])=>list.map(c=>'id' in c.action?c.action.id:undefined);
const center=(r:Rect)=>({x:r.x+r.w/2,y:r.y+r.h/2});
const disjoint=(a:Rect,b:Rect)=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;
function open(s:GameSession,section:typeof sections[number]='theme') {
 act(s,{type:'shop'});act(s,{type:'selectShopTab',tab:'cosmetics'});act(s,{type:'selectShopSection',section});
}
function find(s:GameSession,type:UiAction['type'],label?:string) {
 const control=controls(s).find(c=>c.action.type===type&&(!label||c.label===label));
 assert.ok(control,`missing ${type}${label?` / ${label}`:''}`);return control;
}
function capture(s:GameSession) {
 const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),labels:string[]=[],fill=ctx.fillText.bind(ctx);
 ctx.fillText=(value,x,y)=>{labels.push(value);fill(value,x,y);};
 render(ctx as unknown as CanvasRenderingContext2D,s.state,s.view);
 return {ctx,labels};
}
function assertNoWrites(h:ReturnType<typeof sessionHost>,before:[string,string][],checksum:string) {
 assert.deepEqual([...h.data],before);
 assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
 assert.equal(playableChecksum(h.session.state),checksum);
}

test('three direct appearance categories expose no retired set routes or intermediary',()=>{
 const {session:s}=sessionHost();open(s);
 for(const section of sections){
  act(s,{type:'selectShopSection',section});
  assert.deepEqual(controls(s).filter(c=>c.action.type==='selectShopSection').map(c=>[c.label,c.selected]),
   [['场景',section==='theme'],['货箱',section==='cargo'],['叉车',section==='forklift']]);
  assert.equal(controls(s).some(c=>['selectCosmeticBrowse','selectCosmeticCategory','previewCosmeticSet','selectCosmeticSetPage','previewCosmeticSetMember','selectClassicSetVariant','equipClassicSet','closeShopDetail'].includes(c.action.type)),false);
 }
});

test('retired set actions cannot open a route, create a confirmation, equip or save',()=>{
 const h=sessionHost({wallet:10000}),s=h.session;open(s,'cargo');act(s,{type:'selectCosmeticPage',page:1});
 h.storage.resetFault();const before=[...h.data],checksum=playableChecksum(s.state),view=structuredClone(s.view);
 const actions:UiAction[]=[{type:'selectCosmeticBrowse',mode:'sets'},{type:'selectShopSection',section:'sets'},{type:'selectCosmeticSetPage',page:1},{type:'previewCosmeticSet',id:'classic'},{type:'previewCosmeticSet',id:'cold_chain'},
  {type:'previewCosmeticSetMember',kind:'cargo'},{type:'selectClassicSetVariant',kind:'theme',id:'night'},{type:'equipClassicSet'},{type:'purchaseCosmeticSet',id:'cold_chain'},{type:'equipCosmeticSet',id:'cold_chain'}];
 for(const action of actions){act(s,action);assert.deepEqual(s.view,view,action.type);assertNoWrites(h,before,checksum);}
});

for(const kind of kinds)test(`v23 ${kind} exposes all catalog items through four-text-tile pages`,()=>{
 const {session:s}=sessionHost();open(s,kind);const catalog=COSMETIC_CATALOG.filter(item=>item.kind===kind),seen:string[]=[];
 assert.equal(catalog.length,kind==='forklift'?11:9);
 for(let page=0;page<Math.ceil(COSMETIC_CATALOG.filter(item=>item.kind===kind).length/4);page++){
  act(s,{type:'selectCosmeticPage',page});const result=cosmeticShopPage(s.view),tiles=itemTiles(s),expected=catalog.slice(page*4,page*4+4);
  assert.equal(result.page,page);assert.equal(result.pages,Math.ceil(catalog.length/4));
  assert.deepEqual(result.items.map(item=>item.id),expected.map(item=>item.id));
  assert.equal(tiles.length,expected.length);assert.deepEqual(ids(tiles),expected.map(item=>item.id));
  assert.deepEqual(tiles.map(c=>c.rect),[
   {x:132,y:1110,w:396,h:150},{x:552,y:1110,w:396,h:150},
   {x:132,y:1280,w:396,h:150},{x:552,y:1280,w:396,h:150},
  ].slice(0,expected.length));
  for(const [index,tile] of tiles.entries())assert.ok(tile.label.startsWith(`${expected[index].name}\n`));
  const previous=find(s,'selectCosmeticPage','上一页'),next=find(s,'selectCosmeticPage','下一页');
  assert.deepEqual(previous.rect,{x:132,y:1450,w:240,h:150});assert.deepEqual(next.rect,{x:708,y:1450,w:240,h:150});
  assert.equal(!!previous.disabled,page===0);assert.equal(!!next.disabled,page===Math.ceil(catalog.length/4)-1);
  assert.deepEqual(previous.action,{type:'selectCosmeticPage',page:page-1});
  assert.deepEqual(next.action,{type:'selectCosmeticPage',page:page+1});
  seen.push(...expected.map(item=>item.id));
 }
 assert.deepEqual(seen,catalog.map(item=>item.id));assert.equal(new Set(seen).size,catalog.length);
});

test('v23 ordinary selection updates the same-screen banner, text tiles and explicit purchase button',()=>{
 const {session:s}=sessionHost({wallet:900});open(s,'cargo');
 act(s,{type:'previewCosmetic',kind:'cargo',id:'insulated'});
 assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);
 assert.equal(selectedShopCosmetic(s.view).id,'insulated');
 assert.equal(controls(s).filter(c=>c.action.type==='selectShopSection').length,3);
 assert.equal(itemTiles(s).length,4);assert.equal(controls(s).some(c=>c.action.type==='closeShopDetail'),false);
 assert.equal(find(s,'purchaseCosmetic').label,'300金币 · 购买');
 assert.ok(itemTiles(s).find(c=>c.action.type==='previewCosmetic'&&c.action.id==='insulated')?.selected);
 const labels=capture(s).labels;assert.ok(labels.some(label=>label.includes('保温周转箱')));
 act(s,{type:'back'});assert.equal(s.view.screen,'menu','ordinary item selection does not add an extra Back layer');
});

test('inline preview banner renders ready selection artwork without a detail route',async()=>{
 assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
 const {session:s}=sessionHost();open(s,'theme');
 act(s,{type:'previewCosmetic',kind:'theme',id:'day'});
 await prepareViewArt(s.view);const first=capture(s).ctx.getImageData(132,750,816,232).data;
 act(s,{type:'previewCosmetic',kind:'theme',id:'night'});
 await prepareViewArt(s.view);const second=capture(s).ctx.getImageData(132,750,816,232).data;
 assert.notDeepEqual(second,first,'the selected theme must change the on-list banner');
 assert.equal(s.view.shopItemDetail,undefined);assert.equal(itemTiles(s).length,4);
});

test('all category page actions reject negative, past-end and noninteger page indices',()=>{
 const {session:s}=sessionHost();open(s);
 for(const kind of kinds){
  act(s,{type:'selectShopSection',section:kind});act(s,{type:'selectCosmeticPage',page:2});
  const itemBefore=structuredClone(s.view),pages=cosmeticShopPage(s.view).pages;
  for(const page of [-1,pages,pages+1,99,0.5,NaN,Infinity,-Infinity]){
   act(s,{type:'selectCosmeticPage',page});assert.deepEqual(s.view,itemBefore,`${kind} page ${page}`);
  }
 }
});

test('v23 previews and paging every catalog entry neither persist nor create a fresh account',()=>{
 for(const persisted of [false,true]){
  const h=sessionHost({},persisted),s=h.session;open(s);h.storage.resetFault();
  const before=[...h.data],checksum=playableChecksum(s.state),account=structuredClone(s.view.account);
  for(const kind of kinds){
   act(s,{type:'selectShopSection',section:kind});
   for(let page=0;page<Math.ceil(COSMETIC_CATALOG.filter(item=>item.kind===kind).length/4);page++){
    act(s,{type:'selectCosmeticPage',page});
    for(const item of COSMETIC_CATALOG.filter(item=>item.kind===kind).slice(page*4,page*4+4))act(s,{type:'previewCosmetic',kind,id:item.id});
   }
  }
  assertNoWrites(h,before,checksum);assert.deepEqual(s.view.account,account);if(!persisted)assert.equal(s.view.account,null);
 }
});

test('inline category selection retains each page across tabs and Back returns directly to menu',()=>{
 const {session:s}=sessionHost();open(s,'cargo');act(s,{type:'selectCosmeticPage',page:2});const selected=selectedShopCosmetic(s.view).id;
 act(s,{type:'selectShopSection',section:'forklift'});act(s,{type:'selectCosmeticPage',page:3});
 act(s,{type:'selectShopSection',section:'cargo'});assert.equal(selectedShopCosmetic(s.view).id,selected);assert.equal(cosmeticShopPage(s.view).page,2);
 act(s,{type:'selectShopTab',tab:'tools'});act(s,{type:'selectShopTab',tab:'cosmetics'});assert.equal(selectedShopCosmetic(s.view).id,selected);
 act(s,{type:'back'});assert.equal(s.view.screen,'menu');assert.equal(s.view.cosmeticSetPreview,undefined);
});

test('fresh root shop entry resets category and pages with no classic or set return state',()=>{
 const {session:s}=sessionHost();open(s,'forklift');act(s,{type:'selectCosmeticPage',page:3});act(s,{type:'back'});act(s,{type:'shop'});
 assert.equal(s.view.shopTab,'tools');assert.equal(s.view.shopSection,'theme');assert.equal(s.view.classicSetSelection,undefined);
 assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(s.view.cosmeticReturnSet,undefined);
 act(s,{type:'selectShopTab',tab:'cosmetics'});assert.equal(cosmeticShopPage(s.view).page,0);assert.equal(selectedShopCosmetic(s.view).id,'day');
});

test('v23 all paginated controls fit the viewport, remain disjoint and have at least 44 CSS pixels at width 320',()=>{
 const {session:s}=sessionHost();open(s);
 const check=()=>{
  const all=controls(s);for(const [index,c] of all.entries()){
   assert.ok(c.rect.w*320/1080>=44&&c.rect.h*320/1080>=44,`${c.action.type}: ${c.rect.w} x ${c.rect.h}`);
   assert.ok(c.rect.x>=0&&c.rect.x+c.rect.w<=1080&&c.rect.y>=0&&c.rect.y+c.rect.h<=1856,c.action.type);
   for(const other of all.slice(index+1))assert.ok(disjoint(c.rect,other.rect),`${c.action.type} overlaps ${other.action.type}`);
  }
 };
 for(const section of sections){
  act(s,{type:'selectShopSection',section});
  for(let page=0;page<Math.ceil(COSMETIC_CATALOG.filter(item=>item.kind===section).length/4);page++){
   act(s,{type:'selectCosmeticPage',page});check();
  }
 }
});

test('v23 wheel input neither scrolls nor changes page, preview or durable state',()=>{
 const h=sessionHost(),s=h.session;open(s);h.storage.resetFault();const before=[...h.data],checksum=playableChecksum(s.state);
 for(const section of sections){
  act(s,{type:'selectShopSection',section});const viewBefore=structuredClone(s.view);
  for(const delta of [25,-25,400,0,NaN,Infinity])assert.equal(s.input.wheel({x:330,y:1185},delta),false);
  act(s,{type:'scrollShop',deltaY:400});assert.deepEqual(s.view,viewBefore);
 }
 assertNoWrites(h,before,checksum);
});

test('v23 dragging a cosmetic option more than fourteen logical pixels permanently cancels that tap',()=>{
 for(const section of kinds)for(const releaseOnly of [false,true]){
  const h=sessionHost(),s=h.session;open(s,section);h.storage.resetFault();
  const before=[...h.data],checksum=playableChecksum(s.state),viewBefore=structuredClone(s.view);
  const card=itemTiles(s)[1];assert.ok(card);const point=center(card.rect);
  s.input.down(point,7);
  if(releaseOnly)s.input.up({x:point.x+15,y:point.y},7);
  else{s.input.move({x:point.x,y:point.y-40},7);assert.deepEqual(s.view,viewBefore,'dragging must not even temporarily scroll');s.input.move(point,7);s.input.up(point,7);}
  assert.deepEqual(s.view,viewBefore,`${section}/${releaseOnly}: dragging must neither scroll nor activate`);
  assertNoWrites(h,before,checksum);
 }
});

test('v23 pointer cancel and hide-show abandon a pending cosmetic tap, then a fresh small-motion tap works',()=>{
 const h=sessionHost(),s=h.session;open(s,'cargo');h.storage.resetFault();const before=[...h.data],checksum=playableChecksum(s.state);
 const insulated=find(s,'previewCosmetic');
 const target=itemTiles(s).find(c=>c.action.type==='previewCosmetic'&&c.action.id==='insulated')??insulated,point=center(target.rect);
 const selectedBefore=selectedShopCosmetic(s.view).id;
 s.input.down(point,7);s.input.cancel(7);s.input.up(point,7);assert.equal(selectedShopCosmetic(s.view).id,selectedBefore);
 s.input.down(point,8);s.hide();s.show();s.input.up(point,8);assert.equal(selectedShopCosmetic(s.view).id,selectedBefore);
 s.input.down(point,9);s.input.move({x:point.x+3,y:point.y+4},9);s.input.up(point,9);
 assert.equal(selectedShopCosmetic(s.view).id,'insulated');assert.equal(s.view.shopItemDetail,undefined);assert.equal(itemTiles(s).length,4);
 assertNoWrites(h,before,checksum);
});
