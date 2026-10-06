import { RULES_V2_CONFIG } from '../v2/content.ts';

/** Direct endless keeps the frozen standard tuning and caps upgrade offers before order 30. */
export const RULES_V7_CONFIG = {
  ...RULES_V2_CONFIG,
  rulesetVersion: 7,
  runConfigId: 'run.endless_v7',
  upgradeBeforeOrders: 30,
} as const;
