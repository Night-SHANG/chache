import {placementRisk} from '../presentation/placement-risk.ts';
import {MOTION,shipmentTiming} from '../presentation/motion.ts';
import type {Platform,SoundName} from '../platform/types.ts';
import type {RunState,Command,Shipment,Cell,CellTrait,ColorTier,OutboundDifficulty} from '../domain/types.ts';
import {CURRENT_RULESET,COLOR_EXIT_RULESET} from '../domain/content.ts';
import type {ViewState} from '../presentation/view-types.ts';
import type {UiAction} from '../presentation/ui-types.ts';
import {createRun,applyCommand,previewPlacement} from '../domain/engine.ts';
import {loadRun,saveRun,preserveCorrupt} from './save.ts';
import {closeRun,loadPlayableRun,closedSerialFloor} from './run-lifecycle.ts';
import {RUN_SLOTS,isRunSlot,slotForTier,tierForSlot,slotForDifficulty,difficultyForSlot,outboundRulesForSlot} from './run-slots.ts';
import type {RunSlot} from './run-slots.ts';
import {pieceCellCargo} from '../domain/pieces.ts';
import {isColorTier} from '../domain/v5/content.ts';
import {isOutboundDifficulty} from '../domain/v6/content.ts';
export const ACTIVE_SLOT_KEY='warehouse.active-mode.v1';
export const COMPARISON_SEED_KEY='warehouse.color_exit.compare_seed.v1';
function createForSlot(seed:number,slot:RunSlot,orderMode:'standard'|'daily'|'tutorial'='standard'):RunState{
 const difficulty=difficultyForSlot(slot),tier=tierForSlot(slot);
 if(difficulty)return createRun(seed,'color_exit',outboundRulesForSlot(slot)!,difficulty);
 if(slot==='inbound_endless')return createRun(seed,'endless',7);
 return createRun(seed,slot==='orders'?orderMode:'color_exit',tier?5:slot==='color_exit'?COLOR_EXIT_RULESET:CURRENT_RULESET,tier);
}
const colorSlot=(slot:RunSlot):boolean=>slot!=='orders'&&slot!=='inbound_endless';
import {InputController} from '../presentation/input.ts';
import {loadProfile,saveProfile,allocateRun,recordResult,setProfileSettings,setProfileCosmetic,localDailyChallenge,recoverProfile,resetProfile} from './profile.ts';
import type {Profile} from './profile.ts';

