import test from 'node:test';
import assert from 'node:assert/strict';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import type {PointerEvent} from '../src/platform/types.ts';
import {InputController} from '../src/presentation/input.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {findPlayableMoves} from '../src/domain/playable.ts';
import {cellCenter,getTrayRects} from '../src/presentation/layout.ts';
import {touchDragLift} from '../src/presentation/touch-placement.ts';

type Touch={identifier:number;clientX:number;clientY:number};
function fixture(pixelRatio=3){
 const callbacks=new Map<string,(event:{changedTouches:Touch[]})=>void>();let hide=()=>{},resize=()=>{};
 const canvas={width:0,height:0,getContext:()=>({setTransform(){},fillRect(){}})};
 const safeArea={left:10,top:32,width:300,height:660},scale=300/1080,offsetY=32+(660-1920*scale)/2;
 const host={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:320,windowHeight:740,pixelRatio,safeArea}),onTouchStart:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('down',cb),onTouchMove:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('move',cb),onTouchEnd:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('up',cb),onTouchCancel:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('cancel',cb),onHide:(callback:()=>void)=>{hide=callback;},onWindowResize:(callback:()=>void)=>{resize=callback;}} as unknown as WechatHost;
 const platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
 const touch=(id:number,x:number,y:number):Touch=>({identifier:id,clientX:10+x*scale,clientY:offsetY+y*scale});
 const emit=(type:string,touches:Touch[])=>callbacks.get(type)?.({changedTouches:touches});
 return {platform,canvas,touch,emit,hide:()=>hide(),resize:()=>resize()};
}

test('WeChat cancels every changed finger rather than only the first one',()=>{
 const f=fixture(),events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
 f.emit('down',[f.touch(7,330,800),f.touch(8,600,900)]);f.emit('cancel',[f.touch(8,600,900),f.touch(7,330,800)]);
 assert.deepEqual(events.filter(event=>event.type==='cancel').map(event=>event.id),[8,7]);
});

test('WeChat empty touchcancel releases all active fingers without reviving ended pointers',()=>{
 const f=fixture(),events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
 f.emit('down',[f.touch(7,330,800),f.touch(8,600,900)]);f.emit('up',[f.touch(8,600,900)]);f.emit('cancel',[]);f.emit('cancel',[]);
 assert.deepEqual(events.filter(event=>event.type==='cancel').map(event=>event.id),[7]);
});

