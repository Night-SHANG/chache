import type {Command,CommandResult,RunState,OutboundDifficulty} from '../types.ts';
import {applyCommandV6,createRunV6} from '../v6/engine.ts';
import {isOutboundDifficulty,OUTBOUND_ENTRY} from '../v6/content.ts';
import {toIndexV6} from '../v6/board.ts';
import {RULES_V8_CONFIG,outboundRunConfigIdV8} from './content.ts';

/** Geometric moves can remain after an entry-blocked loss; preview/reducer phase guards reject input. */
export {findLegalMovesV6 as findLegalMovesV8,previewPlacementV6 as previewPlacementV8} from '../v6/engine.ts';

export function createRunV8(seed:number,difficulty:OutboundDifficulty):RunState {
 return {...createRunV6(seed,difficulty),rulesetVersion:RULES_V8_CONFIG.rulesetVersion,runConfigId:outboundRunConfigIdV8(difficulty)};
}

/** All outbound clear routes need this empty entry. Placement only adds cargo, so once occupied
 * no later shipment can remove it. This is a board fact for v8, not a solver or an order-status test.
 * Apply it only after a successful command has completely settled and victory has had priority. */
export function isIrrecoverableOutboundEntryBlocked(state:RunState):boolean {
 return state.rulesetVersion===RULES_V8_CONFIG.rulesetVersion&&state.mode==='color_exit'
  &&state.boardSize===RULES_V8_CONFIG.boardSize&&state.board.length===81&&isOutboundDifficulty(state.difficultyId)
  &&state.runConfigId===outboundRunConfigIdV8(state.difficultyId)&&state.board[toIndexV6(OUTBOUND_ENTRY.entry)]!==null;
}

/** Frozen v6 owns placement, complete chains, win priority and its exact replacement draw convention. */
export function applyCommandV8(state:RunState,command:Command):CommandResult {
 const result=applyCommandV6(state,command);
 if(result.error||result.state.result==='won'||!isIrrecoverableOutboundEntryBlocked(result.state))return result;
 result.state.phase='result';result.state.result='failed';result.state.endReason='blocked';
 if(!result.events.some(event=>event.type==='result'&&event.result==='failed'))result.events.push({type:'result',result:'failed'});
 return result;
}
