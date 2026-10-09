import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {SHOP_COSMETIC_SETS,DEFAULT_CLASSIC_SET_SELECTION} from '../src/application/cosmetic-sets.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {COSMETIC_PREVIEW_RECT,cosmeticSetShopPage,cosmeticShopPage,selectedShopCosmetic} from '../src/presentation/economy-ui.ts';
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
const sections=['sets',...kinds] as const;
const act=(s:GameSession,action:UiAction)=>s.action(action);
const controls=(s:GameSession)=>getUiControls(s.state,s.view);
const setCards=(s:GameSession)=>controls(s).filter(c=>c.action.type==='previewCosmeticSet');
const itemTiles=(s:GameSession)=>controls(s).filter(c=>c.action.type==='previewCosmetic');
const ids=(list:UiControl[])=>list.map(c=>'id' in c.action?c.action.id:undefined);
const center=(r:Rect)=>({x:r.x+r.w/2,y:r.y+r.h/2});
const disjoint=(a:Rect,b:Rect)=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;
function open(s:GameSession,section:typeof sections[number]='sets') {
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

test('v23 keeps four direct peer sections and never reintroduces the singles intermediary',()=>{
 const {session:s}=sessionHost();open(s);
 for(const section of sections){
  act(s,{type:'selectShopSection',section});
  assert.deepEqual(controls(s).filter(c=>c.action.type==='selectShopSection').map(c=>[c.label,c.selected]),
   [['套装',section==='sets'],['场景',section==='theme'],['货箱',section==='cargo'],['叉车',section==='forklift']]);
  assert.equal(controls(s).some(c=>c.label==='单件'||c.action.type==='selectCosmeticBrowse'||c.action.type==='selectCosmeticCategory'),false);
 }
});

test('v23 set pagination includes classic and all fifteen fixed sets once in four pages',()=>{
 const {session:s}=sessionHost();open(s);const seen:string[]=[];
 assert.equal(SHOP_COSMETIC_SETS.length,16);
 for(let page=0;page<4;page++){
  act(s,{type:'selectCosmeticSetPage',page});const result=cosmeticSetShopPage(s.view);
  assert.equal(result.page,page);assert.equal(result.pages,4);
  assert.deepEqual(result.items.map(item=>item.id),SHOP_COSMETIC_SETS.slice(page*4,page*4+4).map(item=>item.id));
  seen.push(...result.items.map(item=>item.id));
 }
 assert.equal(seen[0],'classic');assert.equal(new Set(seen).size,16);
 assert.deepEqual(seen,SHOP_COSMETIC_SETS.map(item=>item.id));
});

test('v23 restores exactly four set cards in the old two-by-two geometry',()=>{
 const {session:s}=sessionHost();open(s);
 for(let page=0;page<4;page++){
  act(s,{type:'selectCosmeticSetPage',page});const cards=setCards(s);
  assert.equal(cards.length,4,`page ${page+1} must not show a third card row`);
  assert.deepEqual(cards.map(c=>c.rect),[
   {x:132,y:630,w:396,h:366},{x:552,y:630,w:396,h:366},
   {x:132,y:1032,w:396,h:366},{x:552,y:1032,w:396,h:366},
  ]);
  assert.deepEqual(ids(cards),SHOP_COSMETIC_SETS.slice(page*4,page*4+4).map(item=>item.id));
  const previous=find(s,'selectCosmeticSetPage','上一页'),next=find(s,'selectCosmeticSetPage','下一页');
  assert.deepEqual(previous.rect,{x:132,y:1430,w:240,h:150});assert.deepEqual(next.rect,{x:708,y:1430,w:240,h:150});
  assert.equal(!!previous.disabled,page===0);assert.equal(!!next.disabled,page===3);
  assert.deepEqual(previous.action,{type:'selectCosmeticSetPage',page:page-1});
  assert.deepEqual(next.action,{type:'selectCosmeticSetPage',page:page+1});
 }
});

for(const kind of kinds)test(`v23 ${kind} exposes all catalog items through five four-text-tile pages`,()=>{
 const {session:s}=sessionHost();open(s,kind);const catalog=COSMETIC_CATALOG.filter(item=>item.kind===kind),seen:string[]=[];
 assert.equal(catalog.length,kind==='forklift'?19:17);
 for(let page=0;page<5;page++){
  act(s,{type:'selectCosmeticPage',page});const result=cosmeticShopPage(s.view),tiles=itemTiles(s),expected=catalog.slice(page*4,page*4+4);
  assert.equal(result.page,page);assert.equal(result.pages,5);
  assert.deepEqual(result.items.map(item=>item.id),expected.map(item=>item.id));
  assert.equal(tiles.length,expected.length);assert.deepEqual(ids(tiles),expected.map(item=>item.id));
  assert.deepEqual(tiles.map(c=>c.rect),[
   {x:132,y:1110,w:396,h:150},{x:552,y:1110,w:396,h:150},
   {x:132,y:1280,w:396,h:150},{x:552,y:1280,w:396,h:150},
  ].slice(0,expected.length));
  for(const [index,tile] of tiles.entries())assert.ok(tile.label.startsWith(`${expected[index].name}\n`));
  const previous=find(s,'selectCosmeticPage','上一页'),next=find(s,'selectCosmeticPage','下一页');
  assert.deepEqual(previous.rect,{x:132,y:1450,w:240,h:150});assert.deepEqual(next.rect,{x:708,y:1450,w:240,h:150});
  assert.equal(!!previous.disabled,page===0);assert.equal(!!next.disabled,page===4);
  assert.deepEqual(previous.action,{type:'selectCosmeticPage',page:page-1});
  assert.deepEqual(next.action,{type:'selectCosmeticPage',page:page+1});
  seen.push(...expected.map(item=>item.id));
 }
 assert.deepEqual(seen,catalog.map(item=>item.id));assert.equal(new Set(seen).size,catalog.length);
});

test('v23 ordinary selection updates the same-screen banner, text tiles and explicit purchase button',()=>{
 const {session:s}=sessionHost({wallet:900});open(s,'cargo');
 act(s,{type:'previewCosmetic',kind:'cargo',id:'wood'});
 assert.equal(s.view.shopItemDetail,undefined);assert.equal(s.view.cosmeticSetPreview,undefined);
 assert.equal(selectedShopCosmetic(s.view).id,'wood');
 assert.equal(controls(s).filter(c=>c.action.type==='selectShopSection').length,4);
 assert.equal(itemTiles(s).length,4);assert.equal(controls(s).some(c=>c.action.type==='closeShopDetail'),false);
 assert.equal(find(s,'purchaseCosmetic').label,'300金币 · 购买');
 assert.ok(itemTiles(s).find(c=>c.action.type==='previewCosmetic'&&c.action.id==='wood')?.selected);
 const labels=capture(s).labels;assert.ok(labels.some(label=>label.includes('原木藤箱')));
 act(s,{type:'back'});assert.equal(s.view.screen,'menu','ordinary item selection does not add an extra Back layer');
});

test('v23 restores the old single-item preview banner and renders selection into it without a detail route',()=>{
 assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
 const {session:s}=sessionHost();open(s,'theme');
 act(s,{type:'previewCosmetic',kind:'theme',id:'day'});
 const first=capture(s).ctx.getImageData(132,750,816,232).data;
 act(s,{type:'previewCosmetic',kind:'theme',id:'night'});
 const second=capture(s).ctx.getImageData(132,750,816,232).data;
 assert.notDeepEqual(second,first,'the selected theme must change the on-list banner');
 assert.equal(s.view.shopItemDetail,undefined);assert.equal(itemTiles(s).length,4);
});

test('v23 ignores out-of-range and noninteger set and item page actions',()=>{
 const h=sessionHost(),s=h.session;open(s);act(s,{type:'selectCosmeticSetPage',page:2});
 const setBefore=structuredClone(s.view);
 for(const page of [-1,4,99,0.5,NaN,Infinity,-Infinity]){
  act(s,{type:'selectCosmeticSetPage',page});assert.deepEqual(s.view,setBefore,`set page ${page}`);
 }
 for(const kind of kinds){
  act(s,{type:'selectShopSection',section:kind});act(s,{type:'selectCosmeticPage',page:2});
  const itemBefore=structuredClone(s.view);
  for(const page of [-1,5,99,0.5,NaN,Infinity,-Infinity]){
   act(s,{type:'selectCosmeticPage',page});assert.deepEqual(s.view,itemBefore,`${kind} page ${page}`);
  }
 }
});

test('v23 previews and paging every catalog entry neither persist nor create a fresh account',()=>{
 for(const persisted of [false,true]){
  const h=sessionHost({},persisted),s=h.session;open(s);h.storage.resetFault();
  const before=[...h.data],checksum=playableChecksum(s.state),account=structuredClone(s.view.account);
  for(let page=0;page<4;page++){
   act(s,{type:'selectCosmeticSetPage',page});
   for(const set of SHOP_COSMETIC_SETS.slice(page*4,page*4+4)){
    act(s,{type:'previewCosmeticSet',id:set.id});act(s,{type:'closeShopDetail'});
   }
  }
  for(const kind of kinds){
   act(s,{type:'selectShopSection',section:kind});
   for(let page=0;page<5;page++){
    act(s,{type:'selectCosmeticPage',page});
    for(const item of COSMETIC_CATALOG.filter(item=>item.kind===kind).slice(page*4,page*4+4))act(s,{type:'previewCosmetic',kind,id:item.id});
   }
  }
  assertNoWrites(h,before,checksum);assert.deepEqual(s.view.account,account);if(!persisted)assert.equal(s.view.account,null);
 }
});

test('v23 internal set Back retains the exact originating list page',()=>{
 const {session:s}=sessionHost();open(s);
 for(let page=0;page<4;page++){
  act(s,{type:'selectCosmeticSetPage',page});
  for(const set of SHOP_COSMETIC_SETS.slice(page*4,page*4+4)){
   act(s,{type:'previewCosmeticSet',id:set.id});act(s,{type:'back'});
   assert.equal(s.view.screen,'shop');assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(cosmeticSetShopPage(s.view).page,page);
   assert.deepEqual(ids(setCards(s)),SHOP_COSMETIC_SETS.slice(page*4,page*4+4).map(item=>item.id));
  }
 }
});

test('v23 set-member browsing can turn pages and select another item before Back returns to its set',()=>{
 const h=sessionHost(),s=h.session;open(s);act(s,{type:'selectCosmeticSetPage',page:2});
 const set=SHOP_COSMETIC_SETS[8];act(s,{type:'previewCosmeticSet',id:set.id});act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 assert.equal(s.view.shopItemDetail,undefined);assert.equal(selectedShopCosmetic(s.view).id,set.cargo);
 const oldPage=cosmeticShopPage(s.view).page,targetPage=oldPage===4?0:4;
 act(s,{type:'selectCosmeticPage',page:targetPage});assert.equal(cosmeticShopPage(s.view).page,targetPage,'origin must not pin selectedShopCosmetic to the old member');
 const pageItems=cosmeticShopPage(s.view).items,replacement=pageItems[pageItems.length-1];act(s,{type:'previewCosmetic',kind:'cargo',id:replacement.id});
 assert.equal(selectedShopCosmetic(s.view).id,replacement.id);
 act(s,{type:'back'});assert.equal(s.view.screen,'shop');assert.equal(s.view.cosmeticSetPreview,set.id);
 act(s,{type:'back'});assert.equal(s.view.cosmeticSetPreview,undefined);assert.equal(cosmeticSetShopPage(s.view).page,2);
});

test('v23 explicitly choosing a different category clears the set-member return origin',()=>{
 const {session:s}=sessionHost();open(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});act(s,{type:'previewCosmeticSetMember',kind:'cargo'});
 act(s,{type:'selectShopSection',section:'forklift'});act(s,{type:'back'});
 assert.equal(s.view.screen,'menu');assert.equal(s.view.cosmeticSetPreview,undefined);
});

