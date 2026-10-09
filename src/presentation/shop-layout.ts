import {COSMETIC_CATALOG} from '../application/cosmetics.ts';
import type {CosmeticDefinition} from '../application/cosmetics.ts';
import {SHOP_COSMETIC_SETS} from '../application/cosmetic-sets.ts';
import type {CosmeticSetDefinition} from '../application/cosmetic-sets.ts';
import type {ShopSection,ViewState} from './view-types.ts';
import type {Rect} from './layout.ts';

export const SHOP_LIST_RECT:Readonly<Rect>={x:132,y:600,w:816,h:1020};
export const SHOP_CARD_WIDTH=396,SHOP_CARD_HEIGHT=340,SHOP_CARD_GAP=24;
export const SHOP_SECTIONS:readonly ShopSection[]=['sets','theme','cargo','forklift'];
export const shopSection=(view:ViewState):ShopSection=>view.shopSection??(view.cosmeticCategory??'sets');
export const shopItems=(view:ViewState):readonly (CosmeticSetDefinition|CosmeticDefinition)[]=>shopSection(view)==='sets'?SHOP_COSMETIC_SETS:COSMETIC_CATALOG.filter(item=>item.kind===shopSection(view));
/** Geometry is shared by the renderer, pointer gestures, wheel input, and accessibility hitboxes. */
export function shopListViewport(view:ViewState):Rect|null {
 return view.screen==='shop'&&view.shopTab==='cosmetics'&&!view.shopItemDetail&&!view.cosmeticSetPreview&&!view.confirmation&&!view.accountBlocked?{...SHOP_LIST_RECT}:null;
}
export function shopScrollLimit(view:ViewState):number {return Math.max(0,Math.ceil(shopItems(view).length/2)*(SHOP_CARD_HEIGHT+SHOP_CARD_GAP)-SHOP_CARD_GAP-SHOP_LIST_RECT.h);}
export function shopScrollOffset(view:ViewState):number {const offset=view.shopScroll?.[shopSection(view)]??0;return Math.max(0,Math.min(shopScrollLimit(view),Number.isFinite(offset)?offset:0));}
export function shopCardRect(view:ViewState,index:number):Rect {return {x:SHOP_LIST_RECT.x+index%2*(SHOP_CARD_WIDTH+SHOP_CARD_GAP),y:SHOP_LIST_RECT.y+Math.floor(index/2)*(SHOP_CARD_HEIGHT+SHOP_CARD_GAP)-shopScrollOffset(view),w:SHOP_CARD_WIDTH,h:SHOP_CARD_HEIGHT};}
export interface ShopCard {item:CosmeticSetDefinition|CosmeticDefinition;rect:Rect;hitRect:Rect|null;}
/** Partial cards remain visible; a slice under 44 CSS px at 320 px is deliberately not tappable. */
export function visibleShopCards(view:ViewState):ShopCard[] {
 const viewport=SHOP_LIST_RECT,minHeight=44*1080/320;
 return shopItems(view).flatMap((item,index)=>{const rect=shopCardRect(view,index),top=Math.max(rect.y,viewport.y),bottom=Math.min(rect.y+rect.h,viewport.y+viewport.h);return bottom>top?[{item,rect,hitRect:bottom-top>=minHeight?{x:rect.x,y:top,w:rect.w,h:bottom-top}:null}]:[];});
}
