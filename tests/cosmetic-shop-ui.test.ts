import './helpers/static-art-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
const state=createRunV14({seed:11,mode:'standard'});
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),account:makeAccountFixture({wallet:900}),...patch});
function words(v:ViewState){const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,labels:string[]=[];const fill=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>{labels.push(value);fill(value,x,y);};render(ctx,state,v);return labels.join('\n');}
test('shop preserves tool purchases and selected root tabs while settings contains no appearance controls',()=>{
 const v=view(),controls=getUiControls(state,v);assert.deepEqual(controls.filter(c=>c.action.type==='selectShopTab').map(c=>[c.label,c.selected]),[['道具',true],['外观',false]]);assert.equal(controls.filter(c=>c.action.type==='purchase').length,3);
 const settings=getUiControls(state,view({screen:'settings'}));assert.deepEqual(settings.map(c=>c.action.type),['toggleMusic','toggleSound','toggleVibration','toggleMotion','resetProfile','back']);assert.doesNotMatch(words(view({screen:'settings'})),/仓库主题|叉车涂装|货箱样式/);
});
test('cosmetic selection exposes preview-only cards, exact prices, locked achievements and free separate equip',()=>{
 const v=view({shopTab:'cosmetics',shopSection:'cargo',cosmeticPreview:{cargo:'wood'}}),controls=getUiControls(state,v),out=words(v);
 assert.equal(controls.filter(c=>c.action.type==='selectShopSection').length,3);const list=getUiControls(state,view({shopTab:'cosmetics',shopSection:'cargo'}));assert.equal(list.filter(c=>c.action.type==='selectShopSection').length,3);assert.deepEqual(list.filter(c=>c.action.type==='previewCosmetic').slice(0,4).map(c=>c.action.type==='previewCosmetic'&&`${c.action.kind}.${c.action.id}`),['cargo.classic','cargo.outline','cargo.wood','cargo.insulated']);assert.equal(controls.find(c=>c.action.type==='purchaseCosmetic')?.label,'300金币 · 购买');assert.match(out,/原木藤箱/);
 const locked=words(view({shopTab:'cosmetics',shopSection:'forklift',cosmeticPreview:{forklift:'red'}}));assert.match(locked,/成就解锁/);assert.match(locked,/通关入库五班后解锁/);
 const account=retainAccountCosmetics(makeAccountFixture({wallet:0}));account.profile.ownedCosmetics!.push('cargo.wood');account.profile.ownedCosmetics!.sort();
 const owned=getUiControls(state,view({account,shopTab:'cosmetics',shopSection:'cargo',cosmeticPreview:{cargo:'wood'}}));assert.equal(owned.find(c=>c.action.type==='equipCosmetic')?.label,'装备');
 account.profile.cosmetics.cargo='wood';assert.equal(getUiControls(state,view({account,shopTab:'cosmetics',shopSection:'cargo',cosmeticPreview:{cargo:'wood'}})).find(c=>c.action.type==='equipCosmetic')?.label,'使用中');
});
test('all shop tabs categories cards actions and back are disjoint and at least 44 CSS pixels at three sizes',()=>{
 for(const viewport of [{w:360,h:800},{w:540,h:960},{w:1200,h:900}])for(const category of ['theme','cargo','forklift'] as const)for(const tab of ['tools','cosmetics'] as const){
  const v=view({shopTab:tab,cosmeticCategory:category}),controls=getUiControls(state,v),scale=Math.min(viewport.w/1080,viewport.h/1920);
  for(const [index,c] of controls.entries()){assert.ok(c.rect.w*scale>=44&&c.rect.h*scale>=44,`${tab}/${category} small ${c.action.type}`);assert.ok(c.rect.y+c.rect.h<=1920);
   for(const other of controls.slice(index+1))assert.ok(c.rect.x+c.rect.w<=other.rect.x||other.rect.x+other.rect.w<=c.rect.x||c.rect.y+c.rect.h<=other.rect.y||other.rect.y+other.rect.h<=c.rect.y,`${c.action.type} overlaps ${other.action.type}`);
  }
 }
});

