import type { ColorTier, OutboundDifficulty, RunState } from '../domain/types.ts';
import { difficultyForSlot, tierForSlot, type RunSlot } from '../application/run-slots.ts';
import { MIXED_COLOR_PERCENT } from '../domain/v5/content.ts';
import { OUTBOUND_DIFFICULTIES, MIXED_COLOR_PERCENT_V6 } from '../domain/v6/content.ts';
import { CARGO_STYLES, FORKLIFTS, THEMES } from '../application/profile.ts';
import type { CosmeticMetadata } from '../application/profile.ts';
import type { ViewState } from './view-types.ts';
import { L, type Rect } from './layout.ts';
import type { UiAction } from './ui-types.ts';

export interface UiControl { rect: Rect; action: UiAction; label: string; disabled?: boolean; selected?: boolean }
const wide = (y: number, h = 114): Rect => ({ x: 210, y, w: 660, h });
const settingsRow = (y: number): Rect => ({ x: 132, y, w: 816, h: 106 });
export const COLOR_TIER_NAMES: Readonly<Record<ColorTier,string>> = { entry: '入门', middle: '中段', late: '后段' };
export const colorTierLabel = (tier: ColorTier): string => `${COLOR_TIER_NAMES[tier]} · 双色${MIXED_COLOR_PERCENT[tier]}%`;
export const OUTBOUND_DIFFICULTY_NAMES: Readonly<Record<OutboundDifficulty,string>> = { easy:'简单', normal:'中等', hard:'困难', expert:'专业' };
export const outboundDifficultyLabel = (difficulty:OutboundDifficulty):string => `${OUTBOUND_DIFFICULTY_NAMES[difficulty]} · 双色${MIXED_COLOR_PERCENT_V6[difficulty]}%`;
export const runSlotLabel = (slot:RunSlot):string => {
  const difficulty=difficultyForSlot(slot),tier=tierForSlot(slot);
  return difficulty?`出库 9×9 · ${outboundDifficultyLabel(difficulty)}`:tier?`旧版 7×7 · ${colorTierLabel(tier)}`:slot==='color_exit'?'旧版 7×7 · 纯色 v4':slot==='inbound_endless'?'无限入库 7×7':'入库模式 7×7';
};
export const LEGACY_SLOTS: readonly RunSlot[] = ['color_exit','color_exit_entry','color_exit_middle','color_exit_late'];
export const hasLegacyRun = (view:ViewState,slot:RunSlot):boolean => ['saved','result','corrupt'].includes(view.modeSlots?.[slot]??'empty');
const modeLabel = (view:ViewState,slot:RunSlot):string => view.modeSlots?.[slot]==='saved'?'继续旧局':view.modeSlots?.[slot]==='result'?'查看结算':'存档待处理';
const restartAction = (state:RunState):UiAction => state.mode==='color_exit'
  ? state.difficultyId?{type:'newRun',mode:'color_exit',difficultyId:state.difficultyId}:{type:'chooseColorTier'}
  : {type:'newRun',mode:state.mode==='daily'?'daily':state.mode==='endless'?'endless':'standard'};
const control = (rect: Rect, label: string, action: UiAction): UiControl => ({ rect, label, action });

