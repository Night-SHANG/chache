import {SHOP_COSMETIC_SETS,getCosmeticSet,cosmeticSetStatus,quoteCosmeticSetPurchase,cosmeticSetDiscountLabel,classicSetStatus,DEFAULT_CLASSIC_SET_SELECTION} from '../application/cosmetic-sets.ts';
import type {CosmeticSetDefinition} from '../application/cosmetic-sets.ts';
import {COSMETIC_CATALOG,accountCosmeticState,getCosmetic} from '../application/cosmetics.ts';
import type {CosmeticDefinition} from '../application/cosmetics.ts';
import {isInboundRun,isToolRun} from '../domain/playable.ts';
import type {GameRun,ToolRun} from '../domain/playable.ts';
import type {ViewState} from './view-types.ts';
import {SHOP_SECTIONS,shopSection} from './shop-layout.ts';
import type {UiControl} from './ui.ts';
import type {ItemId} from '../application/account-types.ts';
import {ITEM_PRICES} from '../application/economy.ts';
import {PLAYTEST_FREE_SHOP,shopPrice} from '../shared/build-policy.ts';
export {ITEM_PRICES} from '../application/economy.ts';
export const ITEM_NAMES:Record<ItemId,string>={rotate:'旋转',clear:'清障',wildcard:'万能'};
export const ITEM_EFFECTS:Record<ItemId,string>={rotate:'旋转选中的货件',clear:'清除1至2个占用格',wildcard:'将待放货件\n换成单格'};
export const TOOL_ITEMS:readonly ItemId[]=['rotate','clear','wildcard'];
export const TOOLBOX_RECT={x:355,y:105,w:144,h:144};
export const CLEANUP_RECTS=[{x:108,y:650,w:414,h:592},{x:558,y:650,w:414,h:592}] as const;
export const economyCardRect=(index:number)=>({x:132,y:510+index*300,w:816,h:280});
export function toolboxVisible(state:GameRun,view:ViewState):boolean {return !view.practice&&isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume&&!view.confirmation&&!view.accountBlocked&&!view.toolSelection&&!view.supplyUpgrade&&(!view.screen||view.screen==='game')&&(!!view.toolboxOpen||state.phase==='rescue');}
export const toolStatus=(state:ToolRun,item:ItemId):string=>state.toolCharges[item]?'可用 1':state.usedToolIds.includes(item)?'已用完':'未携带';
/** Original paginated presentation shares a compact same-screen item preview. */
export const COSMETIC_PREVIEW_RECT={x:132,y:750,w:816,h:232};
export const COSMETIC_SET_PREVIEW_RECT={x:132,y:646,w:816,h:840};
export const CLASSIC_SET_PREVIEW_RECT={x:132,y:316,w:816,h:780};
// One page preserves the original four-card layout, including the classic preset.
export const COSMETIC_SETS_PER_PAGE=4;
export const cosmeticSetCardRect=(index:number)=>({x:132+index%2*420,y:630+Math.floor(index/2)*402,w:396,h:366});
export const cosmeticBrowseMode=(view:ViewState):'sets'|'items'=>shopSection(view)==='sets'?'sets':'items';
export function selectedShopCosmeticSet(view:ViewState):CosmeticSetDefinition|undefined {return view.cosmeticSetPreview?getCosmeticSet(view.cosmeticSetPreview):undefined;}
export function cosmeticSetShopPage(view:ViewState):{page:number;pages:number;items:readonly CosmeticSetDefinition[]} {
 const pages=Math.ceil(SHOP_COSMETIC_SETS.length/COSMETIC_SETS_PER_PAGE),page=Math.max(0,Math.min(pages-1,Number.isInteger(view.cosmeticSetPage)?view.cosmeticSetPage!:0));
 return {page,pages,items:SHOP_COSMETIC_SETS.slice(page*COSMETIC_SETS_PER_PAGE,(page+1)*COSMETIC_SETS_PER_PAGE)};
}
export const COSMETICS_PER_PAGE=4;
export function selectedShopCosmetic(view:ViewState):CosmeticDefinition {
 const kind=view.shopItemDetail?.kind??(shopSection(view)==='sets'?'theme':shopSection(view)) as CosmeticDefinition['kind'],appearance=accountCosmeticState(view.account??null,view.profile);
 return getCosmetic(kind,view.shopItemDetail?.id??view.cosmeticPreview?.[kind]??appearance.cosmetics[kind])??COSMETIC_CATALOG.find(item=>item.kind===kind)!;
}
export function cosmeticShopPage(view:ViewState):{page:number;pages:number;items:readonly CosmeticDefinition[]} {
 const selected=selectedShopCosmetic(view),options=COSMETIC_CATALOG.filter(item=>item.kind===selected.kind),page=Math.floor(options.findIndex(item=>item.id===selected.id)/COSMETICS_PER_PAGE);
 return {page,pages:Math.ceil(options.length/COSMETICS_PER_PAGE),items:options.slice(page*COSMETICS_PER_PAGE,(page+1)*COSMETICS_PER_PAGE)};
}
function cosmeticEquipped(item:CosmeticDefinition,appearance:ReturnType<typeof accountCosmeticState>):boolean {
 return item.overlay?appearance.cargoOutline:appearance.cosmetics[item.kind]===item.id&&!(item.kind==='cargo'&&item.id==='classic'&&appearance.cargoOutline);
}
const purchaseLabel=(price:number,set=false):string=>`${price}金币 · ${set?'购买套装':'购买'}`;
export function cosmeticStatus(item:CosmeticDefinition,view:ViewState):string {
 const state=accountCosmeticState(view.account??null,view.profile),owned=state.ownedCosmetics.includes(item.key),equipped=cosmeticEquipped(item,state);
 return owned?equipped?'使用中':'已拥有':PLAYTEST_FREE_SHOP?'试玩免费':item.achievementId?'成就解锁':`${item.price}金币`;
}
export function cosmeticSetCardStatus(set:CosmeticSetDefinition,view:ViewState):string {
 const appearance=accountCosmeticState(view.account??null,view.profile),status=cosmeticSetStatus(set,appearance),quote=quoteCosmeticSetPurchase(set.id,appearance);
 if(set.id==='classic'){const classic=classicSetStatus(view.classicSetSelection??DEFAULT_CLASSIC_SET_SELECTION,appearance);return classic.equipped?'使用中':classic.complete?'已拥有':'自由搭配';}
 return status.equipped?'使用中':status.complete?'已拥有':PLAYTEST_FREE_SHOP?'试玩免费':`${quote?.price??0}金币 · ${cosmeticSetDiscountLabel(quote?.missingKeys.length??0)}`;
}
/** Every paired shop footer keeps navigation left and the committing action right. */
const shopFooterRects=(y:number,backWidth:number)=>({back:{x:132,y,w:backWidth,h:150},primary:{x:156+backWidth,y,w:792-backWidth,h:150}});
export function getShopControls(view:ViewState):UiControl[] {
 const tab=view.shopTab??'tools';
 const tabs:UiControl[]=(['tools','cosmetics'] as const).map((value,index)=>({rect:{x:132+index*420,y:248,w:396,h:150},label:value==='tools'?'道具':'外观',action:{type:'selectShopTab',tab:value},selected:value===tab}));
 if(tab==='tools')return [...tabs,...TOOL_ITEMS.map((item,index)=>{const price=shopPrice(ITEM_PRICES[item]),short=Math.max(0,price-(view.account?.wallet??0));return {rect:{x:688,y:610+index*300,w:228,h:150},label:PLAYTEST_FREE_SHOP?'领取':purchaseLabel(price),action:{type:'purchase' as const,item},disabled:short>0||!!view.account?.run};}),{rect:{x:210,y:1518,w:660,h:150},label:'返回',action:{type:'back'}}];
 const sections:UiControl[]=SHOP_SECTIONS.map((section,index)=>({rect:{x:132+index*280,y:414,w:256,h:150},label:section==='theme'?'场景':section==='cargo'?'货箱':'叉车',action:{type:'selectShopSection',section},selected:shopSection(view)===section}));
 const item=selectedShopCosmetic(view),appearance=accountCosmeticState(view.account??null,view.profile),owned=appearance.ownedCosmetics.includes(item.key),equipped=cosmeticEquipped(item,appearance),short=Math.max(0,shopPrice(item.price)-(view.account?.wallet??0)),pagination=cosmeticShopPage(view),footer=shopFooterRects(1640,264),primaryRect=footer.primary;
 const primary:UiControl=item.overlay?{rect:primaryRect,label:equipped?'使用中':'装备',action:{type:'setCargoOutline',enabled:true},disabled:equipped||!!view.account?.run,buttonRole:'primary'}:owned?{rect:primaryRect,label:equipped?'使用中':'装备',action:{type:'equipCosmetic',kind:item.kind,id:item.id},disabled:equipped||!!view.account?.run,buttonRole:'primary'}:{rect:primaryRect,label:PLAYTEST_FREE_SHOP?'领取':item.achievementId?'成就解锁':purchaseLabel(item.price),action:{type:'purchaseCosmetic',kind:item.kind,id:item.id},disabled:!PLAYTEST_FREE_SHOP&&!!item.achievementId||short>0||!!view.account?.run,buttonRole:'primary'};
 return [...tabs,...sections,...pagination.items.map((option,index)=>({rect:{x:132+index%2*420,y:1110+Math.floor(index/2)*170,w:396,h:150},label:`${option.name}\n${cosmeticStatus(option,view)}`,action:{type:'previewCosmetic' as const,kind:option.kind,id:option.id},selected:option.id===item.id})),{rect:{x:132,y:1450,w:240,h:150},label:'上一页',action:{type:'selectCosmeticPage',page:pagination.page-1},disabled:pagination.page===0},{rect:{x:708,y:1450,w:240,h:150},label:'下一页',action:{type:'selectCosmeticPage',page:pagination.page+1},disabled:pagination.page===pagination.pages-1},{rect:footer.back,label:'返回',action:{type:'back'},buttonRole:'secondary'},primary];
}
export function getEconomyControls(state:GameRun,view:ViewState):UiControl[] {
 if(view.practice)return [];
 if(view.dailyLocked&&view.prepareIntent?.spec.family==='inbound'&&view.prepareIntent.spec.mode==='daily'&&['prepareTools','prepareCleanup'].includes(view.screen??''))return [{rect:{x:132,y:1518,w:348,h:132},label:'取消',action:{type:'back'},buttonRole:'secondary'},{rect:{x:516,y:1518,w:432,h:132},label:'今日已完成',action:{type:'prepareNext'},buttonRole:'primary',disabled:true}];
 if(view.screen==='shop')return getShopControls(view);
 if(view.screen==='prepareTools'){const chosen=view.prepareIntent?.items??[],allowed=!(view.prepareIntent&&'mode' in view.prepareIntent.spec&&view.prepareIntent.spec.mode==='daily')&&view.prepareIntent?.guide!=='guided';return [...TOOL_ITEMS.map((item,index)=>({rect:{x:688,y:610+index*300,w:228,h:132},label:chosen.includes(item)?'已选择':!allowed?'本局不可携带':(view.account?.inventory[item]??0)<1?'暂无库存':chosen.length>=2?'已选满2种':'携带',action:{type:'toggleItem' as const,item},selected:chosen.includes(item),disabled:!chosen.includes(item)&&(!allowed||(view.account?.inventory[item]??0)<1||chosen.length>=2)})),{rect:{x:132,y:1518,w:348,h:132},label:'取消',action:{type:'back'},buttonRole:'secondary'},{rect:{x:516,y:1518,w:432,h:132},label:`携带${chosen.length}件 · ${view.prepareIntent?.spec.family==='inbound'&&['rush','daily'].includes(view.prepareIntent.spec.mode)?'选择清扫':'开始游戏'}`,action:{type:'prepareNext'},buttonRole:'primary'}];}
 if(view.screen==='prepareCleanup'||isInboundRun(state)&&state.phase==='cleanup')return [{rect:CLEANUP_RECTS[0],label:'按单清扫 · 每完成2单，清除1格废弃箱',action:{type:'chooseCleanup',branch:'orders'}},{rect:CLEANUP_RECTS[1],label:(state.rulesetVersion===16||state.rulesetVersion===18||state.rulesetVersion===19||state.rulesetVersion===20||state.rulesetVersion===21)?'定期清扫 · 每成功放置6次，清除1格废弃箱':'定期清扫 · 每放置6次，清除1格废弃箱',action:{type:'chooseCleanup',branch:'placements'}},...(view.screen==='prepareCleanup'?[{rect:{x:210,y:1420,w:660,h:132},label:'取消准备',action:{type:'back' as const}}]:[])];
 if(isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume){const count=TOOL_ITEMS.reduce((sum,item)=>sum+state.toolCharges[item],0);return [{rect:TOOLBOX_RECT,label:`工具箱 · ${count}`,action:{type:'toggleToolbox'},selected:toolboxVisible(state,view)},...(toolboxVisible(state,view)?TOOL_ITEMS.map((item,index)=>({rect:{x:48+index*334,y:1530,w:316,h:state.phase==='rescue'?234:272},label:`${ITEM_NAMES[item]} · ${toolStatus(state,item)}`,action:{type:'tool' as const,item},disabled:state.toolCharges[item]!==1})):[])];}return [];
}

/** Only the visible economic identity can supply a result reward. Legacy boards have no ledger earnings. */
export function resultEarnedCoins(state:GameRun,view:ViewState):{earnedCoins:number;wallet:number}|null {
 if(view.practice)return null;
 const account=view.account,serial=state.runSerial;if(!account||serial===undefined||serial<=account.migration.legacySerialCeiling||![8,9,10,11,12,13,14,15,16,18,19,20,21].includes(state.rulesetVersion))return null;
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
