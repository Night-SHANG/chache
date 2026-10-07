import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV6,drawPieceRollsV6} from '../src/domain/v6/engine.ts';
import {OUTBOUND_DOCKS,MIXED_COLOR_PATTERNS_V6,OUTBOUND_CARGO} from '../src/domain/v6/content.ts';
import {createRunV12,applyCommandV12,previewPlacementV12,findLegalMovesV12,pieceCellsV12,findRescuePlanV12,settlePhaseV12} from '../src/domain/v12/engine.ts';
import {validToolChargesV12,isValidOutboundPieceV12,MIXED_COLOR_PERCENT_V12} from '../src/domain/v12/content.ts';
import type {OutboundToolRunV12,OutboundToolPieceV12,OutboundToolCommandV12,ToolChargesV12} from '../src/domain/v12/types.ts';
import type {CargoId} from '../src/domain/types.ts';

const F:CargoId='cargo.food',C:CargoId='cargo.chem',M:CargoId='cargo.machine';
const noTools:ToolChargesV12={rotate:0,clear:0,wildcard:0};
const piece=(shapeId='shape.single',cargo:CargoId=F):OutboundToolPieceV12=>({id:'fixture',shapeId,cargo,quarterTurns:0});
function state(tools:ToolChargesV12=noTools):OutboundToolRunV12 {
 const run=createRunV12(17,'normal',tools);run.candidates=[piece(),{...piece('shape.single',C),id:'second'},{...piece('shape.single',M),id:'third'}];return run;
}
function frozen<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
function place(run:OutboundToolRunV12,x:number,y:number){return applyCommandV12(run,{type:'place',pieceId:run.candidates[0].id,origin:{x,y}});}

// Mutation target: changing the four frozen supply branches or using a different draw count.
test('v12 owns a normal identity, reserves no RNG draws for tools, and preserves the four distributions',()=>{
 assert.deepEqual(MIXED_COLOR_PERCENT_V12,{easy:20,normal:30,hard:40,expert:50});
 for(const difficulty of ['easy','normal','hard','expert'] as const)for(const seed of [0,17,-83,2147483647]){
  const run=createRunV12(seed,difficulty,{rotate:1,clear:1,wildcard:0}),legacy=createRunV6(seed,difficulty);
  assert.equal(run.rulesetVersion,12);assert.equal(run.runConfigId,`run.outbound9_v12.${difficulty}`);
  assert.deepEqual(run.candidates,legacy.candidates.map(p=>({...p,quarterTurns:0})));assert.deepEqual(run.rngState,legacy.rngState);
  assert.deepEqual(run.usedToolIds,[]);assert.equal(run.phase,'input');
 }
 for(const invalid of [{rotate:1,clear:1,wildcard:1},{rotate:2,clear:0,wildcard:0},{rotate:0,clear:0},{...noTools,extra:0},null]){
  assert.equal(validToolChargesV12(invalid),false);assert.throws(()=>createRunV12(1,'normal',invalid as ToolChargesV12));
 }
});

// Mutation target: using the old placeable south cell in any geometry entry point.
test('all placement entry points reject south entry but allow each colored exit',()=>{
 const run=frozen(state()),before=JSON.stringify(run);
 assert.equal(previewPlacementV12(run,'fixture',{x:4,y:8}).valid,false);assert.equal(previewPlacementV12(run,'fixture',{x:4,y:8}).reason,'入口需留空');
 assert.ok(place(run,4,8).error);assert.equal(place(run,4,8).state,run);
 assert.equal(findLegalMovesV12(run).length,240);assert.ok(findLegalMovesV12(run).every(m=>m.origin.x!==4||m.origin.y!==8));
 for(const dock of OUTBOUND_DOCKS){assert.equal(previewPlacementV12(run,'fixture',dock.entry).valid,true);assert.equal(place(run,dock.entry.x,dock.entry.y).error,undefined);}
 const overhang=state();overhang.candidates=[piece('shape.domino_h')];assert.equal(previewPlacementV12(overhang,'fixture',{x:3,y:8}).valid,false);
 assert.equal(JSON.stringify(run),before);
});

