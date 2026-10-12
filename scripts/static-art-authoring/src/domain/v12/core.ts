import {cloneData} from '../../shared/data.ts';
import type {OutboundDifficulty,Point,RunState} from '../types.ts';
import {createRunV6,generatePieceV6} from '../v6/engine.ts';
import {OUTBOUND_CARGO,OUTBOUND_DOCKS,isOutboundDifficulty} from '../v6/content.ts';
import {selectExitGroupV6} from '../v6/board.ts';
import {pieceCellCargo} from '../pieces.ts';
import {RULES_V12_CONFIG as CONFIG,validToolChargesV12} from './content.ts';
import {findGeometricMovesV12,pieceCellsV12,placementCellsV12,reservedEntryCellsV12} from './board.ts';
import type {OutboundItemCommandV12,OutboundPreviewV12,OutboundShipmentV12,OutboundToolEventV12,OutboundToolPieceV12,OutboundToolRunV12,ToolChargesV12} from './types.ts';
import type {OutboundToolCommandV13,OutboundToolRunV13} from '../v13/types.ts';
import {displayScoreV12,validScoreStateV12} from './score.ts';

export type OutboundToolsCoreState=OutboundToolRunV12|OutboundToolRunV13;
export interface OutboundCoreStep<T> {state:T;events:OutboundToolEventV12[];error?:string}
export function assertIdentityCore(state:OutboundToolsCoreState,version:12|13):void {
 if(state.rulesetVersion!==version||state.mode!=='color_exit'||state.boardSize!==9||state.board.length!==81
  ||!isOutboundDifficulty(state.difficultyId)||state.runConfigId!==`run.outbound9_v${version}.${state.difficultyId}`)
  throw Error('出库道具规则版本与局身份不匹配');
 if(!validScoreStateV12(state.rawScore,state.score,state.difficultyId))throw Error('出库累计原始分数与显示分数不匹配');
}
/** The frozen generator and route helpers only receive a read-only compatibility view. */
function legacyView(state:OutboundToolsCoreState):RunState {return {...state,phase:'input',commands:[]};}
export function createCore(version:12|13,seed:number,difficulty:OutboundDifficulty,charges:ToolChargesV12={rotate:0,clear:0,wildcard:0}):OutboundToolsCoreState {
 if(!Number.isInteger(seed)||seed<-2147483648||seed>4294967295)throw Error('Invalid outbound seed');
 if(!validToolChargesV12(charges))throw Error('Invalid outbound tool charges');
 const legacy=createRunV6(seed,difficulty);
 return {...legacy,rulesetVersion:version,runConfigId:`run.outbound9_v${version}.${difficulty}`,mode:'color_exit',boardSize:9,difficultyId:difficulty,
  phase:'input',result:null,endReason:null,overtime:false,rawScore:0,cellTraits:Array(81).fill(null),generatedPieces:3,commandBaseIndex:0,commands:[],
  candidates:legacy.candidates.map(piece=>({...piece,quarterTurns:0})),toolCharges:{...charges},usedToolIds:[]};
}
/** Every successful shipment restarts original north/east/west priority; each exit ships once. */
function settleShipments(state:OutboundToolsCoreState):OutboundShipmentV12[] {
 const pending=OUTBOUND_DOCKS.map(dock=>state.orders.find(order=>order.dockId===dock.id)!).filter(Boolean),shipments:OutboundShipmentV12[]=[];
 while(pending.length){
  let selected:ReturnType<typeof selectExitGroupV6>=null,index=-1;
  for(let i=0;i<pending.length;i++){selected=selectExitGroupV6(legacyView(state),pending[i]);if(selected){index=i;break;}}
  if(!selected)break;
  const [order]=pending.splice(index,1),chain=shipments.length+1,rawPoints=selected.group.cells.length*CONFIG.pointsPerCell;
  if(rawPoints>Number.MAX_SAFE_INTEGER-state.rawScore)throw new RangeError('Outbound raw score exceeds safe integer range');
  const rawScore=state.rawScore+rawPoints;
  const displayedScore=displayScoreV12(rawScore,state.difficultyId),score=displayedScore-state.score;
  shipments.push({type:'shipment',boardSize:9,dockId:order.dockId,orderId:order.id,cargo:order.cargo,cells:selected.group.cells,
   path:selected.path,score,chain,units:selected.group.cells.length,transport:'conveyor',cargoPaths:selected.cargoPaths});
  for(const cell of selected.group.cells){state.board[cell]=null;state.cellTraits[cell]=null;}
  state.completedOrders++;state.rawScore=rawScore;state.score=displayedScore;
 }
 state.lastChain=shipments.length;state.maxChain=Math.max(state.maxChain,shipments.length);return shipments;
}
function advanceShift(state:OutboundToolsCoreState,events:OutboundToolEventV12[]):void {
 const shift=Math.min(CONFIG.stageCount,Math.floor(state.completedOrders/CONFIG.batchesPerStage)+1);
 if(shift>state.shift){state.shift=shift;events.push({type:'shift',shift});}
}
function normalComplete(state:OutboundToolsCoreState):boolean {return state.rulesetVersion===12&&state.completedOrders>=CONFIG.targetBatches;}
function coloredLayout(piece:OutboundToolPieceV12):string {
 return JSON.stringify(pieceCellsV12(piece).map((point,index)=>[point.x,point.y,pieceCellCargo(piece,index)])
  .sort((a,b)=>(a[1] as number)-(b[1] as number)||(a[0] as number)-(b[0] as number)));
}
function recordCommand<T extends OutboundToolsCoreState>(state:T,command:OutboundToolCommandV13):void {
 state.commands=[...state.commands,cloneData(command)] as T['commands'];state.commandIndex++;
}
/** Raw tool transformation includes real clear settlement but never phase recursion or random generation. */
function toolChange<T extends OutboundToolsCoreState>(state:T,command:OutboundItemCommandV12,record:boolean):OutboundCoreStep<T> {
 const reject=(error:string):OutboundCoreStep<T>=>({state,events:[],error});
 if(!command||!['rotate','clear','wildcard'].includes(command.type))return reject('未知道具');
 if(!['input','rescue'].includes(state.phase)||state.result!==null)return reject('当前不能使用道具');
 if(state.toolCharges[command.type]!==1)return reject('没有可用道具');
 if(command.type==='clear'){
  if(!Array.isArray(command.cells)||command.cells.length<1||command.cells.length>2||new Set(command.cells).size!==command.cells.length
   ||[...command.cells].some(cell=>!Number.isInteger(cell)||cell<0||cell>=81||reservedEntryCellsV12().includes(cell)||state.board[cell]===null))return reject('请选择1至2个非入口占用格');
 }else{
  const piece=state.candidates.find(piece=>piece.id===command.pieceId);if(!piece)return reject('货件已不存在');
  if(command.type==='rotate'){
   if(![1,2,3].includes(command.quarterTurns))return reject('旋转朝向无效');
   if(coloredLayout(piece)===coloredLayout({...piece,quarterTurns:(piece.quarterTurns+command.quarterTurns)%4 as 0|1|2|3}))return reject('旋转没有改变货件');
  }else{
   if(!OUTBOUND_CARGO.includes(command.cargo))return reject('请选择三种出库颜色之一');
   if(piece.shapeId==='shape.single'&&piece.cargo===command.cargo&&!piece.cellCargos&&!piece.trait)return reject('货件已经是该颜色的单格货');
  }
 }
 // Rescue probes share immutable history and metadata; only these gameplay fields can change.
 const next=record?cloneData(state):{...state,board:[...state.board],cellTraits:[...state.cellTraits],toolCharges:{...state.toolCharges},
  usedToolIds:[...state.usedToolIds],candidates:state.candidates.map(piece=>({...piece}))};
 const events:OutboundToolEventV12[]=[{type:'toolUsed',toolId:command.type,...(command.type==='clear'?{cells:[...command.cells]}:{pieceId:command.pieceId})}];
 if(command.type==='clear'){
  for(const cell of command.cells){next.board[cell]=null;next.cellTraits[cell]=null;}
  events.push(...settleShipments(next));advanceShift(next,events);
 }else{
  const index=next.candidates.findIndex(piece=>piece.id===command.pieceId),piece=next.candidates[index];
  if(command.type==='rotate')piece.quarterTurns=(piece.quarterTurns+command.quarterTurns)%4 as 0|1|2|3;
  else next.candidates[index]={id:piece.id,shapeId:'shape.single',cargo:command.cargo,quarterTurns:0};
 }
 next.toolCharges[command.type]=0;if(!next.usedToolIds.includes(command.type))next.usedToolIds.push(command.type);
 if(record)recordCommand(next,command);return {state:next,events};
}
function transformCommands(state:OutboundToolsCoreState):OutboundItemCommandV12[] {
 const commands:OutboundItemCommandV12[]=[];
 for(const piece of state.candidates){
  if(state.toolCharges.rotate)for(const quarterTurns of [1,2,3] as const)commands.push({type:'rotate',pieceId:piece.id,quarterTurns});
  if(state.toolCharges.wildcard)for(const cargo of OUTBOUND_CARGO)commands.push({type:'wildcard',pieceId:piece.id,cargo});
 }
 return commands;
}
function rescued(state:OutboundToolsCoreState):boolean {return normalComplete(state)||findGeometricMovesV12(state,true).length>0;}
/** Exhaust only carried one-charge tools, at most two distinct kinds. No future placement/draw search. */
export function findRescueCore(state:OutboundToolsCoreState):OutboundItemCommandV12[]|null {
 if(state.result!==null)return null;
 const input={...state,phase:'input' as const};if(rescued(input))return [];
 const transforms=transformCommands(input);
 for(const command of transforms){
  const first=toolChange(input,command,false);if(first.error)continue;if(rescued(first.state))return [command];
  for(const second of transforms){
   if(second.type===command.type)continue;
   const result=toolChange(first.state,second,false);if(!result.error&&rescued(result.state))return [command,second];
  }
 }
 if(!input.toolCharges.clear)return null;
 const occupied=input.board.flatMap((cargo,cell)=>cargo!==null&&!reservedEntryCellsV12().includes(cell)?[cell]:[]);
 const tryClear=(cells:number[]):OutboundItemCommandV12[]|null=>{
  const command:OutboundItemCommandV12={type:'clear',cells},first=toolChange(input,command,false);
  if(first.error)return null;if(rescued(first.state))return [command];
  // Clear and candidate-only transforms commute; simulate clear first to include all real shipments.
  for(const second of transforms){const result=toolChange(first.state,second,false);if(!result.error&&rescued(result.state))return [command,second];}
  return null;
 };
 for(const cell of occupied){const plan=tryClear([cell]);if(plan)return plan;}
 for(let a=0;a<occupied.length;a++)for(let b=a+1;b<occupied.length;b++){const plan=tryClear([occupied[a],occupied[b]]);if(plan)return plan;}
 return null;
}
/** Keep the first witness transient so a rescue event does not repeat the same bounded search. */
function settledPhase<T extends OutboundToolsCoreState>(state:T):{state:T;rescuePlan:OutboundItemCommandV12[]|null} {
 const next=cloneData(state),settled={state:next,rescuePlan:null};if(next.result!==null)return settled;
 if(normalComplete(next)){next.phase='result';next.result='won';next.endReason='completed';return settled;}
 if(findGeometricMovesV12(next,true).length){next.phase='input';return settled;}
 const rescuePlan=findRescueCore(next);if(rescuePlan){next.phase='rescue';return {state:next,rescuePlan};}
 next.phase='result';next.result='failed';next.endReason='blocked';return settled;
}
export function settlePhaseCore<T extends OutboundToolsCoreState>(state:T):T {return settledPhase(state).state;}
function settleWithEvents<T extends OutboundToolsCoreState>(state:T,events:OutboundToolEventV12[]):OutboundCoreStep<T> {
 const {state:next,rescuePlan}=settledPhase(state);
 if(rescuePlan)events.push({type:'rescue',plan:rescuePlan});
 if(next.phase==='result'&&state.result===null)events.push({type:'result',result:next.result!,endReason:next.endReason!});
 return {state:next,events};
}
export function previewCore(state:OutboundToolsCoreState,pieceId:string,origin:Point):OutboundPreviewV12 {
 if(state.phase!=='input'||state.result!==null)return {valid:false,cells:[],shipments:[],reason:'当前阶段不能入库'};
 const checked=placementCellsV12(state,pieceId,origin);if(checked.reason)return {valid:false,cells:checked.cells,shipments:[],reason:checked.reason};
 const next=cloneData(state),piece=next.candidates.find(piece=>piece.id===pieceId)!;
 for(const [index,cell] of checked.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
 return {valid:true,cells:checked.cells,shipments:settleShipments(next)};
}
export function applyToolCore<T extends OutboundToolsCoreState>(state:T,command:OutboundItemCommandV12):OutboundCoreStep<T> {
 const changed=toolChange(state,command,true);return changed.error?changed:settleWithEvents(changed.state,changed.events);
}
export function applyCore<T extends OutboundToolsCoreState>(state:T,command:OutboundToolCommandV13):OutboundCoreStep<T> {
 const reject=(error:string):OutboundCoreStep<T>=>({state,events:[],error});
 if(!command||!['place','rotate','clear','wildcard','finishOutboundEndless'].includes(command.type))return reject('未知出库指令');
 if(state.phase==='result'||state.result!==null)return reject('本局已经结束');
 if(command.type==='finishOutboundEndless'){
  if(state.rulesetVersion!==13)return reject('只有出库无限局可以结束经营');
  const next=cloneData(state);next.phase='result';next.result='won';next.endReason='retired';recordCommand(next,command);
  return {state:next,events:[{type:'result',result:'won',endReason:'retired'}]};
 }
 if(command.type!=='place')return applyToolCore(state,command);
 const preview=previewCore(state,command.pieceId,command.origin);if(!preview.valid)return reject(preview.reason!);
 const next=cloneData(state),slot=next.candidates.findIndex(piece=>piece.id===command.pieceId),piece=next.candidates[slot];
 for(const [index,cell] of preview.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
 next.maxOccupancy=Math.max(next.maxOccupancy??0,next.board.filter(Boolean).length);next.candidates.splice(slot,1);
 const events:OutboundToolEventV12[]=[{type:'placed',pieceId:piece.id,cells:preview.cells},...settleShipments(next)];
 recordCommand(next,command);advanceShift(next,events);
 // Normal victory follows the full shipment chain and precedes replacement/no-fit/rescue.
 if(normalComplete(next))return settleWithEvents(next,events);
 const generated=generatePieceV6(legacyView(next));next.rngState=generated.rngState;next.nextId++;next.generatedPieces++;
 next.candidates.splice(slot,0,{...generated.piece,quarterTurns:0});return settleWithEvents(next,events);
}

/** UI metadata and storage segmentation are excluded; carried and consumed tools are gameplay. */
export function checksumCore(state:OutboundToolsCoreState):string {
 const canonical=JSON.stringify([
  state.rulesetVersion,state.runConfigId,state.seed,state.mode,state.boardSize,state.difficultyId,state.board,state.cellTraits,
  state.candidates.map(piece=>[piece.id,piece.shapeId,piece.cargo,piece.cellCargos??null,piece.quarterTurns]),
  state.orders.map(order=>[order.id,order.dockId,order.cargo,order.amount,order.baseScore]),
  state.score,state.rawScore,state.shift,state.rngState,state.phase,state.completedOrders,state.lastChain,state.maxChain,
  state.upgrades,state.upgradeChoices,state.commandIndex,state.nextId,state.generatedPieces,state.result,state.endReason,
  [state.toolCharges.rotate,state.toolCharges.clear,state.toolCharges.wildcard],state.usedToolIds,
 ]);
 let hash=0x811c9dc5;for(let index=0;index<canonical.length;index++){hash^=canonical.charCodeAt(index);hash=Math.imul(hash,0x01000193);}
 return (hash>>>0).toString(16).padStart(8,'0');
}
/** Call only after application storage has durably sealed the corresponding immutable commands. */
export function compactCore<T extends OutboundToolsCoreState>(state:T,throughIndex:number):T {
 if(!Number.isSafeInteger(throughIndex)||throughIndex%CONFIG.historySegmentSize!==0||throughIndex<state.commandBaseIndex
  ||throughIndex>state.commandIndex||state.commandBaseIndex+state.commands.length!==state.commandIndex)throw Error('出库道具历史封段边界无效');
 const next=cloneData(state);next.commands=next.commands.slice(throughIndex-state.commandBaseIndex) as T['commands'];next.commandBaseIndex=throughIndex;return next;
}