/** Only the top actionable layer is returned. Geometry never changes either state object. */
export function getUiControls(state: RunState, view: ViewState): UiControl[] {
  if (view.confirmation) {
    const kind=view.confirmation.kind;
    const label = kind==='resetProfile'?'确认重置':kind==='finishOvertime'||kind==='finishEndless'?'结束并结算':kind==='switchMode'?'保留并切换':kind==='leaveRun'?'结束本局':'开始新局';
    const cancel=kind==='resetProfile'||kind==='switchMode'?'取消':'继续游戏';
    return [control({ x:186,y:1160,w:330,h:118 },cancel,{type:'cancel'}),control({ x:564,y:1160,w:330,h:118 },label,{type:'confirm'})];
  }
  // The interrupted-save recovery flow owns L.resume/L.restart, above every menu.
  if (view.needsResume) return [];
  if (view.screen === 'colorIntro') return [control(wide(1240),'开始游戏',{type:'introStart'}),control(wide(1390),'返回主页',{type:'home'})];
  if (view.screen === 'menu') return [
    control(wide(752,176),'入库模式\n按订单配货',{type:'chooseInbound'}),
    control(wide(990,176),'出库模式\n同色连出口',{type:'chooseColorTier'}),
    control(wide(1270),'设置与外观',{type:'settings'}),
  ];
  if (view.screen === 'inboundMenu') return [
    control(wide(695,114),'开始普通五班',{type:'newRun',mode:'standard'}),
    control(wide(985,114),'开始直接无限',{type:'newRun',mode:'endless'}),
    control(wide(1275,114),'开始本地每日',{type:'newRun',mode:'daily'}),
    control(wide(1565),'返回主页',{type:'home'}),
  ];
  if (view.screen === 'colorTiers') {
    const controls:UiControl[]=[control({x:675,y:305,w:255,h:100},'换对比种子',{type:'comparisonSeedNext'})];
    OUTBOUND_DIFFICULTIES.forEach((difficulty,index)=>controls.push(control({x:170,y:568+index*244,w:740,h:114},`开始${OUTBOUND_DIFFICULTY_NAMES[difficulty]}`,{type:'newRun',mode:'color_exit',difficultyId:difficulty})));
    if(LEGACY_SLOTS.some(slot=>hasLegacyRun(view,slot)))controls.push(control(wide(1475),'旧版 7×7 存档',{type:'chooseLegacy'}));
    controls.push(control(wide(1620),'返回主页',{type:'home'}));
    return controls;
  }
  if(view.screen==='legacyRuns')return [
    ...LEGACY_SLOTS.filter(slot=>hasLegacyRun(view,slot)).map((slot,index)=>control({x:132,y:560+index*220,w:816,h:154},`${runSlotLabel(slot)}\n${modeLabel(view,slot)}`,{type:'switchMode',variant:slot})),
    control(wide(1540),'返回出库选择',{type:'chooseColorTier'}),
  ];
  if (view.screen === 'settings') {
    const options = (catalogue: readonly CosmeticMetadata[], kind: 'theme' | 'forklift' | 'cargo', y: number): UiControl[] => {
      const gap = 18, w = (816 - gap * (catalogue.length - 1)) / catalogue.length;
      return catalogue.map((item, index) => {
        const disabled = !!item.achievementId && !view.profile?.achievements.includes(item.achievementId);
        const unlock = item.achievementId === 'first_shipment' ? '首次出货解锁' : '五班全勤解锁';
        return { rect: { x: 132 + index * (w + gap), y, w, h: 112 }, action: { type: 'cosmetic', kind, id: item.id }, label: disabled ? `${item.name}\n${unlock}` : item.name, disabled, selected: view.profile?.cosmetics[kind] === item.id };
      });
    };
    return [
      { ...control(settingsRow(355), `声音：${view.profile?.settings.sound !== false ? '开' : '关'}`, { type: 'toggleSound' }), selected: view.profile?.settings.sound !== false },
      { ...control(settingsRow(493), `简化动效：${view.profile?.settings.reducedMotion ? '开' : '关'}`, { type: 'toggleMotion' }), selected: !!view.profile?.settings.reducedMotion },
      ...options(THEMES, 'theme', 725), ...options(FORKLIFTS, 'forklift', 978), ...options(CARGO_STYLES, 'cargo', 1226),
      ...(view.profileNeedsRecovery ? [control(settingsRow(1504), '恢复本地长期记录', { type: 'recoverProfile' })] : []),
      control(settingsRow(1636), '重置长期记录', { type: 'resetProfile' }),
      control(settingsRow(1768), '返回', { type: 'back' }),
    ];
  }
  if (view.paused) return [
    control({...L.resume,h:104},'继续游戏',{type:'continue'}),
    control({...L.restart,y:1220,h:104},'重新开始',restartAction(state)),
    control({...L.restart,y:1350,h:104},'返回主页',{type:'home'}),
    control({...L.restart,y:1480,h:104},'设置与外观',{type:'settings'}),
    ...(state.mode==='color_exit'?[control({...L.restart,y:1610,h:104},'出库玩法图解',{type:'colorHelp'})]:[]),
    ...(state.mode==='endless'&&state.phase==='input'?[control({...L.restart,y:1610,h:104},'结束并结算',{type:'finishEndless'})]:[]),
    ...(state.overtime?[control({...L.restart,y:1610,h:104},'结束加班并结算',{type:'finishOvertime'})]:[]),
  ];
  if (state.phase === 'result' && view.noticeFx?.kind === 'fail') return [];
  if (state.phase === 'result' && !view.animation) {
    const overtime = state.rulesetVersion === 3 && state.mode === 'standard' && state.result === 'won' && state.shift === 5 && !state.overtime;
    return [
      ...(overtime ? [control({ ...L.resume }, '继续加班 · 挑战更高分', { type: 'continueOvertime' })] : []),
      control({ ...L.restart }, state.mode === 'tutorial' ? '开始正式值班' : state.mode === 'daily' ? '再试今日挑战' : state.mode==='color_exit'&&!state.difficultyId?'选择新出库难度':'再来一局', restartAction(state)),
      control({ ...L.restart, y: 1390 }, '返回主页', { type: 'home' }),
    ];
  }
  return [];
}
