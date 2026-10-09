import test from 'node:test';
import assert from 'node:assert/strict';
import {InputController} from '../src/presentation/input.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {hitTestPoint} from '../src/presentation/layout.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {sessionHost} from './helpers/session-fixtures.ts';

const viewport={x:132,y:600,w:816,h:1020},origin={x:330,y:800};
function fixture(){
 const {session}=sessionHost({wallet:3000});
 Object.assign(session.view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',shopScroll:{sets:0,theme:0,cargo:0,forklift:0},cosmeticSetPreview:undefined,shopItemDetail:undefined});
 const actions:UiAction[]=[],commands:unknown[]=[],previews:unknown[]=[];
 const input=new InputController({getState:()=>session.state,getView:()=>session.view,patchView:patch=>Object.assign(session.view,patch),preview:(...args)=>{previews.push(args);return {valid:true,events:[],cells:[],shipments:[]};},dispatch:command=>commands.push(command),togglePause:()=>{},restart:()=>{},resume:()=>{},toggleDebug:()=>{},action:action=>actions.push(action)});
 const wheel=(point:{x:number;y:number},deltaY:number)=>input.wheel(point,deltaY);
 return {session,view:session.view,input,wheel,actions,commands,previews};
}

test('shop drag emits incremental vertical deltas and never previews or places game pieces',()=>{
 const f=fixture();f.input.down(origin,7);f.input.move({x:340,y:740},7);f.input.move({x:350,y:690},7);f.input.up({x:350,y:690},7);
 assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:60},{type:'scrollShop',deltaY:50}]);assert.deepEqual(f.commands,[]);assert.deepEqual(f.previews,[]);
});

test('shop scroll threshold keeps small motion a tap and diagonal motion cancels a card tap',()=>{
 const f=fixture();f.input.down(origin,1);f.input.move({x:330,y:786},1);assert.deepEqual(f.actions,[]);
 f.input.move({x:341,y:789},1);f.input.up(origin,1);
 assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:-3}]);
});

test('a captured shop swipe cannot activate a card after returning to its origin',()=>{
 const f=fixture();f.input.down(origin);f.input.move({x:430,y:800});f.input.up(origin);
 assert.deepEqual(f.actions,[]);assert.deepEqual(f.commands,[]);
});

test('shop dragging stays captured beyond the bottom viewport and cannot activate the footer',()=>{
 const f=fixture();f.input.down(origin);f.input.move({x:330,y:1660});f.input.up({x:330,y:1720});
 assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:-860}]);assert.deepEqual(f.commands,[]);
});

test('secondary shop fingers cannot steal, release, or cancel the primary gesture',()=>{
 const f=fixture();f.input.down(origin,7);f.input.down({x:400,y:800},8);f.input.move({x:400,y:600},8);f.input.up(origin,8);f.input.cancel(8);assert.deepEqual(f.actions,[]);
 f.input.move({x:330,y:750},7);f.input.up(origin,7);assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:50}]);
});

test('shop cancellation releases its pending card and permits the next pointer',()=>{
 const f=fixture();f.input.down(origin,7);f.input.cancel(7);f.input.up(origin,7);assert.deepEqual(f.actions,[]);
 f.input.down(origin,8);f.input.move({x:330,y:770},8);f.input.up(origin,8);assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:30}]);
});

test('shop gesture is abandoned when a modal, blocked account, detail, or different section replaces its list',()=>{
 for(const patch of [{confirmation:{kind:'purchase'}},{accountBlocked:true},{cosmeticSetPreview:'cold_chain'},{shopItemDetail:{kind:'cargo',id:'wood'}},{shopSection:'cargo'},{screen:'game'}]){
  const f=fixture();f.input.down(origin);Object.assign(f.view,patch);f.input.move({x:330,y:700});f.input.up(origin);assert.deepEqual(f.actions,[],JSON.stringify(patch));assert.deepEqual(f.commands,[]);
 }
});