for(const dpr of [1,2,3])test(`WeChat safe-area mapping preserves logical drag distance without scrolling at DPR ${dpr}`,()=>{
 const f=fixture(dpr),h=sessionHost({wallet:3000}),{session}=h;Object.assign(session.view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',cosmeticSetPreview:undefined,shopItemDetail:undefined,placementRisk:null});
 const actions:UiAction[]=[],commands:unknown[]=[],previews:unknown[]=[],events:PointerEvent[]=[];
 const input=new InputController({getState:()=>session.state,getView:()=>session.view,patchView:patch=>Object.assign(session.view,patch),preview:(...args)=>{previews.push(args);return {valid:true,events:[],cells:[],shipments:[]};},dispatch:command=>commands.push(command),togglePause:()=>{},restart:()=>{},resume:()=>{},toggleDebug:()=>{},action:action=>actions.push(action)});
 const before=structuredClone(session.view),dataBefore=[...h.data],checksum=playableChecksum(session.state);h.storage.resetFault();
 f.platform.onPointer(event=>{events.push(event);if(event.type==='cancel')input.cancel(event.id);else input[event.type](event.point,event.id);});f.platform.onHide(()=>input.cancel());
 f.emit('down',[f.touch(7,330,800)]);f.emit('move',[f.touch(7,330,650)]);
 assert.deepEqual(events.map(event=>[event.type,event.id]),[['down',7],['move',7]]);
 assert.ok(Math.abs(events[0].point.x-330)<1e-10&&Math.abs(events[0].point.y-800)<1e-10);
 assert.ok(Math.abs(events[1].point.x-330)<1e-10&&Math.abs(events[1].point.y-650)<1e-10);
 assert.ok(Math.abs(events[0].point.y-events[1].point.y-150)<1e-10);
 assert.deepEqual(actions,[]);assert.deepEqual(session.view,before,'a mapped drag must never temporarily scroll');
 f.emit('cancel',[]);f.emit('up',[f.touch(7,330,800)]);assert.deepEqual(actions,[]);assert.deepEqual(session.view,before);
 f.emit('down',[f.touch(9,330,800)]);f.emit('cancel',[]);f.emit('up',[f.touch(9,330,800)]);assert.deepEqual(actions,[]);
 f.emit('down',[f.touch(9,330,800)]);f.hide();f.emit('up',[f.touch(9,330,800)]);assert.deepEqual(actions,[]);
 f.emit('down',[f.touch(10,330,800)]);f.emit('move',[f.touch(10,330,700)]);assert.deepEqual(actions,[]);f.emit('up',[f.touch(10,330,700)]);assert.deepEqual(actions,[]);assert.deepEqual(session.view,before);
 const card=getUiControls(session.state,session.view).find(control=>control.action.type==='previewCosmeticSet');assert.ok(card);
 f.emit('down',[f.touch(11,330,800)]);f.emit('move',[f.touch(11,333,804)]);f.emit('up',[f.touch(11,330,800)]);assert.deepEqual(actions,[card.action]);
 assert.deepEqual(commands,[]);assert.deepEqual(previews,[]);assert.deepEqual([...h.data],dataBefore);assert.equal(playableChecksum(session.state),checksum);
 assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
 assert.equal(f.canvas.width,320*dpr);assert.equal(f.canvas.height,740*dpr);
});

for(const dpr of [1,2,3])test(`WeChat real-shop swipes preserve every section's page, preview and data at DPR ${dpr}`,()=>{
 const f=fixture(dpr),h=sessionHost({wallet:3000}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 f.platform.onPointer(event=>{if(event.type==='cancel')s.input.cancel(event.id);else s.input[event.type](event.point,event.id);});
 const dataBefore=[...h.data],checksum=playableChecksum(s.state);h.storage.resetFault();
 for(const section of ['sets','theme','cargo','forklift'] as const){
  s.action({type:'selectShopSection',section});s.action({type:section==='sets'?'selectCosmeticSetPage':'selectCosmeticPage',page:2});
  const card=getUiControls(s.state,s.view).filter(control=>control.action.type===(section==='sets'?'previewCosmeticSet':'previewCosmetic'))[1];assert.ok(card);
  const point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2},before=structuredClone(s.view);
  f.emit('down',[f.touch(7,point.x,point.y)]);f.emit('move',[f.touch(7,point.x,point.y-50)]);assert.deepEqual(s.view,before,section);
  f.emit('move',[f.touch(7,point.x,point.y)]);f.emit('up',[f.touch(7,point.x,point.y)]);assert.deepEqual(s.view,before,section);
  f.emit('down',[f.touch(8,point.x,point.y)]);f.emit('up',[f.touch(8,point.x+25,point.y)]);assert.deepEqual(s.view,before,section);
  assert.deepEqual([...h.data],dataBefore);assert.equal(playableChecksum(s.state),checksum);
 }
 assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
});

test('WeChat safe-area letterboxing never turns a touch in the margin into a shop gesture',()=>{
 const f=fixture(),events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
 f.emit('down',[{identifier:1,clientX:160,clientY:33},{identifier:2,clientX:9,clientY:400}]);
 assert.deepEqual(events.map(event=>event.point),[{x:-1,y:-1},{x:-1,y:-1}]);
});

test('WeChat labels touch events so placement can lift only finger drags',()=>{
 const f=fixture(),events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
 for(const type of ['down','move','up'])f.emit(type,[f.touch(1,330,800)]);
 assert.deepEqual(events.map(event=>event.pointerType),['touch','touch','touch']);
});

test('WeChat resize cancels each active touch before a stale release',()=>{
 const f=fixture(),events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
 f.emit('down',[f.touch(7,330,800)]);f.resize();
 assert.deepEqual(events.map(event=>[event.type,event.id]),[['down',7],['cancel',7]]);
});

for(const interrupt of ['resize','hide'] as const)test(`WeChat lifted drag ${interrupt} prevents a stale touchend placement`,()=>{
 const f=fixture(),h=sessionHost(),s=h.session;startInbound(s);
 f.platform.onPointer(event=>{if(event.type==='cancel')s.input.cancel(event.id);else if(event.type==='down')s.input.down(event.point,event.id,event.pointerType);else s.input[event.type](event.point,event.id);});
 f.platform.onHide(()=>s.hide());
 const rect=getTrayRects(s.state.candidates.length)[0],move=findPlayableMoves(s.state).find(move=>move.pieceId===s.state.candidates[0].id);assert.ok(move);
 const target=cellCenter(move.origin,s.state),finger={x:target.x,y:target.y+touchDragLift(s.state)},before=s.state.commandIndex;
 f.emit('down',[f.touch(7,rect.x+rect.w/2,rect.y+rect.h/2)]);f.emit('move',[f.touch(7,finger.x,finger.y)]);assert.deepEqual(s.view.hoverOrigin,move.origin);
 f[interrupt]();assert.equal(s.view.selectedPieceId,null);f.emit('up',[f.touch(7,finger.x,finger.y)]);assert.equal(s.state.commandIndex,before);
});
