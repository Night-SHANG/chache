import type {GameSession} from '../application/session.ts';

/** Native Back only dismisses or pauses; it never closes or settles the saved run. */
export function handleAndroidBack(session:GameSession):'handled'|'background' {
 const view=session.view;session.input.cancel();
 // Recovery and revoked writers must remain able to leave without retrying a transaction.
 if(view.accountBlocked)return 'background';
 const handled=(): 'handled'|'background'=>view.accountBlocked?'background':'handled';
 if(view.confirmation){session.action({type:'cancel'});return handled();}
 if(view.toolSelection||view.toolboxOpen){session.action({type:'toolCancel'});return handled();}
 if(view.supplyUpgrade){session.action({type:'supplyCancel'});return handled();}
 if(view.screen==='shop'&&(view.shopItemDetail||view.cosmeticSetPreview||view.cosmeticReturnSet)){session.action({type:'closeShopDetail'});return handled();}
 if(view.screen&&view.screen!=='game'&&view.screen!=='menu'){session.action({type:'back'});return handled();}
 if(view.screen==='game'&&!view.paused&&!view.needsResume&&session.state.phase!=='result'){session.togglePause();return handled();}
 return 'background';
}