export class GameSession {
 state:RunState;
 view:ViewState;
 input:InputController;
 profile:Profile;
 private platform:Platform;
 private newRunSeedBase:number;
 private slot:RunSlot='orders';
 private recoveryPending=false;
 private closureUncertain=false;
 private profileReadBlocked=false;
 private profileDirty=false;
 private helpPaused=false;
 private messageExpiresAt=0;
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
 private settingsReturn:'game'|'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'='menu';
 constructor(platform:Platform,options:{seed:number;mode:RunState['mode'];developerMode?:boolean}){
  this.platform=platform;this.newRunSeedBase=options.seed>>>0;this.lastTick=platform.now();
  const profile=loadProfile(platform.storage);this.profile=profile.profile;this.profileReadBlocked=profile.source==='unavailable';
  try{const remembered=platform.storage.get(ACTIVE_SLOT_KEY);this.slot=isRunSlot(remembered)?remembered:options.mode==='color_exit'?'color_exit':'orders';}catch{/* Default to the original slot without erasing an inaccessible selector. */}
  const saved=loadPlayableRun(platform.storage,this.slot);this.recoveryPending=saved.source==='backup'||saved.source==='corrupt'||saved.source==='unavailable';
  const firstLesson=!this.profileReadBlocked&&this.slot==='orders'&&!this.profile.tutorialComplete;
  this.state=saved.state??{...createForSlot(options.seed,this.slot,firstLesson?'tutorial':'standard'),maxOccupancy:0};
  this.hasRun=!!saved.state||firstLesson&&saved.source==='empty'&&!saved.closed;
  this.canResume=!!saved.state;
  this.view={developerMode:options.developerMode===true,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:saved.source==='unavailable'?saved.message:'每次操作自动保存',elapsed:saved.state?.elapsedMs??0,animation:null,debug:false,needsResume:!!saved.state&&(saved.state.phase!=='result'||saved.source==='backup')||saved.source==='corrupt'||saved.source==='unavailable',recoveryError:saved.source==='corrupt'||saved.source==='unavailable'?saved.message:undefined,screen:this.hasRun||saved.source==='corrupt'?'game':'menu',profile:this.profile,profileStatus:profile.message,profileNeedsRecovery:profile.source==='backup'||profile.source==='corrupt'||profile.source==='unavailable',dailyLabel:this.daily().day,canContinue:this.hasRun&&this.state.phase!=='result',confirmation:null,variant:this.slot};
  this.view.comparisonSeed=options.seed>>>0;try{const raw=platform.storage.get(COMPARISON_SEED_KEY);if(raw!==null&&/^\d+$/.test(raw)){const seed=Number(raw);if(Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff)this.view.comparisonSeed=seed;}}catch{/* A missing preference never changes run saves. */}
  this.refreshSlots();
  this.input=new InputController({getState:()=>this.state,getView:()=>this.view,patchView:patch=>Object.assign(this.view,patch),preview:(pieceId,origin)=>previewPlacement(this.state,pieceId,origin),risk:(pieceId,origin)=>placementRisk(this.state,pieceId,origin),dispatch:command=>this.dispatch(command),togglePause:()=>this.togglePause(),restart:()=>this.restart(),resume:()=>this.resume(),toggleDebug:()=>{this.input.cancel();this.view.debug=!this.view.debug;this.view.debugPage=0;},action:action=>this.action(action),feedback:(kind,pieceId)=>this.feedback(kind,pieceId)});
  if(this.hasRun&&!this.view.needsResume&&this.ensureSerial()){if(this.persist())this.recordFinal();}
 }
 private daily(){return localDailyChallenge(this.platform.wallTime?.()??Date.now(),CURRENT_RULESET);}
 private ensureProfileReadable():boolean{
  if(!this.profileReadBlocked)return true;const loaded=loadProfile(this.platform.storage);
  if(loaded.source==='unavailable'||loaded.source==='corrupt'){this.view.profileStatus=loaded.message;this.view.profileNeedsRecovery=true;return false;}
  this.profile=loaded.profile;this.view.profile=this.profile;this.profileReadBlocked=false;this.view.profileNeedsRecovery=loaded.source==='backup';this.view.profileStatus=loaded.message;return true;
 }
 private updateProfile(profile:Profile):void{if(this.profileReadBlocked){this.view.profileStatus='长期记录尚未读回，未写入默认数据';return;}this.profile=profile;this.view.profile=profile;const saved=saveProfile(this.platform.storage,profile);this.view.profileStatus=saved.message;this.profileDirty=!saved.ok;if(!saved.ok)this.view.profileNeedsRecovery=true;}
 private serialFloor():number|null{
  if(!this.ensureProfileReadable())return null;
  const closed=closedSerialFloor(this.platform.storage);if(!closed.ok){this.view.saveStatus=closed.message;return null;}
  const runs=RUN_SLOTS.map(slot=>loadRun(this.platform.storage,slot));
  if(runs.some(run=>run.source==='unavailable')){this.view.saveStatus='无法读取另一模式进度，暂不分配新局';return null;}
  return Math.max(1,closed.floor+1,(this.state.runSerial??0)+1,...runs.map(run=>(run.state?.runSerial??0)+1));
 }
 private refreshSlots():void{const status=(slot:RunSlot)=>{const loaded=loadPlayableRun(this.platform.storage,slot);return loaded.state?loaded.state.phase==='result'?'result' as const:'saved' as const:loaded.source==='corrupt'?'corrupt' as const:loaded.source==='unavailable'?'unavailable' as const:'empty' as const;};this.view.modeSlots=Object.fromEntries(RUN_SLOTS.map(slot=>[slot,status(slot)]));this.view.variant=this.slot;}
 private setActiveSlot(slot:RunSlot):boolean{
  let previous:string|null=null,changed=false;
  try{previous=this.platform.storage.get(ACTIVE_SLOT_KEY);this.platform.storage.set(ACTIVE_SLOT_KEY,slot);changed=true;if(this.platform.storage.get(ACTIVE_SLOT_KEY)!==slot)throw Error('readback');return true;}
  catch{if(changed){try{if(previous===null)this.platform.storage.remove(ACTIVE_SLOT_KEY);else this.platform.storage.set(ACTIVE_SLOT_KEY,previous);}catch{/* Both independent run snapshots remain safe even if the selector cannot be restored. */}}this.view.saveStatus='模式切换保存失败，当前进度仍保留';return false;}
 }
 private ensureSerial():boolean{
  if(this.state.runSerial)return true;const floor=this.serialFloor();if(floor===null){this.view.needsResume=true;return false;}
  const allocated=allocateRun(this.profile,floor);this.state={...this.state,runSerial:allocated.serial};this.updateProfile(allocated.profile);return true;
 }
 private recordFinal(run:RunState=this.state):boolean{
  if(run.phase!=='result')return true;if(!this.ensureProfileReadable())return false;
  try{const next=recordResult(this.profile,run);if(JSON.stringify(next)!==JSON.stringify(this.profile)||this.profileDirty)this.updateProfile(next);return !this.profileDirty;}
  catch{this.view.profileStatus='本局成绩未写入长期记录，单局存档仍独立保留';this.view.profileNeedsRecovery=true;return false;}
 }
 private sound(name:SoundName):void{if(this.profile.settings.sound)this.platform.playSound(name);}
 private routeCue():void{const now=this.platform.now();if(now-this.lastRouteReady>=200){this.sound('route_ready');this.lastRouteReady=now;}}
 private feedback(kind:'pick'|'routeReady'|'invalid',pieceId?:string):void{
  if(kind==='routeReady'){this.routeCue();return;}
  this.sound(kind);if(kind==='pick'){this.view.invalidFx=null;this.view.message='';this.messageExpiresAt=0;}
  if(kind==='invalid'){this.messageExpiresAt=this.platform.now()+1800;this.invalidStarted=this.platform.now();this.view.invalidFx=pieceId&&!this.profile.settings.reducedMotion?{pieceId,progress:0}:null;}
 }
 private clearFeedback():void{this.animationQueue=[];this.view.animation=null;this.view.placementFx=null;this.view.invalidFx=null;this.view.noticeFx=null;this.pendingNotice=null;this.view.message='';this.messageExpiresAt=0;this.platform.stopSounds?.();}
 private startNotice(now:number):void{const notice=this.pendingNotice;this.pendingNotice=null;if(!notice)return;this.sound(notice.kind);this.noticeStarted=now;const duration=notice.kind==='fail'?(this.profile.settings.reducedMotion?MOTION.reduced.failMs:MOTION.failMs):(this.profile.settings.reducedMotion?MOTION.reduced.noticeMs:MOTION.noticeMs);this.view.noticeFx=duration?{...notice,progress:0}:null;}

