import {STATIC_ART_FORKLIFTS} from './static-art-manifest.ts';
import {accountCosmeticState} from '../application/cosmetics.ts';
import {staticPresentationView} from './static-help.ts';
import type {ViewState} from './view-types.ts';
import {prepareStaticArt,staticArtStatus} from './static-art-resources.ts';
import type {StaticArtRequirements} from './static-art-resources.ts';

/** Optional shared PNGs enhance the synchronous artwork; neither input nor render waits for them. */
export const STATIC_ART_SHARED_KEYS=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'].sort();
export function staticArtCoreRequirementsForView(source:ViewState):StaticArtRequirements {
 const view=staticPresentationView(source),value=accountCosmeticState(view.account??null,view.profile).cosmetics;
 return {scene:`scene.${value.theme}`,shared:[...STATIC_ART_SHARED_KEYS],previews:[]};
}
export function staticArtRequirementsForView(source:ViewState):StaticArtRequirements {return staticArtCoreRequirementsForView(source);}

/** Only a changed committed appearance starts preparation; repeated frames never queue waiters. */
export function prepareStaticArtForView(view:ViewState):void {
 const requirements=staticArtRequirementsForView(view);
 if(staticArtStatus(requirements).status==='superseded')void prepareStaticArt(requirements);
}

/** Android's visible initial menu needs only its scene and the selected forklift. */
export function staticArtStartupRequirementsForView(view:ViewState):StaticArtRequirements {
 if(view.screen!=='menu'||view.needsResume||view.confirmation||view.accountBlocked)return staticArtCoreRequirementsForView(view);
 const cosmetics=accountCosmeticState(view.account??null,view.profile).cosmetics;
 const forklift=STATIC_ART_FORKLIFTS[cosmetics.forklift];
 return {scene:`scene.${cosmetics.theme}`,shared:forklift?[forklift.resource]:[],previews:[]};
}
