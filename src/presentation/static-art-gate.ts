import type {GameSession} from '../application/session.ts';
import type {PointerEvent,WheelEvent} from '../platform/types.ts';
import {hitTestPoint} from './layout.ts';
import type {Rect} from './layout.ts';
import {COSMETIC_PREVIEW_RECT} from './economy-ui.ts';
import {staticArtRequirementsForView,staticArtCoreRequirementsForView,staticArtWarmKeys} from './static-art-requirements.ts';
import {prepareStaticArt,staticArtStatus,retryStaticArt,staticArtKeysStatus,setStaticArtWarmPaused,warmStaticArt} from './static-art-resources.ts';
import type {StaticArtReadiness,StaticArtRequirements} from './static-art-resources.ts';

export const STATIC_ART_RETRY_RECT:Readonly<Rect>={x:240,y:1100,w:600,h:120};
export const STATIC_ART_BACK_RECT:Readonly<Rect>={x:240,y:1260,w:600,h:120};
const FONT_FAMILY='"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';
interface ReadinessAuthority {readiness(keys:readonly string[]):StaticArtReadiness;setWarmPaused(paused:boolean):void;warm(keys:readonly string[]):void;prepare(value:StaticArtRequirements,core?:StaticArtRequirements):Promise<StaticArtReadiness>;status(value?:StaticArtRequirements):StaticArtReadiness;retry(value:StaticArtRequirements):Promise<StaticArtReadiness>}
const globalAuthority:ReadinessAuthority={readiness:staticArtKeysStatus,setWarmPaused:setStaticArtWarmPaused,warm:warmStaticArt,prepare:prepareStaticArt,status:requirements=>staticArtStatus(requirements!),retry:retryStaticArt};

