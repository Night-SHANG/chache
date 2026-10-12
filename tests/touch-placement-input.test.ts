import test from 'node:test';
import assert from 'node:assert/strict';
import {InputController} from '../src/presentation/input.ts';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {createRunV13} from '../src/domain/v13/engine.ts';
import {previewPlayablePlacement} from '../src/domain/playable.ts';
import {presentationPieceCells} from '../src/presentation/inbound-helpers.ts';
import type {GameCommand,GameRun} from '../src/domain/playable.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';
import {cellCenter,getTrayRects,L,hitTestPoint} from '../src/presentation/layout.ts';
import {projectPlacementPoint,touchDragLift} from '../src/presentation/touch-placement.ts';

function harness(boardSize:7|9=7,realPreview=false){
 const state:GameRun=boardSize===7?createRunV16({seed:123,mode:'standard',guided:false}):createRunV13(123,'easy');
 const view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false} as ViewState;
 const commands:GameCommand[]=[],origins:{x:number;y:number}[]=[];
 const input=new InputController({getState:()=>state,getView:()=>view,patchView:patch=>Object.assign(view,patch),preview:(_pieceId,origin)=>{origins.push({...origin});return realPreview?previewPlayablePlacement(state,_pieceId,origin):{valid:true,cells:[],shipments:[],events:[]};},dispatch:command=>commands.push(command),togglePause(){},restart(){},resume(){},toggleDebug(){}});
 const r=getTrayRects(state.candidates.length)[0],tray={x:r.x+r.w/2,y:r.y+r.h/2};
 return {state,view,commands,origins,input,tray};
}

for(const boardSize of [7,9] as const)test(`touch projection exposes a finite grid-scaled target and keeps every ${boardSize}x${boardSize} origin reachable`,()=>{
 const h=harness(boardSize),g=boardGeometry(h.state),lift=touchDragLift(h.state);
 assert.ok(lift>=g.cell&&lift<=1.5*g.cell);
 for(let y=0;y<boardSize;y++)for(let x=0;x<boardSize;x++){
  const target=cellCenter({x,y},h.state),finger={x:target.x,y:target.y+lift};
  assert.ok(hitTestPoint(finger,{x:0,y:0,w:L.width,h:L.height}));
  assert.ok(!getTrayRects(h.state.candidates.length).some(r=>hitTestPoint(finger,r)));
  const projected=projectPlacementPoint(finger,h.state,true);assert.ok(projected);
  assert.equal(projected.x,target.x);assert.ok(Math.abs(projected.y-target.y)<1e-9);
 }
});

for(const boardSize of [7,9] as const)test(`touch drag previews and commits the same lifted bottom-row origin on ${boardSize}x${boardSize}`,()=>{
 const h=harness(boardSize),target=cellCenter({x:0,y:boardSize-1},h.state),finger={x:target.x,y:target.y+touchDragLift(h.state)};
 h.input.down(h.tray,1,'touch');h.input.move(finger,1);
 assert.deepEqual(h.view.dragPoint,target);assert.deepEqual(h.view.hoverOrigin,{x:0,y:boardSize-1});
 h.input.up(finger,1);
 assert.deepEqual(h.commands,[{type:'place',pieceId:h.state.candidates[0].id,origin:{x:0,y:boardSize-1}}]);
});

for(const pointerType of ['mouse','pen','unknown'] as const)test(`${pointerType} drag keeps the original cursor origin`,()=>{
 const h=harness(),target=cellCenter({x:2,y:3},h.state);
 h.input.down(h.tray,1,pointerType);h.input.move(target,1);assert.deepEqual(h.view.dragPoint,target);h.input.up(target,1);
 assert.deepEqual(h.commands,[{type:'place',pieceId:h.state.candidates[0].id,origin:{x:2,y:3}}]);
});

test('touch tap/tap stays unshifted',()=>{
 const h=harness(),target=cellCenter({x:2,y:3},h.state);
 h.input.down(h.tray,1,'touch');h.input.up(h.tray,1);h.input.down(target,2,'touch');h.input.up(target,2);
 assert.deepEqual(h.commands,[{type:'place',pieceId:h.state.candidates[0].id,origin:{x:2,y:3}}]);
});

