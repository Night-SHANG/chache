import {accountCosmeticState,COSMETIC_CATALOG} from '../application/cosmetics.ts';
import type {Profile} from '../application/profile.ts';
import {selectedShopCosmetic} from './economy-ui.ts';
import {staticPresentationView} from './static-help.ts';
import type {ViewState} from './view-types.ts';
import type {StaticArtRequirements} from './static-art-resources.ts';

const appearanceShared=(value:Profile['cosmetics']):string[]=>[
 ...(value.theme==='day'||value.theme==='night'?['frame.classic','material.board']:['material.scene']),
 ...(!['classic','outline'].includes(value.cargo)?['material.cargo']:[]),
 ...(!['yellow','blue','red','white'].includes(value.forklift)?['forklift.styled']:[]),
];
export function staticArtCoreRequirementsForView(source:ViewState):StaticArtRequirements {
 const view=staticPresentationView(source),value=accountCosmeticState(view.account??null,view.profile).cosmetics;
 return {scene:`scene.${value.theme}`,shared:[...new Set(['cargo.core','tools.core','forklift.base',...appearanceShared(value)])].sort(),previews:[]};
}
export function staticArtPreviewKeys(value:Profile['cosmetics']):string[] {
 return [...new Set(['cargo.core','forklift.base',...appearanceShared(value),`preview.${value.theme}.item`])];
}
export function staticArtRequirementsForView(source:ViewState):StaticArtRequirements {
 const view=staticPresentationView(source),core=staticArtCoreRequirementsForView(view);
 if(view.screen!=='shop'||view.shopTab!=='cosmetics'||view.confirmation||view.accountBlocked)return core;
 const item=selectedShopCosmetic(view),value={...accountCosmeticState(view.account??null,view.profile).cosmetics};
 if(item.kind==='theme')value.theme=item.id as typeof value.theme;
 else if(item.kind==='forklift')value.forklift=item.id as typeof value.forklift;
 else value.cargo=item.overlay?'classic':item.id as typeof value.cargo;
 const keys=staticArtPreviewKeys(value);
 return {...core,shared:[...new Set([...core.shared,...keys.filter(key=>!key.startsWith('preview.'))])].sort(),previews:keys.filter(key=>key.startsWith('preview.'))};
}
/** Warm only small item backgrounds, never all large scenes. Visible requests own their atlases. */
export function staticArtWarmKeys(view:ViewState):string[] {
 const equipped=accountCosmeticState(view.account??null,view.profile).cosmetics.theme;
 return [...new Set([`preview.${equipped}.item`,...COSMETIC_CATALOG.filter(item=>item.kind==='theme').map(item=>`preview.${item.id}.item`)])].slice(0,4);
}
