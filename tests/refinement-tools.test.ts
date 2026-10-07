import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV9,applyCommandV9} from '../src/domain/v9/engine.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {InputController} from '../src/presentation/input.ts';
import {getTrayRects,L} from '../src/presentation/layout.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {createProfile} from '../src/application/profile.ts';

const state=()=>applyCommandV9(createRunV9({seed:1,mode:'standard',toolCharges:{rotate:1,clear:0,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});
const overlaps=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('toolbox has a 44px header target even with no tools, away from score and logo',()=>{
 const s=state();s.toolCharges.rotate=0;
 const controls=getUiControls(s,view()),header=controls.find(c=>c.action.type==='toggleToolbox');
 assert.ok(header,'the toolbox must stay discoverable with zero tools');
 assert.ok(header.rect.w/3>=44&&header.rect.h/3>=44);
 assert.equal(overlaps(header.rect,{x:548,y:54,w:363,h:151}),false);
 assert.equal(overlaps(header.rect,{x:49,y:54,w:285,h:183}),false);
 assert.equal(controls.some(c=>c.action.type==='tool'),false,'collapsed toolbox must not add invisible tool targets');
});

test('expanded toolbox shows available used and uncarried tools without buying or consuming',()=>{
 const s=state();s.usedToolIds=['clear'];const before=JSON.stringify(s);
 const controls=getUiControls(s,view({toolboxOpen:true})),tools=controls.filter(c=>c.action.type==='tool');
 assert.equal(tools.length,3);
 assert.equal(tools[0].disabled,false);assert.equal(tools[1].disabled,true);assert.equal(tools[2].disabled,true);
 assert.match(tools[0].label,/可用/);assert.match(tools[1].label,/已用完/);assert.match(tools[2].label,/未携带/);
 assert.ok(tools.every(c=>c.rect.y>=1530&&c.rect.w/3>=44&&c.rect.h/3>=44));
 assert.equal(controls.some(c=>c.action.type==='purchase'||c.action.type==='shop'),false);
 assert.equal(JSON.stringify(s),before);
});

test('toolbox captures candidate-area taps and cannot place through the drawer',()=>{
 const s=state(),v=view({toolboxOpen:true}),actions:unknown[]=[],commands:unknown[]=[];
 const input=new InputController({getState:()=>s,getView:()=>v,patchView:p=>Object.assign(v,p),preview:()=>({valid:false,cells:[],shipments:[],events:[]}),dispatch:c=>commands.push(c),togglePause(){},restart(){},resume(){},toggleDebug(){},action:a=>actions.push(a)});
 const r=getTrayRects(3)[1],point={x:r.x+r.w/2,y:r.y+r.h/2};input.down(point);input.up(point);
 assert.equal(v.selectedPieceId,null,'disabled tool never selects the hidden candidate');assert.deepEqual(commands,[]);assert.deepEqual(actions,[]);
 const first=getUiControls(s,v).find(c=>c.action.type==='tool'&&c.action.item==='rotate')!;const p={x:first.rect.x+first.rect.w/2,y:first.rect.y+first.rect.h/2};input.down(p);input.up(p);assert.deepEqual(actions,[{type:'tool',item:'rotate'}]);
});

test('tool selection actions and rescue finish are finger-size visible controls',()=>{
 const s=state();for(const item of ['rotate','clear','wildcard'] as const){const controls=getUiControls(s,view({toolSelection:{item,pieceId:null,cells:[],quarterTurns:0}}));assert.ok(controls.every(c=>c.rect.w/3>=44&&c.rect.h/3>=44));}
 s.phase='rescue';const controls=getUiControls(s,view({toolboxOpen:true})),finish=controls.find(c=>c.action.type==='finishEndless')!;
 assert.ok(finish&&finish.rect.h/3>=44);assert.ok(controls.filter(c=>c.action.type==='tool').every(c=>!overlaps(c.rect,finish.rect)));
});

test('confirmation and paused controls own the screen even when a tool selection is stale',()=>{
 const s=state(),toolSelection={item:'rotate' as const,pieceId:null,cells:[],quarterTurns:0 as const};
 assert.equal(getUiControls(s,view({paused:true,toolSelection})).some(c=>c.action.type==='toolConfirm'),false);
 const v=view({confirmation:{kind:'finishEndless'},toolSelection}),actions:unknown[]=[];
 const input=new InputController({getState:()=>s,getView:()=>v,patchView:p=>Object.assign(v,p),preview:()=>({valid:false,cells:[],shipments:[],events:[]}),dispatch(){},togglePause(){},restart(){},resume(){},toggleDebug(){},action:a=>actions.push(a)});
 const c=getUiControls(s,v).find(c=>c.action.type==='confirm')!;input.down({x:c.rect.x+20,y:c.rect.y+20});input.up({x:c.rect.x+20,y:c.rect.y+20});assert.deepEqual(actions,[{type:'confirm'}]);
 assert.equal(overlaps({x:355,y:105,w:144,h:144},L.pause),false);
});

test('purchase confirmation keeps both visible buttons at 44px and target actions below all candidate cards',()=>{
 const s=state(),confirm=getUiControls(s,view({confirmation:{kind:'purchase',item:'rotate'}}));assert.ok(confirm.every(c=>c.rect.h/3>=44));
 for(const count of [3,4,5]){const rects=getTrayRects(count,true),controls=getUiControls(s,view({toolSelection:{item:'rotate',pieceId:null,cells:[],quarterTurns:0}}));for(const card of rects)for(const c of controls)assert.equal(overlaps(card,c.rect),false);}
});

test('legacy five-slot tool targets stay finger-size and clear of the tool action row',()=>{
 const rects=getTrayRects(5,true);assert.equal(rects.length,5);assert.ok(rects.every(r=>r.h/3>=44));for(const [i,r] of rects.entries())for(const other of rects.slice(i+1))assert.equal(overlaps(r,other),false);assert.ok(rects.every(r=>r.y>=1460&&r.y+r.h<1788));
});

test('developer diagnostics cannot steal taps from a visible tool confirmation',()=>{
 const s=state(),v=view({developerMode:true,toolSelection:{item:'rotate',pieceId:s.candidates[0].id,cells:[],quarterTurns:1,command:{type:'rotate',pieceId:s.candidates[0].id,quarterTurns:1}}}),actions:unknown[]=[],events:string[]=[];
 const input=new InputController({getState:()=>s,getView:()=>v,patchView:p=>Object.assign(v,p),preview:()=>({valid:false,cells:[],shipments:[],events:[]}),dispatch(){},togglePause(){},restart(){},resume(){},toggleDebug:()=>events.push('debug'),action:a=>actions.push(a)});
 input.down({x:930,y:1870});input.up({x:930,y:1870});assert.deepEqual(actions,[{type:'toolConfirm'}]);assert.deepEqual(events,[]);
});