 dispatch(command:Command):void{
  if(this.recoveryPending||this.view.developerMode&&this.view.debug||this.view.paused||this.view.needsResume||this.view.animation||this.view.confirmation||this.view.screen!=='game')return;
  const before=this.state,resolved=applyCommand(before,command);
  if(resolved.error){this.view.message=resolved.error;this.feedback('invalid',command.type==='place'?command.pieceId:undefined);return;}
  this.state=resolved.state;
  if(before.maxOccupancy!==undefined){const placed=resolved.events.find(event=>event.type==='placed');this.state={...this.state,maxOccupancy:Math.max(before.maxOccupancy,before.board.filter(Boolean).length+(placed?.cells.length??0),this.state.board.filter(Boolean).length)};}
  this.hasRun=true;this.canResume=true;this.view.canContinue=this.state.phase!=='result';
  if(this.persist())this.recordFinal();
  const placed=resolved.events.find(event=>event.type==='placed');
  if(placed){this.placementStarted=this.platform.now();this.view.placementFx=this.profile.settings.reducedMotion?null:{cells:placed.cells.slice(),progress:0};this.sound('place');}
  if(resolved.events.some(event=>event.type==='result'&&event.result==='failed'))this.pendingNotice={kind:'fail',label:this.state.rulesetVersion===8&&this.state.board[76]!==null?'入口堵塞':'放不下了'};
  else if(this.state.mode!=='color_exit'&&resolved.events.some(event=>event.type==='shift'))this.pendingNotice={kind:'shift',label:`第 ${this.state.shift} 班`};
  else if(this.state.phase==='result'&&this.state.result==='won'&&this.state.mode!=='tutorial'&&this.state.mode!=='endless'&&!this.state.overtime)this.pendingNotice={kind:'shift',label:this.state.mode==='color_exit'?'目标完成':'五班完成'};
  const board=before.board.slice(),cellTraits=before.cellTraits?.map(trait=>trait?{...trait}:null);
  for(const event of resolved.events){
   if(event.type==='placed'){
    const piece=before.candidates.find(p=>p.id===event.pieceId);
    if(piece)for(const [offset,cell] of event.cells.entries()){board[cell]=pieceCellCargo(piece,offset);if(cellTraits)cellTraits[cell]=piece.trait?{kind:piece.trait,...(piece.trait==='rush'?{remaining:piece.rushTurns,bornAtCommand:this.state.commandIndex}:{})}:null;}
   }
   if(event.type==='shipment'){
    this.animationQueue.push({shipment:event,board:board.slice(),cellTraits:cellTraits?.map(trait=>trait?{...trait}:null)});
    for(const cell of [...event.cells,...(event.extraClearedCells??[])]){board[cell]=null;if(cellTraits)cellTraits[cell]=null;}
   }
  }
  if(this.animationQueue.length)this.nextAnimation(this.platform.now());else this.startNotice(this.platform.now());
  if(command.type==='upgrade')this.sound('upgrade');
  this.view.message=resolved.events.some(event=>event.type==='rushExpired')?'加急过期':'';this.messageExpiresAt=this.view.message?this.platform.now()+1800:0;
 }
 private persist():boolean{if(this.recoveryPending){this.view.saveStatus='此模式需先恢复存档，旧文件仍保留';return false;}const elapsedMs=Math.floor(this.view.elapsed);if(this.state.elapsedMs!==elapsedMs)this.state={...this.state,elapsedMs};const result=saveRun(this.platform.storage,this.state,this.slot);this.view.saveStatus=result.message;return result.ok;}
 private nextAnimation(now:number):void{const next=this.animationQueue.shift();this.animationStarted=now;this.animationCues={move:false,delivery:false};this.view.animation=next?{...next,progress:0}:null;if(next)this.routeCue();else this.startNotice(now);}
 tick(now:number):void{
  const delta=Math.max(0,now-this.lastTick);this.lastTick=now;
  if(this.view.confirmation){this.animationStarted+=delta;this.placementStarted+=delta;this.invalidStarted+=delta;this.noticeStarted+=delta;if(this.messageExpiresAt)this.messageExpiresAt+=delta;return;}
  if(this.view.screen==='game'&&!this.view.paused&&!this.view.needsResume&&!this.view.confirmation&&this.state.phase!=='result')this.view.elapsed+=delta;
  if(this.messageExpiresAt&&now>=this.messageExpiresAt){this.view.message='';this.messageExpiresAt=0;}
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
 show():void{this.lastTick=this.platform.now();this.view.dailyLabel=this.daily().day;this.view.message='';}
 togglePause():void{this.input.cancel();this.view.paused=!this.view.paused;if(this.view.paused)this.clearFeedback();this.lastTick=this.platform.now();if(this.view.paused&&this.persist())this.recordFinal();}
 resume():void{
  if(this.closureUncertain||this.view.needsResume&&(!this.hasRun||!this.canResume||!!this.view.recoveryError)){
   const loaded=loadPlayableRun(this.platform.storage,this.slot);
   if(loaded.closed){this.closureUncertain=false;this.openSelection('menu');return;}
   if(!loaded.state||loaded.source==='unavailable'||loaded.source==='corrupt'){this.view.saveStatus=loaded.message;this.view.recoveryError=loaded.message;return;}
   this.state=loaded.state;this.view.elapsed=loaded.state.elapsedMs??0;this.hasRun=true;this.canResume=true;this.closureUncertain=false;this.view.recoveryError=undefined;
  }
  if(!this.canResume&&!this.hasRun){this.view.message='旧档无法读取。请选择新开值班，损坏原文会另存保留';return;}
  const preserved=preserveCorrupt(this.platform.storage,this.slot);if(!preserved.ok){this.view.saveStatus=preserved.message;return;}
  this.recoveryPending=false;
  if(!this.ensureSerial())return;this.view.needsResume=false;this.view.paused=false;this.view.screen='game';this.lastTick=this.platform.now();this.hasRun=true;this.canResume=true;this.view.canContinue=this.state.phase!=='result';if(this.persist())this.recordFinal();this.view.message='';
 }
 restart():void{if(this.state.mode==='color_exit'&&this.state.rulesetVersion<8){this.navigateSelection('colorTiers');return;}this.action({type:'newRun',mode:this.state.mode==='color_exit'?'color_exit':this.state.mode==='endless'?'endless':this.state.mode==='daily'?'daily':'standard',colorTier:tierForSlot(this.slot),difficultyId:difficultyForSlot(this.slot)});}
 private activate(next:RunState,slot:RunSlot,source:'new'|'saved'|'backup'|'corrupt'|'unavailable'):void{
  this.input.cancel();this.clearFeedback();this.recoveryPending=source==='backup'||source==='corrupt'||source==='unavailable';this.slot=slot;this.state=next;this.hasRun=source==='new'||source==='saved'||source==='backup';this.canResume=source==='saved'||source==='new'||source==='backup';this.lastTick=this.platform.now();
  Object.assign(this.view,{screen:source==='new'&&colorSlot(slot)&&next.rulesetVersion<8?'colorIntro':'game',needsResume:source==='backup'||source==='corrupt'||source==='unavailable',paused:false,animation:null,elapsed:next.elapsedMs??0,recoveryError:source==='corrupt'?'此模式存档无法读取，原文已保留':source==='unavailable'?'无法访问此模式存储':undefined,confirmation:null,canContinue:this.hasRun&&next.phase!=='result',message:''});
  this.refreshSlots();
 }
 private switchMode(slot:RunSlot):void{
  if(this.hasRun&&!this.recoveryPending&&!this.view.needsResume&&!this.persist())return;
  const target=loadPlayableRun(this.platform.storage,slot);
  if(target.source==='unavailable'){this.view.saveStatus='无法读取目标模式，当前进度仍保留';return;}
  if(target.state){
   if(!this.setActiveSlot(slot))return;
   this.activate(target.state,slot,target.source==='backup'?'backup':'saved');if(target.source==='backup'||!this.ensureSerial())return;if(this.persist())this.recordFinal();
   if(colorSlot(slot)&&this.state.rulesetVersion<8&&this.state.commandIndex===0&&this.state.phase==='input')this.view.screen='colorIntro';
   return;
  }
  if(target.source==='corrupt'){
   if(!this.setActiveSlot(slot))return;
   this.activate(createForSlot(this.state.seed,slot),slot,'corrupt');return;
  }
  this.start(colorSlot(slot)?'color_exit':slot==='inbound_endless'?'endless':this.profile.tutorialComplete?'standard':'tutorial',tierForSlot(slot),undefined,difficultyForSlot(slot));
 }
 private start(mode:'standard'|'daily'|'tutorial'|'color_exit'|'endless',colorTier?:ColorTier,seed?:number,difficultyId?:OutboundDifficulty):void{
  const target:RunSlot=mode==='color_exit'?(difficultyId?slotForDifficulty(difficultyId,8):colorTier?slotForTier(colorTier):'color_exit'):mode==='endless'?'inbound_endless':'orders';
  if(target!==this.slot&&this.hasRun&&!this.recoveryPending&&!this.view.needsResume&&!this.persist())return;
  const previousLoad=loadPlayableRun(this.platform.storage,target);
  if(previousLoad.source==='unavailable'){this.view.saveStatus=previousLoad.message;return;}
  const initialFloor=this.serialFloor();if(initialFloor===null)return;
  let pointer:string|null;try{pointer=this.platform.storage.get(ACTIVE_SLOT_KEY);}catch{this.view.saveStatus='无法读取当前模式标记，未开始新局';return;}
  if(!this.setActiveSlot(target))return;
  const restorePointer=():void=>{try{if(pointer===null)this.platform.storage.remove(ACTIVE_SLOT_KEY);else this.platform.storage.set(ACTIVE_SLOT_KEY,pointer);}catch{/* Saved runs remain isolated even if the selector cannot be restored. */}};
  const preserved=preserveCorrupt(this.platform.storage,target);if(!preserved.ok){restorePointer();this.view.saveStatus=preserved.message;return;}
  const previous=previousLoad.state;let old=target===this.slot&&this.hasRun?this.state:previous;
  if(old){
   if(!old.runSerial){const numbered=allocateRun(this.profile,initialFloor);old={...old,runSerial:numbered.serial};if(target===this.slot&&this.hasRun)this.state=old;this.updateProfile(numbered.profile);}
   if(old.phase==='result'){const stable=saveRun(this.platform.storage,old,target);if(!stable.ok){restorePointer();this.view.saveStatus=stable.message;return;}if(!this.recordFinal(old)){restorePointer();this.view.saveStatus='本局成绩尚未保存，暂未开始新局';return;}}
   const closed=closeRun(this.platform.storage,target,old);this.view.saveStatus=closed.message;
   if(!closed.ok){restorePointer();if(closed.uncertain){this.closureUncertain=true;this.recoveryPending=true;this.view.needsResume=true;this.view.recoveryError=closed.message;this.clearFeedback();}return;}
   if(target===this.slot){this.recoveryPending=false;this.openSelection(colorSlot(target)?'colorTiers':'inboundMenu');}
  }
  const floor=this.serialFloor();if(floor===null){restorePointer();return;}
  const daily=mode==='daily'?this.daily():null,allocated=allocateRun(this.profile,floor);
  // The unique run serial gives ordinary outbound restarts a new sequence. Saved runs and daily challenges retain their own seed.
  const outboundSeed=difficultyId&&!this.view.developerMode?(this.newRunSeedBase+Math.imul(allocated.serial,0x9e3779b9))>>>0:seed??this.view.comparisonSeed??this.state.seed;
  const next=createForSlot(daily?.seed??(colorTier||difficultyId?outboundSeed:(((previous?.seed??this.state.seed)+1)>>>0)),target,mode==='color_exit'||mode==='endless'?'standard':mode);
  next.runSerial=allocated.serial;next.maxOccupancy=0;if(daily){next.challengeId=daily.id;next.challengeDay=daily.day;}
  const saved=saveRun(this.platform.storage,next,target);
  if(!saved.ok){restorePointer();this.view.saveStatus=old?'旧局已结束；新局保存失败，请重试':saved.message;return;}
  this.updateProfile(allocated.profile);this.activate(next,target,'new');this.view.saveStatus=saved.message;
  if(daily)this.view.message='';
 }

 private openSelection(screen:'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'):void{
  this.input.cancel();this.clearFeedback();this.hasRun=false;this.canResume=false;this.view.screen=screen;this.view.needsResume=false;this.view.paused=false;this.view.canContinue=false;this.view.confirmation=null;this.view.recoveryError=undefined;this.view.dailyLabel=this.daily().day;this.refreshSlots();
 }
 private closeConfirmed(screen:'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'):void{
  if(this.hasRun){
   if(!this.ensureSerial())return;
   const closed=closeRun(this.platform.storage,this.slot,this.state);this.view.saveStatus=closed.message;
   if(!closed.ok){if('uncertain' in closed&&closed.uncertain){this.closureUncertain=true;this.recoveryPending=true;this.view.needsResume=true;this.view.recoveryError=closed.message;this.clearFeedback();}return;}
  }
  this.recoveryPending=false;this.openSelection(screen);
 }
 private navigateSelection(screen:'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'):void{
  this.input.cancel();
  if(this.hasRun&&this.state.phase!=='result'){this.view.confirmation={kind:'leaveRun',nextScreen:screen};return;}
  if(this.hasRun&&this.state.phase==='result'&&!this.recoveryPending&&!this.view.needsResume){if(!this.persist()||!this.recordFinal())return;}
  this.closeConfirmed(screen);
 }
 action(action:UiAction):void{
  if(this.view.confirmation&&action.type!=='confirm'&&action.type!=='cancel')return;
  if(['newRun','toggleSound','toggleMotion','cosmetic','resetProfile'].includes(action.type)&&!this.ensureProfileReadable())return;
  if(action.type==='cancel'){this.view.confirmation=null;return;}
  if(action.type==='confirm'){
   const pending=this.view.confirmation;if(!pending)return;this.view.confirmation=null;
   if(pending.kind==='newRun')this.start(pending.mode??'standard',pending.colorTier,pending.seed,pending.difficultyId);
   else if(pending.kind==='leaveRun')this.closeConfirmed(pending.nextScreen??'menu');
   else if(pending.kind==='switchMode'){if(pending.variant)this.switchMode(pending.variant);}
   else if(pending.kind==='finishEndless'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'finishEndless'});}
   else if(pending.kind==='finishOvertime'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'finishOvertime'});}
   else{
    const all=RUN_SLOTS.map(slot=>loadRun(this.platform.storage,slot));
    if(all.some(run=>run.source==='unavailable'||run.source==='corrupt')){this.view.profileStatus='无法读取某个模式存档，未重置；请先恢复该模式';return;}
    if(all.some(run=>run.state?.phase==='result'&&!run.state.runSerial)||this.hasRun&&this.state.phase==='result'&&!this.state.runSerial){this.view.profileStatus='请先打开另一模式的旧结算，再重置长期记录';return;}
    const reset=resetProfile(this.platform.storage,(this.state.runSerial??0)+1,...RUN_SLOTS.map((slot,index)=>({slot,state:slot===this.slot&&this.hasRun?this.state:all[index].state??null}))); this.view.profileStatus=reset.message;
    if(reset.ok&&reset.profile){this.profile=reset.profile;this.view.profile=reset.profile;this.view.profileNeedsRecovery=false;}
   }return;
  }
  if(action.type==='chooseColorTier'){this.navigateSelection('colorTiers');return;}
  if(action.type==='chooseInbound'){this.navigateSelection('inboundMenu');return;}
  if(action.type==='chooseLegacy'){this.navigateSelection('legacyRuns');return;}
  if(action.type==='help'||action.type==='colorHelp'){
   if(this.view.screen!=='helpDetails'&&this.view.screen!=='colorIntro')this.helpPaused=this.view.paused;
   this.input.cancel();this.clearFeedback();this.view.paused=true;this.view.screen='colorIntro';return;
  }
  if(action.type==='helpDetails'){if(this.view.screen==='colorIntro'&&this.state.mode!=='color_exit')this.view.screen='helpDetails';return;}
  if(action.type==='helpBack'){if(this.view.screen==='colorIntro'||this.view.screen==='helpDetails'){this.view.screen='game';this.view.paused=this.helpPaused;this.lastTick=this.platform.now();}return;}
  if(action.type==='skipTutorial'){if(this.state.mode==='tutorial'&&this.state.phase==='input'&&!this.view.needsResume&&!this.recoveryPending)this.start('standard');return;}
  if(action.type==='comparisonSeedNext'){
   const next=((this.view.comparisonSeed??this.state.seed)+1)>>>0;let previous:string|null=null,changed=false;
   try{previous=this.platform.storage.get(COMPARISON_SEED_KEY);this.platform.storage.set(COMPARISON_SEED_KEY,String(next));changed=true;if(this.platform.storage.get(COMPARISON_SEED_KEY)!==String(next))throw Error('readback');this.view.comparisonSeed=next;this.view.saveStatus='新局对比种子已更新，已有进度不变';}
   catch{if(changed){try{if(previous===null)this.platform.storage.remove(COMPARISON_SEED_KEY);else this.platform.storage.set(COMPARISON_SEED_KEY,previous);}catch{/* Existing run snapshots are untouched. */}}this.view.saveStatus='对比种子保存失败，仍使用原种子';}return;
  }
  if(action.type==='switchMode'){if(!isRunSlot(action.variant))return;this.view.confirmation={kind:'switchMode',variant:action.variant};return;}
  if(action.type==='introStart'){if(this.state.mode==='color_exit'&&!this.recoveryPending&&!this.view.needsResume){this.view.screen='game';this.view.paused=false;this.lastTick=this.platform.now();}return;}

  if(action.type==='newRun'){
   if(action.colorTier!==undefined&&(action.mode!=='color_exit'||!isColorTier(action.colorTier)))return;
   if(action.difficultyId!==undefined&&(action.mode!=='color_exit'||!isOutboundDifficulty(action.difficultyId)||action.colorTier!==undefined))return;
   const target:RunSlot=action.mode==='color_exit'?(action.difficultyId?slotForDifficulty(action.difficultyId,8):action.colorTier?slotForTier(action.colorTier):'color_exit'):action.mode==='endless'?'inbound_endless':'orders',loaded=loadPlayableRun(this.platform.storage,target);
   if(loaded.source==='unavailable'){this.view.saveStatus='无法读取目标模式，未开始新局';return;}
   const existing=loaded.state;
   if(target===this.slot&&this.hasRun&&this.state.phase!=='result'||!!existing&&existing.phase!=='result'){this.view.confirmation={kind:'newRun',mode:action.mode,colorTier:action.colorTier,difficultyId:action.difficultyId,seed:action.colorTier||action.difficultyId?this.view.comparisonSeed:undefined};return;}
   this.start(action.mode,action.colorTier,undefined,action.difficultyId);return;
  }
  if(action.type==='continue'){if(this.hasRun)this.resume();return;}
  if(action.type==='home'){this.navigateSelection('menu');return;}
  if(action.type==='settings'){this.input.cancel();this.clearFeedback();this.settingsReturn=this.view.screen==='menu'||this.view.screen==='colorTiers'||this.view.screen==='inboundMenu'||this.view.screen==='legacyRuns'?this.view.screen:'game';if(this.settingsReturn==='game')this.view.paused=true;this.view.screen='settings';return;}
  if(action.type==='back'){this.view.screen=this.settingsReturn;return;}
  if(action.type==='toggleSound'){this.updateProfile(setProfileSettings(this.profile,{sound:!this.profile.settings.sound}));if(!this.profile.settings.sound)this.platform.stopSounds?.();return;}
  if(action.type==='toggleMotion'){this.updateProfile(setProfileSettings(this.profile,{reducedMotion:!this.profile.settings.reducedMotion}));return;}
  if(action.type==='cosmetic'){const result=setProfileCosmetic(this.profile,action.kind,action.id);if(result.error){this.view.profileStatus=result.error;return;}this.updateProfile(result.profile);return;}
  if(action.type==='resetProfile'){this.view.confirmation={kind:'resetProfile'};return;}
  if(action.type==='recoverProfile'){const result=recoverProfile(this.platform.storage);this.view.profileStatus=result.message;if(result.ok){const profile=loadProfile(this.platform.storage);this.profile=profile.profile;this.view.profile=this.profile;this.profileReadBlocked=profile.source==='unavailable';this.view.profileNeedsRecovery=this.profileReadBlocked;}return;}
  if(action.type==='finishEndless'){if(this.state.mode==='endless'&&this.state.phase==='input')this.view.confirmation={kind:'finishEndless'};return;}
  if(action.type==='continueOvertime'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'continueOvertime'});return;}
  if(action.type==='finishOvertime'&&this.state.overtime)this.view.confirmation={kind:'finishOvertime'};
 }
}
