import type {OutboundDifficulty} from '../types.ts';
import type {ToolChargesV12} from '../v12/types.ts';
import type {OutboundToolCommandV13,OutboundToolRunV13} from './types.ts';
import {applyCommandV13,assertRulesIdentityV13,createRunV13} from './engine.ts';
import {checksumCore,compactCore} from '../v12/core.ts';
export function checksumV13(state:OutboundToolRunV13):string {assertRulesIdentityV13(state);return checksumCore(state);}
export function compactCommandTailV13(state:OutboundToolRunV13,throughIndex:number):OutboundToolRunV13 {assertRulesIdentityV13(state);return compactCore(state,throughIndex);}
export function replayV13(seed:number,difficulty:OutboundDifficulty,commands:Iterable<OutboundToolCommandV13>,toolCharges?:ToolChargesV12):OutboundToolRunV13 {
 let state=createRunV13(seed,difficulty,toolCharges);
 for(const command of commands){const result=applyCommandV13(state,command);if(result.error)throw Error(`Replay command ${state.commandIndex+1}: ${result.error}`);state=result.state;}
 return state;
}
