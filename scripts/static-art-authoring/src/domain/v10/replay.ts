import type {OutboundDifficulty} from '../types.ts';
import type {OutboundEndlessCommandV10, OutboundEndlessRunV10} from './types.ts';
import {applyCommandV10,assertRulesIdentityV10,createRunV10} from './engine.ts';

/** History segments and UI metadata do not affect gameplay; the absolute command count does. */
export function checksumV10(state:OutboundEndlessRunV10):string {
  assertRulesIdentityV10(state);
  const canonical=JSON.stringify([
    state.rulesetVersion,state.runConfigId,state.seed,state.mode,state.boardSize,state.difficultyId,state.board,
    state.candidates.map(piece=>[piece.id,piece.shapeId,piece.cargo,piece.cellCargos??null]),
    state.orders.map(order=>[order.id,order.dockId,order.cargo,order.amount,order.baseScore]),
    state.score,state.shift,state.rngState,state.phase,state.completedOrders,state.lastChain,state.maxChain,
    state.upgrades,state.upgradeChoices,state.commandIndex,state.nextId,state.generatedPieces,state.result,state.endReason,
  ]);
  let hash=0x811c9dc5;for(let index=0;index<canonical.length;index++){hash^=canonical.charCodeAt(index);hash=Math.imul(hash,0x01000193);}
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function replayV10(seed:number,difficulty:OutboundDifficulty,commands:readonly OutboundEndlessCommandV10[]):OutboundEndlessRunV10 {
  let state=createRunV10(seed,difficulty);
  for(const [index,command] of commands.entries()){
    const result=applyCommandV10(state,command);if(result.error)throw Error(`Replay command ${index}: ${result.error}`);state=result.state;
  }
  return state;
}
