/** Archived v0.21 paged-control fixture. Only legacy host-protocol unit tests use this; v0.22 native acceptance uses the current renderer and scroll driver. Source: f8e8b83. */
import {COSMETIC_SETS,getCosmeticSet,cosmeticSetStatus,quoteCosmeticSetPurchase} from '../../src/application/cosmetic-sets.ts';
import type {CosmeticSetDefinition} from '../../src/application/cosmetic-sets.ts';
import {COSMETIC_CATALOG,accountCosmeticState,getCosmetic} from '../../src/application/cosmetics.ts';
import type {CosmeticDefinition} from '../../src/application/cosmetics.ts';
import {isInboundRun,isToolRun} from '../../src/domain/playable.ts';
import type {GameRun,ToolRun} from '../../src/domain/playable.ts';
import type {ViewState} from '../../src/presentation/view-types.ts';
import type {UiControl} from '../../src/presentation/ui.ts';
import type {ItemId} from '../../src/application/account-types.ts';
import {ITEM_PRICES} from '../../src/application/economy.ts';
import {PLAYTEST_FREE_SHOP,shopPrice} from '../../src/shared/build-policy.ts';
export {ITEM_PRICES} from '../../src/application/economy.ts';
export const ITEM_NAMES:Record<ItemId,string>={rotate:'旋转',clear:'清障',wildcard:'万能'};
export const ITEM_EFFECTS:Record<ItemId,string>={rotate:'旋转选中的货件',clear:'清除1至2个占用格',wildcard:'将待放货件\n换成单格'};
export const TOOL_ITEMS:readonly ItemId[]=['rotate','clear','wildcard'];
export const TOOLBOX_RECT={x:355,y:105,w:144,h:144};
export const CLEANUP_RECTS=[{x:108,y:650,w:414,h:592},{x:558,y:650,w:414,h:592}] as const;
export const economyCardRect=(index:number)=>({x:132,y:510+index*300,w:816,h:280});
export function toolboxVisible(state:GameRun,view:ViewState):boolean {return !view.practice&&isToolRun(state)&&['input','rescue'].includes(state.phase)&&!view.animation&&!view.paused&&!view.needsResume&&!view.confirmation&&!view.accountBlocked&&!view.toolSelection&&!view.supplyUpgrade&&(!view.screen||view.screen==='game')&&(!!view.toolboxOpen||state.phase==='rescue');}
export const toolStatus=(state:ToolRun,item:ItemId):string=>state.toolCharges[item]?'可用 1':state.usedToolIds.includes(item)?'已用完':'未携带';
export const COSMETIC_PREVIEW_RECT={x:132,y:750,w:816,h:232};
/** 272 × 280 CSS pixels on a 360px phone; the board uses the gameplay geometry. */
export const COSMETIC_SET_PREVIEW_RECT={x:132,y:646,w:816,h:840};
export const COSMETIC_SETS_PER_PAGE=4;
export const cosmeticSetCardRect=(index:number)=>({x:132+index%2*420,y:630+Math.floor(index/2)*402,w:396,h:366});
export const cosmeticBrowseMode=(view:ViewState):'sets'|'items'=>view.cosmeticBrowse??(view.cosmeticCategory?'items':'sets');
export function selectedShopCosmeticSet(view:ViewState):CosmeticSetDefinition|undefined {return view.cosmeticSetPreview?getCosmeticSet(view.cosmeticSetPreview):undefined;}
export function cosmeticSetShopPage(view:ViewState):{page:number;pages:number;items:readonly CosmeticSetDefinition[]} {
 const pages=Math.ceil(COSMETIC_SETS.length/COSMETIC_SETS_PER_PAGE),page=Math.max(0,Math.min(pages-1,Number.isInteger(view.cosmeticSetPage)?view.cosmeticSetPage!:0));
 return {page,pages,items:COSMETIC_SETS.slice(page*COSMETIC_SETS_PER_PAGE,(page+1)*COSMETIC_SETS_PER_PAGE)};
}
function cosmeticBrowseTabs(view:ViewState):UiControl[] {return (['sets','items'] as const).map((mode,index)=>({rect:{x:132+index*420,y:414,w:396,h:150},label:mode==='sets'?'套装':'单件',action:{type:'selectCosmeticBrowse',mode},selected:cosmeticBrowseMode(view)===mode}));}
function getCosmeticSetControls(view:ViewState):UiControl[] {
 const set=selectedShopCosmeticSet(view),appearance=accountCosmeticState(view.account??null,view.profile);
 if(set){
  const status=cosmeticSetStatus(set,appearance),quote=quoteCosmeticSetPurchase(set.id,appearance),short=Math.max(0,(quote?.price??0)-(view.account?.wallet??0));
  const primary:UiControl=status.complete?{rect:{x:552,y:1692,w:396,h:150},label:status.equipped?'使用中':'装备整套',action:{type:'equipCosmeticSet',id:set.id},disabled:status.equipped||!!view.account?.run,buttonRole:'primary'}:{rect:{x:552,y:1692,w:396,h:150},label:PLAYTEST_FREE_SHOP?'领取套装':`购买套装\n${quote?.price??0}金币`,action:{type:'purchaseCosmeticSet',id:set.id},disabled:!quote||short>0||!!view.account?.run,buttonRole:'primary'};
  return [...(['theme','cargo','forklift'] as const).map((kind,index)=>({rect:{x:132+index*280,y:1502,w:256,h:150},label:`${kind==='theme'?'场景':kind==='cargo'?'货箱':'叉车'} · ${appearance.cosmetics[kind]===set[kind]?'已装备':appearance.ownedCosmetics.includes(`${kind}.${set[kind]}`)?'已拥有':'未拥有'}\n${getCosmetic(kind,set[kind])!.name}`,action:{type:'previewCosmeticSetMember' as const,kind}})),{rect:{x:132,y:1692,w:396,h:150},label:'返回套装',action:{type:'closeCosmeticSet'},buttonRole:'secondary'},primary];
 }
 const pagination=cosmeticSetShopPage(view);return [...pagination.items.map((set,index)=>{const status=cosmeticSetStatus(set,appearance);return {rect:cosmeticSetCardRect(index),label:`${set.name}\n已拥有 ${status.ownedCount}/3`,action:{type:'previewCosmeticSet' as const,id:set.id},selected:status.equipped};}),{rect:{x:132,y:1430,w:240,h:150},label:'上一页',action:{type:'selectCosmeticSetPage',page:pagination.page-1},disabled:pagination.page===0},{rect:{x:708,y:1430,w:240,h:150},label:'下一页',action:{type:'selectCosmeticSetPage',page:pagination.page+1},disabled:pagination.page===pagination.pages-1},{rect:{x:210,y:1674,w:660,h:150},label:'返回',action:{type:'back'}}];
}
export const COSMETICS_PER_PAGE=4;
export function selectedShopCosmetic(view:ViewState):CosmeticDefinition {
 const kind=view.cosmeticCategory??'theme',appearance=accountCosmeticState(view.account??null,view.profile);
 return getCosmetic(kind,view.cosmeticPreview?.[kind]??appearance.cosmetics[kind])??COSMETIC_CATALOG.find(item=>item.kind===kind)!;
}
/** The displayed page always contains the previewed item; it is never persisted. */
export function cosmeticShopPage(view:ViewState):{page:number;pages:number;items:readonly CosmeticDefinition[]} {
 const selected=selectedShopCosmetic(view),options=COSMETIC_CATALOG.filter(item=>item.kind===selected.kind),page=Math.floor(options.findIndex(item=>item.id===selected.id)/COSMETICS_PER_PAGE);
 return {page,pages:Math.ceil(options.length/COSMETICS_PER_PAGE),items:options.slice(page*COSMETICS_PER_PAGE,(page+1)*COSMETICS_PER_PAGE)};
}
export function cosmeticStatus(item:CosmeticDefinition,view:ViewState):string {
 const state=accountCosmeticState(view.account??null,view.profile),owned=state.ownedCosmetics.includes(item.key),equipped=item.overlay?state.cargoOutline:state.cosmetics[item.kind]===item.id;
 return owned?equipped?'使用中':'已拥有':PLAYTEST_FREE_SHOP?'试玩免费':item.achievementId?'成就解锁':`${item.price}金币`;
}
export function getShopControls(view:ViewState):UiControl[] {
 const tab=view.shopTab??'tools';
 const tabs:UiControl[]=(['tools','cosmetics'] as const).map((value,index)=>({rect:{x:132+index*420,y:248,w:396,h:150},label:value==='tools'?'道具':'外观',action:{type:'selectShopTab',tab:value},selected:value===tab}));
 if(tab==='tools')return [...tabs,...TOOL_ITEMS.map((item,index)=>{const price=shopPrice(ITEM_PRICES[item]),short=Math.max(0,price-(view.account?.wallet??0));return {rect:{x:688,y:610+index*300,w:228,h:150},label:PLAYTEST_FREE_SHOP?'领取':`${price}金币${short?` · 还差${short}`:' · 购买'}`,action:{type:'purchase' as const,item},disabled:short>0||!!view.account?.run};}),{rect:{x:210,y:1518,w:660,h:150},label:'返回',action:{type:'back'}}];
 const browseTabs=cosmeticBrowseTabs(view);
 if(cosmeticBrowseMode(view)==='sets')return [...tabs,...browseTabs,...getCosmeticSetControls(view)];
 const item=selectedShopCosmetic(view),appearance=accountCosmeticState(view.account??null,view.profile),owned=appearance.ownedCosmetics.includes(item.key),equipped=item.overlay?appearance.cargoOutline:appearance.cosmetics[item.kind]===item.id,short=Math.max(0,shopPrice(item.price)-(view.account?.wallet??0)),pagination=cosmeticShopPage(view);
 const action:UiControl=item.overlay?{rect:{x:132,y:1640,w:528,h:150},label:equipped?'关闭轮廓':'启用轮廓',action:{type:'setCargoOutline',enabled:!equipped}}:owned?{rect:{x:132,y:1640,w:528,h:150},label:equipped?'使用中':'装备',action:{type:'equipCosmetic',kind:item.kind,id:item.id},disabled:equipped}:{rect:{x:132,y:1640,w:528,h:150},label:PLAYTEST_FREE_SHOP?'领取':item.achievementId?'成就解锁':`${item.price}金币 · ${short?`还差${short}`:'购买'}`,action:{type:'purchaseCosmetic',kind:item.kind,id:item.id},disabled:!PLAYTEST_FREE_SHOP&&!!item.achievementId||short>0||!!view.account?.run};
 return [...tabs,...browseTabs,...(['theme','cargo','forklift'] as const).map((kind,index)=>({rect:{x:132+index*280,y:580,w:256,h:150},label:kind==='theme'?'主题':kind==='cargo'?'货箱':'叉车',action:{type:'selectCosmeticCategory' as const,kind},selected:kind===item.kind})),...pagination.items.map((option,index)=>({rect:{x:132+index%2*420,y:1110+Math.floor(index/2)*170,w:396,h:150},label:`${option.name}\n${cosmeticStatus(option,view)}`,action:{type:'previewCosmetic' as const,kind:option.kind,id:option.id},selected:option.id===item.id})),{rect:{x:132,y:1450,w:240,h:150},label:'上一页',action:{type:'selectCosmeticPage',page:pagination.page-1},disabled:pagination.page===0},{rect:{x:708,y:1450,w:240,h:150},label:'下一页',action:{type:'selectCosmeticPage',page:pagination.page+1},disabled:pagination.page===pagination.pages-1},action,{rect:{x:684,y:1640,w:264,h:150},label:'返回',action:{type:'back'}}];
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
 const matches=(identity:import('../../src/application/account-types.ts').RunIdentity)=>identity.serial===serial&&identity.rulesetVersion===state.rulesetVersion&&identity.runConfigId===state.runConfigId;
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
