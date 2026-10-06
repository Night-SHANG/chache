export {CARGO,SHAPES,DOCKS,P0_CONFIG} from './rulesets/v1/content.ts';
export {UPGRADES_V2 as UPGRADES,RULES_V2_CONFIG} from './v2/content.ts';
export {RULES_V3_CONFIG} from './v3/content.ts';
export const CURRENT_RULESET=3;

export {RULES_V4_CONFIG,COLOR_EXIT_ENTRY,COLOR_EXIT_DOCKS,COLOR_EXIT_TARGETS} from './v4/content.ts';
export const COLOR_EXIT_RULESET=4;

export {RULES_V5_CONFIG,COLOR_TIERS,MIXED_COLOR_PERCENT,MIXED_COLOR_SHAPE_ID,MIXED_COLOR_PATTERNS,isColorTier,mixedColorRunConfigId} from './v5/content.ts';
export const COLOR_EXIT_MIX_RULESET=5;

export {RULES_V6_CONFIG,OUTBOUND_DIFFICULTIES,MIXED_COLOR_PERCENT_V6,isOutboundDifficulty,outboundRunConfigId,OUTBOUND_ENTRY,OUTBOUND_DOCKS,OUTBOUND_TARGETS,MIXED_SHAPES_V6} from './v6/content.ts';
export {RULES_V7_CONFIG} from './v7/content.ts';
export const OUTBOUND_RULESET=6;
export const ENDLESS_RULESET=7;
