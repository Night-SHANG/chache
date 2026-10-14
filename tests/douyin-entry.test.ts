import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,type Canvas} from '@napi-rs/canvas';
import {startDouyinGame} from '../src/platform/douyin-entry.ts';
import type {DouyinHost,DouyinTouchEvent,DouyinLaunchOptions} from '../src/platform/douyin.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {playableChecksum} from '../src/domain/playable.ts';

function start(store=new Map<string,string>()) {
 const canvases:Canvas[]=[],frames:((now:number)=>void)[]=[],labels:string[]=[],order:string[]=[];
 const touches=new Map<string,(event:DouyinTouchEvent)=>void>();let hide=()=>{},show:(options:DouyinLaunchOptions)=>void=()=>{},time=0,writes=0;
 const audio:{src:string;playing:boolean;volume:number;play():void;pause():void;stop():void;destroy():void}[]=[];
 const pendingImages:{src:string;onload:(()=>void)|null;onerror:((error:unknown)=>void)|null}[]=[];
 const host:DouyinHost={
  createCanvas:()=>{order.push('canvas');const canvas=createCanvas(1080,1920);canvases.push(canvas);const ctx=canvas.getContext('2d'),fillText=ctx.fillText.bind(ctx);ctx.fillText=(text,x,y,maxWidth)=>{labels.push(text);fillText(text,x,y,maxWidth);};return canvas as unknown as ReturnType<DouyinHost['createCanvas']>;},
  getSystemInfoSync:()=>({windowWidth:1080,windowHeight:1920,pixelRatio:1}),
  getLaunchOptionsSync:()=>({launch_from:'homepage',location:'sidebar_card'}),
  getStorageSync:key=>{order.push('storage');return store.get(key)??'';},setStorageSync:(key,value)=>{writes++;store.set(key,value);},removeStorageSync:key=>{store.delete(key);},
  getStorageInfoSync:()=>({keys:[...store.keys()],currentSize:[...store.values()].reduce((n,value)=>n+value.length,0)/1024,limitSize:10240}),
  onTouchStart:callback=>{touches.set('down',callback);},onTouchMove:callback=>{touches.set('move',callback);},onTouchEnd:callback=>{touches.set('up',callback);},onTouchCancel:callback=>{touches.set('cancel',callback);},
  onHide:callback=>{hide=callback;},onShow:callback=>{order.push('onShow');show=callback;},
  createInnerAudioContext:()=>{const context={src:'',playing:false,volume:1,play(){this.playing=true;},pause(){this.playing=false;},stop(){this.playing=false;},destroy(){this.playing=false;}};audio.push(context);return context;},
  createImage:()=>{const image={src:'',onload:null,onerror:null};pendingImages.push(image);return image;},
 };
 const game=startDouyinGame(host,{requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},now:()=>time},{developerMode:false,seed:42});
 return {...game,order,canvases,labels,store,audio,pendingImages,writes:()=>writes,frame:(delta=16)=>{time+=delta;const callback=frames.shift();assert.ok(callback);callback(time);},hide:()=>hide(),show:(options:DouyinLaunchOptions={})=>show(options),touch:(type:string,x:number,y:number,id=1)=>touches.get(type)?.({changedTouches:[{identifier:id,clientX:x,clientY:y}]})};
}

// Mutation targets: waiting for PNGs, initializing storage before onShow, or eagerly allocating offscreen canvases.
test('Douyin entry paints the real menu while images are pending and registers lifecycle before session storage',()=>{
 const game=start();assert.equal(game.order[0],'canvas');assert.ok(game.order.indexOf('onShow')<game.order.indexOf('storage'));assert.equal(game.canvases.length,1);
 assert.equal(game.platform.getEntrySource().fromSidebar,true);assert.ok(game.pendingImages.length>0);game.frame();
 assert.ok(game.labels.includes('入库模式'));assert.ok(game.labels.includes('出库模式'));assert.equal(game.session.view.screen,'menu');
 const before=JSON.stringify([...game.store]);for(const image of game.pendingImages)image.onerror?.(Error('art unavailable'));game.frame();assert.equal(JSON.stringify([...game.store]),before);
});
test('Douyin entry maps actual buttons and cancels a held press across hide/show',()=>{
 const game=start();const control=getUiControls(game.session.state,game.session.view).find(item=>item.action.type==='chooseInbound');assert.ok(control);
 const x=control.rect.x+control.rect.w/2,y=control.rect.y+control.rect.h/2;
 game.touch('down',x,y);assert.ok(game.session.view.pressedControl);game.hide();assert.equal(game.session.view.pressedControl,null);
 game.show({launch_from:'homepage',location:'sidebar_card'});game.touch('up',x,y);assert.equal(game.session.view.screen,'menu');
 game.touch('down',x,y,2);game.touch('up',x,y,2);assert.equal(game.session.view.screen,'inboundMenu');
});
test('Douyin hide saves the real running account, pauses music and restores the same board',()=>{
 const game=start();game.session.action({type:'newRun',mode:'standard',inboundDifficulty:'hard'});game.session.action({type:'prepareNext'});
 assert.equal(game.session.view.screen,'game');game.frame(1000);game.frame(1000);const before=playableChecksum(game.session.state),writes=game.writes();
 game.hide();assert.equal(game.session.view.paused,true);assert.ok(game.writes()>writes);assert.ok(game.audio.every(context=>!context.playing));
 game.show();assert.equal(game.session.view.paused,true);assert.equal(playableChecksum(game.session.state),before);
 const restored=start(game.store);assert.equal(playableChecksum(restored.session.state),before);assert.equal(restored.session.view.needsResume,true);
});
