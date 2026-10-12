import type { ColorTier, OutboundDifficulty, RunState } from '../domain/types.ts';

/** One catalogue owns every stable run identity, including all frozen legacy slots. */
export const RUN_SLOTS=['orders','color_exit','color_exit_entry','color_exit_middle','color_exit_late','outbound_easy','outbound_normal','outbound_hard','outbound_expert','inbound_endless','outbound8_easy','outbound8_normal','outbound8_hard','outbound8_expert'] as const;
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
export function slotForDifficulty(difficulty:OutboundDifficulty,version:6|8=6):RunSlot {
 if(!['easy','normal','hard','expert'].includes(difficulty))throw Error('出库难度无效');
 if(version!==6&&version!==8)throw Error('出库规则版本无效');
 return version===8?`outbound8_${difficulty}`:`outbound_${difficulty}`;
}
export function difficultyForSlot(slot:RunSlot):OutboundDifficulty|undefined {
 if(!isRunSlot(slot))throw Error('存档槽无效');
 return (['easy','normal','hard','expert'] as const).find(difficulty=>slot===`outbound_${difficulty}`||slot===`outbound8_${difficulty}`);
}
export function outboundRulesForSlot(slot:RunSlot):6|8|undefined {
 if(!isRunSlot(slot))throw Error('存档槽无效');
 return slot.startsWith('outbound8_')?8:slot.startsWith('outbound_')?6:undefined;
}
/** Never infer dimensions or difficulty from a mismatched identity, or cross legacy namespaces. */
export function slotForRun(state:Pick<RunState,'rulesetVersion'|'runConfigId'|'mode'|'colorTier'|'boardSize'|'difficultyId'>):RunSlot {
 const owns=(key:string)=>Object.prototype.hasOwnProperty.call(state,key);
 if(state.rulesetVersion===6||state.rulesetVersion===8){
  if(state.mode!=='color_exit'||state.boardSize!==9||state.difficultyId===undefined||state.runConfigId!==`run.outbound9_v${state.rulesetVersion}.${state.difficultyId}`||owns('colorTier'))throw Error('出库规则身份无效');
  return slotForDifficulty(state.difficultyId,state.rulesetVersion);
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
