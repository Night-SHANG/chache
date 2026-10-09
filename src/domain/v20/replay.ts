import {checksumV16,compactCommandTailV16} from '../v16/replay.ts';
import {applyCommandV20,asV16,createRunV20,fromV16} from './engine.ts';
import type {RushCommandV20,RushRunV20,StartRushV20} from './types.ts';

export function checksumV20(state:RushRunV20):string {
 const raw=asV16(state),data=JSON.stringify([state.rulesetVersion,state.runConfigId,state.mode,state.inboundDifficulty,state.rawScore,state.score,checksumV16(raw)]);
 let hash=0x811c9dc5;for(let index=0;index<data.length;index++){hash^=data.charCodeAt(index);hash=Math.imul(hash,0x01000193);}return (hash>>>0).toString(16).padStart(8,'0');
}
export function compactCommandTailV20(state:RushRunV20,throughIndex:number):RushRunV20 {return fromV16(compactCommandTailV16(asV16(state),throughIndex));}
export function replayV20(options:StartRushV20,commands:Iterable<RushCommandV20>):{state:RushRunV20;trace:{index:number;checksum:string}[]} {
 let state=createRunV20(options);const trace:{index:number;checksum:string}[]=[];
 for(const command of commands){const result=applyCommandV20(state,command);if(result.error)throw new Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;trace.push({index:state.commandIndex,checksum:checksumV20(state)});if(state.commands.length>=128)state=compactCommandTailV20(state,state.commandIndex);}
 return {state,trace};
}
