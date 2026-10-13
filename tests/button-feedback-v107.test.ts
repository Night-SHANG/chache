import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {InputController} from '../src/presentation/input.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {createRun} from '../src/domain/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import {L} from '../src/presentation/layout.ts';
const center=(r:{x:number;y:number;w:number;h:number})=>({x:r.x+r.w/2,y:r.y+r.h/2});
function fixture(){
 const state=createRun(1,'standard',3),view={screen:'menu',profile:createProfile(),selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false} as ViewState;
 const actions:UiAction[]=[],activations:boolean[]=[];
 const input=new InputController({getState:()=>state,getView:()=>view,patchView:p=>Object.assign(view,p),preview:()=>({valid:true,events:[],cells:[],shipments:[]}),dispatch:()=>{},togglePause:()=>{view.paused=!view.paused;},restart:()=>{},resume:()=>{},toggleDebug:()=>{},action:a=>{actions.push(a);},activate:(act:()=>void,major:boolean)=>{act();activations.push(major);}});
 const first=()=>getUiControls(state,view).find(c=>!c.disabled)!;
 return {state,view,actions,activations,input,first};
}
test('enabled control pressure appears on down, follows exit/reentry and clears on release without changing hitbox',()=>{
 const h=fixture(),r=h.first().rect,p=center(r);h.input.down(p,1);assert.deepEqual(h.view.pressedControl?.rect,r);assert.equal(h.view.pressedControl?.visible,true);
 h.input.move({x:1,y:1},1);assert.equal(h.view.pressedControl?.visible,false);h.input.move(p,1);assert.equal(h.view.pressedControl?.visible,true);
 assert.deepEqual(h.first().rect,r);h.input.up(p,1);assert.equal(h.view.pressedControl,null);assert.equal(h.actions.length,1);assert.deepEqual(h.activations,[false]);h.input.up(p,1);assert.equal(h.activations.length,1);
});
for(const end of ['cancel','outside','page-change','modal-replace','disabled-change'] as const)test(`pressure ${end} never commits stale control or acknowledges`,()=>{
 const h=fixture();if(end==='modal-replace')h.view.confirmation={kind:'newRun'};
 if(end==='disabled-change'){h.view.screen='colorTiers';}
 const c=h.first(),p=center(c.rect);h.input.down(p);assert.ok(h.view.pressedControl);
 if(end==='cancel')h.input.cancel();if(end==='page-change')h.view.screen='settings';if(end==='modal-replace')h.view.confirmation={kind:'newRun'};
 if(end==='disabled-change')h.view.needsResume=true;
 h.input.up(end==='outside'?{x:-5,y:-5}:p);assert.equal(h.view.pressedControl,null);assert.equal(h.actions.length,0);assert.equal(h.activations.length,0);
});
test('refresh clears a held button when an external page update arrives before move/up',()=>{
 const h=fixture(),p=center(h.first().rect);h.input.down(p);h.view.screen='settings';h.input.refresh();assert.equal(h.view.pressedControl,null);h.input.up(p);assert.equal(h.actions.length,0);
});
test('multi-touch cannot steal or clear pressure',()=>{const h=fixture(),p=center(h.first().rect);h.input.down(p,1);h.input.down(p,2);h.input.cancel(2);h.input.up(p,2);assert.ok(h.view.pressedControl);h.input.up(p,1);assert.equal(h.activations.length,1);});
test('major starts and purchase confirmation are classified; ordinary navigation is not',()=>{
 for(const screen of ['inboundMenu','menu'] as const){const h=fixture();h.view.screen=screen;const c=getUiControls(h.state,h.view).find(c=>c.action.type===(screen==='inboundMenu'?'newRun':'settings'))!;const p=center(c.rect);h.input.down(p);h.input.up(p);assert.deepEqual(h.activations,[screen==='inboundMenu']);}
 const h=fixture();h.view.confirmation={kind:'purchaseCosmetic',cosmeticKind:'cargo',cosmeticId:'insulated'};const p=center(getUiControls(h.state,h.view).find(c=>c.action.type==='confirm')!.rect);h.input.down(p);h.input.up(p);assert.deepEqual(h.activations,[true]);
});
test('legacy pause icon has pressure and one activation callback',()=>{const h=fixture();h.view.screen='game';const p=center(L.pause);h.input.down(p);assert.deepEqual(h.view.pressedControl?.rect,L.pause);h.input.up(p);assert.equal(h.view.paused,true);assert.deepEqual(h.activations,[false]);});
test('disabled and blank taps do not show pressure or acknowledge',()=>{const h=fixture();h.input.down({x:2,y:2});assert.ok(!h.view.pressedControl);h.input.up({x:2,y:2});assert.equal(h.activations.length,0);});
test('pressed pixels are visible, bounded to control, and cancel restores exact idle frame',()=>{
 const h=fixture(),canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D,r=h.first().rect,p=center(r);
 render(ctx,h.state,h.view);const before=ctx.getImageData(0,0,1080,1920).data.slice();h.input.down(p);render(ctx,h.state,h.view);const held=ctx.getImageData(0,0,1080,1920).data;let diff=0;
 for(let y=0;y<1920;y++)for(let x=0;x<1080;x++){const i=(y*1080+x)*4,changed=before[i]!==held[i]||before[i+1]!==held[i+1]||before[i+2]!==held[i+2];if(changed){diff++;assert.ok(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h,`outside ${x},${y}`);}}
 assert.ok(diff>r.w*r.h/2);h.input.cancel();render(ctx,h.state,h.view);assert.deepEqual(ctx.getImageData(0,0,1080,1920).data,before);
});

