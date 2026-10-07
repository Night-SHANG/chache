import type {GameRun} from '../domain/playable.ts';
import type {ViewState} from './view-types.ts';

/** Old guide state can be restored, but never adds teaching UI or target restrictions. */
export function staticPresentationView(view:ViewState):ViewState {
 const obsolete=view.screen==='guideOffer'||view.screen==='tutorialPracticeSelect';
 const oldConfirmation=view.confirmation?.kind==='startPractice';
 return {...view,guide:null,practice:undefined,...(obsolete?{screen:view.screen==='guideOffer'?'menu' as const:'settings' as const}:{}),...(oldConfirmation?{confirmation:null,screen:'settings' as const}:{})};
}

/** Choosing help never changes the background run or creates a temporary game. */
export function helpTopic(state:GameRun,view:ViewState):'inbound'|'outbound' {
 return view.helpTopic??(state.mode==='color_exit'?'outbound':'inbound');
}
