import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {createProfile} from '../src/application/profile.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {createPlayableRun,applyPlayableCommand,playableChecksum,isInboundRun} from '../src/domain/playable.ts';
import type {RunSpec,GameRun,GameCommand} from '../src/domain/playable.ts';
import {createRun} from '../src/domain/engine.ts';
import {UPGRADES} from '../src/domain/content.ts';
import {createRunV9} from '../src/domain/v9/engine.ts';
import {UPGRADES_V9} from '../src/domain/v9/content.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {InputController} from '../src/presentation/input.ts';
import {render} from '../src/presentation/renderer.ts';
import {L,mapClientPoint} from '../src/presentation/layout.ts';
import type {Rect} from '../src/presentation/layout.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {createWechatPlatform} from '../src/platform/wechat.ts';
import type {WechatHost} from '../src/platform/wechat.ts';
import {createBrowserPlatform} from '../src/platform/browser.ts';

const tools={rotate:0,clear:0,wildcard:0} as const;
const specs:RunSpec[]=[
 ...(['hard','expert'] as const).flatMap(inboundDifficulty=>(['standard','endless'] as const).map(mode=>({family:'inbound' as const,rulesetVersion:18 as const,seed:110,mode,inboundDifficulty,guided:false,toolCharges:tools}))),
 {family:'inbound',rulesetVersion:21,seed:110,mode:'rush',guided:false,toolCharges:tools},
 ...(['easy','normal','hard','expert'] as const).flatMap(difficultyId=>(['normal','endless'] as const).map(variant=>({family:'outbound' as const,rulesetVersion:variant==='normal'?12 as const:13 as const,seed:110,variant,difficultyId,toolCharges:tools}))),
];
function run(spec=specs[0]):GameRun{const state=createPlayableRun(spec);return state.phase==='cleanup'?applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'}).state:state;}
function view(theme:ThemeId='day',patch:Partial<ViewState>={}):ViewState{
 const profile=createProfile();profile.cosmetics.theme=theme;
 return {screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:true,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile,...patch};
}
const labelOrder=['继续游戏','重新开始','返回主页','设置','玩法说明','结束并结算'];
for(const spec of specs)test(`pause moves every ${JSON.stringify(spec)} control up exactly 200 without changing size or spacing`,()=>{
 const state=run(spec),controls=getUiControls(state,view()),six=spec.family==='inbound'?spec.mode==='endless':spec.variant==='endless';
 assert.equal(controls.length,six?6:5);
 assert.deepEqual(controls.map(c=>c.label),labelOrder.slice(0,six?6:5));
 assert.deepEqual(controls.map(c=>c.rect),controls.map((_,i)=>({x:246,y:890+i*130,w:588,h:104})));
 for(const c of controls){assert.equal(c.buttonRole,undefined);assert.equal(c.selected,undefined);assert.equal(c.disabled,undefined);}
});
for(const spec of specs)test(`pause input follows moved controls and blocks board/edges for ${JSON.stringify(spec)}`,()=>{
 const state=run(spec),v=view(),commands:GameCommand[]=[],actions:UiAction[]=[];
 const controller=new InputController({getState:()=>state,getView:()=>v,patchView:patch=>Object.assign(v,patch),preview:()=>({valid:true,cells:[],shipments:[],events:[]}),dispatch:command=>commands.push(command),togglePause(){throw Error('Hidden pause control');},restart(){throw Error('Legacy restart control');},resume(){throw Error('Recovery control');},toggleDebug(){},action:action=>actions.push(action)});
 for(const [index,c]of getUiControls(state,v).entries()){
  const p={x:540,y:942+index*130};controller.down(p);assert.deepEqual(v.pressedControl?.rect,c.rect);controller.up(p);assert.deepEqual(actions[actions.length-1],c.action);
 }
 const n=actions.length;v.selectedPieceId=state.candidates[0].id;
 for(const p of [{x:100,y:600},{x:980,y:110},{x:540,y:1770},{x:300,y:1600},{x:-30,y:1000},{x:1110,y:1000}]){if(getUiControls(state,v).some(c=>p.x>=c.rect.x&&p.x<c.rect.x+c.rect.w&&p.y>=c.rect.y&&p.y<c.rect.y+c.rect.h))continue;controller.down(p);controller.move({x:90,y:900});controller.up({x:90,y:900});}
 assert.equal(actions.length,n);assert.deepEqual(commands,[]);
 for(const viewport of [{x:0,y:0,w:390,h:844},{x:17,y:24,w:512,h:768},{x:20,y:32,w:1160,h:840}]){
  const s=Math.min(viewport.w/L.width,viewport.h/L.height),ox=viewport.x+(viewport.w-L.width*s)/2,oy=viewport.y+(viewport.h-L.height*s)/2;
  for(const c of getUiControls(state,v)){const p=mapClientPoint({x:ox+(c.rect.x+c.rect.w/2)*s,y:oy+(c.rect.y+c.rect.h/2)*s},viewport);assert.ok(p);controller.down(p);controller.up(p);assert.deepEqual(actions[actions.length-1],c.action);}
 }
});

type SurfaceSpec={width:number;height:number;dpr:number;safe?:{left:number;top:number;width:number;height:number}};
const surfaces:SurfaceSpec[]=[{width:540,height:960,dpr:1},{width:390,height:844,dpr:2},{width:512,height:768,dpr:3},{width:1356,height:660,dpr:1},{width:560,height:840,dpr:2,safe:{left:17,top:24,width:512,height:768}}];
const renderer=render as (ctx:CanvasRenderingContext2D,state:GameRun,v:ViewState,background?:Rect,overlay?:Rect)=>void;
function capture(state:GameRun,v:ViewState,spec:SurfaceSpec,expanded=true){
 const {width,height,dpr}=spec,safe=spec.safe??{left:0,top:0,width,height},canvas=createCanvas(Math.round(width*dpr),Math.round(height*dpr)),ctx=canvas.getContext('2d');
 const scale=Math.min(safe.width/1080,safe.height/1920),ox=safe.left+(safe.width-1080*scale)/2,oy=safe.top+(safe.height-1920*scale)/2;
 ctx.fillStyle='#0c131c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale*dpr,0,0,scale*dpr,ox*dpr,oy*dpr);
 const transform=ctx.getTransform(),bounds={x:-ox/scale,y:-oy/scale,w:canvas.width/(scale*dpr),h:canvas.height/(scale*dpr)};
 renderer(ctx as unknown as CanvasRenderingContext2D,state,v,{x:(1080-safe.width/scale)/2,y:0,w:safe.width/scale,h:1920},expanded?bounds:undefined);
 assert.deepEqual(ctx.getTransform(),transform,'modal must preserve platform transform');
 return {canvas,ctx,scale,ox,oy,bounds};
}
function rgba(s:ReturnType<typeof capture>,x:number,y:number){return [...s.ctx.getImageData(x,y,1,1).data];}
function shaded(pixel:number[],alpha=.84){return pixel.map((value,i)=>i===3?255:Math.round(value*(1-alpha)+[5,11,18][i]*alpha));}
for(const theme of ['day','night','cold_chain','steam_foundry'] as const)for(const surface of surfaces)test(`pause shades full actual viewport for ${theme} ${JSON.stringify(surface)}`,()=>{
 const state=run(),before=playableChecksum(state),active=capture(state,view(theme,{paused:false}),surface),paused=capture(state,view(theme),surface),designOnly=capture(state,view(theme),surface,false);
 const points=[[0,0],[0,Math.floor(paused.canvas.height/2)],[paused.canvas.width-1,Math.floor(paused.canvas.height/2)],[paused.canvas.width-1,paused.canvas.height-1],[-35,1000],[1110,1000]].map(([x,y],i)=>i<4?[x,y]:[Math.round((paused.ox+x*paused.scale)*surface.dpr),Math.round((paused.oy+y*paused.scale)*surface.dpr)]).filter(([x,y])=>x>=0&&y>=0&&x<paused.canvas.width&&y<paused.canvas.height);
 for(const [x,y]of points){const actual=rgba(paused,x,y),expected=shaded(rgba(active,x,y));assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=2),`Unshaded viewport pixel ${x},${y}: ${actual} vs ${expected}`);}
 const x=Math.ceil((paused.ox+190*paused.scale)*surface.dpr),y=Math.ceil((paused.oy+450*paused.scale)*surface.dpr),w=Math.floor(700*paused.scale*surface.dpr),h=Math.floor(1300*paused.scale*surface.dpr);
 assert.deepEqual(paused.ctx.getImageData(x,y,w,h).data,designOnly.ctx.getImageData(x,y,w,h).data,'expanding shade cannot dim or recolor modal body/buttons');
 assert.equal(playableChecksum(state),before);
});
test('two wrapped save warnings remain above the shifted five/six-button group',()=>{
 for(const spec of [specs[0],specs[1]]){
  const state=run(spec),v=view('day',{saveStatus:'本局记录已达保存上限，请先结束本局。',profileStatus:'旧游戏记录暂时无法读取，原记录已保留。'}),canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),fill=ctx.fillText.bind(ctx),warnings:{bottom:number;value:string}[]=[];
  ctx.fillText=(value,x,y)=>{if(value.includes('记录')&&y<890)warnings.push({value,bottom:y+ctx.measureText(value).actualBoundingBoxDescent});fill(value,x,y);};render(ctx as unknown as CanvasRenderingContext2D,state,v);
  assert.equal(warnings.length,2);assert.ok(warnings.every(w=>w.bottom<890-30));
 }
});
for(const dpr of [1,2,3])test(`platform supplies distinct full-canvas modal bounds at DPR ${dpr}`,()=>{
 const screen=createCanvas(1,1),info={windowWidth:560,windowHeight:840,pixelRatio:dpr,safeArea:{left:17,top:24,width:512,height:768}},host={createCanvas:()=>screen,getWindowInfo:()=>info,onWindowResize(){}} as unknown as WechatHost;
 const platform=createWechatPlatform(host,{requestAnimationFrame:()=>1,now:()=>0}) as ReturnType<typeof createWechatPlatform>&{overlayBounds?():Rect};platform.beginFrame();
 assert.deepEqual(platform.backgroundBounds?.(),{x:-100,y:0,w:1280,h:1920});const overlay=platform.overlayBounds?.();assert.ok(overlay);for(const [key,value] of Object.entries({x:-142.5,y:-60,w:1400,h:2100}))assert.ok(Math.abs(overlay[key as keyof Rect]-value)<1e-8);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');Object.assign(screen,{getBoundingClientRect:()=>({left:19,top:31,width:390,height:844})});Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:dpr,addEventListener(){}}});
 try{const browser=createBrowserPlatform(screen as unknown as HTMLCanvasElement) as ReturnType<typeof createBrowserPlatform>&{overlayBounds?():Rect};browser.beginFrame();const bounds=browser.overlayBounds?.();assert.ok(bounds);assert.equal(bounds.x,0);assert.ok(Math.abs(bounds.y+208.61538461538458)<1e-8);assert.ok(Math.abs(bounds.h-2337.230769230769)<1e-8);assert.deepEqual(browser.backgroundBounds?.(),{x:0,y:0,w:1080,h:1920});}finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});