test('shop wheel only claims finite nonzero movement inside the exact list clipping rectangle',()=>{
 const f=fixture();assert.equal(f.wheel({x:132,y:600},25),true);assert.equal(f.wheel({x:947.99,y:1619.99},-10),true);
 for(const point of [{x:131.99,y:800},{x:948,y:800},{x:330,y:599.99},{x:330,y:1620},{x:NaN,y:800}])assert.equal(f.wheel(point,25),false,JSON.stringify(point));
 for(const delta of [0,NaN,Infinity,-Infinity])assert.equal(f.wheel(origin,delta),false);
 assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:25},{type:'scrollShop',deltaY:-10}]);
});

test('wheel cannot scroll gameplay, tools, modals, blocked saves, or item and set details',()=>{
 for(const patch of [{screen:'game'},{shopTab:'tools'},{confirmation:{kind:'purchase'}},{accountBlocked:true},{cosmeticSetPreview:'cold_chain'},{shopItemDetail:{kind:'cargo',id:'wood'}}]){
  const f=fixture();Object.assign(f.view,patch);assert.equal(f.wheel(origin,100),false,JSON.stringify(patch));assert.deepEqual(f.actions,[]);
 }
});

test('a normal visible shop card tap retains its UI action',()=>{
 const f=fixture(),card=getUiControls(f.session.state,f.view).find(control=>!control.disabled&&hitTestPoint({x:control.rect.x+control.rect.w/2,y:control.rect.y+control.rect.h/2},viewport));assert.ok(card);
 const point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2};f.input.down(point);f.input.move({x:point.x+3,y:point.y+4});f.input.up(point);
 assert.deepEqual(f.actions,[card.action]);assert.deepEqual(f.commands,[]);
});

test('starting outside the list never captures a shop scroll',()=>{
 for(const point of [{x:131,y:800},{x:948,y:800},{x:330,y:599},{x:330,y:1620}]){
  const f=fixture();f.input.down(point);f.input.move(origin);f.input.up(point);assert.equal(f.actions.some(action=>String(action.type)==='scrollShop'),false,JSON.stringify(point));
 }
});

test('a wheel scroll cancels a card tap pending under the pointer',()=>{
 const f=fixture();f.input.down(origin);assert.equal(f.wheel(origin,100),true);f.input.up(origin);assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:100}]);
});

test('a large release without a move event cannot activate a captured shop card',()=>{
 const f=fixture();f.input.down(origin);f.input.up({x:origin.x,y:origin.y+25});assert.deepEqual(f.actions,[]);
});

test('leaving the logical canvas cancels shop dragging instead of scrolling to an invalid mapped point',()=>{
 const f=fixture();f.input.down(origin,7);f.input.move({x:-1,y:-1},7);f.input.up(origin,7);assert.deepEqual(f.actions,[]);
 f.input.down(origin,8);f.input.move({x:330,y:770},8);f.input.up(origin,8);assert.deepEqual(f.actions,[{type:'scrollShop',deltaY:30}]);
});

test('real session hide cancels a pending shop card and a fresh pointer works after show',()=>{
 const {session}=sessionHost();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
 session.input.down(origin,7);session.hide();session.show();session.input.up(origin,7);assert.equal(session.view.cosmeticSetPreview,undefined);
 session.input.down(origin,8);session.input.up(origin,8);assert.ok(session.view.cosmeticSetPreview);
});

test('a clipped card sliver cannot activate while a sufficiently visible card stays tappable',()=>{
 const f=fixture();f.view.shopScroll={sets:200};const point={x:330,y:610};f.input.down(point);f.input.up(point);assert.equal(f.actions.length,0);
 f.view.shopScroll={sets:190};f.input.down(point);f.input.up(point);assert.equal(f.actions.length,1);assert.equal(f.actions[0].type,'previewCosmeticSet');
});
