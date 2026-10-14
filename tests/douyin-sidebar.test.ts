import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,type Canvas} from '@napi-rs/canvas';
import {startDouyinGame} from '../src/platform/douyin-entry.ts';
import type {DouyinHost,DouyinTouchEvent,DouyinLaunchOptions} from '../src/platform/douyin.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';

const RECT={x:84,y:100,w:216,h:132},CENTER={x:192,y:166};
type CheckRequest=Parameters<NonNullable<DouyinHost['checkScene']>>[0];
type NavigateRequest=Parameters<NonNullable<DouyinHost['navigateToScene']>>[0];
function start(supported=true,width=1080,height=1920) {
 const canvases:Canvas[]=[],frames:((now:number)=>void)[]=[],labels:string[]=[],calls:string[]=[],store=new Map<string,string>();
 const checks:CheckRequest[]=[],navigations:NavigateRequest[]=[],touches=new Map<string,(event:DouyinTouchEvent)=>void>();
 let hide=()=>{},show:(options:DouyinLaunchOptions)=>void=()=>{},time=0;
 const host:DouyinHost={
  createCanvas:()=>{const canvas=createCanvas(width,height);canvases.push(canvas);const ctx=canvas.getContext('2d'),fillText=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y,maxWidth)=>{labels.push(value);fillText(value,x,y,maxWidth);};return canvas as unknown as ReturnType<DouyinHost['createCanvas']>;},
  getSystemInfoSync:()=>({windowWidth:width,windowHeight:height,pixelRatio:1}),
  getLaunchOptionsSync:()=>({launch_from:'homepage',location:'sidebar_card'}),
  getStorageSync:key=>store.get(key)??'',setStorageSync:(key,value)=>{store.set(key,value);},removeStorageSync:key=>{store.delete(key);},
  getStorageInfoSync:()=>({keys:[...store.keys()],currentSize:0,limitSize:10240}),
  onTouchStart:callback=>{touches.set('down',callback);},onTouchMove:callback=>{touches.set('move',callback);},onTouchEnd:callback=>{touches.set('up',callback);},onTouchCancel:callback=>{touches.set('cancel',callback);},
  onHide:callback=>{hide=callback;},onShow:callback=>{show=callback;},
  createInnerAudioContext:()=>({play(){},pause(){},stop(){},destroy(){}}),
  createImage:()=>({src:'',onload:null,onerror:null}),
  ...(supported?{checkScene:(request:CheckRequest)=>{calls.push('check');checks.push(request);},navigateToScene:(request:NavigateRequest)=>{calls.push('navigate');navigations.push(request);}}:{}),
 };
 const game=startDouyinGame(host,{requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},now:()=>time},{seed:42});
 const touch=(type:string,x=CENTER.x,y=CENTER.y,id=1)=>touches.get(type)?.({changedTouches:[{identifier:id,clientX:x*width/1080,clientY:y*height/1920}]});
 return {...game,canvases,labels,calls,checks,navigations,store,touch,tap:(id=1)=>{touch('down',CENTER.x,CENTER.y,id);touch('up',CENTER.x,CENTER.y,id);},
  frame:(delta=16)=>{labels.length=0;time+=delta;const callback=frames.shift();assert.ok(callback);callback(time);},hide:()=>hide(),show:(options:DouyinLaunchOptions={})=>show(options)};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

// Removing the platform-only overlay must fail the label assertion; drawing outside
// its approved bounds must fail the pixel comparison, including the title/footer.
test('sidebar adds only the approved left button and never probes or navigates automatically',()=>{
 const game=start();game.frame();assert.ok(game.labels.includes('侧边栏'));
 assert.deepEqual(game.calls,[]);assert.equal(game.platform.getEntrySource().fromSidebar,true);
 const baseline=createCanvas(1080,1920);render(baseline.getContext('2d') as unknown as CanvasRenderingContext2D,game.session.state,game.session.view);
 const before=baseline.getContext('2d').getImageData(0,0,1080,1920).data,after=game.canvases[0].getContext('2d').getImageData(0,0,1080,1920).data;
 let changed=0;for(let y=0;y<1920;y++)for(let x=0;x<1080;x++)for(let c=0;c<4;c++){
  const i=(y*1080+x)*4+c;if(before[i]!==after[i]){changed++;assert.ok(x>=RECT.x-4&&x<RECT.x+RECT.w+4&&y>=RECT.y-4&&y<RECT.y+RECT.h+8,`unexpected home change at ${x},${y}`);}
 }
 assert.ok(changed>1000);assert.ok(RECT.w/3>=44&&RECT.h/3>=44);
 game.hide();game.show({launch_from:'homepage',location:'sidebar_card'});game.frame();assert.deepEqual(game.calls,[]);
});

