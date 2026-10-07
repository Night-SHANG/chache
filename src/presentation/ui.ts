import {guideProgress,guideTrackFor} from '../application/account-guides.ts';
import type { ColorTier, OutboundDifficulty } from '../domain/types.ts';
import { difficultyForSlot, tierForSlot, type RunSlot } from '../application/run-slots.ts';
import { OUTBOUND_DIFFICULTIES,OUTBOUND_CARGO } from '../domain/v6/content.ts';
import type { GameRun } from '../domain/playable.ts';
import {isGuideComplete} from '../application/tutorials.ts';
import {isInboundV9,isInboundV16,isInboundRun,isToolRun,isOutboundToolsRun} from '../domain/playable.ts';
import {getEconomyControls} from './economy-ui.ts';
import {generationDistributionV9} from '../domain/v9/generation.ts';
import {chooseUpgradeV9} from '../domain/v9/upgrades.ts';
import {RULES_V9_CONFIG,UPGRADES_V9} from '../domain/v9/content.ts';
import {CARGO} from '../domain/content.ts';
import type { ViewState } from './view-types.ts';
import { L, type Rect } from './layout.ts';
import type { UiAction } from './ui-types.ts';

export interface UiControl { rect: Rect; action: UiAction; label: string; disabled?: boolean; selected?: boolean }
const wide = (y: number, h = 114): Rect => ({ x: 210, y, w: 660, h });
const settingsRow = (y: number): Rect => ({ x: 132, y, w: 816, h: 144 });
export const COLOR_TIER_NAMES: Readonly<Record<ColorTier,string>> = { entry: '入门', middle: '中段', late: '后段' };
export const colorTierLabel = (tier: ColorTier): string => COLOR_TIER_NAMES[tier];
export const OUTBOUND_DIFFICULTY_NAMES: Readonly<Record<OutboundDifficulty,string>> = { easy:'简单', normal:'中等', hard:'困难', expert:'专业' };
export const outboundDifficultyLabel = (difficulty:OutboundDifficulty):string => OUTBOUND_DIFFICULTY_NAMES[difficulty];
export const runSlotLabel = (slot:RunSlot):string => {
  const difficulty=difficultyForSlot(slot),tier=tierForSlot(slot);
  return difficulty?`出库 · ${outboundDifficultyLabel(difficulty)}`:tier?`出库 · ${colorTierLabel(tier)}`:slot==='color_exit'?'出库模式':slot==='inbound_endless'?'无限入库':'入库模式';
};
export const LEGACY_SLOTS: readonly RunSlot[] = ['color_exit','color_exit_entry','color_exit_middle','color_exit_late'];
export const hasLegacyRun = (view:ViewState,slot:RunSlot):boolean => ['saved','result','corrupt'].includes(view.modeSlots?.[slot]??'empty');
const modeLabel = (view:ViewState,slot:RunSlot):string => view.modeSlots?.[slot]==='saved'?'继续旧局':view.modeSlots?.[slot]==='result'?'查看结算':'存档待处理';
const restartAction = (state:GameRun):UiAction => state.mode==='color_exit'
  ? 'difficultyId' in state&&state.difficultyId&&[8,10,12,13].includes(state.rulesetVersion)?{type:'newRun',mode:'color_exit',difficultyId:state.difficultyId,outboundMode:[10,13].includes(state.rulesetVersion)?'endless':'normal'}:{type:'chooseColorTier'}
  : {type:'newRun',mode:state.mode==='daily'?'daily':state.mode==='endless'?'endless':'standard'};
const control = (rect: Rect, label: string, action: UiAction): UiControl => ({ rect, label, action });

