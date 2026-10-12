import {checksumV16,compactCommandTailV16} from '../v16/replay.ts';
import {applyCommandV18,asV16,createRunV18,fromV16} from './engine.ts';
import type {InboundCommandV18,InboundRunV18,StartV18} from './types.ts';

/** Include18 tier and both score representations; frozen16 already omits storage/app metadata. */
export function checksumV18(state:InboundRunV18):string {
 const raw=asV16(state),data=JSON.stringify([state.rulesetVersion,state.runConfigId,state.inboundDifficulty,state.rawScore,state.score,checksumV16(raw)]);
 let hash=0x811c9dc5;for(let index=0;index<data.length;index++){hash^=data.charCodeAt(index);hash=Math.imul(hash,0x01000193);}return (hash>>>0).toString(16).padStart(8,'0');
}
export function compactCommandTailV18(state:InboundRunV18,throughIndex:number):InboundRunV18 {return fromV16(compactCommandTailV16(asV16(state),throughIndex));}
export function replayV18(options:StartV18,commands:Iterable<InboundCommandV18>):{state:InboundRunV18;trace:{index:number;checksum:string}[]} {
 let state=createRunV18(options);const trace:{index:number;checksum:string}[]=[];
 for(const command of commands){const result=applyCommandV18(state,command);if(result.error)throw new Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;trace.push({index:state.commandIndex,checksum:checksumV18(state)});if(state.commands.length>=128)state=compactCommandTailV18(state,state.commandIndex);}
 return {state,trace};
}
