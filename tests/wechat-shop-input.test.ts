import test from 'node:test';
import assert from 'node:assert/strict';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import type {PointerEvent} from '../src/platform/types.ts';
import {InputController} from '../src/presentation/input.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {sessionHost} from './helpers/session-fixtures.ts';

type Touch={identifier:number;clientX:number;clientY:number};
function fixture(pixelRatio=3){
 const callbacks=new Map<string,(event:{changedTouches:Touch[]})=>void>();let hide=()=>{};
 const canvas={width:0,height:0,getContext:()=>({setTransform(){},fillRect(){}})};
 const safeArea={left:10,top:32,width:300,height:660},scale=300/1080,offsetY=32+(660-1920*scale)/2;
 const host={createCanvas:()=>canvas,getWindowInfo:()=>({windowWidth:320,windowHeight:740,pixelRatio,safeArea}),onTouchStart:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('down',cb),onTouchMove:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('move',cb),onTouchEnd:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('up',cb),onTouchCancel:(cb:(event:{changedTouches:Touch[]})=>void)=>callbacks.set('cancel',cb),onHide:(callback:()=>void)=>{hide=callback;}} as unknown as WechatHost;
 const platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0});
 const touch=(id:number,x:number,y:number):Touch=>({identifier:id,clientX:10+x*scale,clientY:offsetY+y*scale});
 const emit=(type:string,touches:Touch[])=>callbacks.get(type)?.({changedTouches:touches});
 return {platform,canvas,touch,emit,hide:()=>hide()};
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

for(const dpr of [1,2,3])test(`WeChat safe-area mapping scrolls the same logical distance at DPR ${dpr}`,()=>{
 const f=fixture(dpr),{session}=sessionHost({wallet:3000});Object.assign(session.view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets',cosmeticSetPreview:undefined,shopItemDetail:undefined});
 const actions:UiAction[]=[],commands:unknown[]=[];
 const input=new InputController({getState:()=>session.state,getView:()=>session.view,patchView:patch=>Object.assign(session.view,patch),preview:()=>({valid:true,events:[],cells:[],shipments:[]}),dispatch:command=>commands.push(command),togglePause:()=>{},restart:()=>{},resume:()=>{},toggleDebug:()=>{},action:action=>actions.push(action)});
 f.platform.onPointer(event=>{if(event.type==='cancel')input.cancel(event.id);else input[event.type](event.point,event.id);});f.platform.onHide(()=>input.cancel());
 f.emit('down',[f.touch(7,330,800)]);f.emit('move',[f.touch(7,330,650)]);f.emit('cancel',[]);f.emit('up',[f.touch(7,330,800)]);
 assert.equal(actions.length,1);assert.equal(actions[0].type,'scrollShop');assert.ok('deltaY' in actions[0]&&Math.abs(actions[0].deltaY-150)<1e-10);assert.deepEqual(commands,[]);
 actions.length=0;f.emit('down',[f.touch(9,330,800)]);f.emit('cancel',[]);f.emit('up',[f.touch(9,330,800)]);assert.equal(actions.length,0);
 f.emit('down',[f.touch(9,330,800)]);f.hide();f.emit('up',[f.touch(9,330,800)]);assert.equal(actions.length,0);
 f.emit('down',[f.touch(10,330,800)]);f.emit('move',[f.touch(10,330,700)]);f.emit('up',[f.touch(10,330,700)]);assert.equal(actions.length,1);assert.ok('deltaY' in actions[0]&&Math.abs(actions[0].deltaY-100)<1e-10);
 assert.equal(f.canvas.width,320*dpr);
});

test('WeChat safe-area letterboxing never turns a touch in the margin into a shop gesture',()=>{
 const f=fixture(),events:PointerEvent[]=[];f.platform.onPointer(event=>events.push(event));
 f.emit('down',[{identifier:1,clientX:160,clientY:33},{identifier:2,clientX:9,clientY:400}]);
 assert.deepEqual(events.map(event=>event.point),[{x:-1,y:-1},{x:-1,y:-1}]);
});