/** Only the top actionable layer is returned. Geometry never changes either state object. */
export function getUiControls(state: GameRun, view: ViewState): UiControl[] {
  if(view.accountBlocked)return [control(wide(1250),view.readOnlyReason?'重试':'保存结果尚未确认，请重试',{type:'retrySave'})];
  if (view.confirmation) {
    const kind=view.confirmation.kind;
    const label = kind==='purchase'||kind==='purchaseCosmetic'?'确认购买':kind==='resetProfile'?'确认重置':kind==='finishOvertime'||kind==='finishEndless'?'结束并结算':kind==='switchMode'?'保留并切换':kind==='leaveRun'?'结束本局':'开始新局';
    const cancel=kind==='resetProfile'||kind==='switchMode'||kind==='purchase'||kind==='purchaseCosmetic'?'取消':'继续游戏';
    const height=kind==='purchase'||kind==='purchaseCosmetic'?132:118;
    return [control({ x:186,y:1160,w:330,h:height },cancel,{type:'cancel'}),control({ x:564,y:1160,w:330,h:height },label,{type:'confirm'})];
  }
  // The interrupted-save recovery flow owns L.resume/L.restart, above every menu.
  if (view.needsResume) return [];
  if(view.toolSelection&&!view.paused&&(!view.screen||view.screen==='game')){const tool=view.toolSelection;return [control({x:48,y:1788,w:280,h:132},'取消',{type:'toolCancel'}),{...control({x:752,y:1788,w:280,h:132},'确认使用',{type:'toolConfirm'}),disabled:!tool.command||!!tool.error},...(isOutboundToolsRun(state)&&tool.item==='wildcard'&&tool.pieceId?OUTBOUND_CARGO.map((cargo,index)=>({...control({x:338+index*138,y:1788,w:132,h:132},CARGO.find(c=>c.id===cargo)?.name??'',{type:'toolCargo',cargo}),selected:tool.cargo===cargo})):[]),...(tool.item==='rotate'?[control({x:376,y:1788,w:328,h:132},'顺时针旋转',{type:'toolRotate'})]:[])];}
  if(view.supplyUpgrade)return [...CARGO.slice(0,isInboundV9(state)?RULES_V9_CONFIG.cargoByShift[state.shift-1]:3).map((cargo,index)=>control({x:210,y:650+index*170,w:660,h:122},isInboundV9(state)?`${cargo.name} · ${Math.round((generationDistributionV9(state).nonWildcardCargos.find(c=>c.cargo===cargo.id)?.probability??0)*100)}% → ${Math.round((generationDistributionV9(chooseUpgradeV9(state,'cargo_supply',cargo.id).state).nonWildcardCargos.find(c=>c.cargo===cargo.id)?.probability??0)*100)}%`:cargo.name,{type:'supplyCargo',cargo:cargo.id})),control(wide(1570),'取消',{type:'supplyCancel'})];
  if(view.screen==='guideOffer')return [control(wide(900),'开始引导',{type:'guidedStart',track:view.guideTrack??'inbound'}),control(wide(1080),'直接开始',{type:'directStart'}),control(wide(1400),'返回',{type:'back'})];
  if(['shop','prepareTools','prepareCleanup'].includes(view.screen??''))return getEconomyControls(state,view);
  if (view.screen === 'colorIntro') return [control(wide(1240),'返回游戏',{type:'helpBack'}),...(state.mode==='color_exit'?[]:[control(wide(1390),isInboundRun(state)&&!isInboundV9(state)?'特殊货物与工具':'特殊货物与升级',{type:'helpDetails'})])];
  if (view.screen === 'helpDetails') return [control(wide(1540),'返回玩法说明',{type:'help'})];
  if (view.screen === 'menu') return [
    control(wide(752,176),'入库模式\n按订单配货',{type:'chooseInbound'}),
    control(wide(990,176),'出库模式\n同色连出口',{type:'chooseColorTier'}),
    control({x:210,y:1265,w:318,h:114},'商店',{type:'shop'}),
    control({x:552,y:1265,w:318,h:114},'设置',{type:'settings'}),
  ];
  if (view.screen === 'inboundMenu') return [
    control(wide(695,114),'开始五班',{type:'newRun',mode:'standard'}),
    control(wide(985,114),'开始无限',{type:'newRun',mode:'endless'}),
    {...control(wide(1275,114),view.dailyLocked?'今日已完成':'开始挑战',{type:'newRun',mode:'daily'}),disabled:!!view.dailyLocked},
    control(wide(1565),'返回主页',{type:'home'}),
  ];
  if (view.screen === 'colorTiers') {
    const outboundMode=view.outboundSelectionMode??'normal';
    const controls:UiControl[]=(['normal','endless'] as const).map((mode,index)=>({...control({x:150+index*400,y:304,w:380,h:144},mode==='normal'?'普通':'无限',{type:'selectOutboundMode',mode}),selected:mode===outboundMode}));
    OUTBOUND_DIFFICULTIES.forEach((difficultyId,index)=>controls.push(control({x:730,y:576+index*244,w:180,h:144},'开始',{type:'newRun',mode:'color_exit',difficultyId,outboundMode})));
    controls.push(control(wide(1584,132),'返回主页',{type:'home'}));
    return controls;
  }
  if(view.screen==='legacyRuns')return [
    ...LEGACY_SLOTS.filter(slot=>hasLegacyRun(view,slot)).map((slot,index)=>control({x:132,y:560+index*220,w:816,h:154},`${runSlotLabel(slot)}\n${modeLabel(view,slot)}`,{type:'switchMode',variant:slot})),
    control(wide(1540),'返回出库选择',{type:'chooseColorTier'}),
  ];
  if (view.screen === 'settings') {
    return [
      { ...control(settingsRow(355), `声音：${view.profile?.settings.sound !== false ? '开' : '关'}`, { type: 'toggleSound' }), selected: view.profile?.settings.sound !== false },
      { ...control(settingsRow(535), `简化动效：${view.profile?.settings.reducedMotion ? '开' : '关'}`, { type: 'toggleMotion' }), selected: !!view.profile?.settings.reducedMotion },
      ...(view.profileNeedsRecovery ? [control(settingsRow(1356), '恢复游戏记录', { type: 'recoverProfile' })] : []),
      control(settingsRow(1518), '重置游戏记录', { type: 'resetProfile' }),
      control(settingsRow(1680), '返回', { type: 'back' }),
    ];
  }
  const newGuide=isInboundV16(state)&&view.account&&(state.mode==='daily'||state.guided)&&!guideProgress(view.account,guideTrackFor(state)).skipped&&!isGuideComplete(guideTrackFor(state),guideProgress(view.account,guideTrackFor(state)),16);
  if (view.paused && state.phase!=='result') return [
    ...(newGuide?[control({x:246,y:900,w:588,h:144},'跳过引导',{type:'skipTutorial'})]:[]),
    control({...L.resume,h:104},'继续游戏',{type:'continue'}),
    {...control({...L.restart,y:1220,h:104},state.mode==='daily'&&view.dailyLocked?'今日已完成':'重新开始',restartAction(state)),disabled:state.mode==='daily'&&!!view.dailyLocked},
    control({...L.restart,y:1350,h:104},'返回主页',{type:'home'}),
    control({...L.restart,y:1480,h:104},'设置',{type:'settings'}),
    control({...L.restart,y:1610,h:104},'玩法说明',{type:'help'}),
    ...((state.mode==='endless'||[10,13].includes(state.rulesetVersion))&&state.phase==='input'?[control({...L.restart,y:1740,h:104},'结束并结算',{type:'finishEndless'})]:[]),
    ...(state.overtime?[control({...L.restart,y:1740,h:104},'结束并结算',{type:'finishOvertime'})]:[]),
  ];
  if (state.phase === 'result' && view.noticeFx?.kind === 'fail') return [];
  if (state.phase === 'result' && !view.animation) {
    const overtime = [3,9,11,14,15,16].includes(state.rulesetVersion) && state.mode === 'standard' && state.result === 'won' && state.shift === 5 && !state.overtime;
    return [
      ...(overtime ? [control({ ...L.resume }, '继续加班', { type: 'continueOvertime' }),control({...L.restart,y:1510},'完成收工',{type:'declineOvertime'})] : []),
      {...control({ ...L.restart }, state.mode === 'tutorial' ? '开始正式值班' : state.mode === 'daily' ? view.dailyLocked?'今日已完成':state.result==='won'?'挑战今日':'再试一次' : state.mode==='color_exit'&&![8,12].includes(state.rulesetVersion)?'选择难度':'再来一局', restartAction(state)),disabled:state.mode==='daily'&&!!view.dailyLocked},
      control({ ...L.restart, y: 1390 }, '返回主页', { type: 'home' }),
      ...(isInboundRun(state)&&state.phase==='result'&&view.account&&isGuideComplete('inbound',view.account.guides.inbound,state.rulesetVersion)?[control({...L.restart,y:1650},'去试试出库',{type:'chooseColorTier'})]:[]),
    ];
  }
  const skipGuide=view.guide?isInboundV16(state)?state.phase==='cleanup'?[control({x:210,y:1420,w:660,h:144},'跳过引导',{type:'skipTutorial'})]:[]:[control({x:820,y:1836,w:212,h:60},'跳过引导',{type:'skipTutorial'})]:[];
  if(isInboundV9(state)&&state.phase==='upgrade'&&!view.animation)return [...state.upgradeChoices.map((id,index)=>control(L.upgradeRects[index],UPGRADES_V9.find(u=>u.id===id)?.title??id,{type:'chooseUpgrade',upgradeId:id})),...skipGuide];
  if(isInboundRun(state)&&state.phase==='cleanup'&&!view.animation)return [...getEconomyControls(state,view),...skipGuide];
  if(isToolRun(state)&&state.phase==='rescue'&&!view.animation)return [...getEconomyControls(state,view),control({x:700,y:1788,w:332,h:132},state.rulesetVersion===12?'返回主页':'结束并结算',state.rulesetVersion===12?{type:'home'}:{type:'finishEndless'})];
  if(view.guide&&!view.animation&&!view.paused)return [...getEconomyControls(state,view),...skipGuide];
  if(state.mode==='tutorial'&&state.phase==='input'&&!view.animation)return [control({x:view.developerMode===true?600:820,y:1836,w:212,h:60},'跳过教学',{type:'skipTutorial'})];
  return getEconomyControls(state,view);
}
