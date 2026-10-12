import type {OutboundDifficulty, Piece, Point, RunState} from '../types.ts';
import type {OutboundEndlessCommandV10, OutboundEndlessRunV10, OutboundEventV10, OutboundPreviewV10, OutboundStepResultV10} from './types.ts';
import {createRunV6, findLegalMovesV6, generatePieceV6, previewPlacementV6} from '../v6/engine.ts';
import {pieceCellCargo} from '../pieces.ts';
import {isOutboundDifficulty, OUTBOUND_ENTRY} from '../v6/content.ts';
import {toIndexV6} from '../v6/board.ts';
import {RULES_V10_CONFIG as CONFIG, outboundRunConfigIdV10} from './content.ts';

export function assertRulesIdentityV10(state:OutboundEndlessRunV10):void {
  if(state.rulesetVersion!==10||state.mode!=='color_exit'||state.boardSize!==9||state.board.length!==81
    ||!isOutboundDifficulty(state.difficultyId)||state.runConfigId!==outboundRunConfigIdV10(state.difficultyId))
    throw Error('出库无限规则版本与局身份不匹配');
}

/** The frozen pure geometry/generator never reads history or mutates this view. */
function geometryState(state:OutboundEndlessRunV10):RunState {return {...state,commands:[]};}
function copyCommand(command:OutboundEndlessCommandV10):OutboundEndlessCommandV10 {
  return command.type==='place'?{...command,origin:{...command.origin}}:{...command};
}
function cloneState(state:OutboundEndlessRunV10):OutboundEndlessRunV10 {
  return {...state,board:[...state.board],cellTraits:state.cellTraits.map(trait=>trait?{...trait}:null),rngState:[...state.rngState],
    candidates:state.candidates.map(piece=>piece.cellCargos?{...piece,cellCargos:[...piece.cellCargos]}:{...piece}),
    orders:state.orders.map(order=>({...order})),upgrades:[...state.upgrades],upgradeChoices:[...state.upgradeChoices],commands:state.commands.map(copyCommand)};
}
function generateOwnedPiece(state:OutboundEndlessRunV10):Piece {
  const generated=generatePieceV6(geometryState(state));state.rngState=generated.rngState;state.nextId++;state.generatedPieces++;
  return generated.piece;
}

export function createRunV10(seed:number,difficulty:OutboundDifficulty):OutboundEndlessRunV10 {
  const legacy=createRunV6(seed,difficulty);
  return {...legacy,rulesetVersion:10,runConfigId:outboundRunConfigIdV10(difficulty),mode:'color_exit',boardSize:9,difficultyId:difficulty,
    phase:'input',result:null,endReason:null,overtime:false,cellTraits:Array(81).fill(null),generatedPieces:3,commandBaseIndex:0,commands:[]};
}
export function previewPlacementV10(state:OutboundEndlessRunV10,pieceId:string,origin:Point):OutboundPreviewV10 {
  assertRulesIdentityV10(state);
  const preview=previewPlacementV6(geometryState(state),pieceId,origin);
  return {...preview,shipments:preview.shipments.map(shipment=>({...shipment,boardSize:9,units:shipment.cells.length,
    transport:'conveyor',cargoPaths:shipment.cargoPaths!}))};
}

/** Geometric moves remain inspectable after termination; placement still rejects non-input phases. */
export function findLegalMovesV10(state:OutboundEndlessRunV10):{pieceId:string;origin:Point}[] {
  assertRulesIdentityV10(state);return findLegalMovesV6(geometryState(state));
}

/** Complete frozen exit settlement first, then the consumed-slot refill, then terminal board facts.
 * This never invokes v8's finite reducer or reopens a won state. */
export function applyCommandV10(state:OutboundEndlessRunV10,command:OutboundEndlessCommandV10):OutboundStepResultV10 {
  assertRulesIdentityV10(state);
  const reject=(error:string):OutboundStepResultV10=>({state,events:[],error});
  if(!command||(command.type!=='place'&&command.type!=='finishOutboundEndless'))return reject('未知出库无限指令');
  if(state.phase!=='input')return reject('当前阶段不能操作出库无限');
  if(command.type==='finishOutboundEndless'){
    const next=cloneState(state);next.phase='result';next.result='won';next.endReason='retired';
    next.commands.push(copyCommand(command));next.commandIndex++;
    return {state:next,events:[{type:'result',result:'won',endReason:'retired'}]};
  }
  const preview=previewPlacementV10(state,command.pieceId,command.origin);
  if(!preview.valid)return reject(preview.reason!);
  const next=cloneState(state),slot=next.candidates.findIndex(piece=>piece.id===command.pieceId),piece=next.candidates[slot];
  for(const [index,cell] of preview.cells.entries())next.board[cell]=pieceCellCargo(piece,index);
  next.maxOccupancy=Math.max(next.maxOccupancy??0,next.board.filter(Boolean).length);next.candidates.splice(slot,1);
  for(const shipment of preview.shipments){
    for(const cell of shipment.cells){next.board[cell]=null;next.cellTraits[cell]=null;}
    next.completedOrders++;next.score+=shipment.score;
  }
  next.lastChain=preview.shipments.length;next.maxChain=Math.max(next.maxChain,next.lastChain);
  const events:OutboundEventV10[]=[{type:'placed',pieceId:piece.id,cells:preview.cells},...preview.shipments];
  next.commands.push(copyCommand(command));next.commandIndex++;
  const shift=Math.min(CONFIG.stageCount,Math.floor(next.completedOrders/CONFIG.batchesPerStage)+1);
  if(shift>next.shift){next.shift=shift;events.push({type:'shift',shift});}
  next.candidates.splice(slot,0,generateOwnedPiece(next));
  if(next.board[toIndexV6(OUTBOUND_ENTRY.entry)]!==null||!findLegalMovesV10(next).length){
    next.phase='result';next.result='failed';next.endReason='blocked';events.push({type:'result',result:'failed'});
  }
  return {state:next,events};
}

/** Only call after the application has durably sealed these commands in immutable segments. */
export function compactCommandTailV10(state:OutboundEndlessRunV10,throughIndex:number):OutboundEndlessRunV10 {
  assertRulesIdentityV10(state);
  if(!Number.isInteger(throughIndex)||throughIndex%CONFIG.historySegmentSize!==0||throughIndex<state.commandBaseIndex
    ||throughIndex>state.commandIndex||state.commandBaseIndex+state.commands.length!==state.commandIndex)
    throw Error('出库无限历史封段边界无效');
  const next=cloneState(state);next.commands=next.commands.slice(throughIndex-state.commandBaseIndex);next.commandBaseIndex=throughIndex;
  return next;
}