test('touch drag back over the tray cancels even when its lifted point would hit the bottom row',()=>{
 const h=harness(),r=getTrayRects(h.state.candidates.length)[0],returnPoint={x:r.x+r.w-20,y:r.y+1};
 h.input.down(h.tray,1,'touch');h.input.move(cellCenter({x:1,y:1},h.state),1);h.input.move(returnPoint,1);
 assert.equal(h.view.hoverOrigin,null);assert.equal(h.view.preview,null);h.input.up(returnPoint,1);assert.deepEqual(h.commands,[]);
});

test('touch release uses its own projected position rather than stale preview',()=>{
 const h=harness(),a=cellCenter({x:1,y:1},h.state),b=cellCenter({x:3,y:4},h.state),lift=touchDragLift(h.state);
 h.input.down(h.tray,1,'touch');h.input.move({x:a.x,y:a.y+lift},1);h.input.up({x:b.x,y:b.y+lift},1);
 assert.deepEqual(h.commands,[{type:'place',pieceId:h.state.candidates[0].id,origin:{x:3,y:4}}]);
});

test('touch secondary finger and cancellation cannot steal or commit a drag',()=>{
 const h=harness(),target=cellCenter({x:2,y:3},h.state),finger={x:target.x,y:target.y+touchDragLift(h.state)};
 h.input.down(h.tray,1,'touch');h.input.down(h.tray,2,'mouse');h.input.move(finger,2);h.input.up(finger,2);assert.deepEqual(h.commands,[]);
 h.input.move(finger,1);assert.deepEqual(h.view.dragPoint,target);h.input.cancel(1);h.input.up(finger,1);assert.deepEqual(h.commands,[]);
 h.input.down(h.tray,3,'mouse');h.input.move(target,3);h.input.up(target,3);assert.equal(h.commands.length,1);
});

test('touch projection rejects non-finite and outside-viewport points without manufacturing a target',()=>{
 const h=harness();for(const point of [{x:-1,y:-1},{x:NaN,y:800},{x:500,y:Infinity},{x:500,y:1920}])assert.equal(projectPlacementPoint(point,h.state,true),null);
});

for(const boardSize of [7,9] as const)for(const shapeId of ['shape.single','shape.i4_h','shape.i4_v','shape.l4_w'])test(`touch projection retains exact legal multi-cell footprints: ${boardSize}, ${shapeId}`,()=>{
 const h=harness(boardSize,true);h.state.candidates=[{id:'shape-probe',shapeId,cargo:'cargo.food',quarterTurns:0}];
 const piece=h.state.candidates[0],cells=presentationPieceCells(piece,h.state.rulesetVersion),w=Math.max(...cells.map(p=>p.x))+1,height=Math.max(...cells.map(p=>p.y))+1;
 const corners=[{x:0,y:0},{x:boardSize-w,y:0},{x:0,y:boardSize-height},{x:boardSize-w,y:boardSize-height},{x:1,y:1},{x:1,y:boardSize-height-1}];
 let legal=0;
 for(const origin of corners){
  const before=previewPlayablePlacement(h.state,piece.id,origin),count=h.commands.length;
  const target=cellCenter(origin,h.state),finger={x:target.x,y:target.y+touchDragLift(h.state)};
  h.input.down(h.tray,1,'touch');h.input.move(finger,1);assert.deepEqual(h.view.hoverOrigin,origin);h.input.up(finger,1);
  if(!before.valid){assert.equal(h.commands.length,count);continue;}legal++;
  const command=h.commands[h.commands.length-1];assert.ok(command?.type==='place');assert.deepEqual(command.origin,origin);
  const after=previewPlayablePlacement(h.state,command.pieceId,command.origin);assert.equal(after.valid,true);assert.deepEqual(after.cells,before.cells);
 }
 assert.ok(legal>0,'each representative cargo has legal placements alongside rejected dock corners');
});
