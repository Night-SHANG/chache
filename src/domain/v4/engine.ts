import type {CargoId,Command,CommandResult,DomainEvent,Piece,PlacementPreview,Point,RunState,Shipment} from '../types.ts';
import {SHAPES} from '../rulesets/v1/content.ts';
import {toIndex} from '../rulesets/v1/board.ts';
import {createRandomState,nextRandom} from '../random.ts';
import {COLOR_EXIT_CARGO,COLOR_EXIT_DOCKS,COLOR_EXIT_TARGETS,RULES_V4_CONFIG as CONFIG} from './content.ts';
import {selectExitGroupV4} from './board.ts';
function copyCommand(command:Command):Command{return command.type==='place'?{...command,origin:{...command.origin}}:{...command};}
function cloneState(state:RunState):RunState {
 return {...state,board:[...state.board],cellTraits:state.board.map(()=>null),rngState:[...state.rngState],
  candidates:state.candidates.map(p=>({...p})),orders:state.orders.map(o=>({...o})),
  upgrades:[...state.upgrades],upgradeChoices:[...state.upgradeChoices],commands:state.commands.map(copyCommand)};
}
function weighted<T>(state:RunState,values:T[],weights:number[]):T {
 const draw=nextRandom(state.rngState,1,weights.reduce((a,b)=>a+b,0));state.rngState=draw.state;let value=draw.value;
 for(let i=0;i<values.length;i++){value-=weights[i];if(value<=0)return values[i];}
 throw Error('Invalid v4 weighted pool');
}
/** Reuses frozen ordinary-shape weights and occupancy bias, with no rescue, traits or extra RNG. */
function generatePiece(state:RunState):Piece {
 const shapes=SHAPES.filter(shape=>shape.minShift<=state.shift),occupancy=state.board.filter(Boolean).length;
 const weights=shapes.map(shape=>{
  let weight=shape.weight*100;
  if(shape.cells.length<=2)weight=Math.floor(weight*(100+Math.floor(occupancy*CONFIG.generation.occupancySmallPercent/49))/100);
  if(state.candidates.some(piece=>piece.shapeId===shape.id))weight=Math.floor(weight/CONFIG.generation.recentShapeDivisor);
  return Math.max(1,weight);
 });
 const shapeId=weighted(state,shapes,weights).id;
 const cargo=weighted<CargoId>(state,COLOR_EXIT_CARGO,COLOR_EXIT_CARGO.map(id=>CONFIG.generation.cargoBaseWeight+state.board.filter(cell=>cell===id).length*CONFIG.generation.cargoPresenceWeight));
 state.generatedPieces=(state.generatedPieces??0)+1;
 return {id:`piece.${state.nextId++}`,shapeId,cargo};
}
export function createRunV4(seed:number):RunState {
 const state:RunState={rulesetVersion:4,runConfigId:CONFIG.runConfigId,seed,mode:'color_exit',rngState:createRandomState(seed),
  board:Array(49).fill(null),cellTraits:Array(49).fill(null),generatedPieces:0,candidates:[],orders:COLOR_EXIT_TARGETS.map(order=>({...order})),
  phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:1,result:null,overtime:false,endReason:null};
 for(let i=0;i<CONFIG.candidateCount;i++)state.candidates.push(generatePiece(state));
 return state;
}
function placement(state:RunState,pieceId:string,origin:Point):{cells:number[];reason?:string} {
 if(state.phase!=='input')return {cells:[],reason:'当前阶段不能入库'};
 const piece=state.candidates.find(p=>p.id===pieceId),shape=SHAPES.find(s=>s.id===piece?.shapeId);
 if(!piece||!shape)return {cells:[],reason:'货件已不存在'};
 if(piece.trait!==undefined||piece.rushTurns!==undefined||!COLOR_EXIT_CARGO.includes(piece.cargo))return {cells:[],reason:'颜色出口只接受三类普通货件'};
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
export function previewPlacementV4(state:RunState,pieceId:string,origin:Point):PlacementPreview {
 const checked=placement(state,pieceId,origin);if(checked.reason)return {valid:false,cells:checked.cells,shipments:[],reason:checked.reason};
 const next=cloneState(state),piece=next.candidates.find(p=>p.id===pieceId)!;for(const cell of checked.cells)next.board[cell]=piece.cargo;
 return {valid:true,cells:checked.cells,shipments:resolveExits(next)};
}
export function findLegalMovesV4(state:RunState):{pieceId:string;origin:Point}[] {
 const moves:{pieceId:string;origin:Point}[]=[],input=state.phase==='input'?state:{...state,phase:'input' as const};
 for(const piece of state.candidates)for(let y=0;y<7;y++)for(let x=0;x<7;x++)if(!placement(input,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});
 return moves;
}
export function applyCommandV4(state:RunState,command:Command):CommandResult {
 const reject=(error:string):CommandResult=>({state,events:[],error});
 if(!command||command.type!=='place')return reject('颜色出口只接受入库指令');
 const checked=placement(state,command.pieceId,command.origin);if(checked.reason)return reject(checked.reason);
 const next=cloneState(state),index=next.candidates.findIndex(p=>p.id===command.pieceId),piece=next.candidates[index];
 for(const cell of checked.cells)next.board[cell]=piece.cargo;
 next.maxOccupancy=Math.max(next.maxOccupancy??0,next.board.filter(Boolean).length);next.candidates.splice(index,1);
 const events:DomainEvent[]=[{type:'placed',pieceId:piece.id,cells:checked.cells},...resolveExits(next)];
 next.commands.push(copyCommand(command));next.commandIndex++;
 const shift=Math.min(CONFIG.stageCount,Math.floor(next.completedOrders/CONFIG.batchesPerStage)+1);
 if(shift>next.shift){next.shift=shift;events.push({type:'shift',shift});}
 if(next.completedOrders>=CONFIG.targetBatches){next.phase='result';next.result='won';next.endReason='completed';events.push({type:'result',result:'won'});return {state:next,events};}
 next.candidates.splice(index,0,generatePiece(next));
 if(!findLegalMovesV4(next).length){next.phase='result';next.result='failed';next.endReason='blocked';events.push({type:'result',result:'failed'});}
 return {state:next,events};
}
