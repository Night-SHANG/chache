import test from 'node:test';import assert from 'node:assert/strict';import {InputController} from '../src/presentation/input.ts';import type {InputPort} from '../src/presentation/input.ts';import {createRun} from '../src/domain/engine.ts';import type {ViewState} from '../src/presentation/view-types.ts';
test('advisory red preview does not ban valid placement and cancel clears transient warning',()=>{
 const state=createRun(1,'color_exit',6,'easy'),view={selectedPieceId:state.candidates[0].id,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false} as ViewState;let dispatched=0;
 const port={getState:()=>state,getView:()=>view,patchView:(patch:Partial<ViewState>)=>Object.assign(view,patch),preview:()=>({valid:true,events:[],cells:[76],shipments:[]}),risk:()=>({level:'warning',kind:'entry-blocked',message:'落子后南入口被占',cells:[76],dockIds:['dock.south']}),dispatch:()=>{dispatched++;},togglePause:()=>{},restart:()=>{},resume:()=>{},toggleDebug:()=>{}} as InputPort;
 const input=new InputController(port);input.down({x:540,y:1350});assert.ok(view.placementRisk);input.up({x:540,y:1350});assert.equal(dispatched,1);assert.equal(view.placementRisk,null);view.selectedPieceId=state.candidates[0].id;input.down({x:540,y:1350});assert.ok(view.placementRisk);input.cancel();assert.equal(view.placementRisk,null);
});

test('lifted touch placement keeps advisory risk red legal at the projected origin',()=>{
 const state=createRun(1,'color_exit',6,'easy'),view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false} as ViewState,commands:unknown[]=[];
 const warning={level:'warning',kind:'entry-blocked',message:'南入口风险',cells:[76],dockIds:['dock.south']} as const;
 const input=new InputController({getState:()=>state,getView:()=>view,patchView:patch=>Object.assign(view,patch),preview:()=>({valid:true,cells:[30],shipments:[],events:[]}),risk:()=>({...warning,cells:[76],dockIds:['dock.south']}),dispatch:command=>commands.push(command),togglePause(){},restart(){},resume(){},toggleDebug(){}});
 // 9x9 cell pitch is 840/9, and this touch is 1.25 pitches below cell (3,3).
 const point={x:120+3.5*840/9,y:560+(3.5+1.25)*840/9};
 input.down({x:206,y:1666},1,'touch');input.move(point,1);assert.equal(view.preview?.valid,true);assert.equal(view.placementRisk?.kind,'entry-blocked');assert.deepEqual(view.hoverOrigin,{x:3,y:3});
 input.up(point,1);assert.deepEqual(commands,[{type:'place',pieceId:state.candidates[0].id,origin:{x:3,y:3}}]);
});
