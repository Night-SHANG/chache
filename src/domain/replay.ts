import type {RunState,Command,ColorTier} from './types.ts';
import type {RunState as LegacyState} from './rulesets/v1/types.ts';
import {createRun,applyCommand,assertRulesIdentity} from './engine.ts';
import {checksum as legacyChecksum} from './rulesets/v1/replay.ts';
/** V1's exact checksum is retained; v2 includes every future-affecting trait/counter. */
export function checksum(state:RunState):string {
 assertRulesIdentity(state);
 if(state.rulesetVersion===1)return legacyChecksum(state as LegacyState);
 if(state.rulesetVersion!==2&&state.rulesetVersion!==3&&state.rulesetVersion!==4&&state.rulesetVersion!==5)throw Error(`不支持规则版本 ${state.rulesetVersion}`);
 const fields:unknown[]=[legacyChecksum(state as LegacyState),state.candidates.map(p=>[p.trait??null,p.rushTurns??null]),state.cellTraits?.map(t=>t?[t.kind,t.remaining??null,t.bornAtCommand??null]:null),state.generatedPieces];
 if(state.rulesetVersion===3)fields.push(state.tutorialStep,state.overtime,state.endReason);
 if(state.rulesetVersion===4)fields.push(state.overtime,state.endReason);
 if(state.rulesetVersion===5)fields.push(state.overtime,state.endReason,state.colorTier,state.candidates.map(piece=>piece.cellCargos??null));
 const data=JSON.stringify(fields);
 let hash=0x811c9dc5;for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,0x01000193);}return(hash>>>0).toString(16).padStart(8,'0');
}
export function replay(seed:number,commands:Command[],mode:RunState['mode']='standard',rulesetVersion=1,colorTier?:ColorTier):RunState {
 let state=createRun(seed,mode,rulesetVersion,colorTier);
 for(let i=0;i<commands.length;i++){const result=applyCommand(state,commands[i]);if(result.error)throw Error(`Replay command ${i}: ${result.error}`);state=result.state;}
 return state;
}
/** One-based accepted-command index, matching RunState.commandIndex. */
export interface ReplayTraceEntry {commandIndex:number;checksum:string}
export interface ReplayTrace {state:RunState;trace:ReplayTraceEntry[]}
export interface ReplayDivergence {commandIndex:number;expected:ReplayTraceEntry|null;actual:ReplayTraceEntry|null}
/** Additive diagnostic API; the existing replay return value and checksum stay unchanged. */
export function replayWithTrace(seed:number,commands:readonly Command[],mode:RunState['mode']='standard',rulesetVersion=1,colorTier?:ColorTier):ReplayTrace {
 let state=createRun(seed,mode,rulesetVersion,colorTier);const trace:ReplayTraceEntry[]=[];
 for(let i=0;i<commands.length;i++){
  const result=applyCommand(state,commands[i]);if(result.error)throw Error(`Replay command ${i}: ${result.error}`);
  state=result.state;trace.push({commandIndex:state.commandIndex,checksum:checksum(state)});
 }
 return {state,trace};
}
/** Compare in recorded order, including missing/extra commands. null means all entries match.
 * A mismatching command index is itself a divergence, even if the checksums match. */
export function findReplayDivergence(expected:readonly ReplayTraceEntry[],actual:readonly ReplayTraceEntry[]):ReplayDivergence|null {
 for(let i=0;i<Math.max(expected.length,actual.length);i++){
  const left=expected[i],right=actual[i];
  if(!left||!right||left.commandIndex!==right.commandIndex||left.checksum!==right.checksum)
   return {commandIndex:left?.commandIndex??right.commandIndex,expected:left?{...left}:null,actual:right?{...right}:null};
 }
 return null;
}
