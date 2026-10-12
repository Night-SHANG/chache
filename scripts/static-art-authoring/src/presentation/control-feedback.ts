import type {ViewState} from './view-types.ts';
import type {UiAction} from './ui-types.ts';
/** Only navigation/modal identity: changing an elapsed clock never invalidates a press. */
export function controlContext(v:ViewState):string {
 return JSON.stringify([v.screen,v.paused,v.needsResume,v.accountBlocked,v.debug,v.debugPage,!!v.animation,v.supplyUpgrade,v.toolboxOpen,v.toolSelection,v.confirmation,v.shopTab,v.shopSection,v.cosmeticBrowse,v.cosmeticCategory,v.cosmeticSetPage,v.cosmeticSetPreview,v.shopItemDetail,v.cosmeticPreview,v.shopScroll]);
}
export function majorControl(action:UiAction|undefined,view:ViewState):boolean {
 if(!action)return false;
 if(['newRun','prepareNext','toolConfirm','chooseCleanup'].includes(action.type))return true;
 return action.type==='confirm'&&['purchase','purchaseCosmetic','purchaseCosmeticSet','newRun'].includes(view.confirmation?.kind??'');
}