import {applyCommandV14} from '../src/domain/v14/engine.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {createRun} from '../src/domain/engine.ts';
import type {GameRun} from '../src/domain/playable.ts';
function pixels(run:GameRun,v:ViewState,region={x:0,y:0,w:1080,h:1920}){const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D;render(ctx,run,v);return ctx.getImageData(region.x,region.y,region.w,region.h).data;}
test('account-only source renders equipped cargo on real boards, trays and dragging without changing checksums',()=>{
 for(const run of [applyCommandV14(createRunV14({seed:7,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state,createRun(7,'standard',3),createRun(7,'color_exit',8,'expert')]){
  run.board[10]='cargo.food';const account=retainAccountCosmetics(makeAccountFixture());account.profile.ownedCosmetics!.push('cargo.wood');account.profile.ownedCosmetics!.sort();
  const classic=view({screen:'game',account,profile:undefined}),snapshot=playableChecksum(run),base=pixels(run,classic,{x:160,y:540,w:730,h:850}),trays=pixels(run,classic,{x:48,y:1530,w:984,h:272});
  const woodAccount=structuredClone(account);woodAccount.profile.cosmetics.cargo='wood';const skinned=view({screen:'game',account:woodAccount,profile:undefined});
  assert.notDeepEqual(pixels(run,skinned,{x:160,y:540,w:730,h:850}),base);assert.notDeepEqual(pixels(run,skinned,{x:48,y:1530,w:984,h:272}),trays);
  const drag={selectedPieceId:run.candidates[0].id,dragPoint:{x:520,y:1050}};assert.notDeepEqual(pixels(run,{...classic,...drag},{x:420,y:950,w:420,h:420}),pixels(run,{...skinned,...drag},{x:420,y:950,w:420,h:420}));
  const outlineAccount=structuredClone(woodAccount);outlineAccount.profile.cargoOutline=true;assert.notDeepEqual(pixels(run,view({screen:'game',account:outlineAccount,profile:undefined})),pixels(run,skinned));assert.equal(playableChecksum(run),snapshot);
 }
});

import {createRunV9,applyCommandV9} from '../src/domain/v9/engine.ts';
import {shipmentFrame,shipmentPose} from '../src/presentation/motion.ts';
import {drawColorExitShipment} from '../src/presentation/color-exit-renderer.ts';
import {buildOutboundTransport} from '../src/presentation/outbound-transport.ts';
import type {Shipment,Cell} from '../src/domain/types.ts';
import type {GameShipment} from '../src/domain/playable.ts';

test('inbound loaded cargo uses wood and independent outlines on current 7 and retained 8 cell boards',()=>{
 const initial=applyCommandV9(createRunV9({seed:2,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
 for(const size of [7,8] as const){
  const run={...initial,boardSize:size,board:Array<Cell>(size*size).fill(null),cellTraits:Array(size*size).fill(null)},cell=3+3*size;run.board[cell]='cargo.food';
  const shipment:GameShipment={type:'shipment',boardSize:size,gateId:'dock.north',units:1,extraClearedCells:[],dockId:'dock.north',orderId:'order.old',cargo:'cargo.food',cells:[cell],path:[{x:3,y:0},{x:3,y:1},{x:3,y:2}],score:450,chain:1};
  const account=retainAccountCosmetics(makeAccountFixture());account.profile.ownedCosmetics!.push('cargo.wood');account.profile.ownedCosmetics!.sort();
  const v=view({screen:'game',account,animation:{shipment,progress:.65,board:run.board}}),pose=shipmentPose(shipment,shipmentFrame(.65,false));assert.ok(pose?.loaded);
  const region={x:Math.floor(pose.cargo.x-34),y:Math.floor(pose.cargo.y-35),w:70,h:55},classic=pixels(run,v,region),snapshot=playableChecksum(run);
  account.profile.cosmetics.cargo='wood';const wood=pixels(run,v,region);assert.notDeepEqual(wood,classic);account.profile.cargoOutline=true;assert.notDeepEqual(pixels(run,v,region),wood);assert.equal(playableChecksum(run),snapshot);
 }
});
test('outbound loaded cargo and white forklift apply source-account appearance on both transport sizes',()=>{
 for(const size of [7,9] as const){
  const middle=Math.floor(size/2),cells=[middle,middle+size,middle+size*2],board:Array<Cell>=Array(size*size).fill(null);cells.forEach(cell=>board[cell]='cargo.food');
  const shipment:Shipment={type:'shipment',...(size===9?{boardSize:9}:{}),transport:'conveyor',dockId:'dock.north',orderId:'exit.food',cargo:'cargo.food',cells,path:Array.from({length:size-3},(_,i)=>({x:middle,y:size-1-i})),cargoPaths:cells.map((cell,i)=>({cell,path:Array.from({length:i+1},(_,n)=>({x:middle,y:i-n}))})),score:30,chain:1};
  const plan=buildOutboundTransport(shipment,board);assert.ok(plan);const step=plan.steps.find(s=>s.loadedCount>0&&s.kind==='move');assert.ok(step);const progress=(step.startMs+step.endMs)/2/plan.durationMs;
  const account=retainAccountCosmetics(makeAccountFixture()),v=view({screen:'game',account,profile:undefined,animation:{shipment,progress,board,transportPlan:plan}}),snapshot=JSON.stringify({shipment,plan,board});
  const draw=()=>{const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D;drawColorExitShipment(ctx,shipment,progress,v);return ctx.getImageData(0,0,1080,1920).data;};
  const classic=draw();account.profile.cosmetics.cargo='wood';const wood=draw();assert.notDeepEqual(wood,classic);account.profile.cargoOutline=true;assert.notDeepEqual(draw(),wood);const yellow=draw();account.profile.cosmetics.forklift='white';assert.notDeepEqual(draw(),yellow);assert.equal(JSON.stringify({shipment,plan,board}),snapshot);
 }
});
test('legacy outline projection survives renderer normalization and cold chain changes board material without changing cargo overlays',()=>{
 const run=applyCommandV14(createRunV14({seed:7,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;run.board[10]='cargo.food';
 const profile=createProfile();profile.cosmetics.cargo='outline';const old=view({screen:'game',account:null,profile});
 const account=retainAccountCosmetics(makeAccountFixture());account.profile.cargoOutline=true;const modern=view({screen:'game',account,profile:undefined}),region={x:120,y:560,w:840,h:840};assert.deepEqual(pixels(run,old,region),pixels(run,modern,region));
 account.profile.cosmetics.theme='cold_chain';assert.notDeepEqual(pixels(run,old,{x:126,y:566,w:30,h:30}),pixels(run,modern,{x:126,y:566,w:30,h:30}));assert.notDeepEqual(pixels(run,old,{x:0,y:0,w:120,h:400}),pixels(run,modern,{x:0,y:0,w:120,h:400}));
});
