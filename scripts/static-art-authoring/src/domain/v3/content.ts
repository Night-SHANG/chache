import { RULES_V2_CONFIG } from '../v2/content.ts';

/** Version 3 adds the authored tutorial and explicit Overtime commands; v2 tuning stays unchanged. */
export const RULES_V3_CONFIG = {
  ...RULES_V2_CONFIG,
  rulesetVersion: 3,
  runConfigId: 'run.standard_v3',
  tutorial: {
    origins: [{x:1,y:1},{x:3,y:1},{x:3,y:4}],
    lessonFoodCells: [42,43,44],
    lessonWallCells: [21,22,23,24,25,26,27],
    foodAmount: 3,
    machineAmount: 8,
  },
} as const;
