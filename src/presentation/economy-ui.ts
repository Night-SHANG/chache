import {COSMETIC_CATALOG,accountCosmeticState,getCosmetic} from '../application/cosmetics.ts';
import type {CosmeticDefinition} from '../application/cosmetics.ts';
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
export function toolboxVisible(state:GameRun,view:ViewState):boolean {return !view.practice&&isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume&&!view.confirmation&&!view.accountBlocked&&!view.toolSelection&&!view.supplyUpgrade&&(!view.screen||view.screen==='game')&&(!!view.toolboxOpen||state.phase==='rescue');}
export const toolStatus=(state:ToolRun,item:ItemId):string=>state.toolCharges[item]?'可用 1':state.usedToolIds.includes(item)?'已用完':'未携带';
export const COSMETIC_PREVIEW_RECT={x:132,y:632,w:816,h:404};
export function selectedShopCosmetic(view:ViewState):CosmeticDefinition {
 const kind=view.cosmeticCategory??'theme',appearance=accountCosmeticState(view.account??null,view.profile);
 return getCosmetic(kind,view.cosmeticPreview?.[kind]??appearance.cosmetics[kind])??COSMETIC_CATALOG.find(item=>item.kind===kind)!;
}
export function cosmeticStatus(item:CosmeticDefinition,view:ViewState):string {
 const state=accountCosmeticState(view.account??null,view.profile),owned=state.ownedCosmetics.includes(item.key),equipped=item.overlay?state.cargoOutline:state.cosmetics[item.kind]===item.id;
 return owned?equipped?'使用中':'已拥有':item.achievementId?'成就解锁':`${item.price}金币`;
}
export function getShopControls(view:ViewState):UiControl[] {
 const tab=view.shopTab??'tools';
 const tabs:UiControl[]=(['tools','cosmetics'] as const).map((value,index)=>({rect:{x:132+index*420,y:280,w:396,h:144},label:value==='tools'?'道具':'外观',action:{type:'selectShopTab',tab:value},selected:value===tab}));
 if(tab==='tools')return [...tabs,...TOOL_ITEMS.map((item,index)=>{const price=ITEM_PRICES[item],short=Math.max(0,price-(view.account?.wallet??0));return {rect:{x:688,y:610+index*300,w:228,h:132},label:`${price}金币${short?` · 还差${short}`:' · 购买'}`,action:{type:'purchase' as const,item},disabled:short>0};}),{rect:{x:210,y:1518,w:660,h:132},label:'返回',action:{type:'back'}}];
 const item=selectedShopCosmetic(view),appearance=accountCosmeticState(view.account??null,view.profile),owned=appearance.ownedCosmetics.includes(item.key),equipped=item.overlay?appearance.cargoOutline:appearance.cosmetics[item.kind]===item.id,short=Math.max(0,item.price-(view.account?.wallet??0));
 const action:UiControl=item.overlay?{rect:{x:132,y:1524,w:816,h:144},label:equipped?'关闭轮廓':'启用轮廓',action:{type:'setCargoOutline',enabled:!equipped}}:owned?{rect:{x:132,y:1524,w:816,h:144},label:equipped?'使用中':'免费装备',action:{type:'equipCosmetic',kind:item.kind,id:item.id},disabled:equipped}:{rect:{x:132,y:1524,w:816,h:144},label:item.achievementId?'成就解锁':`${item.price}金币 · ${short?`还差${short}`:'购买'}`,action:{type:'purchaseCosmetic',kind:item.kind,id:item.id},disabled:!!item.achievementId||short>0||!!view.account?.run};
 return [...tabs,...(['theme','cargo','forklift'] as const).map((kind,index)=>({rect:{x:132+index*280,y:456,w:256,h:132},label:kind==='theme'?'主题':kind==='cargo'?'货箱':'叉车',action:{type:'selectCosmeticCategory' as const,kind},selected:kind===item.kind})),...COSMETIC_CATALOG.filter(option=>option.kind===item.kind).map((option,index)=>({rect:{x:132+index%2*420,y:1182+Math.floor(index/2)*162,w:396,h:144},label:`${option.name}\n${cosmeticStatus(option,view)}`,action:{type:'previewCosmetic' as const,kind:option.kind,id:option.id},selected:option.id===item.id})),action,{rect:{x:210,y:1692,w:660,h:144},label:'返回',action:{type:'back'}}];
}
export function getEconomyControls(state:GameRun,view:ViewState):UiControl[] {
 if(view.practice)return [];
 if(view.dailyLocked&&view.prepareIntent?.spec.family==='inbound'&&view.prepareIntent.spec.mode==='daily'&&['prepareTools','prepareCleanup'].includes(view.screen??''))return [{rect:{x:132,y:1518,w:348,h:132},label:'取消',action:{type:'back'}},{rect:{x:516,y:1518,w:432,h:132},label:'今日已完成',action:{type:'prepareNext'},disabled:true}];
 if(view.screen==='shop')return getShopControls(view);
 if(view.screen==='prepareTools'){const chosen=view.prepareIntent?.items??[],allowed=!(view.prepareIntent&&'mode' in view.prepareIntent.spec&&view.prepareIntent.spec.mode==='daily')&&view.prepareIntent?.guide!=='guided';return [...TOOL_ITEMS.map((item,index)=>({rect:{x:688,y:610+index*300,w:228,h:132},label:chosen.includes(item)?'已选择':!allowed?'本局不可携带':(view.account?.inventory[item]??0)<1?'暂无库存':chosen.length>=2?'已选满2种':'携带',action:{type:'toggleItem' as const,item},selected:chosen.includes(item),disabled:!chosen.includes(item)&&(!allowed||(view.account?.inventory[item]??0)<1||chosen.length>=2)})),{rect:{x:132,y:1518,w:348,h:132},label:'取消',action:{type:'back'}},{rect:{x:516,y:1518,w:432,h:132},label:`携带${chosen.length}件 · 下一步`,action:{type:'prepareNext'}}];}
 if(view.screen==='prepareCleanup'||isInboundRun(state)&&state.phase==='cleanup')return [{rect:CLEANUP_RECTS[0],label:'按单清扫 · 每完成2单，清除1格废弃物',action:{type:'chooseCleanup',branch:'orders'}},{rect:CLEANUP_RECTS[1],label:(state.rulesetVersion===16||state.rulesetVersion===18||state.rulesetVersion===19)?'定期清扫 · 每成功放置6次，清除1格废弃物':'定期清扫 · 每放置6次，清除1格废弃物',action:{type:'chooseCleanup',branch:'placements'}},...(view.screen==='prepareCleanup'?[{rect:{x:210,y:1420,w:660,h:132},label:'取消准备',action:{type:'back' as const}}]:[])];
 if(isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume){const count=TOOL_ITEMS.reduce((sum,item)=>sum+state.toolCharges[item],0);return [{rect:TOOLBOX_RECT,label:`工具箱 · ${count}`,action:{type:'toggleToolbox'},selected:toolboxVisible(state,view)},...(toolboxVisible(state,view)?TOOL_ITEMS.map((item,index)=>({rect:{x:48+index*334,y:1530,w:316,h:state.phase==='rescue'?234:272},label:`${ITEM_NAMES[item]} · ${toolStatus(state,item)}`,action:{type:'tool' as const,item},disabled:state.toolCharges[item]!==1})):[])];}return [];
}

