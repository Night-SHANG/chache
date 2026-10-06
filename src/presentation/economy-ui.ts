import {isInboundV9} from '../domain/playable.ts';import type {GameRun} from '../domain/playable.ts';import type {ViewState} from './view-types.ts';import type {UiControl} from './ui.ts';import type {ItemId} from '../application/account-types.ts';
import {ITEM_PRICES} from '../application/economy.ts';export {ITEM_PRICES} from '../application/economy.ts';
export const ITEM_NAMES:Record<ItemId,string>={rotate:'旋转',clear:'清障',wildcard:'万能'};
const items:ItemId[]=['rotate','clear','wildcard'];
export function getEconomyControls(state:GameRun,view:ViewState):UiControl[] {
 if(view.screen==='shop')return [...items.map((item,index)=>{const price=ITEM_PRICES[item],short=Math.max(0,price-(view.account?.wallet??0));return {rect:{x:170,y:580+index*245,w:740,h:132},label:`${ITEM_NAMES[item]} · ${price}金币${short?` · 还差${short}`:''}`,action:{type:'purchase' as const,item},disabled:short>0};}),{rect:{x:210,y:1500,w:660,h:114},label:'返回',action:{type:'back'}}];
 if(view.screen==='prepareTools'){const chosen=view.prepareIntent?.items??[];return [...items.map((item,index)=>({rect:{x:170,y:620+index*220,w:740,h:132},label:`${ITEM_NAMES[item]} · 库存${view.account?.inventory[item]??0}`,action:{type:'toggleItem' as const,item},selected:chosen.includes(item),disabled:!chosen.includes(item)&&((view.account?.inventory[item]??0)<1||chosen.length>=2)})),{rect:{x:186,y:1420,w:330,h:118},label:'取消',action:{type:'back'}},{rect:{x:564,y:1420,w:330,h:118},label:`携带${chosen.length}件 · 下一步`,action:{type:'prepareNext'}}];}
 if(view.screen==='prepareCleanup'||isInboundV9(state)&&state.phase==='cleanup')return [{rect:{x:170,y:740,w:740,h:140},label:'按单清扫 · 每2单清理旧废物',action:{type:'chooseCleanup',branch:'orders'}},{rect:{x:170,y:950,w:740,h:140},label:'定期清扫 · 每6次放置清理旧废物',action:{type:'chooseCleanup',branch:'placements'}},...(view.screen==='prepareCleanup'?[{rect:{x:210,y:1420,w:660,h:114},label:'取消准备',action:{type:'back' as const}}]:[])];
 if(isInboundV9(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume)return items.filter(item=>state.toolCharges[item]===1).map((item,index)=>({rect:{x:48+index*235,y:1828,w:217,h:66},label:ITEM_NAMES[item],action:{type:'tool',item}}));return [];
}

/** Only the visible economic identity can supply a result reward. Legacy boards have no ledger earnings. */
export function resultEarnedCoins(state:GameRun,view:ViewState):{earnedCoins:number;wallet:number}|null {
 const account=view.account,serial=state.runSerial;if(!account||serial===undefined||serial<=account.migration.legacySerialCeiling||![8,9,10].includes(state.rulesetVersion))return null;
 const matches=(identity:import('../application/account-types.ts').RunIdentity)=>identity.serial===serial&&identity.rulesetVersion===state.rulesetVersion&&identity.runConfigId===state.runConfigId;
 const active=account.run;if(active){if(view.accountRunId!==active.identity.runId||!matches(active.identity)||active.state.seed!==state.seed||active.state.commandIndex!==state.commandIndex||active.state.score!==state.score||active.state.completedOrders!==state.completedOrders)return null;return {earnedCoins:active.earnedCoins,wallet:account.wallet};}
 const closed=account.lastClosedResult;if(!closed||!matches(closed.identity)||closed.history.seed!==state.seed||closed.commandIndex!==state.commandIndex||closed.score!==state.score||closed.units!==state.completedOrders||closed.result!==state.result)return null;
 return {earnedCoins:closed.earnedCoins,wallet:account.wallet};
}