test('v23 fresh root shop entry resets tabs, page and classic defaults while internal Back retains choices',()=>{
 const h=sessionHost(),s=h.session;open(s);act(s,{type:'previewCosmeticSet',id:'classic'});
 act(s,{type:'selectClassicSetVariant',kind:'theme',id:'night'});act(s,{type:'selectClassicSetVariant',kind:'cargo',id:'outline'});act(s,{type:'selectClassicSetVariant',kind:'forklift',id:'white'});
 act(s,{type:'back'});act(s,{type:'previewCosmeticSet',id:'classic'});
 assert.deepEqual(s.view.classicSetSelection,{theme:'night',cargo:'outline',forklift:'white'});
 act(s,{type:'back'});act(s,{type:'selectCosmeticSetPage',page:3});act(s,{type:'back'});assert.equal(s.view.screen,'menu');act(s,{type:'shop'});
 assert.equal(s.view.shopTab,'tools');assert.deepEqual(s.view.classicSetSelection,DEFAULT_CLASSIC_SET_SELECTION);
 act(s,{type:'selectShopTab',tab:'cosmetics'});assert.equal(cosmeticSetShopPage(s.view).page,0);
 assert.deepEqual(ids(setCards(s)),SHOP_COSMETIC_SETS.slice(0,4).map(item=>item.id));
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
  for(let page=0;page<(section==='sets'?4:5);page++){
   act(s,{type:section==='sets'?'selectCosmeticSetPage':'selectCosmeticPage',page});check();
  }
 }
 for(const set of SHOP_COSMETIC_SETS){act(s,{type:'previewCosmeticSet',id:set.id});check();act(s,{type:'back'});}
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
 for(const section of ['sets','cargo'] as const)for(const releaseOnly of [false,true]){
  const h=sessionHost(),s=h.session;open(s,section);h.storage.resetFault();
  const before=[...h.data],checksum=playableChecksum(s.state),viewBefore=structuredClone(s.view);
  const card=(section==='sets'?setCards(s):itemTiles(s))[1];assert.ok(card);const point=center(card.rect);
  s.input.down(point,7);
  if(releaseOnly)s.input.up({x:point.x+15,y:point.y},7);
  else{s.input.move({x:point.x,y:point.y-40},7);assert.deepEqual(s.view,viewBefore,'dragging must not even temporarily scroll');s.input.move(point,7);s.input.up(point,7);}
  assert.deepEqual(s.view,viewBefore,`${section}/${releaseOnly}: dragging must neither scroll nor activate`);
  assertNoWrites(h,before,checksum);
 }
});

