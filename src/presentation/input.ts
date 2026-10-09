import {isInboundRun,isToolRun,isOutboundToolsRun} from '../domain/playable.ts';
import {toolboxVisible} from './economy-ui.ts';
import type {PlacementRisk} from './placement-risk.ts';
import {DEBUG_PREVIOUS,DEBUG_NEXT} from './debug-layout.ts';
import type { Point } from '../domain/types.ts';
import type {GameRun,GameCommand,PlayablePreview} from '../domain/playable.ts';
import type { ViewState } from './view-types.ts';
import { hitTestPoint, L, pointToCell, getTrayRects } from './layout.ts';
import {getUiControls} from './ui.ts';
import type {UiAction} from './ui-types.ts';
import type { Rect } from './layout.ts';
import {shopListViewport,shopScrollLimit,shopSection} from './shop-layout.ts';
export interface InputPort { getState():GameRun;getView():ViewState;patchView(patch:Partial<ViewState>):void;preview(pieceId:string,origin:Point):PlayablePreview;risk?(pieceId:string,origin:Point):PlacementRisk|null;dispatch(command:GameCommand):void;togglePause():void;restart():void;resume():void;toggleDebug():void;action?(action:UiAction):void;feedback?(kind:'pick'|'routeReady'|'invalid',pieceId?:string):void }
/** Both drag/drop and tap/tap end at the same immutable domain command. */
export class InputController {
 private port:InputPort;
 private active:number|null=null;
 private start:Point|null=null;
 private dragging=false;
 private routeReady=false;
 private button:{rect:Rect;act:()=>void}|null=null;
 private shopGesture:{last:Point;section:ReturnType<typeof shopSection>}|null=null;
 constructor(port:InputPort){this.port=port;}
 private canPlace():boolean { const v=this.port.getView();return !v.practice?.completed&&!(v.developerMode&&v.debug)&&!v.paused&&!v.needsResume&&!v.animation&&!v.confirmation&&!v.accountBlocked&&!v.toolSelection&&!toolboxVisible(this.port.getState(),v)&&!v.supplyUpgrade&&(!v.screen||v.screen==='game')&&this.port.getState().phase==='input'; }
 private captureButton(point:Point,rect:Rect,act:()=>void):boolean { if(!hitTestPoint(point,rect))return false;this.button={rect,act};return true; }
 down(point:Point,id=0):void {
  if(this.active!==null)return;
  this.active=id;this.start=point;this.dragging=false;this.button=null;this.routeReady=false;this.shopGesture=null;
  const v=this.port.getView(),s=this.port.getState();
  const shopViewport=shopListViewport(v);
  if(shopViewport&&hitTestPoint(point,shopViewport)){
   this.shopGesture={last:point,section:shopSection(v)};
   const control=getUiControls(s,v).find(c=>!c.disabled&&hitTestPoint(point,c.rect));
   if(control)this.button={rect:control.rect,act:()=>this.port.action?.(control.action)};
   return;
  }
  if(v.practice){const control=getUiControls(s,v).find(c=>!c.disabled&&hitTestPoint(point,c.rect));if(control){this.button={rect:control.rect,act:()=>this.port.action?.(control.action)};return;}if(v.practice.completed||v.paused||s.phase==='cleanup')return;}
  if(v.accountBlocked){const c=getUiControls(s,v).find(c=>hitTestPoint(point,c.rect));if(c)this.button={rect:c.rect,act:()=>this.port.action?.(c.action)};return;}
  if(v.supplyUpgrade||v.confirmation||!v.needsResume&&v.profile&&(v.screen!==undefined&&v.screen!=='game'||v.paused||s.phase==='result')){const control=getUiControls(s,v).find(c=>!c.disabled&&hitTestPoint(point,c.rect));if(control)this.button={rect:control.rect,act:()=>this.port.action?.(control.action)};return;}
  if(v.needsResume){if(!this.captureButton(point,L.resume,()=>this.port.resume())&&!this.captureButton(point,L.restart,()=>this.port.restart()))this.captureButton(point,L.recoveryMenu,()=>this.port.action?.({type:'home'}));return;}
  if(v.paused){if(!this.captureButton(point,L.resume,()=>this.port.togglePause())&&!this.captureButton(point,L.restart,()=>this.port.restart()))this.captureButton(point,L.pause,()=>this.port.togglePause());return;}
  if(v.developerMode&&v.debug){
   if(!this.captureButton(point,L.debug,()=>this.port.toggleDebug())&&!this.captureButton(point,DEBUG_PREVIOUS,()=>this.port.patchView({debugPage:Math.max(0,(v.debugPage??0)-1)})))this.captureButton(point,DEBUG_NEXT,()=>this.port.patchView({debugPage:(v.debugPage??0)+1}));return;
  }
  if(v.animation)return;
  if(s.phase==='result'){this.captureButton(point,L.restart,()=>this.port.restart());return;}
  if(!v.practice&&this.captureButton(point,L.pause,()=>this.port.togglePause())||!v.practice&&v.developerMode&&!v.toolSelection&&s.phase!=='rescue'&&this.captureButton(point,L.debug,()=>this.port.toggleDebug()))return;
  if(v.toolSelection){const c=getUiControls(s,v).find(c=>!c.disabled&&hitTestPoint(point,c.rect));if(c){this.button={rect:c.rect,act:()=>this.port.action?.(c.action)};return;}const origin=pointToCell(point,s);if(v.toolSelection.item==='clear'&&origin){const cell=origin.y*Math.sqrt(s.board.length)+origin.x;this.button={rect:{x:point.x-20,y:point.y-20,w:40,h:40},act:()=>this.port.action?.({type:'toolCell',cell})};}else{const i=getTrayRects(s.candidates.length,true).findIndex(r=>hitTestPoint(point,r));if(i>=0)this.button={rect:getTrayRects(s.candidates.length,true)[i],act:()=>this.port.action?.({type:'toolPiece',pieceId:s.candidates[i].id})};}return;}
  if(isInboundRun(s)&&['upgrade','cleanup'].includes(s.phase)||isToolRun(s)&&s.phase==='rescue'){const c=getUiControls(s,v).find(c=>!c.disabled&&hitTestPoint(point,c.rect));if(c)this.button={rect:c.rect,act:()=>this.port.action?.(c.action)};return;}
  if(s.phase==='upgrade'){
   if(s.rulesetVersion===10||isOutboundToolsRun(s))return;
   const index=L.upgradeRects.findIndex(rect=>hitTestPoint(point,rect));
   if(index>=0&&s.upgradeChoices[index])this.button={rect:L.upgradeRects[index],act:()=>this.port.dispatch({type:'upgrade',upgradeId:s.upgradeChoices[index]})};return;
  }
  const activeControl=getUiControls(s,v).find(control=>!control.disabled&&hitTestPoint(point,control.rect));if(activeControl){this.button={rect:activeControl.rect,act:()=>this.port.action?.(activeControl.action)};return;}
  if(toolboxVisible(s,v))return;
  const index=getTrayRects(s.candidates.length).findIndex(rect=>hitTestPoint(point,rect));
  if(index>=0&&s.candidates[index]){this.port.patchView({selectedPieceId:s.candidates[index].id,preview:null,hoverOrigin:null,placementRisk:null});this.port.feedback?.('pick',s.candidates[index].id);}
  else this.updatePreview(point,false);
 }
 private updatePreview(point:Point,dragging:boolean):void {
  const pieceId=this.port.getView().selectedPieceId;
  if(!pieceId||!this.canPlace())return;
  const origin=pointToCell(point,this.port.getState());
  const guide=this.port.getView().guide;if(guide?.selectedPieceId&&guide.selectedPieceId!==pieceId)return;
  const preview=origin?this.port.preview(pieceId,origin):null,ready=!!preview?.valid&&preview.shipments.length>0;if(ready&&!this.routeReady)this.port.feedback?.('routeReady',pieceId);this.routeReady=ready;
  this.port.patchView({dragPoint:dragging?point:null,hoverOrigin:origin,preview,placementRisk:preview?.valid&&origin?this.port.risk?.(pieceId,origin)??null:null});
 }
 move(point:Point,id=0):void {
  if(this.active!==id||!this.start)return;
  if(this.shopGesture){
   if(!this.validShopGesture()||!hitTestPoint(point,{x:0,y:0,w:L.width,h:L.height})){this.cancel(id);return;}
   const deltaY=this.shopGesture.last.y-point.y;this.shopGesture.last=point;
   if(Math.hypot(point.x-this.start.x,point.y-this.start.y)>14){this.dragging=true;this.button=null;}
   if(this.dragging&&deltaY!==0&&shopScrollLimit(this.port.getView())>0)this.port.action?.({type:'scrollShop',deltaY});
   return;
  }
  if(this.button)return;
  if(!this.canPlace()){this.cancel();return;}
  if(Math.hypot(point.x-this.start.x,point.y-this.start.y)>14)this.dragging=true;
  this.updatePreview(point,this.dragging);
 }
 up(point:Point,id=0):void {
  if(this.active!==id)return;
  if(this.shopGesture){
   const button=this.button,viewport=shopListViewport(this.port.getView()),tap=this.validShopGesture()&&!this.dragging&&!!this.start&&Math.hypot(point.x-this.start.x,point.y-this.start.y)<=14;
   this.active=null;this.button=null;this.start=null;this.shopGesture=null;this.dragging=false;
   if(tap&&button&&viewport&&hitTestPoint(point,viewport)&&hitTestPoint(point,button.rect))button.act();
   return;
  }
  const button=this.button;this.active=null;this.button=null;this.start=null;
  if(button){if(hitTestPoint(point,button.rect))button.act();return;}
  const pieceId=this.port.getView().selectedPieceId,origin=pointToCell(point,this.port.getState());
  if(pieceId&&origin&&this.canPlace()){
   const preview=this.port.preview(pieceId,origin);
   const guide=this.port.getView().guide,allowed=!guide?.allowedOrigins||((!guide.selectedPieceId||guide.selectedPieceId===pieceId)&&guide.allowedOrigins.some(p=>p.x===origin.x&&p.y===origin.y));
   if(preview.valid&&allowed){this.port.dispatch({type:'place',pieceId,origin});this.port.patchView({selectedPieceId:null});}
   else{this.port.patchView({message:!allowed?this.port.getView().practice?'请放到提示格，或退出练习':'请放到提示格，或跳过引导':preview.reason||'这里放不下，换个位置试试'});this.port.feedback?.('invalid',pieceId);}
  }else if(this.dragging){this.port.patchView({selectedPieceId:null});if(pieceId)this.port.feedback?.('invalid',pieceId);}
  this.dragging=false;
  this.port.patchView({dragPoint:null,hoverOrigin:null,preview:null,placementRisk:null});
 }
 private validShopGesture():boolean {const view=this.port.getView();return !!this.shopGesture&&!!shopListViewport(view)&&this.shopGesture.section===shopSection(view);}
 wheel(point:Point,deltaY:number):boolean {
  const view=this.port.getView(),viewport=shopListViewport(view);
  if(!viewport||!hitTestPoint(point,viewport)||!Number.isFinite(deltaY)||deltaY===0||shopScrollLimit(view)<=0||!this.port.action)return false;
  if(this.shopGesture){this.dragging=true;this.button=null;}
  this.port.action({type:'scrollShop',deltaY});return true;
 }
 cancel(id?:number):void {if(id!==undefined&&this.active!==id)return;this.active=null;this.start=null;this.button=null;this.shopGesture=null;this.dragging=false;this.port.patchView({dragPoint:null,hoverOrigin:null,preview:null,selectedPieceId:null,placementRisk:null});}
}
