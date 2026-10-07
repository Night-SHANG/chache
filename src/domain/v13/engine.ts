import type {OutboundDifficulty,Point} from '../types.ts';
import type {OutboundItemCommandV12,ToolChargesV12} from '../v12/types.ts';
import type {OutboundToolCommandV13,OutboundToolRunV13} from './types.ts';
import {applyCore,applyToolCore,assertIdentityCore,createCore,findRescueCore,previewCore,settlePhaseCore} from '../v12/core.ts';
import {findGeometricMovesV12} from '../v12/board.ts';
export {pieceCellsV12 as pieceCellsV13,reservedEntryCellsV12 as reservedEntryCellsV13} from '../v12/board.ts';
export function assertRulesIdentityV13(state:OutboundToolRunV13):void {assertIdentityCore(state,13);}
export function createRunV13(seed:number,difficulty:OutboundDifficulty,toolCharges?:ToolChargesV12):OutboundToolRunV13 {return createCore(13,seed,difficulty,toolCharges) as OutboundToolRunV13;}
export function applyCommandV13(state:OutboundToolRunV13,command:OutboundToolCommandV13) {assertRulesIdentityV13(state);return applyCore(state,command);}
export function applyToolV13(state:OutboundToolRunV13,command:OutboundItemCommandV12) {assertRulesIdentityV13(state);return applyToolCore(state,command);}
export function previewPlacementV13(state:OutboundToolRunV13,pieceId:string,origin:Point) {assertRulesIdentityV13(state);return previewCore(state,pieceId,origin);}
export function findLegalMovesV13(state:OutboundToolRunV13) {assertRulesIdentityV13(state);return findGeometricMovesV12(state);}
export function findRescuePlanV13(state:OutboundToolRunV13) {assertRulesIdentityV13(state);return findRescueCore(state);}
export function settlePhaseV13(state:OutboundToolRunV13):OutboundToolRunV13 {assertRulesIdentityV13(state);return settlePhaseCore(state);}
