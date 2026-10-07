import {cloneData} from '../../shared/data.ts';
import {createRunV14,applyCommandV14} from './engine.ts';
import {NEUTRAL_LEVEL_IDS_V14} from './content.ts';
import type{InboundRunV14,InboundCommandV14,StartV14}from'./types.ts';
/** Explicit gameplay identity excludes command storage representation and application metadata. */
export function checksumV14(state:InboundRunV14):string {
 const fields=[state.rulesetVersion,state.runConfigId,state.seed,state.mode,state.guided,state.boardSize,state.board,
  state.cellTraits.map(t=>t?[t.kind,t.remaining??null,t.bornAtPlacement??null]:null),state.rngState,state.nextId,
  state.candidates.map(p=>[p.id,p.shapeId,p.quarterTurns,p.cargo,p.trait??null,p.rushTurns??null]),
  state.orders.map(o=>[o.id,o.dockId,o.cargo,o.amount,o.baseScore]),state.phase,state.shift,state.completedOrders,state.score,state.lastChain,state.maxChain,
  NEUTRAL_LEVEL_IDS_V14.map(id=>state.levels[id]),state.supplyCargo,state.pendingThresholds,state.claimedThresholds,state.upgradeChoices,
  state.cleanup?[state.cleanup.branch,state.cleanup.progress]:null,state.successfulPlacements,state.generatedPieces,
  [state.toolCharges.rotate,state.toolCharges.clear,state.toolCharges.wildcard],state.usedToolIds,state.commandIndex,state.overtime,state.result,state.endReason];
 const data=JSON.stringify(fields);let hash=0x811c9dc5;for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,0x01000193);}return(hash>>>0).toString(16).padStart(8,'0');
}
export function compactCommandTailV14(state:InboundRunV14,throughIndex:number):InboundRunV14 {
 if(!Number.isSafeInteger(throughIndex)||throughIndex%128!==0||throughIndex<state.commandBaseIndex||throughIndex>state.commandIndex||state.commandIndex-state.commandBaseIndex!==state.commands.length)throw new Error('Invalid v14 compaction prefix');
 const next=cloneData(state);next.commands=next.commands.slice(throughIndex-next.commandBaseIndex);next.commandBaseIndex=throughIndex;return next;
}
export function replayV14(options:StartV14,commands:Iterable<InboundCommandV14>):{state:InboundRunV14;trace:{index:number;checksum:string}[]}{
 let state=createRunV14(options);const trace:{index:number;checksum:string}[]=[];
 for(const command of commands){const result=applyCommandV14(state,command);if(result.error)throw new Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;trace.push({index:state.commandIndex,checksum:checksumV14(state)});if(state.commands.length>=128)state=compactCommandTailV14(state,state.commandIndex);}
 return {state,trace};
}
