import type { RunState } from '../domain/types.ts';
import { CARGO_STYLES, FORKLIFTS, THEMES } from '../application/profile.ts';
import type { CosmeticMetadata } from '../application/profile.ts';
import type { ViewState } from './view-types.ts';
import { L, type Rect } from './layout.ts';
import type { UiAction } from './ui-types.ts';

export interface UiControl { rect: Rect; action: UiAction; label: string; disabled?: boolean; selected?: boolean }
const wide = (y: number, h = 114): Rect => ({ x: 210, y, w: 660, h });
const settingsRow = (y: number): Rect => ({ x: 132, y, w: 816, h: 106 });
const control = (rect: Rect, label: string, action: UiAction): UiControl => ({ rect, label, action });

/** Only the top actionable layer is returned. Geometry never changes either state object. */
export function getUiControls(state: RunState, view: ViewState): UiControl[] {
  if (view.confirmation) {
    const label = view.confirmation.kind === 'resetProfile' ? '确认重置' : view.confirmation.kind === 'finishOvertime' ? '结束并结算' : view.confirmation.kind === 'switchMode' ? '保留并切换' : '开始新局';
    return [control({ x: 186, y: 1160, w: 330, h: 118 }, '取消', { type: 'cancel' }), control({ x: 564, y: 1160, w: 330, h: 118 }, label, { type: 'confirm' })];
  }
  // The old-save recovery flow owns L.resume/L.restart, including its failure handling.
  if (view.needsResume) return [];
  if (view.screen === 'colorIntro') return [control(wide(1240),'开始试玩',{type:'introStart'}),control(wide(1390),'返回模式选择',{type:'home'})];
  if (view.screen === 'menu') {
    const modeLabel=(variant:'orders'|'color_exit')=>{const status=view.modeSlots?.[variant];return status==='saved'?'继续进度':status==='result'?'查看结算':status==='corrupt'?'存档待处理':'开始';};
    return [
      control(wide(792,104),`订单模式 · ${modeLabel('orders')}`,{type:'switchMode',variant:'orders'}),
      control(wide(916,104),`颜色出口 · ${modeLabel('color_exit')}`,{type:'switchMode',variant:'color_exit'}),
      control(wide(1040,104),state.mode==='color_exit'?'颜色出口 · 新开一局':'订单模式 · 新开标准局',{type:'newRun',mode:state.mode==='color_exit'?'color_exit':'standard'}),
      control(wide(1164,104),'订单模式 · 本地每日挑战',{type:'newRun',mode:'daily'}),
      control(wide(1288,104),'设置与外观',{type:'settings'}),
    ];
  }
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
    control({ ...L.resume }, '继续工作', { type: 'continue' }),
    control({ ...L.restart }, '切换模式 · 保留进度', { type: 'home' }),
    control({ ...L.restart, y: 1390 }, '设置与外观', { type: 'settings' }),
    ...(state.mode==='color_exit'?[control({...L.restart,y:1540},'颜色出口玩法图解',{type:'colorHelp'})]:[]),
    ...(state.overtime ? [control({ ...L.restart, y: 1540 }, '结束加班并结算', { type: 'finishOvertime' })] : []),
  ];
  if (state.phase === 'result' && view.noticeFx?.kind === 'fail') return [];
  if (state.phase === 'result' && !view.animation) {
    const overtime = state.rulesetVersion === 3 && state.mode === 'standard' && state.result === 'won' && state.shift === 5 && !state.overtime;
    return [
      ...(overtime ? [control({ ...L.resume }, '继续加班 · 挑战更高分', { type: 'continueOvertime' })] : []),
      control({ ...L.restart }, state.mode === 'tutorial' ? '开始正式值班' : state.mode === 'daily' ? '再试今日挑战' : '再来一局', { type: 'newRun', mode: state.mode === 'color_exit' ? 'color_exit' : state.mode === 'daily' ? 'daily' : 'standard' }),
      control({ ...L.restart, y: 1390 }, '返回主页', { type: 'home' }),
    ];
  }
  return [];
}
