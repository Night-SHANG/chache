import {checksumV16,compactCommandTailV16} from '../v16/replay.ts';
import {applyCommandV19,asV16,createRunV19,fromV16} from './engine.ts';
import type {RushCommandV19,RushRunV19,StartRushV19} from './types.ts';

/** Bind permanent mode, tier and both score totals; commandIndex remains independent of tail storage. */
export function checksumV19(state:RushRunV19):string {
 const raw=asV16(state),data=JSON.stringify([state.rulesetVersion,state.runConfigId,state.mode,state.inboundDifficulty,state.rawScore,state.score,checksumV16(raw)]);
 let hash=0x811c9dc5;for(let index=0;index<data.length;index++){hash^=data.charCodeAt(index);hash=Math.imul(hash,0x01000193);}return (hash>>>0).toString(16).padStart(8,'0');
}
export function compactCommandTailV19(state:RushRunV19,throughIndex:number):RushRunV19 {return fromV16(compactCommandTailV16(asV16(state),throughIndex));}
export function replayV19(options:StartRushV19,commands:Iterable<RushCommandV19>):{state:RushRunV19;trace:{index:number;checksum:string}[]} {
 let state=createRunV19(options);const trace:{index:number;checksum:string}[]=[];
 for(const command of commands){const result=applyCommandV19(state,command);if(result.error)throw new Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;trace.push({index:state.commandIndex,checksum:checksumV19(state)});if(state.commands.length>=128)state=compactCommandTailV19(state,state.commandIndex);}
 return {state,trace};
}
