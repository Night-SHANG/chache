import {MOTION,shipmentTiming} from '../presentation/motion.ts';
import type {Platform,SoundName} from '../platform/types.ts';
import type {RunState,Command,Shipment,Cell,CellTrait} from '../domain/types.ts';
import {CURRENT_RULESET} from '../domain/content.ts';
import type {ViewState} from '../presentation/view-types.ts';
import type {UiAction} from '../presentation/ui-types.ts';
import {createRun,applyCommand,previewPlacement} from '../domain/engine.ts';
import {loadRun,saveRun,preserveCorrupt} from './save.ts';
import {InputController} from '../presentation/input.ts';
import {loadProfile,saveProfile,allocateRun,recordResult,setProfileSettings,setProfileCosmetic,localDailyChallenge,recoverProfile,resetProfile} from './profile.ts';
import type {Profile} from './profile.ts';

export class GameSession {
 state:RunState;
 view:ViewState;
 input:InputController;
 profile:Profile;
 private platform:Platform;
 private animationQueue:{shipment:Shipment;board:Cell[];cellTraits?:(CellTrait|null)[]}[]=[];
 private animationStarted=0;
 private animationCues={move:false,delivery:false};
 private placementStarted=0;
 private invalidStarted=0;
 private noticeStarted=0;
 private lastRouteReady=-Infinity;
 private pendingNotice:{kind:'shift'|'fail';label:string}|null=null;
 private lastTick=0;
 private canResume=false;
 private hasRun=false;
 private settingsReturn:'game'|'menu'='menu';
 constructor(platform:Platform,options:{seed:number;mode:RunState['mode']}){
  this.platform=platform;this.lastTick=platform.now();
  const profile=loadProfile(platform.storage);this.profile=profile.profile;
  const saved=loadRun(platform.storage);
  const firstLesson=!this.profile.tutorialComplete;
  this.state=saved.state??{...createRun(options.seed,firstLesson?'tutorial':'standard',CURRENT_RULESET),maxOccupancy:0};
  this.hasRun=!!saved.state||firstLesson&&(saved.source==='empty'||saved.source==='unavailable');
  this.canResume=!!saved.state;
  this.view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:saved.source==='corrupt'?saved.message:'同类凑够 + 叉车能过去 = 自动出库',saveStatus:saved.source==='unavailable'?saved.message:'每次操作自动保存',elapsed:saved.state?.elapsedMs??0,animation:null,debug:false,needsResume:!!saved.state&&(saved.state.phase!=='result'||saved.source==='backup')||saved.source==='corrupt',recoveryError:saved.source==='corrupt'?saved.message:undefined,screen:this.hasRun||saved.source==='corrupt'?'game':'menu',profile:this.profile,profileStatus:profile.message,profileNeedsRecovery:profile.source==='backup'||profile.source==='corrupt'||profile.source==='unavailable',dailyLabel:this.daily().day,canContinue:this.hasRun&&this.state.phase!=='result',confirmation:null};
  this.input=new InputController({getState:()=>this.state,getView:()=>this.view,patchView:patch=>Object.assign(this.view,patch),preview:(pieceId,origin)=>previewPlacement(this.state,pieceId,origin),dispatch:command=>this.dispatch(command),togglePause:()=>this.togglePause(),restart:()=>this.restart(),resume:()=>this.resume(),toggleDebug:()=>{this.input.cancel();this.view.debug=!this.view.debug;this.view.debugPage=0;},action:action=>this.action(action),feedback:(kind,pieceId)=>this.feedback(kind,pieceId)});
  if(this.hasRun&&!this.view.needsResume){this.ensureSerial();if(this.persist())this.recordFinal();}
 }
 private daily(){return localDailyChallenge(this.platform.wallTime?.()??Date.now(),CURRENT_RULESET);}
 private updateProfile(profile:Profile):void{this.profile=profile;this.view.profile=profile;const saved=saveProfile(this.platform.storage,profile);this.view.profileStatus=saved.message;if(!saved.ok)this.view.profileNeedsRecovery=true;}
 private ensureSerial():void{if(this.state.runSerial)return;const allocated=allocateRun(this.profile);this.state={...this.state,runSerial:allocated.serial};this.updateProfile(allocated.profile);}
 private recordFinal():void{
  if(this.state.phase!=='result')return;
  try{const next=recordResult(this.profile,this.state);if(JSON.stringify(next)!==JSON.stringify(this.profile))this.updateProfile(next);}catch{this.view.profileStatus='本局成绩未写入长期记录，单局存档仍独立保留';this.view.profileNeedsRecovery=true;}
 }
 private sound(name:SoundName):void{if(this.profile.settings.sound)this.platform.playSound(name);}
 private routeCue():void{const now=this.platform.now();if(now-this.lastRouteReady>=200){this.sound('route_ready');this.lastRouteReady=now;}}
 private feedback(kind:'pick'|'routeReady'|'invalid',pieceId?:string):void{
  if(kind==='routeReady'){this.routeCue();return;}
  this.sound(kind);if(kind==='pick')this.view.invalidFx=null;
  if(kind==='invalid'){this.invalidStarted=this.platform.now();this.view.invalidFx=pieceId&&!this.profile.settings.reducedMotion?{pieceId,progress:0}:null;}
 }
 private clearFeedback():void{this.animationQueue=[];this.view.animation=null;this.view.placementFx=null;this.view.invalidFx=null;this.view.noticeFx=null;this.pendingNotice=null;this.platform.stopSounds?.();}
 private startNotice(now:number):void{const notice=this.pendingNotice;this.pendingNotice=null;if(!notice)return;this.sound(notice.kind);this.noticeStarted=now;const duration=notice.kind==='fail'?(this.profile.settings.reducedMotion?MOTION.reduced.failMs:MOTION.failMs):(this.profile.settings.reducedMotion?MOTION.reduced.noticeMs:MOTION.noticeMs);this.view.noticeFx=duration?{...notice,progress:0}:null;}

 dispatch(command:Command):void{
  if(this.view.debug||this.view.paused||this.view.needsResume||this.view.animation||this.view.confirmation||this.view.screen!=='game')return;
  const before=this.state,resolved=applyCommand(before,command);
  if(resolved.error){this.view.message=resolved.error;this.feedback('invalid',command.type==='place'?command.pieceId:undefined);return;}
  this.state=resolved.state;
  if(before.maxOccupancy!==undefined){const placed=resolved.events.find(event=>event.type==='placed');this.state={...this.state,maxOccupancy:Math.max(before.maxOccupancy,before.board.filter(Boolean).length+(placed?.cells.length??0),this.state.board.filter(Boolean).length)};}
  this.hasRun=true;this.canResume=true;this.view.canContinue=this.state.phase!=='result';
  if(this.persist())this.recordFinal();
  const placed=resolved.events.find(event=>event.type==='placed');
  if(placed){this.placementStarted=this.platform.now();this.view.placementFx=this.profile.settings.reducedMotion?null:{cells:placed.cells.slice(),progress:0};this.sound('place');}
  if(resolved.events.some(event=>event.type==='result'&&event.result==='failed'))this.pendingNotice={kind:'fail',label:'暂时放不下了，下一班再来'};
  else if(resolved.events.some(event=>event.type==='shift'))this.pendingNotice={kind:'shift',label:`第 ${before.shift} 班完成 · 进入第 ${this.state.shift} 班`};
  else if(this.state.phase==='result'&&this.state.result==='won'&&this.state.mode!=='tutorial'&&!this.state.overtime)this.pendingNotice={kind:'shift',label:'五班完成，辛苦了！'};
  const board=before.board.slice(),cellTraits=before.cellTraits?.map(trait=>trait?{...trait}:null);
  for(const event of resolved.events){
   if(event.type==='placed'){
    const piece=before.candidates.find(p=>p.id===event.pieceId);
    if(piece)for(const cell of event.cells){board[cell]=piece.cargo;if(cellTraits)cellTraits[cell]=piece.trait?{kind:piece.trait,...(piece.trait==='rush'?{remaining:piece.rushTurns,bornAtCommand:this.state.commandIndex}:{})}:null;}
   }
   if(event.type==='shipment'){
    this.animationQueue.push({shipment:event,board:board.slice(),cellTraits:cellTraits?.map(trait=>trait?{...trait}:null)});
    for(const cell of [...event.cells,...(event.extraClearedCells??[])]){board[cell]=null;if(cellTraits)cellTraits[cell]=null;}
   }
  }
  if(this.animationQueue.length)this.nextAnimation(this.platform.now());else this.startNotice(this.platform.now());
  if(command.type==='upgrade')this.sound('upgrade');
  this.view.message=this.state.phase==='upgrade'?'选择一个升级，继续当前仓库':this.state.lastChain>1?`${this.state.lastChain} 连锁！清出的通路让叉车继续深入`:resolved.events.some(event=>event.type==='shipment')?'订单完成！记得给叉车留条路':'货物已入库，给同类货箱留出连接位置';
  if(resolved.events.some(event=>event.type==='rushExpired'))this.view.message='加急货件已过期变废弃物，可用危险品或扫路清理';
 }
 private persist():boolean{const elapsedMs=Math.floor(this.view.elapsed);if(this.state.elapsedMs!==elapsedMs)this.state={...this.state,elapsedMs};const result=saveRun(this.platform.storage,this.state);this.view.saveStatus=result.message;return result.ok;}
 private nextAnimation(now:number):void{const next=this.animationQueue.shift();this.animationStarted=now;this.animationCues={move:false,delivery:false};this.view.animation=next?{...next,progress:0}:null;if(next)this.routeCue();else this.startNotice(now);}
 tick(now:number):void{
  const delta=Math.max(0,now-this.lastTick);this.lastTick=now;
  if(this.view.screen==='game'&&!this.view.paused&&!this.view.needsResume&&!this.view.confirmation&&this.state.phase!=='result')this.view.elapsed+=delta;
  const reduced=this.profile.settings.reducedMotion;
  if(this.view.placementFx){this.view.placementFx.progress=Math.max(0,Math.min(1,(now-this.placementStarted)/MOTION.placeMs));if(reduced||this.view.placementFx.progress>=1)this.view.placementFx=null;}
  if(this.view.invalidFx){this.view.invalidFx.progress=Math.max(0,Math.min(1,(now-this.invalidStarted)/MOTION.invalidMs));if(reduced||this.view.invalidFx.progress>=1)this.view.invalidFx=null;}
  if(this.view.noticeFx){const duration=this.view.noticeFx.kind==='fail'?(reduced?MOTION.reduced.failMs:MOTION.failMs):(reduced?MOTION.reduced.noticeMs:MOTION.noticeMs);this.view.noticeFx.progress=duration?Math.max(0,Math.min(1,(now-this.noticeStarted)/duration)):1;if(this.view.noticeFx.progress>=1)this.view.noticeFx=null;}
  if(this.view.animation){const timing=shipmentTiming(reduced),elapsed=Math.max(0,now-this.animationStarted),progress=Math.min(1,elapsed/timing.totalMs);this.view.animation.progress=progress;
   if(!this.animationCues.move&&timing.moveMs>0&&elapsed>=timing.routeMs&&elapsed<timing.routeMs+timing.moveMs){this.animationCues.move=true;this.sound('forklift');}
   if(!this.animationCues.delivery&&elapsed>=(reduced?0:timing.routeMs+timing.moveMs+timing.collectMs+timing.carryMs)){this.animationCues.delivery=true;const chain=this.view.animation.shipment.chain;this.sound(chain>=4?'chain4':chain===3?'chain3':chain===2?'chain2':'ship');}
   if(progress>=1)this.nextAnimation(now);
  }

 }
 hide():void{this.input.cancel();this.clearFeedback();this.lastTick=this.platform.now();this.view.paused=!this.view.needsResume&&this.hasRun&&this.state.phase!=='result';if(this.hasRun&&!this.view.needsResume&&this.persist())this.recordFinal();}
 show():void{this.lastTick=this.platform.now();this.view.dailyLabel=this.daily().day;this.view.message='已恢复稳定存档，点继续值班';}
 togglePause():void{this.input.cancel();this.view.paused=!this.view.paused;if(this.view.paused)this.clearFeedback();this.lastTick=this.platform.now();if(this.view.paused&&this.persist())this.recordFinal();}
 resume():void{
  if(!this.canResume&&!this.hasRun){this.view.message='旧档无法读取。请选择新开值班，损坏原文会另存保留';return;}
  const preserved=preserveCorrupt(this.platform.storage);if(!preserved.ok){this.view.saveStatus=preserved.message;return;}
  this.ensureSerial();this.view.needsResume=false;this.view.paused=false;this.view.screen='game';this.lastTick=this.platform.now();this.hasRun=true;this.canResume=true;this.view.canContinue=this.state.phase!=='result';if(this.persist())this.recordFinal();this.view.message='继续上次值班，仓库状态已恢复';
 }
 restart():void{this.action({type:'newRun',mode:'standard'});}
 private start(mode:'standard'|'daily'):void{
  const preserved=preserveCorrupt(this.platform.storage);if(!preserved.ok){this.view.saveStatus=preserved.message;return;}
  const daily=mode==='daily'?this.daily():null;
  const allocated=allocateRun(this.profile,(this.state.runSerial??0)+1);
  const next=createRun(daily?.seed??((this.state.seed+1)>>>0),mode,CURRENT_RULESET);next.runSerial=allocated.serial;next.maxOccupancy=0;if(daily){next.challengeId=daily.id;next.challengeDay=daily.day;}
  this.input.cancel();this.clearFeedback();this.state=next;this.hasRun=true;this.canResume=true;this.lastTick=this.platform.now();this.updateProfile(allocated.profile);
  Object.assign(this.view,{screen:'game',needsResume:false,paused:false,animation:null,elapsed:0,recoveryError:undefined,confirmation:null,canContinue:true,message:daily?`本地每日挑战 ${daily.day} · 北京时间`:'新的一班，给叉车留条路'});this.persist();
 }
 action(action:UiAction):void{
  if(this.view.confirmation&&action.type!=='confirm'&&action.type!=='cancel')return;
  if(action.type==='cancel'){this.view.confirmation=null;return;}
  if(action.type==='confirm'){
   const pending=this.view.confirmation;if(!pending)return;this.view.confirmation=null;
   if(pending.kind==='newRun')this.start(pending.mode??'standard');
   else if(pending.kind==='finishOvertime'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'finishOvertime'});}
   else{
    const reset=resetProfile(this.platform.storage,(this.state.runSerial??0)+1,this.hasRun?this.state:undefined);this.view.profileStatus=reset.message;
    if(reset.ok&&reset.profile){this.profile=reset.profile;this.view.profile=reset.profile;this.view.profileNeedsRecovery=false;}
   }return;
  }
  if(action.type==='newRun'){
   if(this.hasRun&&this.state.phase!=='result'){this.view.confirmation={kind:'newRun',mode:action.mode};return;}
   this.start(action.mode);return;
  }
  if(action.type==='continue'){if(this.hasRun)this.resume();return;}
  if(action.type==='home'){
   this.input.cancel();this.clearFeedback();if(this.hasRun&&!this.view.needsResume&&this.persist())this.recordFinal();this.view.screen='menu';this.view.paused=false;this.view.dailyLabel=this.daily().day;this.view.canContinue=this.hasRun&&this.state.phase!=='result';return;
  }
  if(action.type==='settings'){this.input.cancel();this.clearFeedback();this.settingsReturn=this.view.screen==='menu'?'menu':'game';if(this.settingsReturn==='game')this.view.paused=true;this.view.screen='settings';return;}
  if(action.type==='back'){this.view.screen=this.settingsReturn;return;}
  if(action.type==='toggleSound'){this.updateProfile(setProfileSettings(this.profile,{sound:!this.profile.settings.sound}));if(!this.profile.settings.sound)this.platform.stopSounds?.();return;}
  if(action.type==='toggleMotion'){this.updateProfile(setProfileSettings(this.profile,{reducedMotion:!this.profile.settings.reducedMotion}));return;}
  if(action.type==='cosmetic'){const result=setProfileCosmetic(this.profile,action.kind,action.id);if(result.error){this.view.profileStatus=result.error;return;}this.updateProfile(result.profile);return;}
  if(action.type==='resetProfile'){this.view.confirmation={kind:'resetProfile'};return;}
  if(action.type==='recoverProfile'){const result=recoverProfile(this.platform.storage);this.view.profileStatus=result.message;if(result.ok){const profile=loadProfile(this.platform.storage);this.profile=profile.profile;this.view.profile=this.profile;this.view.profileNeedsRecovery=false;}return;}
  if(action.type==='continueOvertime'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'continueOvertime'});return;}
  if(action.type==='finishOvertime'&&this.state.overtime)this.view.confirmation={kind:'finishOvertime'};
 }
}
