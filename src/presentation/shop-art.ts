import {accountCosmeticState} from '../application/cosmetics.ts';
import type {CosmeticDefinition} from '../application/cosmetics.ts';
import {drawCosmeticSetPreview} from './cosmetic-art.ts';
import type {CosmeticPreviewOptions} from './cosmetic-art.ts';
import {cargoBox,forklift,gradient} from './assets.ts';
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
