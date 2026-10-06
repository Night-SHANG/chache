import type {OutboundDifficulty} from '../types.ts';
import {isOutboundDifficulty, RULES_V6_CONFIG} from '../v6/content.ts';

export {MIXED_COLOR_PERCENT_V6 as MIXED_COLOR_PERCENT_V10, isValidOutboundPieceV6 as isValidOutboundPieceV10} from '../v6/content.ts';

/** Infinite batches use the same frozen final-stage supply, with an independent identity. */
export const RULES_V10_CONFIG={
  balanced:false,rulesetVersion:10,runConfigId:'run.outbound9_v10',
  boardSize:9,candidateCount:3,minBatch:4,batchesPerStage:6,stageCount:5,pointsPerCell:10,
  historySegmentSize:128,generation:{...RULES_V6_CONFIG.generation},
} as const;

export function outboundRunConfigIdV10(difficulty:OutboundDifficulty):string {
  if(!isOutboundDifficulty(difficulty))throw Error('出库规则版本必须指定有效难度');
  return `${RULES_V10_CONFIG.runConfigId}.${difficulty}`;
}