// An implementation that navigates on down, skips checkScene, or auto-rewards must fail.
test('sidebar opens only after a completed explicit tap and a successful capability check, without saved changes',async()=>{
 const game=start(),before=JSON.stringify([...game.store]),account=JSON.stringify(game.session.view.account);
 game.touch('down');assert.deepEqual(game.calls,[]);assert.equal(game.session.view.pressedControl,null);
 game.touch('up');assert.deepEqual(game.calls,['check']);assert.equal(game.checks[0].scene,'sidebar');
 game.checks[0].success?.({isExist:true});await settle();assert.deepEqual(game.calls,['check','navigate']);assert.equal(game.navigations[0].scene,'sidebar');
 game.navigations[0].success?.({});await settle();assert.equal(JSON.stringify([...game.store]),before);assert.equal(JSON.stringify(game.session.view.account),account);
 game.hide();game.show({launch_from:'homepage',location:'sidebar_card'});game.hide();game.show({launch_from:'homepage',location:'sidebar_card'});
 assert.equal(JSON.stringify(game.session.view.account),account);assert.deepEqual(game.calls,['check','navigate']);
});

test('sidebar remains hidden and noninteractive beneath recovery, confirmation, blocked account and other screens',()=>{
 const patches:Partial<ViewState>[]=[{screen:'settings'},{screen:'game'},{needsResume:true},{confirmation:{kind:'resetProfile'}},{accountBlocked:true},{paused:true},{toolboxOpen:true},{supplyUpgrade:'cargo_supply'}];
 for(const patch of patches){const game=start();Object.assign(game.session.view,patch);game.frame();assert.ok(!game.labels.includes('侧边栏'),JSON.stringify(patch));game.tap();assert.deepEqual(game.calls,[]);}
});

test('unsupported sidebar keeps the full menu usable and offers local retry',async()=>{
 const game=start(false);game.tap();await settle();game.frame();assert.ok(game.labels.includes('暂不可用'));assert.ok(game.labels.includes('稍后再试'));
 assert.ok(game.labels.includes('入库模式'));assert.ok(game.labels.includes('出库模式'));assert.equal(game.session.view.screen,'menu');
 const inbound=getUiControls(game.session.state,game.session.view).find(control=>control.action.type==='chooseInbound');assert.ok(inbound);
 game.touch('down',inbound.rect.x+10,inbound.rect.y+10,2);game.touch('up',inbound.rect.x+10,inbound.rect.y+10,2);assert.equal(game.session.view.screen,'inboundMenu');
});

test('sidebar consumes only its own pointers and cancels moved, cancelled or hidden presses',async()=>{
 for(const interrupted of ['move','cancel','hide'] as const){const game=start();game.touch('down');
  if(interrupted==='hide'){game.hide();game.show();}else game.touch(interrupted,CENTER.x+30,CENTER.y);
  game.touch('up');await settle();assert.deepEqual(game.calls,[],interrupted);
  game.tap(2);assert.deepEqual(game.calls,['check'],`${interrupted} must allow a fresh tap`);
 }
 const game=start();game.touch('down',400,600,3);game.touch('up',CENTER.x,CENTER.y,3);assert.deepEqual(game.calls,[],'up entering the button cannot create a gesture');
});

test('sidebar debounces parallel checks and navigation, then permits retry after navigation failure',async()=>{
 const game=start();game.tap(1);game.tap(2);game.tap(3);assert.equal(game.checks.length,1);
 game.checks[0].success?.({isExist:true});await settle();game.tap(4);assert.equal(game.navigations.length,1);assert.equal(game.checks.length,1);
 game.navigations[0].fail?.({errMsg:'cancelled'});await settle();game.frame();assert.ok(game.labels.includes('打开失败'));assert.ok(game.labels.includes('点此重试'));
 game.tap(5);assert.equal(game.checks.length,2);game.checks[1].success?.({isExist:true});await settle();assert.equal(game.navigations.length,2);
});

test('a stale capability result cannot navigate after hide, page departure, or a modal',async()=>{
 for(const interruption of ['hide','page','modal'] as const){const game=start();game.tap();assert.equal(game.checks.length,1);
  if(interruption==='hide'){game.hide();game.show();}
  else if(interruption==='page'){
   const inbound=getUiControls(game.session.state,game.session.view).find(control=>control.action.type==='chooseInbound');assert.ok(inbound);
   game.touch('down',inbound.rect.x+10,inbound.rect.y+10,2);game.touch('up',inbound.rect.x+10,inbound.rect.y+10,2);game.session.view.screen='menu';
  }else game.session.view.confirmation={kind:'resetProfile'};
  game.checks[0].success?.({isExist:true});await settle();assert.equal(game.navigations.length,0,interruption);
 }
});