/** Only the visible economic identity can supply a result reward. Legacy boards have no ledger earnings. */
export function resultEarnedCoins(state:GameRun,view:ViewState):{earnedCoins:number;wallet:number}|null {
 if(view.practice)return null;
 const account=view.account,serial=state.runSerial;if(!account||serial===undefined||serial<=account.migration.legacySerialCeiling||![8,9,10,11,12,13,14,15,16,18,19].includes(state.rulesetVersion))return null;
 const matches=(identity:import('../application/account-types.ts').RunIdentity)=>identity.serial===serial&&identity.rulesetVersion===state.rulesetVersion&&identity.runConfigId===state.runConfigId;
 const active=account.run;if(active){if(view.accountRunId!==active.identity.runId||!matches(active.identity)||active.state.seed!==state.seed||active.state.commandIndex!==state.commandIndex||active.state.score!==state.score||active.state.completedOrders!==state.completedOrders)return null;return {earnedCoins:active.earnedCoins,wallet:account.wallet};}
 const closed=account.lastClosedResult;if(!closed||!matches(closed.identity)||closed.history.seed!==state.seed||closed.commandIndex!==state.commandIndex||closed.score!==state.score||closed.units!==state.completedOrders||closed.result!==state.result)return null;
 return {earnedCoins:closed.earnedCoins,wallet:account.wallet};
}

/** A closed daily board keeps its start date even after today's menu has rolled over. */
export function dailyChallengeDay(state:GameRun,view:ViewState):string|undefined {
 if(view.practice||state.mode!=='daily')return undefined;
 if('challengeDay' in state&&state.challengeDay)return state.challengeDay;
 const account=view.account;if(!account)return undefined;
 const run=account.run??account.lastClosedResult;
 if(!run||run.identity.serial!==state.runSerial||run.identity.rulesetVersion!==state.rulesetVersion||run.identity.runConfigId!==state.runConfigId||run.history.seed!==state.seed)return undefined;
 return run.identity.challengeDay;
}