test('all shared blocking overlays shade the viewport with their original opacity',()=>{
 const surface={width:512,height:768,dpr:1},state=run(),base=view('cold_chain',{paused:false});assert.ok(isInboundRun(state));
 const legacy=createRun(110,'standard'),growth=createRunV9({seed:110,mode:'standard',guided:false,toolCharges:tools});
 legacy.phase='upgrade';legacy.upgradeChoices=UPGRADES.slice(0,3).map(u=>u.id);
 growth.phase='upgrade';growth.upgradeChoices=UPGRADES_V9.slice(0,3).map(u=>u.id);
 const scenarios:{name:string;state:GameRun;patch:Partial<ViewState>;alpha:number}[]=[
  {name:'pause',state,patch:{paused:true},alpha:.84},
  {name:'recovery',state,patch:{needsResume:true},alpha:.84},
  {name:'confirmation',state,patch:{confirmation:{kind:'newRun'}},alpha:.84},
  {name:'save blocked',state,patch:{accountBlocked:true},alpha:.84},
  {name:'supply',state,patch:{supplyUpgrade:'cargo_supply'},alpha:.84},
  {name:'cleanup',state:{...state,phase:'cleanup'},patch:{},alpha:.65},
  {name:'prepare cleanup',state,patch:{screen:'prepareCleanup'},alpha:.65},
  {name:'result',state:{...state,phase:'result',result:'failed'},patch:{},alpha:.84},
  {name:'legacy upgrades',state:legacy,patch:{},alpha:.84},
  {name:'growth upgrades',state:growth,patch:{},alpha:.84},
 ];
 const before=capture(state,base,surface);
 for(const scene of scenarios){const after=capture(scene.state,{...base,...scene.patch},surface);for(const [x,y]of [[0,300],[25,400],[490,400],[511,700]]){const actual=rgba(after,x,y),expected=shaded(rgba(before,x,y),scene.alpha);assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<=2),`${scene.name} edge ${x},${y}: ${actual} vs ${expected}`);}}
});
