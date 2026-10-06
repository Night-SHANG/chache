import type {CargoId,ColorTier} from '../types.ts';
import {COLOR_EXIT_CARGO,RULES_V4_CONFIG} from '../v4/content.ts';
/** V5 changes only the mixed-piece ratio. Every physical/scoring value remains v4's. */
export const RULES_V5_CONFIG={...RULES_V4_CONFIG,rulesetVersion:5,runConfigId:'run.color_exit_mix_v5'} as const;
export const COLOR_TIERS:readonly ColorTier[]=['entry','middle','late'];
export const MIXED_COLOR_PERCENT:Readonly<Record<ColorTier,number>>={entry:20,middle:30,late:40};
export const MIXED_COLOR_SHAPE_ID='shape.square';
export function isColorTier(value:unknown):value is ColorTier {return COLOR_TIERS.some(tier=>tier===value);}
export function mixedColorRunConfigId(tier:ColorTier):string {
 if(!isColorTier(tier))throw Error('双色规则版本必须指定有效档位');
 return `${RULES_V5_CONFIG.runConfigId}.${tier}`;
}
/** Ordered color pair, then horizontal/vertical. Order matches the existing square's cells. */
export const MIXED_COLOR_PATTERNS:readonly (readonly CargoId[])[]=Object.freeze(COLOR_EXIT_CARGO.flatMap(first=>COLOR_EXIT_CARGO.filter(second=>second!==first).flatMap(second=>[
 Object.freeze([first,first,second,second]),Object.freeze([first,second,first,second]),
])));
