import type {Point} from '../../domain/types.ts';
import type {DouyinPlatform} from '../../platform/douyin.ts';
import type {PointerEvent} from '../../platform/types.ts';
import {button,CREAM,roundedPath,text} from '../assets.ts';
import {controlContext} from '../control-feedback.ts';
import {hitTestPoint} from '../layout.ts';
import type {ViewState} from '../view-types.ts';
import {drawBoundedPressedOverlay} from './primitives.ts';

/** Approved home-only addition. At a 360px-wide viewport this is 72 × 44px. */
export const DOUYIN_SIDEBAR_RECT=Object.freeze({x:84,y:100,w:216,h:132});
const RESPONSE_TIMEOUT_MS=8000;
type Status='idle'|'checking'|'navigating'|'unavailable'|'failed'|'timeout';
type SidebarPort=Pick<DouyinPlatform,'checkSidebar'|'navigateToSidebar'|'now'|'playSound'>;

function menuVisible(view:ViewState):boolean {
 return view.screen==='menu'&&!view.needsResume&&!view.confirmation&&!view.accountBlocked&&!view.paused&&!view.animation&&!view.toolboxOpen&&!view.toolSelection&&!view.supplyUpgrade&&!(view.developerMode&&view.debug);
}

/** Ephemeral platform UI only: no shared action types, account writes, or rewards. */
export class DouyinSidebar {
 private platform:SidebarPort;
 private getView:()=>ViewState;
 private hidden=false;
 private status:Status='idle';
 private context:string;
 private serial=0;
 private deadline=0;
 private owned=new Set<number>();
 private press:{id:number;start:Point;context:string}|null=null;
 constructor(platform:SidebarPort,getView:()=>ViewState){this.platform=platform;this.getView=getView;this.context=controlContext(getView());}
 private visible():boolean{return !this.hidden&&menuVisible(this.getView());}
 private busy():boolean{return this.status==='checking'||this.status==='navigating';}
 private invalidate(status:Status='idle'):void{this.serial++;this.press=null;this.status=status;}
 /** Refresh after shared input as well as each frame, so leaving and returning
  * between host callbacks cannot resurrect an obsolete sidebar request. */
 refresh():void {
  const context=controlContext(this.getView());
  if(!this.visible()||context!==this.context){this.invalidate();this.context=context;}
  else if(this.busy()&&this.platform.now()>=this.deadline)this.invalidate('timeout');
 }
 hide():void{this.hidden=true;this.invalidate();this.owned.clear();}
 show():void{this.hidden=false;this.invalidate();this.owned.clear();this.context=controlContext(this.getView());}
 /** Only gestures that began on our button are consumed, including their tails
  * after cancellation. The unchanged game input owns every other pointer. */
 pointer(event:PointerEvent):boolean {
  this.refresh();
  if(event.type==='down'){
   if(!this.visible()||!hitTestPoint(event.point,DOUYIN_SIDEBAR_RECT))return false;
   this.owned.add(event.id);
   if(!this.busy()&&!this.press){this.press={id:event.id,start:{...event.point},context:this.context};this.status='idle';}
   return true;
  }
  if(!this.owned.has(event.id))return false;
  if(event.type==='up'||event.type==='cancel')this.owned.delete(event.id);
  const press=this.press;if(!press||press.id!==event.id)return true;
  if(event.type==='move'){
   if(!hitTestPoint(event.point,DOUYIN_SIDEBAR_RECT)||Math.hypot(event.point.x-press.start.x,event.point.y-press.start.y)>14)this.press=null;
   return true;
  }
  this.press=null;
  if(event.type==='up'&&this.visible()&&press.context===this.context&&hitTestPoint(event.point,DOUYIN_SIDEBAR_RECT)&&!this.busy())void this.open();
  return true;
 }
 private current(serial:number):boolean{this.refresh();return serial===this.serial&&this.visible();}
 private async open():Promise<void> {
  const serial=++this.serial;this.status='checking';this.deadline=this.platform.now()+RESPONSE_TIMEOUT_MS;
  if(this.getView().profile?.settings.sound)this.platform.playSound('ui_click');
  let supported=false;try{supported=await this.platform.checkSidebar();}catch{/* Capability failures are a local, retryable result. */}
  if(!this.current(serial))return;
  if(!supported){this.status='unavailable';return;}
  this.status='navigating';this.deadline=this.platform.now()+RESPONSE_TIMEOUT_MS;
  let opened=false;try{opened=await this.platform.navigateToSidebar();}catch{/* Never affect gameplay or account persistence. */}
  if(this.current(serial))this.status=opened?'idle':'failed';
 }
 draw(ctx:CanvasRenderingContext2D):void {
  this.refresh();if(!this.visible())return;
  const r=DOUYIN_SIDEBAR_RECT,cx=r.x+r.w/2;ctx.save();button(ctx,r,'',false);
  if(this.status==='idle'){
   ctx.fillStyle=CREAM;for(let row=0;row<3;row++){roundedPath(ctx,cx-21,r.y+27+row*13,42,6,3);ctx.fill();}
   text(ctx,'侧边栏',cx,r.y+96,32,CREAM,'center',900);
  }else{
   const caption={checking:'检查中…',navigating:'打开中…',unavailable:'暂不可用',failed:'打开失败',timeout:'响应超时'}[this.status];
   text(ctx,caption,cx,r.y+29,24,'#c4d2d6','center',600);
   text(ctx,'侧边栏',cx,r.y+67,32,CREAM,'center',900);
   if(!this.busy())text(ctx,this.status==='unavailable'?'稍后再试':'点此重试',cx,r.y+103,22,'#ffe3a3','center',600);
  }
  if(this.press)drawBoundedPressedOverlay(ctx,r,roundedPath);
  ctx.restore();
 }
}
