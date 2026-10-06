import type { ColorTier, OutboundDifficulty, RunState } from '../domain/types.ts';

/** One catalogue owns every stable run identity, including all frozen legacy slots. */
export const RUN_SLOTS=['orders','color_exit','color_exit_entry','color_exit_middle','color_exit_late','outbound_easy','outbound_normal','outbound_hard','outbound_expert','inbound_endless'] as const;
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
export function slotForDifficulty(difficulty:OutboundDifficulty):RunSlot {
 if(!['easy','normal','hard','expert'].includes(difficulty))throw Error('出库难度无效');
 return `outbound_${difficulty}`;
}
export function difficultyForSlot(slot:RunSlot):OutboundDifficulty|undefined {
 if(!isRunSlot(slot))throw Error('存档槽无效');
 return slot==='outbound_easy'?'easy':slot==='outbound_normal'?'normal':slot==='outbound_hard'?'hard':slot==='outbound_expert'?'expert':undefined;
}
/** Never infer dimensions or difficulty from a mismatched identity, or cross legacy namespaces. */
export function slotForRun(state:Pick<RunState,'rulesetVersion'|'runConfigId'|'mode'|'colorTier'|'boardSize'|'difficultyId'>):RunSlot {
 const owns=(key:string)=>Object.prototype.hasOwnProperty.call(state,key);
 if(state.rulesetVersion===6){
  if(state.mode!=='color_exit'||state.boardSize!==9||state.difficultyId===undefined||state.runConfigId!==`run.outbound9_v6.${state.difficultyId}`||owns('colorTier'))throw Error('出库规则身份无效');
  return slotForDifficulty(state.difficultyId);
 }
 if(owns('boardSize')||owns('difficultyId'))throw Error('旧规则不允许出库尺寸或难度');
 if(state.rulesetVersion===7||state.mode==='endless'){
  if(state.rulesetVersion!==7||state.mode!=='endless'||state.runConfigId!=='run.endless_v7'||owns('colorTier'))throw Error('无限入库规则身份无效');
  return 'inbound_endless';
 }
 if(state.rulesetVersion===5){
  if(state.mode!=='color_exit'||state.colorTier===undefined||state.runConfigId!==`run.color_exit_mix_v5.${state.colorTier}`)throw Error('颜色比较规则身份无效');
  return slotForTier(state.colorTier);
 }
 if(owns('colorTier'))throw Error('旧规则不允许颜色比较档');
 if(state.rulesetVersion===4||state.mode==='color_exit'){
  if(state.rulesetVersion!==4||state.mode!=='color_exit'||state.runConfigId!=='run.color_exit_p0_v4')throw Error('纯色出口规则身份无效');
  return 'color_exit';
 }
 if(![1,2,3].includes(state.rulesetVersion)||!['standard','daily','tutorial'].includes(state.mode))throw Error('订单规则身份无效');
 return 'orders';
}