test('shop card pressure follows sub-threshold edge exit and reentry, larger drag permanently cancels',()=>{
 const h=fixture();h.view.screen='shop';h.view.shopTab='cosmetics';h.view.shopSection='theme';const c=getUiControls(h.state,h.view).find(c=>c.action.type==='previewCosmetic')!;const point={x:c.rect.x+1,y:c.rect.y+30};h.input.down(point);assert.equal(h.view.pressedControl?.visible,true);
 h.input.move({x:c.rect.x-4,y:point.y});assert.equal(h.view.pressedControl?.visible,false);h.input.move(point);assert.equal(h.view.pressedControl?.visible,true);h.input.move({x:point.x+20,y:point.y});assert.equal(h.view.pressedControl,null);h.input.move(point);h.input.up(point);assert.equal(h.actions.length,0);
});
test('refresh discards replaced modal and changed purchase quantity while held',()=>{
 for(const kind of ['replace','quantity'] as const){const h=fixture();h.view.confirmation={kind:'purchaseCosmetic',quantity:1};const p=center(h.first().rect);h.input.down(p);if(kind==='replace')h.view.confirmation={kind:'purchaseCosmetic',quantity:1};else h.view.confirmation.quantity=2;h.input.refresh();assert.equal(h.view.pressedControl,null);h.input.up(p);assert.equal(h.activations.length,0);}
});

test('clear tool captures only occupied eligible cells, not empty targets or a third selected cell',()=>{
 const h=fixture();h.view.screen='game';h.view.toolSelection={item:'clear',pieceId:null,cells:[],quarterTurns:0};
 const point={x:L.board.x+1.5*L.board.cell,y:L.board.y+1.5*L.board.cell},cell=8;
 h.state.board[cell]=null;h.input.down(point);assert.ok(!h.view.pressedControl);h.input.up(point);assert.equal(h.activations.length,0);
 h.state.board[cell]='cargo.food';h.view.toolSelection.cells=[9,10];h.input.down(point);assert.ok(!h.view.pressedControl);h.input.up(point);assert.equal(h.activations.length,0);
 h.view.toolSelection.cells=[];h.input.down(point);assert.ok(h.view.pressedControl);h.input.up(point);assert.equal(h.activations.length,1);assert.deepEqual(h.actions,[{type:'toolCell',cell}]);
});

test('disabled purchase controls never capture, sound or vibrate',()=>{const h=fixture();h.view.confirmation={kind:'purchase',item:'rotate',quantity:1};for(const c of getUiControls(h.state,h.view).filter(c=>c.disabled)){const p=center(c.rect);h.input.down(p);assert.ok(!h.view.pressedControl);h.input.up(p);}assert.deepEqual(h.actions,[]);assert.deepEqual(h.activations,[]);});
