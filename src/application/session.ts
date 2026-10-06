import {MOTION,shipmentTiming} from '../presentation/motion.ts';
import type {Platform,SoundName} from '../platform/types.ts';
import type {RunState,Command,Shipment,Cell,CellTrait,ColorTier} from '../domain/types.ts';
import {CURRENT_RULESET,COLOR_EXIT_RULESET} from '../domain/content.ts';
import type {ViewState} from '../presentation/view-types.ts';
import type {UiAction} from '../presentation/ui-types.ts';
import {createRun,applyCommand,previewPlacement} from '../domain/engine.ts';
import {loadRun,saveRun,preserveCorrupt} from './save.ts';
import {RUN_SLOTS,isRunSlot,slotForTier,tierForSlot} from './run-slots.ts';
import type {RunSlot} from './run-slots.ts';
import {pieceCellCargo} from '../domain/pieces.ts';
import {isColorTier} from '../domain/v5/content.ts';
export const ACTIVE_SLOT_KEY='warehouse.active-mode.v1';
export const COMPARISON_SEED_KEY='warehouse.color_exit.compare_seed.v1';
function createForSlot(seed:number,slot:RunSlot,orderMode:'standard'|'daily'|'tutorial'='standard'):RunState{const tier=tierForSlot(slot);return createRun(seed,slot==='orders'?orderMode:'color_exit',tier?5:slot==='color_exit'?COLOR_EXIT_RULESET:CURRENT_RULESET,tier);}
import {InputController} from '../presentation/input.ts';
import {loadProfile,saveProfile,allocateRun,recordResult,setProfileSettings,setProfileCosmetic,localDailyChallenge,recoverProfile,resetProfile} from './profile.ts';
import type {Profile} from './profile.ts';

