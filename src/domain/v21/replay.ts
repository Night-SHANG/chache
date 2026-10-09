import {checksumV20,compactCommandTailV20} from '../v20/replay.ts';
import {applyCommandV21,asV20,createRunV21,fromV20} from './engine.ts';
import type {RushCommandV21,RushRunV21,StartRushV21} from './types.ts';
export function checksumV21(state:RushRunV21):string {
 const data=JSON.stringify([state.rulesetVersion,state.runConfigId,checksumV20(asV20(state))]);
 let hash=0x811c9dc5;for(let index=0;index<data.length;index++){hash^=data.charCodeAt(index);hash=Math.imul(hash,0x01000193);}return (hash>>>0).toString(16).padStart(8,'0');
}
export function compactCommandTailV21(state:RushRunV21,throughIndex:number):RushRunV21 {return fromV20(compactCommandTailV20(asV20(state),throughIndex));}
export function replayV21(options:StartRushV21,commands:Iterable<RushCommandV21>):{state:RushRunV21;trace:{index:number;checksum:string}[]} {
 let state=createRunV21(options);const trace:{index:number;checksum:string}[]=[];
 for(const command of commands){const result=applyCommandV21(state,command);if(result.error)throw new Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;trace.push({index:state.commandIndex,checksum:checksumV21(state)});if(state.commands.length>=128)state=compactCommandTailV21(state,state.commandIndex);}
 return {state,trace};
}
