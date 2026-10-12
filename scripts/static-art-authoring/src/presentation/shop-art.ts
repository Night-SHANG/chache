import {classicSetStatus,classicSetDefinition,cosmeticSetStatus,DEFAULT_CLASSIC_SET_SELECTION} from '../application/cosmetic-sets.ts';
import {accountCosmeticState} from '../application/cosmetics.ts';
import type {CosmeticDefinition} from '../application/cosmetics.ts';
import {drawCosmeticSetPreview} from './cosmetic-art.ts';
import type {CosmeticPreviewOptions} from './cosmetic-art.ts';
import {SHOP_LIST_RECT,shopSection,shopScrollOffset,shopScrollLimit,visibleShopCards} from './shop-layout.ts';
import {drawCachedCosmeticComposite} from './cosmetic-preview-cache.ts';
import {cosmeticStatus,cosmeticSetCardStatus} from './economy-ui.ts';
import {cargoBox,forklift,gradient,panel,text} from './assets.ts';
import type {Rect} from './layout.ts';
import type {ViewState} from './view-types.ts';
type Context=CanvasRenderingContext2D;

export function shopItemPreviewOptions(item:CosmeticDefinition,view:ViewState):CosmeticPreviewOptions {
 const appearance=accountCosmeticState(view.account??null,view.profile),options:CosmeticPreviewOptions={category:item.kind,theme:appearance.cosmetics.theme,cargoStyle:appearance.cosmetics.cargo,forklift:appearance.cosmetics.forklift,cargoOutline:appearance.cargoOutline};
 if(item.kind==='theme')options.theme=item.id as typeof options.theme;
 else if(item.kind==='forklift')options.forklift=item.id as typeof options.forklift;
 else if(item.overlay){options.cargoStyle='classic';options.cargoOutline=true;}else options.cargoStyle=item.id as typeof options.cargoStyle;
 return options;
}
/** Catalog art uses the exact board, cargo and vehicle painters used during play. */
export function paintShopItemPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions):void {
 if(options.category==='theme'){drawCosmeticSetPreview(ctx,rect,options);return;}
 ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();
 ctx.fillStyle=gradient(ctx,rect.x,rect.y,rect.h,'#314959','#142633');ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
 const centerX=rect.x+rect.w/2,centerY=rect.y+rect.h/2;
 if(options.category==='forklift')forklift(ctx,centerX-rect.w*.045,centerY,Math.min(rect.w*.76,rect.h*.85),0,options.forklift);
 else{
  const size=Math.min(rect.w*.54,rect.h*.7);cargoBox(ctx,'cargo.food',centerX-size/2,centerY-size/2,size,1,undefined,options.cargoStyle,false,options.cargoOutline);
 }
 ctx.restore();
}
export function drawShopList(ctx:Context,view:ViewState):void {
 const viewport=SHOP_LIST_RECT,cards=visibleShopCards(view),appearance=accountCosmeticState(view.account??null,view.profile);
 ctx.save();ctx.beginPath();ctx.rect(viewport.x,viewport.y,viewport.w,viewport.h);ctx.clip();
 for(const {rect,item}of cards){const equipped='kind'in item?cosmeticStatus(item,view)==='使用中':(item.id==='classic'?classicSetStatus(view.classicSetSelection??DEFAULT_CLASSIC_SET_SELECTION,appearance):cosmeticSetStatus(item,appearance)).equipped;panel(ctx,rect,equipped?'#435245':'#263d50',equipped?'#e0bf67':'#718d98',18);}
 const options:CosmeticPreviewOptions={theme:appearance.cosmetics.theme,cargoStyle:appearance.cosmetics.cargo,forklift:appearance.cosmetics.forklift,cargoOutline:appearance.cargoOutline};
 drawCachedCosmeticComposite(ctx,viewport,options,(target,bounds)=>{
  for(const {item,rect}of cards){const preview={x:rect.x-viewport.x+bounds.x+16,y:rect.y-viewport.y+bounds.y+16,w:rect.w-32,h:230};
   if('kind'in item)paintShopItemPreview(target,preview,shopItemPreviewOptions(item,view));
   else{const classic=item.id==='classic',choice=view.classicSetSelection??DEFAULT_CLASSIC_SET_SELECTION,set=classic?classicSetDefinition(choice):item;drawCosmeticSetPreview(target,preview,{theme:set.theme,cargoStyle:set.cargo,forklift:set.forklift,cargoOutline:classic?choice.cargo==='outline':appearance.cargoOutline});}
  }
 },`shop-list/${shopSection(view)}/${shopScrollOffset(view)}/${JSON.stringify(view.classicSetSelection??DEFAULT_CLASSIC_SET_SELECTION)}/${cards.map(({item})=>'kind'in item?item.key:item.id).join(',')}`);
 for(const {item,rect}of cards){text(ctx,item.name,rect.x+rect.w/2,rect.y+278,item.name.length>5?34:38,'#ffe8b4','center');text(ctx,'kind'in item?cosmeticStatus(item,view):cosmeticSetCardStatus(item,view),rect.x+rect.w/2,rect.y+319,30,'#d0dedb','center');}
 ctx.restore();
 const limit=shopScrollLimit(view);if(limit>0){const track={x:963,y:viewport.y,w:6,h:viewport.h},content=viewport.h+limit,thumb=Math.max(92,viewport.h*viewport.h/content);ctx.fillStyle='#34505f';ctx.fillRect(track.x,track.y,track.w,track.h);ctx.fillStyle='#c7bb8b';ctx.fillRect(track.x,track.y+shopScrollOffset(view)/limit*(track.h-thumb),track.w,thumb);}
}
