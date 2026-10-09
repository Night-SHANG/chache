import test from 'node:test';
import assert from 'node:assert/strict';
import {InputController} from '../src/presentation/input.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {hitTestPoint} from '../src/presentation/layout.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {sessionHost} from './helpers/session-fixtures.ts';

const viewport={x:132,y:600,w:816,h:1020},origin={x:330,y:800};
function fixture(){
 const h=sessionHost({wallet:3000}),{session}=h;
 Object.assign(session.view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',shopScroll:{sets:0,theme:0,cargo:0,forklift:0},cosmeticSetPreview:undefined,shopItemDetail:undefined,placementRisk:null});
 const actions:UiAction[]=[],commands:unknown[]=[],previews:unknown[]=[];
 const input=new InputController({getState:()=>session.state,getView:()=>session.view,patchView:patch=>Object.assign(session.view,patch),preview:(...args)=>{previews.push(args);return {valid:true,events:[],cells:[],shipments:[]};},dispatch:command=>commands.push(command),togglePause:()=>{},restart:()=>{},resume:()=>{},toggleDebug:()=>{},action:action=>actions.push(action)});
 const wheel=(point:{x:number;y:number},deltaY:number)=>input.wheel(point,deltaY);
 const before={view:structuredClone(session.view),data:[...h.data],checksum:playableChecksum(session.state)};
 h.storage.resetFault();
 return {...h,view:session.view,input,wheel,actions,commands,previews,before};
}
function originCard(f:ReturnType<typeof fixture>){
 const card=getUiControls(f.session.state,f.view).find(control=>control.action.type==='previewCosmeticSet'&&hitTestPoint(origin,control.rect));assert.ok(card);return card;
}
function assertUnchanged(f:ReturnType<typeof fixture>){
 assert.deepEqual(f.actions,[]);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
 assert.deepEqual(f.view,f.before.view);assert.deepEqual([...f.data],f.before.data);assert.equal(playableChecksum(f.session.state),f.before.checksum);
 assert.equal(f.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
}

test('shop drag never scrolls, changes selection or page, previews or places game pieces',()=>{
 const f=fixture();f.input.down(origin,7);f.input.move({x:340,y:740},7);assertUnchanged(f);
 f.input.move({x:350,y:690},7);assertUnchanged(f);f.input.up({x:350,y:690},7);assertUnchanged(f);
});

test('shop drag threshold keeps fourteen-pixel motion a tap and cancels larger diagonal motion',()=>{
 const tap=fixture(),card=originCard(tap);tap.input.down(origin,1);tap.input.move({x:330,y:786},1);assertUnchanged(tap);tap.input.up({x:330,y:786},1);assert.deepEqual(tap.actions,[card.action]);
 const drag=fixture();drag.input.down(origin,1);drag.input.move({x:330,y:786},1);assertUnchanged(drag);
 drag.input.move({x:341,y:789},1);assertUnchanged(drag);drag.input.up(origin,1);assertUnchanged(drag);
});

test('a captured shop swipe cannot activate a card after returning to its origin',()=>{
 const f=fixture();f.input.down(origin);f.input.move({x:430,y:800});assertUnchanged(f);f.input.move(origin);f.input.up(origin);assertUnchanged(f);
});

test('shop dragging stays captured beyond the bottom viewport and cannot activate the footer',()=>{
 const f=fixture();f.input.down(origin);f.input.move({x:330,y:1660});assertUnchanged(f);f.input.up({x:330,y:1720});assertUnchanged(f);
});

test('secondary shop fingers cannot steal, release, or cancel the primary gesture',()=>{
 for(const drag of [false,true]){
  const f=fixture(),card=originCard(f);f.input.down(origin,7);f.input.down({x:400,y:800},8);f.input.move({x:400,y:600},8);f.input.up(origin,8);f.input.cancel(8);assertUnchanged(f);
  if(drag){f.input.move({x:330,y:750},7);assertUnchanged(f);}f.input.up(origin,7);
  if(drag)assertUnchanged(f);else assert.deepEqual(f.actions,[card.action]);
 }
});

test('shop cancellation releases its pending card and permits a fresh pointer tap',()=>{
 const f=fixture(),card=originCard(f);f.input.down(origin,7);f.input.cancel(7);f.input.up(origin,7);assertUnchanged(f);
 f.input.down(origin,8);f.input.move({x:333,y:804},8);f.input.up(origin,8);assert.deepEqual(f.actions,[card.action]);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
});

test('shop gesture is abandoned when a modal, blocked account, detail, tab, section or screen replaces its list',()=>{
 for(const patch of [{confirmation:{kind:'purchase'}},{accountBlocked:true},{cosmeticSetPreview:'cold_chain'},{shopItemDetail:{kind:'cargo',id:'wood'}},{shopTab:'tools'},{shopSection:'cargo'},{screen:'game'}]){
  for(const move of [false,true]){
   const f=fixture();f.input.down(origin);Object.assign(f.view,patch);if(move)f.input.move({x:330,y:700});f.input.up(origin);assert.deepEqual(f.actions,[],JSON.stringify({patch,move}));assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
  }
 }
});

test('shop wheel is unclaimed at every viewport edge and for all finite or invalid deltas',()=>{
 const f=fixture();
 for(const point of [origin,{x:132,y:600},{x:947.99,y:1619.99},{x:131.99,y:800},{x:948,y:800},{x:330,y:599.99},{x:330,y:1620},{x:NaN,y:800},{x:330,y:NaN},{x:Infinity,y:800}]){
  for(const delta of [25,-10,100000,-100000,0,NaN,Infinity,-Infinity])assert.equal(f.wheel(point,delta),false,JSON.stringify({point,delta}));
  assertUnchanged(f);
 }
});

test('wheel cannot change gameplay, tools, modals, blocked saves, ordinary previews or set details',()=>{
 for(const patch of [{screen:'game'},{shopTab:'tools'},{confirmation:{kind:'purchase'}},{accountBlocked:true},{cosmeticSetPreview:'cold_chain'},{shopSection:'cargo',cosmeticPreview:{cargo:'wood'}}]){
  const f=fixture();Object.assign(f.view,patch);const before=structuredClone(f.view);assert.equal(f.wheel(origin,100),false,JSON.stringify(patch));assert.deepEqual(f.actions,[]);assert.deepEqual(f.view,before);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
 }
});

test('a normal visible shop card tap retains its UI action',()=>{
 const f=fixture(),card=getUiControls(f.session.state,f.view).find(control=>control.action.type==='previewCosmeticSet'&&!control.disabled&&hitTestPoint({x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2},viewport));assert.ok(card);
 const point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2};f.input.down(point);f.input.move({x:point.x+3,y:point.y+4});f.input.up(point);
 assert.deepEqual(f.actions,[card.action]);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
});

test('starting outside the list cannot activate a paginated card after moving into it',()=>{
 for(const point of [{x:131,y:800},{x:948,y:800},{x:330,y:599},{x:330,y:1620}]){
  const f=fixture();f.input.down(point);f.input.move(origin);f.input.up(point);assertUnchanged(f);
 }
});

test('an unclaimed wheel event leaves a pending card tap unchanged',()=>{
 const f=fixture(),card=originCard(f);f.input.down(origin);assert.equal(f.wheel(origin,100),false);assertUnchanged(f);
 f.input.up(origin);assert.deepEqual(f.actions,[card.action]);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
});

test('a large release without a move event cannot activate a captured shop card',()=>{
 for(const point of [{x:origin.x,y:origin.y+25},{x:origin.x+15,y:origin.y},{x:origin.x+11,y:origin.y+11}]){
  const f=fixture();f.input.down(origin);f.input.up(point);assertUnchanged(f);
 }
});

test('leaving the logical canvas cancels shop dragging and a new pointer can still tap',()=>{
 for(const invalid of [{x:-1,y:-1},{x:1080,y:800},{x:330,y:1920},{x:NaN,y:800},{x:330,y:Infinity}]){
  const f=fixture(),card=originCard(f);f.input.down(origin,7);f.input.move(invalid,7);f.input.up(origin,7);assertUnchanged(f);
  f.input.down(origin,8);f.input.up(origin,8);assert.deepEqual(f.actions,[card.action]);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
 }
});

test('real session hide cancels a pending shop card and a fresh pointer works after show',()=>{
 const {session}=sessionHost();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
 session.input.down(origin,7);session.hide();session.show();session.input.up(origin,7);assert.equal(session.view.cosmeticSetPreview,undefined);
 session.input.down(origin,8);session.input.up(origin,8);assert.equal(session.view.cosmeticSetPreview,'classic');
});

test('stale scrolling offsets never move or clip any of the four paginated card targets',()=>{
 const f=fixture(),cards=getUiControls(f.session.state,f.view).filter(control=>control.action.type==='previewCosmeticSet');assert.equal(cards.length,4);
 for(const offset of [190,200,10000,-200,NaN]){
  f.view.shopScroll={sets:offset};assert.deepEqual(getUiControls(f.session.state,f.view).filter(control=>control.action.type==='previewCosmeticSet'),cards);
  f.actions.length=0;f.input.down({x:330,y:610});f.input.up({x:330,y:610});assert.deepEqual(f.actions,[]);
  for(const card of cards){const point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2};f.input.down(point);f.input.up(point);}
  assert.deepEqual(f.actions,cards.map(card=>card.action));assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
 }
});

test('real paginated shop drags preserve pages, previews, account data and game state in all four sections',()=>{
 const h=sessionHost({wallet:3000}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});h.storage.resetFault();
 const dataBefore=[...h.data],checksum=playableChecksum(s.state);
 for(const section of ['sets','theme','cargo','forklift'] as const){
  s.action({type:'selectShopSection',section});s.action({type:section==='sets'?'selectCosmeticSetPage':'selectCosmeticPage',page:2});
  const card=getUiControls(s.state,s.view).filter(control=>control.action.type===(section==='sets'?'previewCosmeticSet':'previewCosmetic'))[1];assert.ok(card);
  const point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2},before=structuredClone(s.view);
  s.input.down(point,7);s.input.move({x:point.x,y:point.y-50},7);assert.deepEqual(s.view,before,section);
  s.input.move(point,7);s.input.up(point,7);assert.deepEqual(s.view,before,section);
  assert.deepEqual([...h.data],dataBefore);assert.equal(playableChecksum(s.state),checksum);
 }
 assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
});
