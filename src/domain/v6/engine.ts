import type {CargoId,Command,CommandResult,DomainEvent,OutboundDifficulty,Piece,PlacementPreview,Point,RunState,Shipment} from '../types.ts';
import {SHAPES} from '../rulesets/v1/content.ts';
import {createRandomState,nextRandom} from '../random.ts';
import {pieceCellCargo} from '../pieces.ts';
import {RULES_V6_CONFIG as CONFIG,OUTBOUND_CARGO,OUTBOUND_DOCKS,OUTBOUND_TARGETS,MIXED_COLOR_PERCENT_V6,MIXED_SHAPES_V6,MIXED_PARTITIONS_V6,COLOR_PAIRS_V6,isOutboundDifficulty,outboundRunConfigId,isValidOutboundPieceV6} from './content.ts';
import {selectExitGroupV6,toIndexV6} from './board.ts';
export {isValidOutboundPieceV6} from './content.ts';
function copyCommand(command:Command):Command{return command.type==='place'?{...command,origin:{...command.origin}}:{...command};}
function cloneState(state:RunState):RunState {
 return {...state,board:[...state.board],cellTraits:state.board.map(()=>null),rngState:[...state.rngState],
  candidates:state.candidates.map(p=>p.cellCargos?{...p,cellCargos:[...p.cellCargos]}:{...p}),orders:state.orders.map(o=>({...o})),
  upgrades:[...state.upgrades],upgradeChoices:[...state.upgradeChoices],commands:state.commands.map(copyCommand)};
}
export interface PieceRollsV6 {typeRoll:number;shapeRaw:number;cargoRaw:number;mixedShape:number;splitRaw:number;colorPair:number}
/** Exactly six nextRandom calls with invariant ranges, regardless of branch, difficulty or board. */
export function drawPieceRollsV6(rngState:number[]):{rolls:PieceRollsV6;rngState:number[]} {
 const type=nextRandom(rngState,1,100),shape=nextRandom(type.state,0,2147483647),cargo=nextRandom(shape.state,0,2147483647),mixedShape=nextRandom(cargo.state,0,7),split=nextRandom(mixedShape.state,0,5),pair=nextRandom(split.state,0,5);
 return {rolls:{typeRoll:type.value,shapeRaw:shape.value,cargoRaw:cargo.value,mixedShape:mixedShape.value,splitRaw:split.value,colorPair:pair.value},rngState:pair.state};
}
function weightedRaw<T>(raw:number,values:T[],weights:number[]):T {
 let value=Math.floor(raw*weights.reduce((a,b)=>a+b,0)/2147483648);
 for(let i=0;i<values.length;i++){if(value<weights[i])return values[i];value-=weights[i];}throw Error('Invalid v6 weighted pool');
}
/** Pure generation with no fit filtering, rescue, reroll, or stage restriction on the mixed pool. */
export function generatePieceV6(state:RunState):{piece:Piece;rolls:PieceRollsV6;rngState:number[]} {
 if(!isOutboundDifficulty(state.difficultyId))throw Error('出库规则版本必须指定有效难度');
 const drawn=drawPieceRollsV6(state.rngState),{rolls}=drawn,id=`piece.${state.nextId}`;
 if(rolls.typeRoll<=MIXED_COLOR_PERCENT_V6[state.difficultyId]){
  const shapeId=MIXED_SHAPES_V6[rolls.mixedShape],partitions=MIXED_PARTITIONS_V6[shapeId],partition=partitions[rolls.splitRaw%partitions.length],pair=COLOR_PAIRS_V6[rolls.colorPair],cellCargos=[...partition].map(letter=>pair[letter==='A'?0:1]);
  return {...drawn,piece:{id,shapeId,cargo:cellCargos[0],cellCargos}};
 }
 const shapes=SHAPES.filter(shape=>shape.minShift<=state.shift),occupancy=state.board.filter(Boolean).length;
 const weights=shapes.map(shape=>{
  let weight=shape.weight*100;
  if(shape.cells.length<=2)weight=Math.floor(weight*(100+Math.floor(occupancy*CONFIG.generation.occupancySmallPercent/81))/100);
  if(state.candidates.some(piece=>piece.shapeId===shape.id))weight=Math.floor(weight/CONFIG.generation.recentShapeDivisor);
  return Math.max(1,weight);
 });
 const shapeId=weightedRaw(rolls.shapeRaw,shapes,weights).id;
 const cargo=weightedRaw<CargoId>(rolls.cargoRaw,OUTBOUND_CARGO,OUTBOUND_CARGO.map(id=>CONFIG.generation.cargoBaseWeight+state.board.filter(cell=>cell===id).length*CONFIG.generation.cargoPresenceWeight));
 return {...drawn,piece:{id,shapeId,cargo}};
}
function generateOwnedPiece(state:RunState):Piece {
 const generated=generatePieceV6(state);state.rngState=generated.rngState;state.nextId++;state.generatedPieces=(state.generatedPieces??0)+1;return generated.piece;
}
export function createRunV6(seed:number,difficultyId:OutboundDifficulty):RunState {
 const runConfigId=outboundRunConfigId(difficultyId);
 const state:RunState={rulesetVersion:6,runConfigId,difficultyId,boardSize:9,seed,mode:'color_exit',rngState:createRandomState(seed),
  board:Array(81).fill(null),cellTraits:Array(81).fill(null),generatedPieces:0,candidates:[],orders:OUTBOUND_TARGETS.map(order=>({...order})),
  phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:1,result:null,overtime:false,endReason:null};
 for(let i=0;i<CONFIG.candidateCount;i++)state.candidates.push(generateOwnedPiece(state));return state;
}
function placement(state:RunState,pieceId:string,origin:Point):{cells:number[];reason?:string} {
 if(state.phase!=='input')return {cells:[],reason:'当前阶段不能入库'};
 const piece=state.candidates.find(p=>p.id===pieceId),shape=SHAPES.find(s=>s.id===piece?.shapeId);
 if(!piece||!shape)return {cells:[],reason:'货件已不存在'};
 if(!isValidOutboundPieceV6(piece))return {cells:[],reason:'出库货件逐格内容无效'};
 if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
 if(origin.x<0||origin.y<0||origin.x>=9||origin.y>=9)return {cells:[],reason:'超出仓库边界'};
 const points=shape.cells.map(cell=>({x:cell.x+origin.x,y:cell.y+origin.y})),cells=points.map(toIndexV6);
 if(points.some(p=>p.x<0||p.y<0||p.x>=9||p.y>=9))return {cells,reason:'超出仓库边界'};
 if(cells.some(i=>state.board[i]!==null))return {cells,reason:'这里已有货物'};
 return {cells};
}
/** Every clear restarts fixed gate priority after exposing the newly empty cells. */
function resolveExits(state:RunState):Shipment[] {
 const pending=OUTBOUND_DOCKS.map(dock=>state.orders.find(order=>order.dockId===dock.id)!).filter(Boolean),shipments:Shipment[]=[];
 while(pending.length){
  let selected:ReturnType<typeof selectExitGroupV6>=null,index=-1;
  for(let i=0;i<pending.length;i++){selected=selectExitGroupV6(state,pending[i]);if(selected){index=i;break;}}
  if(!selected)break;
  const [order]=pending.splice(index,1),chain=shipments.length+1,score=selected.group.cells.length*CONFIG.pointsPerCell;
  shipments.push({type:'shipment',boardSize:9,dockId:order.dockId,orderId:order.id,cargo:order.cargo,cells:selected.group.cells,path:selected.path,score,chain,units:selected.group.cells.length,transport:'conveyor',cargoPaths:selected.cargoPaths});
  for(const cell of selected.group.cells){state.board[cell]=null;state.cellTraits![cell]=null;}
  state.completedOrders++;state.score+=score;
 }
 state.lastChain=shipments.length;state.maxChain=Math.max(state.maxChain,shipments.length);return shipments;
}
export function previewPlacementV6(state:RunState,pieceId:string,origin:Point):PlacementPreview {
 const checked=placement(state,pieceId,origin);if(checked.reason)return {valid:false,cells:checked.cells,shipments:[],reason:checked.reason};
 const next=cloneState(state),piece=next.candidates.find(p=>p.id===pieceId)!;for(const [index,cell] of checked.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
 return {valid:true,cells:checked.cells,shipments:resolveExits(next)};
}
export function findLegalMovesV6(state:RunState):{pieceId:string;origin:Point}[] {
 const moves:{pieceId:string;origin:Point}[]=[],input=state.phase==='input'?state:{...state,phase:'input' as const};
 for(const piece of state.candidates)for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(!placement(input,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});return moves;
}
export function applyCommandV6(state:RunState,command:Command):CommandResult {
 const reject=(error:string):CommandResult=>({state,events:[],error});if(!command||command.type!=='place')return reject('出库模式只接受入库指令');
 const checked=placement(state,command.pieceId,command.origin);if(checked.reason)return reject(checked.reason);
 const next=cloneState(state),index=next.candidates.findIndex(p=>p.id===command.pieceId),piece=next.candidates[index];
 for(const [index,cell] of checked.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
 next.maxOccupancy=Math.max(next.maxOccupancy??0,next.board.filter(Boolean).length);next.candidates.splice(index,1);
 const events:DomainEvent[]=[{type:'placed',pieceId:piece.id,cells:checked.cells},...resolveExits(next)];next.commands.push(copyCommand(command));next.commandIndex++;
 const shift=Math.min(CONFIG.stageCount,Math.floor(next.completedOrders/CONFIG.batchesPerStage)+1);if(shift>next.shift){next.shift=shift;events.push({type:'shift',shift});}
 if(next.completedOrders>=CONFIG.targetBatches){next.phase='result';next.result='won';next.endReason='completed';events.push({type:'result',result:'won'});return {state:next,events};}
 next.candidates.splice(index,0,generateOwnedPiece(next));
 if(!findLegalMovesV6(next).length){next.phase='result';next.result='failed';next.endReason='blocked';events.push({type:'result',result:'failed'});}return {state:next,events};
}