// Mutation target: sorting rotated offsets independently of their original per-cell colors.
test('mixed rotations preserve original indices and exact colored layouts across every catalogue piece',()=>{
 for(const pattern of MIXED_COLOR_PATTERNS_V6){
  const mixed:OutboundToolPieceV12={...piece(pattern.shapeId,pattern.cellCargos[0]),cellCargos:[...pattern.cellCargos]};
  for(const quarterTurns of [1,2,3] as const){
   const run=state({rotate:1,clear:0,wildcard:0});run.candidates=[mixed];
   const before=pieceCellsV12(mixed),expected=before.map(p=>({...p}));
   for(let turn=0;turn<quarterTurns;turn++)for(const p of expected){const oldX=p.x;p.x=-p.y;p.y=oldX;}
   const minX=Math.min(...expected.map(p=>p.x)),minY=Math.min(...expected.map(p=>p.y));
   for(const p of expected){p.x-=minX;p.y-=minY;}
   const result=applyCommandV12(run,{type:'rotate',pieceId:'fixture',quarterTurns});assert.equal(result.error,undefined);
   assert.deepEqual(pieceCellsV12(result.state.candidates[0]),expected);assert.deepEqual(result.state.candidates[0].cellCargos,mixed.cellCargos);
   const placed=place(result.state,2,2);assert.equal(placed.error,undefined);
   for(const [i,p] of expected.entries())assert.equal(placed.state.board[(p.y+2)*9+p.x+2],pattern.cellCargos[i]);
  }
 }
});

test('rotation rejects semantic single-color no-ops and permits square color-band turns',()=>{
 const run=state({rotate:1,clear:0,wildcard:0});run.candidates=[piece('shape.square')];
 for(const quarterTurns of [1,2,3] as const){const rejected=applyCommandV12(frozen(run),{type:'rotate',pieceId:'fixture',quarterTurns});assert.ok(rejected.error);assert.equal(rejected.state,run);}
 const mixed=state({rotate:1,clear:0,wildcard:0});mixed.candidates=[{...piece('shape.square'),cellCargos:[F,F,C,C]}];
 const result=applyCommandV12(mixed,{type:'rotate',pieceId:'fixture',quarterTurns:1});assert.equal(result.error,undefined);assert.equal(result.state.toolCharges.rotate,0);assert.deepEqual(result.state.usedToolIds,['rotate']);
 assert.deepEqual(result.state.rngState,mixed.rngState);assert.equal(result.state.generatedPieces,mixed.generatedPieces);
 assert.ok(applyCommandV12(result.state,{type:'rotate',pieceId:'fixture',quarterTurns:1}).error);
});

test('wildcard becomes one chosen plain color and refuses same-single no-op or a fourth color',()=>{
 for(const cargo of OUTBOUND_CARGO){
  const run=state({rotate:0,clear:0,wildcard:1});run.candidates=[{...piece('shape.square'),cellCargos:[F,F,C,C],quarterTurns:1}];
  const result=applyCommandV12(frozen(run),{type:'wildcard',pieceId:'fixture',cargo});assert.equal(result.error,undefined);
  assert.deepEqual(result.state.candidates[0],{id:'fixture',shapeId:'shape.single',cargo,quarterTurns:0});assert.equal(result.state.toolCharges.wildcard,0);
  assert.deepEqual(result.state.rngState,run.rngState);assert.equal(result.state.commandIndex,1);assert.equal(result.state.generatedPieces,run.generatedPieces);
 }
 const run=state({rotate:0,clear:0,wildcard:1});
 for(const cargo of [F,'cargo.cold','cargo.electronic',undefined]){const result=applyCommandV12(run,{type:'wildcard',pieceId:'fixture',cargo} as OutboundToolCommandV12);assert.ok(result.error);assert.equal(result.state,run);}
 assert.equal(isValidOutboundPieceV12({...piece(),trait:'wildcard'}),false);
});