export class GameSession {
 state:RunState;
 view:ViewState;
 input:InputController;
 profile:Profile;
 private platform:Platform;
 private slot:RunSlot='orders';
 private recoveryPending=false;
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
  try{const remembered=platform.storage.get(ACTIVE_SLOT_KEY);this.slot=isRunSlot(remembered)?remembered:options.mode==='color_exit'?'color_exit':'orders';}catch{/* Default to the original slot without erasing an inaccessible selector. */}
  const saved=loadRun(platform.storage,this.slot);this.recoveryPending=saved.source==='backup'||saved.source==='corrupt'||saved.source==='unavailable';
  const firstLesson=this.slot==='orders'&&!this.profile.tutorialComplete;
  this.state=saved.state??{...createForSlot(options.seed,this.slot,firstLesson?'tutorial':'standard'),maxOccupancy:0};
  this.hasRun=!!saved.state||firstLesson&&saved.source==='empty';
  this.canResume=!!saved.state;
  this.view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:saved.source==='corrupt'?saved.message:'同类凑够 + 叉车能过去 = 自动出库',saveStatus:saved.source==='unavailable'?saved.message:'每次操作自动保存',elapsed:saved.state?.elapsedMs??0,animation:null,debug:false,needsResume:!!saved.state&&(saved.state.phase!=='result'||saved.source==='backup')||saved.source==='corrupt'||saved.source==='unavailable',recoveryError:saved.source==='corrupt'||saved.source==='unavailable'?saved.message:undefined,screen:this.hasRun||saved.source==='corrupt'?'game':'menu',profile:this.profile,profileStatus:profile.message,profileNeedsRecovery:profile.source==='backup'||profile.source==='corrupt'||profile.source==='unavailable',dailyLabel:this.daily().day,canContinue:this.hasRun&&this.state.phase!=='result',confirmation:null,variant:this.slot};
  this.view.comparisonSeed=options.seed>>>0;try{const raw=platform.storage.get(COMPARISON_SEED_KEY);if(raw!==null&&/^\d+$/.test(raw)){const seed=Number(raw);if(Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff)this.view.comparisonSeed=seed;}}catch{/* A missing preference never changes run saves. */}
  this.refreshSlots();
  this.input=new InputController({getState:()=>this.state,getView:()=>this.view,patchView:patch=>Object.assign(this.view,patch),preview:(pieceId,origin)=>previewPlacement(this.state,pieceId,origin),dispatch:command=>this.dispatch(command),togglePause:()=>this.togglePause(),restart:()=>this.restart(),resume:()=>this.resume(),toggleDebug:()=>{this.input.cancel();this.view.debug=!this.view.debug;this.view.debugPage=0;},action:action=>this.action(action),feedback:(kind,pieceId)=>this.feedback(kind,pieceId)});
  if(this.hasRun&&!this.view.needsResume&&this.ensureSerial()){if(this.persist())this.recordFinal();}
 }
 private daily(){return localDailyChallenge(this.platform.wallTime?.()??Date.now(),CURRENT_RULESET);}
 private updateProfile(profile:Profile):void{this.profile=profile;this.view.profile=profile;const saved=saveProfile(this.platform.storage,profile);this.view.profileStatus=saved.message;if(!saved.ok)this.view.profileNeedsRecovery=true;}
 private serialFloor():number|null{
  const runs=RUN_SLOTS.map(slot=>loadRun(this.platform.storage,slot));
  if(runs.some(run=>run.source==='unavailable')){this.view.saveStatus='无法读取另一模式进度，暂不分配新局';return null;}
  return Math.max(1,(this.state.runSerial??0)+1,...runs.map(run=>(run.state?.runSerial??0)+1));
 }
 private refreshSlots():void{const status=(slot:RunSlot)=>{const loaded=loadRun(this.platform.storage,slot);return loaded.state?loaded.state.phase==='result'?'result' as const:'saved' as const:loaded.source==='corrupt'?'corrupt' as const:loaded.source==='unavailable'?'unavailable' as const:'empty' as const;};this.view.modeSlots=Object.fromEntries(RUN_SLOTS.map(slot=>[slot,status(slot)]));this.view.variant=this.slot;}
 private setActiveSlot(slot:RunSlot):boolean{
  let previous:string|null=null,changed=false;
  try{previous=this.platform.storage.get(ACTIVE_SLOT_KEY);this.platform.storage.set(ACTIVE_SLOT_KEY,slot);changed=true;if(this.platform.storage.get(ACTIVE_SLOT_KEY)!==slot)throw Error('readback');return true;}
  catch{if(changed){try{if(previous===null)this.platform.storage.remove(ACTIVE_SLOT_KEY);else this.platform.storage.set(ACTIVE_SLOT_KEY,previous);}catch{/* Both independent run snapshots remain safe even if the selector cannot be restored. */}}this.view.saveStatus='模式切换保存失败，当前进度仍保留';return false;}
 }
 private ensureSerial():boolean{
  if(this.state.runSerial)return true;const floor=this.serialFloor();if(floor===null){this.view.needsResume=true;return false;}
  const allocated=allocateRun(this.profile,floor);this.state={...this.state,runSerial:allocated.serial};this.updateProfile(allocated.profile);return true;
 }
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
  if(this.recoveryPending||this.view.debug||this.view.paused||this.view.needsResume||this.view.animation||this.view.confirmation||this.view.screen!=='game')return;
  const before=this.state,resolved=applyCommand(before,command);
  if(resolved.error){this.view.message=resolved.error;this.feedback('invalid',command.type==='place'?command.pieceId:undefined);return;}
  this.state=resolved.state;
  if(before.maxOccupancy!==undefined){const placed=resolved.events.find(event=>event.type==='placed');this.state={...this.state,maxOccupancy:Math.max(before.maxOccupancy,before.board.filter(Boolean).length+(placed?.cells.length??0),this.state.board.filter(Boolean).length)};}
  this.hasRun=true;this.canResume=true;this.view.canContinue=this.state.phase!=='result';
  if(this.persist())this.recordFinal();
  const placed=resolved.events.find(event=>event.type==='placed');
  if(placed){this.placementStarted=this.platform.now();this.view.placementFx=this.profile.settings.reducedMotion?null:{cells:placed.cells.slice(),progress:0};this.sound('place');}
  if(resolved.events.some(event=>event.type==='result'&&event.result==='failed'))this.pendingNotice={kind:'fail',label:'暂时放不下了，下一班再来'};
  else if(resolved.events.some(event=>event.type==='shift'))this.pendingNotice={kind:'shift',label:this.slot!=='orders'?`出货 ${this.state.completedOrders}/30 批 · 进入第 ${this.state.shift} 档`:`第 ${before.shift} 班完成 · 进入第 ${this.state.shift} 班`};
  else if(this.state.phase==='result'&&this.state.result==='won'&&this.state.mode!=='tutorial'&&!this.state.overtime)this.pendingNotice={kind:'shift',label:this.slot!=='orders'?'30批出货完成，辛苦了！':'五班完成，辛苦了！'};
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
  this.view.message=this.slot!=='orders'?(resolved.events.some(event=>event.type==='shipment')?'货物沿同色货线出库，继续给南入口留路':'连同色出口、至少4件，还要留叉车空路'):this.state.phase==='upgrade'?'选择一个升级，继续当前仓库':this.state.lastChain>1?`${this.state.lastChain} 连锁！清出的通路让叉车继续深入`:resolved.events.some(event=>event.type==='shipment')?'订单完成！记得给叉车留条路':'货物已入库，给同类货箱留出连接位置';
  if(resolved.events.some(event=>event.type==='rushExpired'))this.view.message='加急货件已过期变废弃物，可用危险品或扫路清理';
 }
 private persist():boolean{if(this.recoveryPending){this.view.saveStatus='此模式需先恢复存档，旧文件仍保留';return false;}const elapsedMs=Math.floor(this.view.elapsed);if(this.state.elapsedMs!==elapsedMs)this.state={...this.state,elapsedMs};const result=saveRun(this.platform.storage,this.state,this.slot);this.view.saveStatus=result.message;return result.ok;}
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
  const preserved=preserveCorrupt(this.platform.storage,this.slot);if(!preserved.ok){this.view.saveStatus=preserved.message;return;}
  this.recoveryPending=false;
  if(!this.ensureSerial())return;this.view.needsResume=false;this.view.paused=false;this.view.screen='game';this.lastTick=this.platform.now();this.hasRun=true;this.canResume=true;this.view.canContinue=this.state.phase!=='result';if(this.persist())this.recordFinal();this.view.message='继续上次值班，仓库状态已恢复';
 }
 restart():void{this.action({type:'newRun',mode:this.slot!=='orders'?'color_exit':'standard',colorTier:tierForSlot(this.slot)});}
 private activate(next:RunState,slot:RunSlot,source:'new'|'saved'|'backup'|'corrupt'|'unavailable'):void{
  this.input.cancel();this.clearFeedback();this.recoveryPending=source==='backup'||source==='corrupt'||source==='unavailable';this.slot=slot;this.state=next;this.hasRun=source==='new'||source==='saved'||source==='backup';this.canResume=source==='saved'||source==='new'||source==='backup';this.lastTick=this.platform.now();
  Object.assign(this.view,{screen:source==='new'&&slot!=='orders'?'colorIntro':'game',needsResume:source==='backup'||source==='corrupt'||source==='unavailable',paused:false,animation:null,elapsed:next.elapsedMs??0,recoveryError:source==='corrupt'?'此模式存档无法读取，原文已保留':source==='unavailable'?'无法访问此模式存储':undefined,confirmation:null,canContinue:this.hasRun&&next.phase!=='result',message:slot!=='orders'?'颜色出口：连同色口、至少4件、留南入口空路':'订单模式：按当前订单凑货并留路'});
  this.refreshSlots();
 }
 private switchMode(slot:RunSlot):void{
  if(this.hasRun&&!this.recoveryPending&&!this.view.needsResume&&!this.persist())return;
  const target=loadRun(this.platform.storage,slot);
  if(target.source==='unavailable'){this.view.saveStatus='无法读取目标模式，当前进度仍保留';return;}
  if(target.state){
   if(!this.setActiveSlot(slot))return;
   this.activate(target.state,slot,target.source==='backup'?'backup':'saved');if(target.source==='backup'||!this.ensureSerial())return;if(this.persist())this.recordFinal();
   if(slot!=='orders'&&this.state.commandIndex===0&&this.state.phase==='input')this.view.screen='colorIntro';
   return;
  }
  if(target.source==='corrupt'){
   if(!this.setActiveSlot(slot))return;
   this.activate(createForSlot(this.state.seed,slot),slot,'corrupt');return;
  }
  this.start(slot!=='orders'?'color_exit':this.profile.tutorialComplete?'standard':'tutorial',tierForSlot(slot));
 }
 private start(mode:'standard'|'daily'|'tutorial'|'color_exit',colorTier?:ColorTier,seed?:number):void{
  const target:RunSlot=mode==='color_exit'?(colorTier?slotForTier(colorTier):'color_exit'):'orders';
  if(target!==this.slot&&this.hasRun&&!this.recoveryPending&&!this.view.needsResume&&!this.persist())return;
  const preserved=preserveCorrupt(this.platform.storage,target);if(!preserved.ok){this.view.saveStatus=preserved.message;return;}
  const floor=this.serialFloor();if(floor===null)return;
  const daily=mode==='daily'?this.daily():null,allocated=allocateRun(this.profile,floor);
  const previous=loadRun(this.platform.storage,target).state;
  const next=createForSlot(daily?.seed??(colorTier?(seed??this.view.comparisonSeed??this.state.seed):(((previous?.seed??this.state.seed)+1)>>>0)),target,mode==='color_exit'?'standard':mode);
  next.runSerial=allocated.serial;next.maxOccupancy=0;if(daily){next.challengeId=daily.id;next.challengeDay=daily.day;}
  const switching=target!==this.slot;
  if(switching&&!this.setActiveSlot(target))return;
  const saved=saveRun(this.platform.storage,next,target);
  if(!saved.ok){if(switching)this.setActiveSlot(this.slot);this.view.saveStatus=saved.message;return;}
  this.updateProfile(allocated.profile);this.activate(next,target,'new');this.view.saveStatus=saved.message;
  if(daily)this.view.message=`本地每日挑战 ${daily.day} · 北京时间`;
 }
 action(action:UiAction):void{
  if(this.view.confirmation&&action.type!=='confirm'&&action.type!=='cancel')return;
  if(action.type==='cancel'){this.view.confirmation=null;return;}
  if(action.type==='confirm'){
   const pending=this.view.confirmation;if(!pending)return;this.view.confirmation=null;
   if(pending.kind==='newRun')this.start(pending.mode??'standard',pending.colorTier,pending.seed);
   else if(pending.kind==='switchMode'){if(pending.variant)this.switchMode(pending.variant);}
   else if(pending.kind==='finishOvertime'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'finishOvertime'});}
   else{
    const all=RUN_SLOTS.map(slot=>loadRun(this.platform.storage,slot));
    if(all.some(run=>run.source==='unavailable'||run.source==='corrupt')){this.view.profileStatus='无法读取某个模式存档，未重置；请先恢复该模式';return;}
    if(all.some(run=>run.state?.phase==='result'&&!run.state.runSerial)||this.hasRun&&this.state.phase==='result'&&!this.state.runSerial){this.view.profileStatus='请先打开另一模式的旧结算，再重置长期记录';return;}
    const reset=resetProfile(this.platform.storage,(this.state.runSerial??0)+1,...RUN_SLOTS.map((slot,index)=>({slot,state:slot===this.slot&&this.hasRun?this.state:all[index].state??null}))); this.view.profileStatus=reset.message;
    if(reset.ok&&reset.profile){this.profile=reset.profile;this.view.profile=reset.profile;this.view.profileNeedsRecovery=false;}
   }return;
  }
  if(action.type==='chooseColorTier'){this.input.cancel();this.clearFeedback();this.view.screen='colorTiers';this.view.paused=false;this.refreshSlots();return;}
  if(action.type==='comparisonSeedNext'){
   const next=((this.view.comparisonSeed??this.state.seed)+1)>>>0;let previous:string|null=null,changed=false;
   try{previous=this.platform.storage.get(COMPARISON_SEED_KEY);this.platform.storage.set(COMPARISON_SEED_KEY,String(next));changed=true;if(this.platform.storage.get(COMPARISON_SEED_KEY)!==String(next))throw Error('readback');this.view.comparisonSeed=next;this.view.saveStatus='新局对比种子已更新，已有进度不变';}
   catch{if(changed){try{if(previous===null)this.platform.storage.remove(COMPARISON_SEED_KEY);else this.platform.storage.set(COMPARISON_SEED_KEY,previous);}catch{/* Existing run snapshots are untouched. */}}this.view.saveStatus='对比种子保存失败，仍使用原种子';}return;
  }
  if(action.type==='switchMode'){if(!isRunSlot(action.variant))return;this.view.confirmation={kind:'switchMode',variant:action.variant};return;}
  if(action.type==='introStart'){if(this.slot!=='orders'&&!this.recoveryPending&&!this.view.needsResume){this.view.screen='game';this.view.paused=false;this.lastTick=this.platform.now();}return;}
  if(action.type==='colorHelp'){if(this.slot!=='orders'){this.input.cancel();this.clearFeedback();this.view.screen='colorIntro';this.view.paused=true;}return;}
  if(action.type==='newRun'){
   if(action.colorTier!==undefined&&(action.mode!=='color_exit'||!isColorTier(action.colorTier)))return;
   const target:RunSlot=action.mode==='color_exit'?(action.colorTier?slotForTier(action.colorTier):'color_exit'):'orders',loaded=loadRun(this.platform.storage,target);
   if(loaded.source==='unavailable'){this.view.saveStatus='无法读取目标模式，未开始新局';return;}
   const existing=loaded.state;
   if(target===this.slot&&this.hasRun&&this.state.phase!=='result'||!!existing&&existing.phase!=='result'){this.view.confirmation={kind:'newRun',mode:action.mode,colorTier:action.colorTier,seed:action.colorTier?this.view.comparisonSeed:undefined};return;}
   this.start(action.mode,action.colorTier);return;
  }
  if(action.type==='continue'){if(this.hasRun)this.resume();return;}
  if(action.type==='home'){
   this.input.cancel();this.clearFeedback();if(this.hasRun&&!this.view.needsResume&&this.persist())this.recordFinal();this.view.screen='menu';this.view.needsResume=false;this.view.paused=false;this.view.dailyLabel=this.daily().day;this.view.canContinue=this.hasRun&&this.state.phase!=='result';this.refreshSlots();return;
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
