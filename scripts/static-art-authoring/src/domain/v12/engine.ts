import type {OutboundDifficulty,Point} from '../types.ts';
import type {OutboundItemCommandV12,OutboundToolCommandV12,OutboundToolRunV12,ToolChargesV12} from './types.ts';
import {applyCore,applyToolCore,assertIdentityCore,createCore,findRescueCore,previewCore,settlePhaseCore} from './core.ts';
import {findGeometricMovesV12} from './board.ts';
export {pieceCellsV12,reservedEntryCellsV12} from './board.ts';
export function assertRulesIdentityV12(state:OutboundToolRunV12):void {assertIdentityCore(state,12);}
export function createRunV12(seed:number,difficulty:OutboundDifficulty,toolCharges?:ToolChargesV12):OutboundToolRunV12 {return createCore(12,seed,difficulty,toolCharges) as OutboundToolRunV12;}
export function applyCommandV12(state:OutboundToolRunV12,command:OutboundToolCommandV12) {assertRulesIdentityV12(state);return applyCore(state,command);}
export function applyToolV12(state:OutboundToolRunV12,command:OutboundItemCommandV12) {assertRulesIdentityV12(state);return applyToolCore(state,command);}
export function previewPlacementV12(state:OutboundToolRunV12,pieceId:string,origin:Point) {assertRulesIdentityV12(state);return previewCore(state,pieceId,origin);}
export function findLegalMovesV12(state:OutboundToolRunV12) {assertRulesIdentityV12(state);return findGeometricMovesV12(state);}
export function findRescuePlanV12(state:OutboundToolRunV12) {assertRulesIdentityV12(state);return findRescueCore(state);}
export function settlePhaseV12(state:OutboundToolRunV12):OutboundToolRunV12 {assertRulesIdentityV12(state);return settlePhaseCore(state);}
