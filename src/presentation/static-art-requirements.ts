import {accountCosmeticState} from '../application/cosmetics.ts';
import {classicSetDefinition,DEFAULT_CLASSIC_SET_SELECTION} from '../application/cosmetic-sets.ts';
import type {Profile} from '../application/profile.ts';
import {cosmeticBrowseMode,cosmeticSetShopPage,selectedShopCosmetic,selectedShopCosmeticSet} from './economy-ui.ts';
import {staticPresentationView} from './static-help.ts';
import type {ViewState} from './view-types.ts';
import type {StaticArtRequirements} from './static-art-resources.ts';

/** Mirrors the renderer's existing account projection without changing profile or save data. */
export function staticArtRequirementsForView(source:ViewState):StaticArtRequirements {
 const view=staticPresentationView(source),appearance=accountCosmeticState(view.account??null,view.profile);
 const equipped=view.account?appearance.cosmetics:(view.profile?.cosmetics??appearance.cosmetics);
 const shared=new Set(['cargo.core','tools.core','forklift.base']),previews=new Set<string>();
 const addAppearance=(value:Profile['cosmetics']):void=>{
  if(value.theme==='day'||value.theme==='night'){shared.add('frame.classic');shared.add('material.board');}else shared.add('material.scene');
  if(value.cargo!=='classic'&&value.cargo!=='outline')shared.add('material.cargo');
  if(!['yellow','blue','red','white'].includes(value.forklift))shared.add('forklift.styled');
 };
 const preview=(value:Profile['cosmetics'],variant:'card'|'item'|'set'|'classic'):void=>{addAppearance(value);previews.add(`preview.${value.theme}.${variant}`);};
 addAppearance(equipped);
 if(view.screen==='shop'&&view.shopTab==='cosmetics'&&!view.confirmation&&!view.accountBlocked){
  const set=selectedShopCosmeticSet(view),choice=view.classicSetSelection??DEFAULT_CLASSIC_SET_SELECTION;
  if(set?.id==='classic'){const value=classicSetDefinition(choice);preview(value,'classic');}
  else if(cosmeticBrowseMode(view)==='sets'){
   if(set)preview(set,'set');else for(const card of cosmeticSetShopPage(view).items)preview(card.id==='classic'?classicSetDefinition(choice):card,'card');
  }else{
   const item=selectedShopCosmetic(view),value={...appearance.cosmetics};
   if(item.kind==='theme')value.theme=item.id as typeof value.theme;
   else if(item.kind==='forklift')value.forklift=item.id as typeof value.forklift;
   else value.cargo=item.overlay?'classic':item.id as typeof value.cargo;
   preview(value,'item');
  }
 }
 return {scene:`scene.${equipped.theme}`,shared:[...shared].sort(),previews:[...previews].sort()};
}
