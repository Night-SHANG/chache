import {accountCosmeticState} from '../application/cosmetics.ts';
import {staticPresentationView} from './static-help.ts';
import type {ViewState} from './view-types.ts';
import type {StaticArtRequirements} from './static-art-resources.ts';

/** Fixed shared art is ready once before interaction; browsing never waits on a per-item PNG. */
export const STATIC_ART_SHARED_KEYS=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'].sort();
export function staticArtCoreRequirementsForView(source:ViewState):StaticArtRequirements {
 const view=staticPresentationView(source),value=accountCosmeticState(view.account??null,view.profile).cosmetics;
 return {scene:`scene.${value.theme}`,shared:[...STATIC_ART_SHARED_KEYS],previews:[]};
}
export function staticArtRequirementsForView(source:ViewState):StaticArtRequirements {return staticArtCoreRequirementsForView(source);}
