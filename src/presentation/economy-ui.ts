import {isInboundRun,isToolRun} from '../domain/playable.ts';
import type {GameRun,ToolRun} from '../domain/playable.ts';
import type {ViewState} from './view-types.ts';
import type {UiControl} from './ui.ts';
import type {ItemId} from '../application/account-types.ts';
import {ITEM_PRICES} from '../application/economy.ts';
export {ITEM_PRICES} from '../application/economy.ts';
export const ITEM_NAMES:Record<ItemId,string>={rotate:'旋转',clear:'清障',wildcard:'万能'};
export const ITEM_EFFECTS:Record<ItemId,string>={rotate:'旋转选中的货件',clear:'清除1至2个占用格',wildcard:'将一件待放货\n换成万能箱'};
export const TOOL_ITEMS:readonly ItemId[]=['rotate','clear','wildcard'];
export const TOOLBOX_RECT={x:355,y:105,w:144,h:144};
export const CLEANUP_RECTS=[{x:108,y:650,w:414,h:592},{x:558,y:650,w:414,h:592}] as const;
export const economyCardRect=(index:number)=>({x:132,y:510+index*300,w:816,h:280});
export function toolboxVisible(state:GameRun,view:ViewState):boolean {return isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume&&!view.confirmation&&!view.accountBlocked&&!view.toolSelection&&!view.supplyUpgrade&&(!view.screen||view.screen==='game')&&(!!view.toolboxOpen||state.phase==='rescue');}
export const toolStatus=(state:ToolRun,item:ItemId):string=>state.toolCharges[item]?'可用 1':state.usedToolIds.includes(item)?'已用完':'未携带';
export function getEconomyControls(state:GameRun,view:ViewState):UiControl[] {
 if(view.screen==='shop')return [...TOOL_ITEMS.map((item,index)=>{const price=ITEM_PRICES[item],short=Math.max(0,price-(view.account?.wallet??0));return {rect:{x:688,y:610+index*300,w:228,h:132},label:`${price}金币${short?` · 还差${short}`:' · 购买'}`,action:{type:'purchase' as const,item},disabled:short>0};}),{rect:{x:210,y:1518,w:660,h:132},label:'返回',action:{type:'back'}}];
 if(view.screen==='prepareTools'){const chosen=view.prepareIntent?.items??[],allowed=!(view.prepareIntent&&'mode' in view.prepareIntent.spec&&view.prepareIntent.spec.mode==='daily')&&view.prepareIntent?.guide!=='guided';return [...TOOL_ITEMS.map((item,index)=>({rect:{x:688,y:610+index*300,w:228,h:132},label:chosen.includes(item)?'已选择':!allowed?'本局不可携带':(view.account?.inventory[item]??0)<1?'暂无库存':chosen.length>=2?'已选满2种':'携带',action:{type:'toggleItem' as const,item},selected:chosen.includes(item),disabled:!chosen.includes(item)&&(!allowed||(view.account?.inventory[item]??0)<1||chosen.length>=2)})),{rect:{x:132,y:1518,w:348,h:132},label:'取消',action:{type:'back'}},{rect:{x:516,y:1518,w:432,h:132},label:`携带${chosen.length}件 · 下一步`,action:{type:'prepareNext'}}];}
 if(view.screen==='prepareCleanup'||isInboundRun(state)&&state.phase==='cleanup')return [{rect:CLEANUP_RECTS[0],label:'按单清扫 · 每完成2单，清除1格废弃物',action:{type:'chooseCleanup',branch:'orders'}},{rect:CLEANUP_RECTS[1],label:'定期清扫 · 每放置6次，清除1格废弃物',action:{type:'chooseCleanup',branch:'placements'}},...(view.screen==='prepareCleanup'?[{rect:{x:210,y:1420,w:660,h:132},label:'取消准备',action:{type:'back' as const}}]:[])];
 if(isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume){const count=TOOL_ITEMS.reduce((sum,item)=>sum+state.toolCharges[item],0);return [{rect:TOOLBOX_RECT,label:`工具箱 · ${count}`,action:{type:'toggleToolbox'},selected:toolboxVisible(state,view)},...(toolboxVisible(state,view)?TOOL_ITEMS.map((item,index)=>({rect:{x:48+index*334,y:1530,w:316,h:state.phase==='rescue'?234:272},label:`${ITEM_NAMES[item]} · ${toolStatus(state,item)}`,action:{type:'tool' as const,item},disabled:state.toolCharges[item]!==1})):[])];}return [];
}

/** Only the visible economic identity can supply a result reward. Legacy boards have no ledger earnings. */
export function resultEarnedCoins(state:GameRun,view:ViewState):{earnedCoins:number;wallet:number}|null {
 const account=view.account,serial=state.runSerial;if(!account||serial===undefined||serial<=account.migration.legacySerialCeiling||![8,9,10,11,12,13,14].includes(state.rulesetVersion))return null;
 const matches=(identity:import('../application/account-types.ts').RunIdentity)=>identity.serial===serial&&identity.rulesetVersion===state.rulesetVersion&&identity.runConfigId===state.runConfigId;
 const active=account.run;if(active){if(view.accountRunId!==active.identity.runId||!matches(active.identity)||active.state.seed!==state.seed||active.state.commandIndex!==state.commandIndex||active.state.score!==state.score||active.state.completedOrders!==state.completedOrders)return null;return {earnedCoins:active.earnedCoins,wallet:account.wallet};}
 const closed=account.lastClosedResult;if(!closed||!matches(closed.identity)||closed.history.seed!==state.seed||closed.commandIndex!==state.commandIndex||closed.score!==state.score||closed.units!==state.completedOrders||closed.result!==state.result)return null;
 return {earnedCoins:closed.earnedCoins,wallet:account.wallet};
}