test('clear deletes only one or two occupied ordinary cells without score, RNG or candidate replacement',()=>{
 const run=state({rotate:0,clear:1,wildcard:0});run.board[0]=F;run.board[80]=C;
 const result=applyCommandV12(frozen(run),{type:'clear',cells:[0,80]});assert.equal(result.error,undefined);
 assert.equal(result.state.board[0],null);assert.equal(result.state.board[80],null);assert.equal(result.state.score,0);assert.equal(result.state.completedOrders,0);
 assert.deepEqual(result.state.candidates,run.candidates);assert.deepEqual(result.state.rngState,run.rngState);assert.equal(result.state.generatedPieces,run.generatedPieces);assert.equal(result.state.nextId,run.nextId);
 assert.deepEqual(result.events,[{type:'toolUsed',toolId:'clear',cells:[0,80]}]);assert.deepEqual(result.state.usedToolIds,['clear']);
 for(const cells of [[],[0,0],[0,80,1],[76],[1],[-1],[81],[.5],new Array<number>(1)]){const invalid=applyCommandV12(run,{type:'clear',cells});assert.ok(invalid.error);assert.equal(invalid.state,run);}
});

test('clear immediately settles real priority shipments and gives normal victory priority without drawing',()=>{
 const run=state({rotate:0,clear:1,wildcard:0});run.completedOrders=29;run.shift=5;run.board[67]=M;run.board[75]=M;run.board[77]=M;
 for(const i of [4,13,22,31])run.board[i]=F;for(const i of [44,43,42,41])run.board[i]=C;for(const i of [36,37,38,39])run.board[i]=M;
 const result=applyCommandV12(frozen(run),{type:'clear',cells:[67]}),shipments=result.events.filter(e=>e.type==='shipment');
 assert.equal(result.error,undefined);assert.deepEqual(shipments.map(e=>e.dockId),['dock.north','dock.east','dock.west']);
 assert.deepEqual(shipments.map(e=>e.chain),[1,2,3]);assert.equal(result.state.completedOrders,32);assert.equal(result.state.score,120);
 assert.equal(result.state.phase,'result');assert.equal(result.state.result,'won');assert.equal(result.state.endReason,'completed');
 assert.deepEqual(result.state.rngState,run.rngState);assert.deepEqual(result.state.candidates,run.candidates);assert.equal(result.state.generatedPieces,run.generatedPieces);
});

test('placement keeps a mutual route obstruction playable while geometric moves exist',()=>{
 const run=state();for(const i of [67,75,77])run.board[i]=M;
 const result=place(run,0,0);assert.equal(result.error,undefined);assert.equal(result.state.phase,'input');assert.equal(result.state.result,null);
 assert.deepEqual(result.state.rngState,drawPieceRollsV6(run.rngState).rngState);assert.equal(result.state.generatedPieces,run.generatedPieces+1);
});

test('no-fit is rescue only when a finite carried tool plan can restore placement, excluding the reserved cell',()=>{
 const run=state({rotate:0,clear:0,wildcard:1});run.candidates=[piece('shape.domino_h')];run.board.fill(F);run.board[76]=null;
 assert.deepEqual(findLegalMovesV12(run),[]);assert.equal(findRescuePlanV12(frozen(run)),null);assert.equal(settlePhaseV12(run).result,'failed');
 const cleared=state({rotate:0,clear:1,wildcard:1});cleared.candidates=[piece('shape.square')];cleared.board.fill(C);cleared.board[76]=null;
 // All exits contain the wrong color except east. Deleting at east breaks that group into a still-shippable group,
 // so this fixture intentionally permits either a true clear-shipment witness or a two-tool placement witness.
 const plan=findRescuePlanV12(frozen(cleared));assert.ok(plan&&plan.length<=2);assert.equal(new Set(plan.map(c=>c.type)).size,plan.length);
 let next={...cleared,phase:'rescue' as const} as OutboundToolRunV12;
 for(const command of plan){const result=applyCommandV12(next,command);assert.equal(result.error,undefined);next=result.state;}
 assert.ok(findLegalMovesV12(next).length||next.result==='won');assert.equal(next.phase,'input');
});
