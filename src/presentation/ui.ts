import {toolPurchaseQuote} from '../application/tool-purchase.ts';
import type { ColorTier, OutboundDifficulty } from '../domain/types.ts';
import {PLAYTEST_FREE_SHOP} from '../shared/build-policy.ts';
import { difficultyForSlot, tierForSlot, type RunSlot } from '../application/run-slots.ts';
import { OUTBOUND_DIFFICULTIES,OUTBOUND_CARGO } from '../domain/v6/content.ts';
import type { GameRun } from '../domain/playable.ts';
import {isInboundV9,isInboundV16,isInboundV18,isTieredInbound,isInboundRun,isToolRun,isOutboundToolsRun} from '../domain/playable.ts';
import {isInboundDifficultyV18} from '../domain/v18/content.ts';
import {getEconomyControls} from './economy-ui.ts';
import {helpTopic,staticPresentationView} from './static-help.ts';
import {generationDistributionV9} from '../domain/v9/generation.ts';
import {chooseUpgradeV9} from '../domain/v9/upgrades.ts';
import {RULES_V9_CONFIG,UPGRADES_V9} from '../domain/v9/content.ts';
import {CARGO} from '../domain/content.ts';
import type { ViewState } from './view-types.ts';
import { L, verticalStackRects, type Rect } from './layout.ts';
import type { UiAction } from './ui-types.ts';
import {modeMenuStartRect} from './mode-menu-layout.ts';
import {homeLayout} from './home-layout.ts';

export interface UiControl { rect: Rect; action: UiAction; label: string; disabled?: boolean; selected?: boolean; buttonRole?: 'primary'|'secondary' }
const wide = (y: number, h = 114): Rect => ({ x: 210, y, w: 660, h });
export const COLOR_TIER_NAMES: Readonly<Record<ColorTier,string>> = { entry: '入门', middle: '中段', late: '后段' };
export const colorTierLabel = (tier: ColorTier): string => COLOR_TIER_NAMES[tier];
export const OUTBOUND_DIFFICULTY_NAMES: Readonly<Record<OutboundDifficulty,string>> = { easy:'简单', normal:'中等', hard:'困难', expert:'专业' };
export const outboundDifficultyLabel = (difficulty:OutboundDifficulty):string => OUTBOUND_DIFFICULTY_NAMES[difficulty];
export const isInfiniteInbound = (state:GameRun):boolean => state.mode==='endless'||isInboundV18(state)&&state.overtime;
export const inboundModeLabel = (state:GameRun):string => state.mode==='rush'?'加急':state.mode==='daily'?'每日':isInfiniteInbound(state)?'无限':'五班';
export const runSlotLabel = (slot:RunSlot):string => {
  const difficulty=difficultyForSlot(slot),tier=tierForSlot(slot);
  return difficulty?`出库 · ${outboundDifficultyLabel(difficulty)}`:tier?`出库 · ${colorTierLabel(tier)}`:slot==='color_exit'?'出库模式':slot==='inbound_endless'?'无限入库':'入库模式';
};
export const LEGACY_SLOTS: readonly RunSlot[] = ['color_exit','color_exit_entry','color_exit_middle','color_exit_late'];
export const hasLegacyRun = (view:ViewState,slot:RunSlot):boolean => ['saved','result','corrupt'].includes(view.modeSlots?.[slot]??'empty');
const modeLabel = (view:ViewState,slot:RunSlot):string => view.modeSlots?.[slot]==='saved'?'继续旧局':view.modeSlots?.[slot]==='result'?'查看结算':'存档待处理';
const restartAction = (state:GameRun):UiAction => state.mode==='color_exit'
  ? 'difficultyId' in state&&state.difficultyId&&[8,10,12,13].includes(state.rulesetVersion)?{type:'newRun',mode:'color_exit',difficultyId:state.difficultyId,outboundMode:[10,13].includes(state.rulesetVersion)?'endless':'normal'}:{type:'chooseColorTier'}
  : {type:'newRun',mode:state.mode==='daily'||state.mode==='rush'?'rush':state.mode==='endless'?'endless':'standard',...(isTieredInbound(state)?{inboundDifficulty:isInboundDifficultyV18(state.inboundDifficulty)?state.inboundDifficulty:'hard'}:{})};
