import {cloneData} from '../../shared/data.ts';
import {createRunV11,applyCommandV11} from './engine.ts';
import {NEUTRAL_LEVEL_IDS_V11} from './content.ts';
import type{InboundRunV11,InboundCommandV11,StartV11}from'./types.ts';
/** Explicit gameplay identity excludes command storage representation and application metadata. */
export function checksumV11(state:InboundRunV11):string {
 const fields=[state.rulesetVersion,state.runConfigId,state.seed,state.mode,state.guided,state.boardSize,state.board,
  state.cellTraits.map(t=>t?[t.kind,t.remaining??null,t.bornAtPlacement??null]:null),state.rngState,state.nextId,
  state.candidates.map(p=>[p.id,p.shapeId,p.quarterTurns,p.cargo,p.trait??null,p.rushTurns??null]),
  state.orders.map(o=>[o.id,o.dockId,o.cargo,o.amount,o.baseScore]),state.phase,state.shift,state.completedOrders,state.score,state.lastChain,state.maxChain,
  NEUTRAL_LEVEL_IDS_V11.map(id=>state.levels[id]),state.supplyCargo,state.pendingThresholds,state.claimedThresholds,state.upgradeChoices,
  state.cleanup?[state.cleanup.branch,state.cleanup.progress]:null,state.successfulPlacements,state.generatedPieces,
  [state.toolCharges.rotate,state.toolCharges.clear,state.toolCharges.wildcard],state.usedToolIds,state.commandIndex,state.overtime,state.result,state.endReason];
 const data=JSON.stringify(fields);let hash=0x811c9dc5;for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,0x01000193);}return(hash>>>0).toString(16).padStart(8,'0');
}
export function compactCommandTailV11(state:InboundRunV11,throughIndex:number):InboundRunV11 {
 if(!Number.isSafeInteger(throughIndex)||throughIndex%128!==0||throughIndex<state.commandBaseIndex||throughIndex>state.commandIndex||state.commandIndex-state.commandBaseIndex!==state.commands.length)throw new Error('Invalid v11 compaction prefix');
 const next=cloneData(state);next.commands=next.commands.slice(throughIndex-next.commandBaseIndex);next.commandBaseIndex=throughIndex;return next;
}
export function replayV11(options:StartV11,commands:Iterable<InboundCommandV11>):{state:InboundRunV11;trace:{index:number;checksum:string}[]}{
 let state=createRunV11(options);const trace:{index:number;checksum:string}[]=[];
 for(const command of commands){const result=applyCommandV11(state,command);if(result.error)throw new Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;trace.push({index:state.commandIndex,checksum:checksumV11(state)});if(state.commands.length>=128)state=compactCommandTailV11(state,state.commandIndex);}
 return {state,trace};
}
