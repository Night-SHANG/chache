import type { ColorTier, RunState } from '../domain/types.ts';

/** One catalogue owns every stable run identity, including the frozen pure-color slot. */
export const RUN_SLOTS=['orders','color_exit','color_exit_entry','color_exit_middle','color_exit_late'] as const;
export type RunSlot=typeof RUN_SLOTS[number];
export function isRunSlot(value:unknown):value is RunSlot {return RUN_SLOTS.some(slot=>slot===value);}
export function slotForTier(tier:ColorTier):RunSlot {
 if(tier!=='entry'&&tier!=='middle'&&tier!=='late')throw Error('颜色比较档无效');
 return `color_exit_${tier}`;
}
export function tierForSlot(slot:RunSlot):ColorTier|undefined {
 if(!isRunSlot(slot))throw Error('存档槽无效');
 return slot==='color_exit_entry'?'entry':slot==='color_exit_middle'?'middle':slot==='color_exit_late'?'late':undefined;
}
/** Never infer a tier from a config mismatch or turn an unrecognized color run into orders. */
export function slotForRun(state:Pick<RunState,'rulesetVersion'|'runConfigId'|'mode'|'colorTier'>):RunSlot {
 if(state.rulesetVersion===5){
  if(state.mode!=='color_exit'||state.colorTier===undefined||state.runConfigId!==`run.color_exit_mix_v5.${state.colorTier}`)throw Error('颜色比较规则身份无效');
  return slotForTier(state.colorTier);
 }
 if(state.colorTier!==undefined)throw Error('旧规则不允许颜色比较档');
 if(state.rulesetVersion===4||state.mode==='color_exit'){
  if(state.rulesetVersion!==4||state.mode!=='color_exit'||state.runConfigId!=='run.color_exit_p0_v4')throw Error('纯色出口规则身份无效');
  return 'color_exit';
 }
 if(![1,2,3].includes(state.rulesetVersion)||!['standard','daily','tutorial'].includes(state.mode))throw Error('订单规则身份无效');
 return 'orders';
}
