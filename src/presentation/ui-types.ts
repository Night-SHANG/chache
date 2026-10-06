import type { ColorTier } from '../domain/types.ts';
import type { RunSlot } from '../application/run-slots.ts';

export type UiAction = {type:'newRun';mode:'standard'|'daily'|'color_exit';colorTier?:ColorTier}|{type:'switchMode';variant:RunSlot}|{type:'chooseColorTier'}|{type:'comparisonSeedNext'}|{type:'introStart'}|{type:'colorHelp'}|{type:'continue'}|{type:'settings'}|{type:'home'}|{type:'back'}|{type:'confirm'}|{type:'cancel'}|{type:'toggleSound'}|{type:'toggleMotion'}|{type:'cosmetic';kind:'theme'|'forklift'|'cargo';id:string}|{type:'resetProfile'}|{type:'recoverProfile'}|{type:'continueOvertime'}|{type:'finishOvertime'};