test('unanswered checks expire locally and late callbacks cannot hijack a newer tap',async()=>{
 const game=start();game.tap();assert.equal(game.checks.length,1);game.frame(9000);assert.ok(game.labels.includes('响应超时'));assert.ok(game.labels.includes('点此重试'));
 game.tap(2);assert.equal(game.checks.length,2);game.checks[0].success?.({isExist:true});await settle();assert.equal(game.navigations.length,0);
 game.checks[1].success?.({isExist:true});await settle();assert.equal(game.navigations.length,1);
});

test('the approved sidebar target remains a full 72 by 44 touch area at 360 pixel width',()=>{
 for(const point of [{x:RECT.x+1,y:RECT.y+1},{x:RECT.x+RECT.w-1,y:RECT.y+RECT.h-1}]){
  const game=start(true,360,640);game.touch('down',point.x,point.y);game.touch('up',point.x,point.y);assert.equal(game.checks.length,1);
 }
});

// A departed gesture must stay cancelled even when the pointer returns inside.
test('dragging out and back, simultaneous fingers, and a newly opened modal never manufacture a sidebar tap',async()=>{
 const game=start();game.touch('down');game.touch('move',RECT.x-10,CENTER.y);game.touch('move',CENTER.x,CENTER.y);game.touch('up');assert.deepEqual(game.calls,[]);
 game.touch('down',CENTER.x,CENTER.y,2);game.touch('down',CENTER.x,CENTER.y,3);game.touch('up',CENTER.x,CENTER.y,3);assert.deepEqual(game.calls,[]);
 game.touch('up',CENTER.x,CENTER.y,2);assert.deepEqual(game.calls,['check']);game.checks[0].fail?.({});await settle();
 game.touch('down',CENTER.x,CENTER.y,4);game.session.view.confirmation={kind:'resetProfile'};game.frame();game.session.view.confirmation=null;game.touch('up',CENTER.x,CENTER.y,4);assert.equal(game.checks.length,1);
 game.tap(5);assert.equal(game.checks.length,2);
});

test('old navigation completion cannot clear or fail a newer request after a warm return',async()=>{
 for(const outcome of ['success','fail'] as const){
  const game=start();game.tap();game.checks[0].success?.({isExist:true});await settle();assert.equal(game.navigations.length,1);
  game.hide();game.show({launch_from:'homepage',location:'sidebar_card'});game.tap(2);assert.equal(game.checks.length,2);
  game.navigations[0][outcome]?.({});await settle();game.frame();assert.ok(game.labels.includes('检查中…'),outcome);assert.ok(!game.labels.includes('打开失败'));
  game.tap(3);assert.equal(game.checks.length,2,'old result cannot unlock a second request');
  game.checks[1].success?.({isExist:true});await settle();assert.equal(game.navigations.length,2);
 }
});

test('unanswered navigation expires and an unsuccessful capability probe can also be retried',async()=>{
 const game=start();game.tap();game.checks[0].fail?.({errMsg:'network unavailable'});await settle();game.frame();assert.ok(game.labels.includes('暂不可用'));
 game.tap(2);game.checks[1].success?.({isExist:true});await settle();assert.equal(game.navigations.length,1);game.frame(9000);assert.ok(game.labels.includes('响应超时'));
 game.tap(3);assert.equal(game.checks.length,3);game.navigations[0].fail?.({});await settle();game.frame();assert.ok(game.labels.includes('检查中…'));
});

test('sidebar pressed, busy and retry feedback never paints outside the original button silhouette',async()=>{
 const game=start();
 const localOnly=()=>{
  game.frame();const baseline=createCanvas(1080,1920);render(baseline.getContext('2d') as unknown as CanvasRenderingContext2D,game.session.state,game.session.view);
  const a=baseline.getContext('2d').getImageData(0,0,1080,1920).data,b=game.canvases[0].getContext('2d').getImageData(0,0,1080,1920).data;
  for(let y=0;y<1920;y++)for(let x=0;x<1080;x++)if(x<RECT.x-4||x>=RECT.x+RECT.w+4||y<RECT.y-4||y>=RECT.y+RECT.h+8){
   const i=(y*1080+x)*4;for(let c=0;c<4;c++)assert.equal(b[i+c],a[i+c],`feedback outside approved button at ${x},${y}`);
  }
 };
 game.touch('down');localOnly();game.touch('up');localOnly();game.checks[0].success?.({isExist:false});await settle();localOnly();
 game.tap(2);game.checks[1].success?.({isExist:true});await settle();localOnly();game.navigations[0].fail?.({});await settle();localOnly();
 game.tap(3);game.frame(9000);localOnly();
});
