import type {PlacementRisk} from './placement-risk.ts';
import {DEBUG_PREVIOUS,DEBUG_NEXT} from './debug-layout.ts';
import type { Command, PlacementPreview, Point, RunState } from '../domain/types.ts';
import type { ViewState } from './view-types.ts';
import { hitTestPoint, L, pointToCell, getTrayRects } from './layout.ts';
import {getUiControls} from './ui.ts';
import type {UiAction} from './ui-types.ts';
import type { Rect } from './layout.ts';
export interface InputPort { getState():RunState;getView():ViewState;patchView(patch:Partial<ViewState>):void;preview(pieceId:string,origin:Point):PlacementPreview;risk?(pieceId:string,origin:Point):PlacementRisk|null;dispatch(command:Command):void;togglePause():void;restart():void;resume():void;toggleDebug():void;action?(action:UiAction):void;feedback?(kind:'pick'|'routeReady'|'invalid',pieceId?:string):void }
/** Both drag/drop and tap/tap end at the same immutable domain command. */
export class InputController {
 private port:InputPort;
 private active:number|null=null;
 private start:Point|null=null;
 private dragging=false;
 private routeReady=false;
 private button:{rect:Rect;act:()=>void}|null=null;
 constructor(port:InputPort){this.port=port;}
 private canPlace():boolean { const v=this.port.getView();return !v.debug&&!v.paused&&!v.needsResume&&!v.animation&&!v.confirmation&&(!v.screen||v.screen==='game')&&this.port.getState().phase==='input'; }
 private captureButton(point:Point,rect:Rect,act:()=>void):boolean { if(!hitTestPoint(point,rect))return false;this.button={rect,act};return true; }
 down(point:Point,id=0):void {
  if(this.active!==null)return;
  this.active=id;this.start=point;this.dragging=false;this.button=null;this.routeReady=false;
  const v=this.port.getView(),s=this.port.getState();
  if(v.confirmation||!v.needsResume&&v.profile&&(v.screen!==undefined&&v.screen!=='game'||v.paused||s.phase==='result')){const control=getUiControls(s,v).find(c=>!c.disabled&&hitTestPoint(point,c.rect));if(control)this.button={rect:control.rect,act:()=>this.port.action?.(control.action)};return;}
  if(v.needsResume){if(!this.captureButton(point,L.resume,()=>this.port.resume())&&!this.captureButton(point,L.restart,()=>this.port.restart()))this.captureButton(point,L.recoveryMenu,()=>this.port.action?.({type:'home'}));return;}
  if(v.paused){if(!this.captureButton(point,L.resume,()=>this.port.togglePause())&&!this.captureButton(point,L.restart,()=>this.port.restart()))this.captureButton(point,L.pause,()=>this.port.togglePause());return;}
  if(v.debug){
   if(!this.captureButton(point,L.debug,()=>this.port.toggleDebug())&&!this.captureButton(point,DEBUG_PREVIOUS,()=>this.port.patchView({debugPage:Math.max(0,(v.debugPage??0)-1)})))this.captureButton(point,DEBUG_NEXT,()=>this.port.patchView({debugPage:(v.debugPage??0)+1}));return;
  }
  if(v.animation)return;
  if(s.phase==='result'){this.captureButton(point,L.restart,()=>this.port.restart());return;}
  if(s.phase==='upgrade'){
   const index=L.upgradeRects.findIndex(rect=>hitTestPoint(point,rect));
   if(index>=0&&s.upgradeChoices[index])this.button={rect:L.upgradeRects[index],act:()=>this.port.dispatch({type:'upgrade',upgradeId:s.upgradeChoices[index]})};return;
  }
  if(this.captureButton(point,L.pause,()=>this.port.togglePause())||this.captureButton(point,L.debug,()=>this.port.toggleDebug()))return;
  const index=getTrayRects(s.candidates.length).findIndex(rect=>hitTestPoint(point,rect));
  if(index>=0&&s.candidates[index]){this.port.patchView({selectedPieceId:s.candidates[index].id,preview:null,hoverOrigin:null,placementRisk:null});this.port.feedback?.('pick',s.candidates[index].id);}
  else this.updatePreview(point,false);
 }
 private updatePreview(point:Point,dragging:boolean):void {
  const pieceId=this.port.getView().selectedPieceId;
  if(!pieceId||!this.canPlace())return;
  const origin=pointToCell(point,this.port.getState());
  const preview=origin?this.port.preview(pieceId,origin):null,ready=!!preview?.valid&&preview.shipments.length>0;if(ready&&!this.routeReady)this.port.feedback?.('routeReady',pieceId);this.routeReady=ready;
  this.port.patchView({dragPoint:dragging?point:null,hoverOrigin:origin,preview,placementRisk:preview?.valid&&origin?this.port.risk?.(pieceId,origin)??null:null});
 }
 move(point:Point,id=0):void {
  if(this.active!==id||this.button||!this.start)return;
  if(!this.canPlace()){this.cancel();return;}
  if(Math.hypot(point.x-this.start.x,point.y-this.start.y)>14)this.dragging=true;
  this.updatePreview(point,this.dragging);
 }
 up(point:Point,id=0):void {
  if(this.active!==id)return;
  const button=this.button;this.active=null;this.button=null;this.start=null;
  if(button){if(hitTestPoint(point,button.rect))button.act();return;}
  const pieceId=this.port.getView().selectedPieceId,origin=pointToCell(point,this.port.getState());
  if(pieceId&&origin&&this.canPlace()){
   const preview=this.port.preview(pieceId,origin);
   if(preview.valid){this.port.dispatch({type:'place',pieceId,origin});this.port.patchView({selectedPieceId:null});}
   else{this.port.patchView({message:preview.reason||'这里放不下，换个位置试试'});this.port.feedback?.('invalid',pieceId);}
  }else if(this.dragging){this.port.patchView({selectedPieceId:null});if(pieceId)this.port.feedback?.('invalid',pieceId);}
  this.dragging=false;
  this.port.patchView({dragPoint:null,hoverOrigin:null,preview:null,placementRisk:null});
 }
 cancel(id?:number):void {if(id!==undefined&&this.active!==id)return;this.active=null;this.start=null;this.button=null;this.dragging=false;this.port.patchView({dragPoint:null,hoverOrigin:null,preview:null,selectedPieceId:null,placementRisk:null});}
}