test('v23 pointer cancel and hide-show abandon a pending cosmetic tap, then a fresh small-motion tap works',()=>{
 const h=sessionHost(),s=h.session;open(s,'cargo');h.storage.resetFault();const before=[...h.data],checksum=playableChecksum(s.state);
 const wood=find(s,'previewCosmetic');
 const target=itemTiles(s).find(c=>c.action.type==='previewCosmetic'&&c.action.id==='wood')??wood,point=center(target.rect);
 const selectedBefore=selectedShopCosmetic(s.view).id;
 s.input.down(point,7);s.input.cancel(7);s.input.up(point,7);assert.equal(selectedShopCosmetic(s.view).id,selectedBefore);
 s.input.down(point,8);s.hide();s.show();s.input.up(point,8);assert.equal(selectedShopCosmetic(s.view).id,selectedBefore);
 s.input.down(point,9);s.input.move({x:point.x+3,y:point.y+4},9);s.input.up(point,9);
 assert.equal(selectedShopCosmetic(s.view).id,'wood');assert.equal(s.view.shopItemDetail,undefined);assert.equal(itemTiles(s).length,4);
 assertNoWrites(h,before,checksum);
});

test('v23 all sixteen classic preview combinations stay session-only and unowned choices cannot equip',()=>{
 const h=sessionHost({wallet:600}),s=h.session;open(s);act(s,{type:'previewCosmeticSet',id:'classic'});h.storage.resetFault();
 const before=[...h.data],checksum=playableChecksum(s.state),appearance=structuredClone(s.view.account?.profile.cosmetics);
 for(const theme of ['day','night'] as const)for(const cargo of ['classic','outline'] as const)for(const forklift of ['yellow','blue','red','white'] as const){
  act(s,{type:'selectClassicSetVariant',kind:'theme',id:theme});act(s,{type:'selectClassicSetVariant',kind:'cargo',id:cargo});act(s,{type:'selectClassicSetVariant',kind:'forklift',id:forklift});
  assert.deepEqual(s.view.classicSetSelection,{theme,cargo,forklift});
  if(forklift!=='yellow'){
   assert.equal(controls(s).some(c=>c.action.type==='equipClassicSet'),false);
   act(s,{type:'equipClassicSet'});assert.deepEqual(s.view.account?.profile.cosmetics,appearance);
  }
 }
 assertNoWrites(h,before,checksum);
});