const control = (rect: Rect, label: string, action: UiAction, buttonRole?: UiControl['buttonRole']): UiControl => ({ rect, label, action, ...(buttonRole?{buttonRole}:{}) });
/** Purchases and preserved-save switches advance; ending or replacing progress keeps the safe choice emphasized. */
const CONFIRMATION_PRIMARY_ACTION:Record<NonNullable<ViewState['confirmation']>['kind'],'cancel'|'confirm'>={
  purchase:'confirm',purchaseCosmetic:'confirm',purchaseCosmeticSet:'confirm',switchMode:'confirm',
  newRun:'cancel',resetProfile:'cancel',leaveRun:'cancel',finishOvertime:'cancel',finishEndless:'cancel',startPractice:'cancel',
};

/** Only the top actionable layer is returned. Geometry never changes either state object. */
export function getUiControls(state: GameRun, view: ViewState): UiControl[] {
  view=staticPresentationView(view);
  if(view.accountBlocked)return [control(wide(1250,view.screen==='shop'?150:114),'重试',{type:'retrySave'})];
  if (view.confirmation) {
    const kind=view.confirmation.kind;
    const label = kind==='startPractice'?'结束并练习':kind==='purchase'||kind==='purchaseCosmetic'||kind==='purchaseCosmeticSet'?PLAYTEST_FREE_SHOP?'确认领取':'确认购买':kind==='resetProfile'?'确认重置':kind==='finishOvertime'||kind==='finishEndless'?'结束并结算':kind==='switchMode'?'保留并切换':kind==='leaveRun'?'结束本局':'开始新局';
    const cancel=kind==='startPractice'?'取消':kind==='resetProfile'||kind==='switchMode'||kind==='purchase'||kind==='purchaseCosmetic'||kind==='purchaseCosmeticSet'?'取消':'继续游戏';
    const height=view.screen==='shop'?150:kind==='startPractice'?144:kind==='purchase'||kind==='purchaseCosmetic'||kind==='purchaseCosmeticSet'?132:118;
    const confirmPrimary=CONFIRMATION_PRIMARY_ACTION[kind]==='confirm';
    const buttons=[control({ x:186,y:1160,w:330,h:height },cancel,{type:'cancel'},confirmPrimary?'secondary':'primary'),control({ x:564,y:1160,w:330,h:height },label,{type:'confirm'},confirmPrimary?'primary':'secondary')];
    if(kind==='purchase'&&view.confirmation.item){
      const quantity=view.confirmation.quantity??1,quote=toolPurchaseQuote(view.account,view.confirmation.item,quantity);
      buttons[1].disabled=!quote.valid;
      return [...buttons,{...control({x:210,y:972,w:168,h:162},'−',{type:'purchaseQuantity',delta:-1},'secondary'),disabled:quantity<=1},{...control({x:702,y:972,w:168,h:162},'+',{type:'purchaseQuantity',delta:1},'secondary'),disabled:quantity>=quote.maxQuantity}];
    }
    return buttons;
  }
  // The interrupted-save recovery flow owns L.resume/L.restart, above every menu.
  if (view.needsResume) return [];
  if(view.toolSelection&&!view.paused&&(!view.screen||view.screen==='game')){const tool=view.toolSelection;return [control({x:48,y:1788,w:280,h:132},'取消',{type:'toolCancel'},'secondary'),{...control({x:752,y:1788,w:280,h:132},'确认使用',{type:'toolConfirm'},'primary'),disabled:!tool.command||!!tool.error},...(isOutboundToolsRun(state)&&tool.item==='wildcard'&&tool.pieceId?OUTBOUND_CARGO.map((cargo,index)=>({...control({x:338+index*138,y:1788,w:132,h:132},CARGO.find(c=>c.id===cargo)?.name??'',{type:'toolCargo',cargo},'secondary'),selected:tool.cargo===cargo})):[]),...(tool.item==='rotate'?[control({x:376,y:1788,w:328,h:132},'顺时针旋转',{type:'toolRotate'},'secondary')]:[])];}
  if(view.supplyUpgrade)return [...CARGO.slice(0,isInboundV9(state)?RULES_V9_CONFIG.cargoByShift[state.shift-1]:3).map((cargo,index)=>control({x:210,y:650+index*170,w:660,h:122},isInboundV9(state)?`${cargo.name} · ${Math.round((generationDistributionV9(state).nonWildcardCargos.find(c=>c.cargo===cargo.id)?.probability??0)*100)}% → ${Math.round((generationDistributionV9(chooseUpgradeV9(state,'cargo_supply',cargo.id).state).nonWildcardCargos.find(c=>c.cargo===cargo.id)?.probability??0)*100)}%`:cargo.name,{type:'supplyCargo',cargo:cargo.id})),control(wide(1570),'取消',{type:'supplyCancel'})];
  if(['shop','prepareTools','prepareCleanup'].includes(view.screen??''))return getEconomyControls(state,view);
  if (view.screen === 'helpMenu') return [control(wide(646,144),'入库玩法',{type:'selectHelp',topic:'inbound'}),control(wide(856,144),'出库玩法',{type:'selectHelp',topic:'outbound'}),control(wide(1066,144),'道具说明',{type:'selectHelp',topic:'tools'}),control(wide(1390,144),'返回',{type:'helpBack'})];
  if (view.screen === 'colorIntro') {
    const inbound=helpTopic(state,view)==='inbound';
    return [...(inbound?[control(wide(1240,144),'特殊货物与加急',{type:'helpDetails'})]:[]),...(!view.helpFromHome?[control(wide(inbound?1420:1240,144),'道具说明',{type:'toolsHelp'})]:[]),control(wide(inbound&&!view.helpFromHome?1600:1420,144),view.helpFromHome?'返回':'返回游戏',{type:'helpBack'})];
  }
  if (view.screen === 'toolsHelp') return [control(wide(1600,144),'返回',{type:'helpBack'})];
  if (view.screen === 'helpDetails') return [control(wide(1600,144),'返回玩法说明',{type:'help'})];
  if (view.screen === 'menu') {
    const home=homeLayout(view.androidContentBounds);
    return [
      control(home.inbound,'入库模式\n按订单配货',{type:'chooseInbound'}),
      control(home.outbound,'出库模式\n同色连出口',{type:'chooseColorTier'}),
      control(home.help,'玩法说明',{type:'helpMenu'}),
      control(home.shop,'商店',{type:'shop'}),
      control(home.settings,'设置',{type:'settings'}),
    ];
  }
  if (view.screen === 'inboundMenu') {
    const selectedDifficulty=isInboundDifficultyV18(view.inboundDifficulty)?view.inboundDifficulty:'hard';
    return [
      ...(['hard','expert'] as const).map((inboundDifficulty,index)=>({...control({x:150+index*400,y:304,w:380,h:144},index?'专业':'困难',{type:'selectInboundDifficulty',inboundDifficulty}),selected:selectedDifficulty===inboundDifficulty})),
      control(modeMenuStartRect(598),'开始',{type:'newRun',mode:'standard',inboundDifficulty:selectedDifficulty}),
      control(modeMenuStartRect(918),'开始',{type:'newRun',mode:'endless',inboundDifficulty:selectedDifficulty}),
      control(modeMenuStartRect(1268),'开始',{type:'newRun',mode:'rush'}),
      control(wide(1565,144),'返回主页',{type:'home'}),
    ];
  }
  if (view.screen === 'colorTiers') {
    const outboundMode=view.outboundSelectionMode??'normal';
    const controls:UiControl[]=(['normal','endless'] as const).map((mode,index)=>({...control({x:150+index*400,y:304,w:380,h:144},mode==='normal'?'普通':'无限',{type:'selectOutboundMode',mode}),selected:mode===outboundMode}));
    OUTBOUND_DIFFICULTIES.forEach((difficultyId,index)=>controls.push(control(modeMenuStartRect(576+index*244,180),'开始',{type:'newRun',mode:'color_exit',difficultyId,outboundMode})));
    controls.push(control(wide(1584,132),'返回主页',{type:'home'}));
    return controls;
  }
  if(view.screen==='legacyRuns')return [
    ...LEGACY_SLOTS.filter(slot=>hasLegacyRun(view,slot)).map((slot,index)=>control({x:132,y:560+index*220,w:816,h:154},`${runSlotLabel(slot)}\n${modeLabel(view,slot)}`,{type:'switchMode',variant:slot})),
    control(wide(1540),'返回出库选择',{type:'chooseColorTier'}),
  ];
  if (view.screen === 'settings') {
    const count=view.profileNeedsRecovery?7:6,totalHeight=count*144+(count-1)*36;
    const rows=verticalStackRects(count,{x:132,y:L.height/2-totalHeight/2,w:816,h:144},36);
    const controls=[
      { ...control(rows[0], `音乐：${view.profile?.settings.music !== false ? '开' : '关'}`, { type: 'toggleMusic' }), selected: view.profile?.settings.music !== false },
      { ...control(rows[1], `音效：${view.profile?.settings.sound !== false ? '开' : '关'}`, { type: 'toggleSound' }), selected: view.profile?.settings.sound !== false },
      { ...control(rows[2], `震动：${view.profile?.settings.vibration !== false ? '开' : '关'}`, { type: 'toggleVibration' }), selected: view.profile?.settings.vibration !== false },
      { ...control(rows[3], `简化动效：${view.profile?.settings.reducedMotion ? '开' : '关'}`, { type: 'toggleMotion' }), selected: !!view.profile?.settings.reducedMotion },
      ...(view.profileNeedsRecovery ? [control(rows[4], '恢复游戏记录', { type: 'recoverProfile' })] : []),
      control(rows[rows.length-2], '重置成绩记录', { type: 'resetProfile' }),
      control(rows[rows.length-1], '返回', { type: 'back' }),
    ];
    return controls;
  }
  if (view.paused && state.phase!=='result') return [
    control({...L.resume,y:L.resume.y-200,h:104},'继续游戏',{type:'continue'}),
    control({...L.restart,y:1020,h:104},'重新开始',restartAction(state)),
    control({...L.restart,y:1150,h:104},'返回主页',{type:'home'}),
    control({...L.restart,y:1280,h:104},'设置',{type:'settings'}),
    control({...L.restart,y:1410,h:104},'玩法说明',{type:'help'}),
    ...((state.mode==='endless'||[10,13].includes(state.rulesetVersion))&&state.phase==='input'?[control({...L.restart,y:1540,h:104},'结束并结算',{type:'finishEndless'})]:[]),
    ...(state.overtime?[control({...L.restart,y:1540,h:104},'结束并结算',{type:'finishOvertime'})]:[]),
  ];
  if (state.phase === 'result' && view.noticeFx?.kind === 'fail') return [];
  if (state.phase === 'result' && !view.animation) {
    const overtime = (isInboundV18(state)||!isInboundV16(state)||state.inboundDifficulty==='normal') && [3,9,11,14,15,16,18].includes(state.rulesetVersion) && state.mode === 'standard' && state.result === 'won' && state.shift === 5 && !state.overtime;
    const controls=[
      ...(overtime ? [control({ ...L.resume }, '继续无限', { type: 'continueOvertime' })] : []),
      {...control({ ...L.restart }, state.mode === 'tutorial' ? '开始正式值班' : state.mode === 'daily'||state.mode === 'rush' ? '再来一局' : state.mode==='color_exit'&&![8,12].includes(state.rulesetVersion)?'选择难度':'再来一局', restartAction(state))},
      control({ ...L.restart, y: 1390 }, '返回主页', { type: 'home' }),
      ...(overtime?[control({...L.restart},'完成收工',{type:'declineOvertime'})]:[]),
    ];
    const rows=verticalStackRects(controls.length,{x:246,y:state.mode==='tutorial'?1160:1120,w:588,h:132},28);
    return controls.map((item,index)=>({...item,rect:rows[index]}));
  }
  if(isInboundV9(state)&&state.phase==='upgrade'&&!view.animation)return state.upgradeChoices.map((id,index)=>control(L.upgradeRects[index],UPGRADES_V9.find(u=>u.id===id)?.title??id,{type:'chooseUpgrade',upgradeId:id}));
  if(isInboundRun(state)&&state.phase==='cleanup'&&!view.animation)return getEconomyControls(state,view);
  if(isToolRun(state)&&state.phase==='rescue'&&!view.animation)return [...getEconomyControls(state,view),control({x:700,y:1788,w:332,h:132},state.rulesetVersion===12?'返回主页':'结束并结算',state.rulesetVersion===12?{type:'home'}:{type:'finishEndless'})];
  return getEconomyControls(state,view);
}
