import type {OutboundDifficulty} from '../types.ts';
import type {OutboundToolCommandV12,OutboundToolRunV12,ToolChargesV12} from './types.ts';
import {applyCommandV12,assertRulesIdentityV12,createRunV12} from './engine.ts';
import {checksumCore,compactCore} from './core.ts';
export function checksumV12(state:OutboundToolRunV12):string {assertRulesIdentityV12(state);return checksumCore(state);}
export function compactCommandTailV12(state:OutboundToolRunV12,throughIndex:number):OutboundToolRunV12 {assertRulesIdentityV12(state);return compactCore(state,throughIndex);}
export function replayV12(seed:number,difficulty:OutboundDifficulty,commands:Iterable<OutboundToolCommandV12>,toolCharges?:ToolChargesV12):OutboundToolRunV12 {
 let state=createRunV12(seed,difficulty,toolCharges);
 for(const command of commands){const result=applyCommandV12(state,command);if(result.error)throw Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;}
 return state;
}
