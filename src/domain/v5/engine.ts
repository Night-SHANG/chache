import type {CargoId,ColorTier,Command,CommandResult,DomainEvent,Piece,PlacementPreview,Point,RunState,Shipment} from '../types.ts';
import {SHAPES} from '../rulesets/v1/content.ts';
import {toIndex} from '../rulesets/v1/board.ts';
import {createRandomState,nextRandom} from '../random.ts';
import {COLOR_EXIT_CARGO,COLOR_EXIT_DOCKS,COLOR_EXIT_TARGETS} from '../v4/content.ts';
import {RULES_V5_CONFIG as CONFIG,MIXED_COLOR_PERCENT,MIXED_COLOR_PATTERNS,MIXED_COLOR_SHAPE_ID,isColorTier,mixedColorRunConfigId} from './content.ts';
import {pieceCellCargo,isValidColorExitPiece} from '../pieces.ts';
import {selectExitGroupV4} from '../v4/board.ts';
function copyCommand(command:Command):Command{return command.type==='place'?{...command,origin:{...command.origin}}:{...command};}
function cloneState(state:RunState):RunState {
 return {...state,board:[...state.board],cellTraits:state.board.map(()=>null),rngState:[...state.rngState],
  candidates:state.candidates.map(p=>p.cellCargos?{...p,cellCargos:[...p.cellCargos]}:{...p}),orders:state.orders.map(o=>({...o})),
  upgrades:[...state.upgrades],upgradeChoices:[...state.upgradeChoices],commands:state.commands.map(copyCommand)};
}
export interface PieceRollsV5 {typeRoll:number;shapeRaw:number;cargoRaw:number;mixedPattern:number}
/** Exactly four calls with invariant ranges. Input RNG state is never mutated. */
export function drawPieceRollsV5(rngState:number[]):{rolls:PieceRollsV5;rngState:number[]} {
 const type=nextRandom(rngState,1,100),shape=nextRandom(type.state,0,2147483647),cargo=nextRandom(shape.state,0,2147483647),pattern=nextRandom(cargo.state,0,11);
 return {rolls:{typeRoll:type.value,shapeRaw:shape.value,cargoRaw:cargo.value,mixedPattern:pattern.value},rngState:pattern.state};
}
function weightedRaw<T>(raw:number,values:T[],weights:number[]):T {
 let value=Math.floor(raw*weights.reduce((a,b)=>a+b,0)/2147483648);
 for(let i=0;i<values.length;i++){if(value<weights[i])return values[i];value-=weights[i];}
 throw Error('Invalid v5 weighted pool');
}
/** Pure generator: describes the next candidate and random cursor without changing the caller's state. */
export function generatePieceV5(state:RunState):{piece:Piece;rolls:PieceRollsV5;rngState:number[]} {
 if(!isColorTier(state.colorTier))throw Error('双色规则版本必须指定有效档位');
 const drawn=drawPieceRollsV5(state.rngState),{rolls}=drawn;
 const shapes=SHAPES.filter(shape=>shape.minShift<=state.shift),occupancy=state.board.filter(Boolean).length;
 const weights=shapes.map(shape=>{
  let weight=shape.weight*100;
  if(shape.cells.length<=2)weight=Math.floor(weight*(100+Math.floor(occupancy*CONFIG.generation.occupancySmallPercent/49))/100);
  if(state.candidates.some(piece=>piece.shapeId===shape.id))weight=Math.floor(weight/CONFIG.generation.recentShapeDivisor);
  return Math.max(1,weight);
 });
 const shapeId=weightedRaw(rolls.shapeRaw,shapes,weights).id;
 const cargo=weightedRaw<CargoId>(rolls.cargoRaw,COLOR_EXIT_CARGO,COLOR_EXIT_CARGO.map(id=>CONFIG.generation.cargoBaseWeight+state.board.filter(cell=>cell===id).length*CONFIG.generation.cargoPresenceWeight));
 const id=`piece.${state.nextId}`,solid:Piece={id,shapeId,cargo},cellCargos=[...MIXED_COLOR_PATTERNS[rolls.mixedPattern]];
 const mixed:Piece={id,shapeId:MIXED_COLOR_SHAPE_ID,cargo:cellCargos[0],cellCargos};
 return {...drawn,piece:rolls.typeRoll<=MIXED_COLOR_PERCENT[state.colorTier]?mixed:solid};
}
/** Called only on the engine's owned freshly created/cloned state. */
function generateOwnedPiece(state:RunState):Piece {
 const generated=generatePieceV5(state);state.rngState=generated.rngState;state.nextId++;state.generatedPieces=(state.generatedPieces??0)+1;return generated.piece;
}
export function createRunV5(seed:number,colorTier:ColorTier):RunState {
 const runConfigId=mixedColorRunConfigId(colorTier);
 const state:RunState={rulesetVersion:5,runConfigId,colorTier,seed,mode:'color_exit',rngState:createRandomState(seed),
  board:Array(49).fill(null),cellTraits:Array(49).fill(null),generatedPieces:0,candidates:[],orders:COLOR_EXIT_TARGETS.map(order=>({...order})),
  phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:1,result:null,overtime:false,endReason:null};
 for(let i=0;i<CONFIG.candidateCount;i++)state.candidates.push(generateOwnedPiece(state));
 return state;
}
function placement(state:RunState,pieceId:string,origin:Point):{cells:number[];reason?:string} {
 if(state.phase!=='input')return {cells:[],reason:'当前阶段不能入库'};
 const piece=state.candidates.find(p=>p.id===pieceId),shape=SHAPES.find(s=>s.id===piece?.shapeId);
 if(!piece||!shape)return {cells:[],reason:'货件已不存在'};
 if(!isValidColorExitPiece(piece))return {cells:[],reason:'双色出口货件逐格内容无效'};
 if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
 const points=shape.cells.map(cell=>({x:cell.x+origin.x,y:cell.y+origin.y})),cells=points.map(toIndex);
 if(points.some(p=>p.x<0||p.y<0||p.x>=7||p.y>=7))return {cells,reason:'超出仓库边界'};
 if(cells.some(i=>state.board[i]!==null))return {cells,reason:'这里已有货物'};
 return {cells};
}
/** Each successful clear restarts fixed gate priority against the newly opened empty cells. */
function resolveExits(state:RunState):Shipment[] {
 const pending=COLOR_EXIT_DOCKS.map(dock=>state.orders.find(order=>order.dockId===dock.id)!).filter(Boolean),shipments:Shipment[]=[];
 while(pending.length){
  let selected:ReturnType<typeof selectExitGroupV4>=null,index=-1;
  for(let i=0;i<pending.length;i++){selected=selectExitGroupV4(state,pending[i]);if(selected){index=i;break;}}
  if(!selected)break;
  const [order]=pending.splice(index,1),chain=shipments.length+1,score=selected.group.cells.length*CONFIG.pointsPerCell;
  shipments.push({type:'shipment',dockId:order.dockId,orderId:order.id,cargo:order.cargo,cells:selected.group.cells,path:selected.path,
   score,chain,units:selected.group.cells.length,transport:'conveyor',cargoPaths:selected.cargoPaths});
  for(const cell of selected.group.cells){state.board[cell]=null;state.cellTraits![cell]=null;}
  state.completedOrders++;state.score+=score;
 }
 state.lastChain=shipments.length;state.maxChain=Math.max(state.maxChain,shipments.length);return shipments;
}
export function previewPlacementV5(state:RunState,pieceId:string,origin:Point):PlacementPreview {
 const checked=placement(state,pieceId,origin);if(checked.reason)return {valid:false,cells:checked.cells,shipments:[],reason:checked.reason};
 const next=cloneState(state),piece=next.candidates.find(p=>p.id===pieceId)!;for(const [index,cell] of checked.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
 return {valid:true,cells:checked.cells,shipments:resolveExits(next)};
}
export function findLegalMovesV5(state:RunState):{pieceId:string;origin:Point}[] {
 const moves:{pieceId:string;origin:Point}[]=[],input=state.phase==='input'?state:{...state,phase:'input' as const};
 for(const piece of state.candidates)for(let y=0;y<7;y++)for(let x=0;x<7;x++)if(!placement(input,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});
 return moves;
}
export function applyCommandV5(state:RunState,command:Command):CommandResult {
 const reject=(error:string):CommandResult=>({state,events:[],error});
 if(!command||command.type!=='place')return reject('颜色出口只接受入库指令');
 const checked=placement(state,command.pieceId,command.origin);if(checked.reason)return reject(checked.reason);
 const next=cloneState(state),index=next.candidates.findIndex(p=>p.id===command.pieceId),piece=next.candidates[index];
 for(const [index,cell] of checked.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
 next.maxOccupancy=Math.max(next.maxOccupancy??0,next.board.filter(Boolean).length);next.candidates.splice(index,1);
 const events:DomainEvent[]=[{type:'placed',pieceId:piece.id,cells:checked.cells},...resolveExits(next)];
 next.commands.push(copyCommand(command));next.commandIndex++;
 const shift=Math.min(CONFIG.stageCount,Math.floor(next.completedOrders/CONFIG.batchesPerStage)+1);
 if(shift>next.shift){next.shift=shift;events.push({type:'shift',shift});}
 if(next.completedOrders>=CONFIG.targetBatches){next.phase='result';next.result='won';next.endReason='completed';events.push({type:'result',result:'won'});return {state:next,events};}
 next.candidates.splice(index,0,generateOwnedPiece(next));
 if(!findLegalMovesV5(next).length){next.phase='result';next.result='failed';next.endReason='blocked';events.push({type:'result',result:'failed'});}
 return {state:next,events};
}