/** A single visible gate protects startup, equipped-art changes, and the currently drawn shop page. */
export class StaticArtGate {
 private session:GameSession;
 private authority:ReadinessAuthority;
 private requirements:StaticArtRequirements;
 private identity='';
 private visible=true;
 private firstHomePainted=false;
 private allowedPointers=new Set<number>();
 private button:{id:number;action:'retry'|'back'|'preview'}|null=null;
 constructor(session:GameSession,authority:ReadinessAuthority=globalAuthority){this.session=session;this.authority=authority;this.requirements=staticArtRequirementsForView(session.view);}
 refresh():StaticArtReadiness {
  if(!this.visible||!['menu','shop'].includes(this.session.view.screen??''))this.authority.setWarmPaused(true);
  const next=staticArtRequirementsForView(this.session.view),identity=JSON.stringify(next);
  if(identity!==this.identity){this.identity=identity;this.requirements=next;this.cancel();void this.authority.prepare(next,staticArtCoreRequirementsForView(this.session.view));}
  const core=staticArtCoreRequirementsForView(this.session.view);
  return this.authority.readiness([core.scene,...core.shared]);
 }
 isReady():boolean {return this.visible&&this.refresh().status==='ready';}
 tick(now:number):void {this.session.tick(now,!this.isReady());}
 canGoBack():boolean {return this.session.view.screen==='shop';}
 back():void {if(!this.canGoBack())return;this.cancel();this.session.action({type:'back'});this.refresh();}
 pointer(event:PointerEvent):void {
  if(event.type==='cancel'){this.allowedPointers.delete(event.id);if(this.button?.id===event.id)this.button=null;this.session.input.cancel(event.id);return;}
  if(!this.visible)return;
  const status=this.refresh();
  if(status.status==='ready'){
   const view=this.session.view,previewVisible=view.screen==='shop'&&view.shopTab==='cosmetics'&&!view.confirmation&&!view.accountBlocked;
   const previewError=previewVisible&&this.authority.status(this.requirements).status==='error';
   if(this.button?.action==='preview'&&this.button.id!==event.id)return;
   if(this.button?.action==='preview'&&this.button.id===event.id){
    if(!hitTestPoint(event.point,COSMETIC_PREVIEW_RECT)){this.button=null;return;}
    if(event.type==='up'){this.button=null;if(previewError)void this.authority.retry(this.requirements);}return;
   }
   if(event.type==='down'&&previewError&&hitTestPoint(event.point,COSMETIC_PREVIEW_RECT)){if(!this.allowedPointers.size)this.button={id:event.id,action:'preview'};return;}
   // Never turn the release of a loading-screen touch into a gameplay action.
   if(event.type==='down'){this.allowedPointers.add(event.id);this.session.input.down(event.point,event.id,event.pointerType);}
   else if(this.allowedPointers.has(event.id)){this.session.input[event.type](event.point,event.id);if(event.type==='up')this.allowedPointers.delete(event.id);}
   this.refresh();return;
  }
  if(event.type==='down'){
   if(this.button)return;
   if(status.status==='error'&&hitTestPoint(event.point,STATIC_ART_RETRY_RECT))this.button={id:event.id,action:'retry'};
   else if(this.canGoBack()&&hitTestPoint(event.point,STATIC_ART_BACK_RECT))this.button={id:event.id,action:'back'};
  }else if(this.button?.id===event.id){
   const button=this.button,rect=button.action==='retry'?STATIC_ART_RETRY_RECT:STATIC_ART_BACK_RECT;
   if(!hitTestPoint(event.point,rect)){this.button=null;return;}
   if(event.type==='up'){this.button=null;if(button.action==='back')this.back();else if(status.status==='error')void this.authority.retry(this.requirements);}
  }
 }
 wheel(event:WheelEvent):boolean {return this.isReady()?this.session.input.wheel(event.point,event.deltaY):false;}
 hide():void {this.visible=false;this.authority.setWarmPaused(true);this.cancel();}
 show():void {this.visible=true;this.cancel();this.refresh();}
 /** Called only after an actual successful render, never from a readiness probe. */
 didPaint():void {
  const view=this.session.view;
  if(this.visible&&view.screen==='menu')this.firstHomePainted=true;
  const idle=this.visible&&this.firstHomePainted&&(view.screen==='menu'||view.screen==='shop')&&!view.confirmation&&!view.accountBlocked;
  this.authority.setWarmPaused(!idle);
  if(idle)this.authority.warm(staticArtWarmKeys(view));
 }
 private cancel():void {this.allowedPointers.clear();this.button=null;this.session.input.cancel();}
 /** Uses the already-created display surface, simple fills and text. No decoded art or offscreen surfaces. */
 paint(ctx:CanvasRenderingContext2D,overlayBounds?:Rect):boolean {
  const status=this.refresh();if(status.status==='ready')return true;
  const bounds=overlayBounds??{x:0,y:0,w:1080,h:1920};
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#0c131c';ctx.fillRect(bounds.x,bounds.y,bounds.w,bounds.h);
  ctx.fillStyle='#263d50';ctx.fillRect(96,610,888,870);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 46px ${FONT_FAMILY}`;ctx.fillStyle='#ffe8b4';
  ctx.fillText(status.status==='error'?'画面资源加载失败':'正在加载画面资源',540,735,820);
  ctx.font=`28px ${FONT_FAMILY}`;ctx.fillStyle='#d0dedb';ctx.fillText(status.status==='error'?'已保留原有外观与游戏进度，请重试。':`已加载 ${status.loaded} / ${status.total}`,540,835,790);
  if(status.error){ctx.font=`22px ${FONT_FAMILY}`;ctx.fillText(status.error,540,925,790);}
  const button=(rect:Readonly<Rect>,label:string)=>{ctx.fillStyle='#e0bf67';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.fillStyle='#162633';ctx.font=`600 34px ${FONT_FAMILY}`;ctx.fillText(label,rect.x+rect.w/2,rect.y+rect.h/2,rect.w-40);};
  if(status.status==='error')button(STATIC_ART_RETRY_RECT,'重试加载');
  if(this.canGoBack())button(STATIC_ART_BACK_RECT,'返回');
  ctx.restore();return false;
 }
}
