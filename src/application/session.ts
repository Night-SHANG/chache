import {getCosmetic,accountCosmeticState} from './cosmetics.ts';
import {createAccountService,accountDisplayProfile,accountDailyAvailability} from './account-service.ts';
import type {AccountService,AccountRequest,StartIntent,TransactionResult} from './account-service.ts';
import {prepareLegacyMigration} from './legacy-migration.ts';
import type {AccountSnapshot,GuideTrack,GuideProgress,GuideStep} from './account-types.ts';
import type {GameRun,GameCommand,GameEvent,GameShipment} from '../domain/playable.ts';
import {isInboundRun,isInboundV9,isToolRun,isOutboundToolsRun,reservedEntryCells,previewPlayablePlacement} from '../domain/playable.ts';
import {guideOverlay,isGuideComplete} from './tutorials.ts';
import {toolPreview} from '../presentation/tool-preview.ts';
import type {ToolCommand} from '../presentation/tool-preview.ts';
import {OUTBOUND_CARGO} from '../domain/v6/content.ts';
import {buildOutboundTransport} from '../presentation/outbound-transport.ts';
import {placementRisk} from '../presentation/placement-risk.ts';
import {MOTION,shipmentTiming} from '../presentation/motion.ts';
import type {Platform,SoundName} from '../platform/types.ts';
import type {RunState,Command,Shipment,Cell,CellTrait,ColorTier,OutboundDifficulty} from '../domain/types.ts';
import {CURRENT_RULESET,COLOR_EXIT_RULESET} from '../domain/content.ts';
import type {ViewState} from '../presentation/view-types.ts';
import type {UiAction} from '../presentation/ui-types.ts';
import {createRun,applyCommand} from '../domain/engine.ts';
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
import {loadProfile,saveProfile,allocateRun,setProfileSettings,setProfileCosmetic,localDailyChallenge,recoverProfile,resetProfile} from './profile.ts';
import type {Profile} from './profile.ts';

type RequestBody=AccountRequest extends infer R?R extends {operationId:string}?Omit<R,'operationId'>:never:never;
export class GameSession {
 state!:GameRun;
 private get legacyState():RunState{return this.state as RunState;}
 private set legacyState(state:RunState){this.state=state;}
 private accountService:AccountService;
 private accountOwned=false;
 private pendingRequest:AccountRequest|null=null;
 private operationSerial=0;
 private preparedGuideProgress:GuideProgress|null=null;
 private normalHintsShown=new Set<GuideStep>();
 private afterAccountAck:((result:TransactionResult)=>void)|null=null;
 private prepareReturn:'inboundMenu'|'colorTiers'='inboundMenu';
 private shopReturn:ViewState['screen']='menu';
 private growthStarted=0;
 view:ViewState;
 input:InputController;
 profile:Profile;
 private platform:Platform;
 private newRunSeedBase:number;
 private slot:RunSlot='orders';
 private recoveryPending=false;
 private closureUncertain=false;
 private profileReadBlocked=false;
 private dailyDateIndex=-1;

 private helpPaused=false;
 private messageExpiresAt=0;
 private animationQueue:{shipment:GameShipment;board:Cell[];cellTraits?:(CellTrait|null)[]}[]=[];
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
  this.platform=platform;this.accountService=createAccountService(platform.storage,platform.writerLease??{status:'unsupported',release(){}},()=>platform.wallTime?.()??Date.now());this.newRunSeedBase=options.seed>>>0;this.lastTick=platform.now();
  const profile=loadProfile(platform.storage);this.profile=profile.profile;this.profileReadBlocked=profile.source==='unavailable';
  try{const remembered=platform.storage.get(ACTIVE_SLOT_KEY);this.slot=isRunSlot(remembered)?remembered:options.mode==='color_exit'?'color_exit':'orders';}catch{/* Default to the original slot without erasing an inaccessible selector. */}
  const saved=loadPlayableRun(platform.storage,this.slot);this.recoveryPending=saved.source==='backup'||saved.source==='corrupt'||saved.source==='unavailable';
  const firstLesson=false;
  this.legacyState=saved.state??{...createForSlot(options.seed,this.slot,firstLesson?'tutorial':'standard'),maxOccupancy:0};
  this.hasRun=!!saved.state||firstLesson&&saved.source==='empty'&&!saved.closed;
  this.canResume=!!saved.state;
  this.view={account:null,developerMode:options.developerMode===true,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:saved.source==='unavailable'?saved.message:'每次操作自动保存',elapsed:saved.state?.elapsedMs??0,animation:null,debug:false,needsResume:!!saved.state&&(saved.state.phase!=='result'||saved.source==='backup')||saved.source==='corrupt'||saved.source==='unavailable',recoveryError:saved.source==='corrupt'||saved.source==='unavailable'?saved.message:undefined,screen:this.hasRun||saved.source==='corrupt'?'game':'menu',profile:this.profile,profileStatus:profile.message,profileNeedsRecovery:profile.source==='backup'||profile.source==='corrupt'||profile.source==='unavailable',dailyLabel:this.daily().day,canContinue:this.hasRun&&this.legacyState.phase!=='result',confirmation:null,variant:this.slot};
  this.view.comparisonSeed=options.seed>>>0;try{const raw=platform.storage.get(COMPARISON_SEED_KEY);if(raw!==null&&/^\d+$/.test(raw)){const seed=Number(raw);if(Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff)this.view.comparisonSeed=seed;}}catch{/* A missing preference never changes run saves. */}
  this.refreshSlots();
  const account=this.accountService.getSnapshot();if(account){this.publishAccount(account);}else if(!['empty','ready'].includes(this.accountService.getStatus())){this.view.accountBlocked=true;this.view.accountStatus=this.accountService.getStatus();this.view.saveStatus='保存结果尚未确认，请重试';}
  this.view.outboundSelectionMode=this.hasRun&&this.state.mode==='color_exit'&&[10,13].includes(this.state.rulesetVersion)?'endless':'normal';
  this.refreshDailyAvailability();
  this.input=new InputController({getState:()=>this.state,getView:()=>this.view,patchView:patch=>Object.assign(this.view,patch),preview:(pieceId,origin)=>previewPlayablePlacement(this.state,pieceId,origin),risk:(pieceId,origin)=>placementRisk(this.state,pieceId,origin),dispatch:command=>this.dispatch(command),togglePause:()=>this.togglePause(),restart:()=>this.restart(),resume:()=>this.resume(),toggleDebug:()=>{this.input.cancel();this.view.debug=!this.view.debug;this.view.debugPage=0;},action:action=>this.action(action),feedback:(kind,pieceId)=>this.feedback(kind,pieceId)});
  if(!this.writerHeld())this.blockWriter();
  if(this.writerHeld()&&!this.accountOwned&&this.hasRun&&!this.view.needsResume&&this.ensureSerial()){if(this.persist())this.recordFinal();}
  if(this.writerHeld()&&this.accountOwned)this.closeTerminalAccount();
 }
 private writerHeld():boolean{return this.platform.writerLease?.status==='held';}
 private blockWriter():void{this.view.accountBlocked=true;this.view.readOnlyReason=this.platform.writerLease?.status==='busy'?'另一个窗口正在保存，请回到已经打开的游戏窗口。':'请重新用启动器打开游戏，确认只有一个窗口保存进度。';this.view.saveStatus=this.view.readOnlyReason;this.input?.cancel();}
 private publishAccount(account:Readonly<AccountSnapshot>):void {
  this.view.account=account;this.view.accountStatus='ready';this.view.accountBlocked=false;
  this.refreshDailyAvailability();
  this.profile=accountDisplayProfile(account);this.view.profile=this.profile;this.view.profileNeedsRecovery=false;this.profileReadBlocked=false;
  if(account.run){const sameRun=this.view.accountRunId===account.run.identity.runId,activating=!this.accountOwned;this.accountOwned=true;this.recoveryPending=false;this.state=account.run.state;if(!sameRun)this.view.toolboxOpen=false;if(isToolRun(this.state)&&this.state.phase==='rescue')this.view.toolboxOpen=true;else if(this.state.phase!=='input')this.view.toolboxOpen=false;this.hasRun=true;this.canResume=true;this.view.accountRunId=account.run.identity.runId;this.view.variant=this.state.mode==='color_exit'?'difficultyId' in this.state?slotForDifficulty(this.state.difficultyId!,8):'color_exit':this.state.mode==='endless'?'inbound_endless':'orders';this.view.canContinue=this.state.phase!=='result';this.view.elapsed=sameRun?Math.max(this.view.elapsed,this.state.elapsedMs??0):this.state.elapsedMs??0;if(activating)this.view.screen='game';this.view.needsResume=this.pendingRequest===null&&this.state.phase!=='result';
   const track:GuideTrack=this.state.mode==='color_exit'?'outbound':'inbound';this.view.guideTrack=track;this.view.guide=account.run.identity.mode==='guided'||account.run.identity.mode==='outboundGuided'?guideOverlay(track,account.guides[track],this.state):null;
  }else{if(!this.accountOwned&&this.hasRun&&this.state.runSerial!==undefined&&this.state.runSerial>account.migration.legacySerialCeiling){this.hasRun=false;this.canResume=false;this.recoveryPending=false;this.state=createForSlot(this.newRunSeedBase,'orders');this.input?.cancel();Object.assign(this.view,{screen:'menu',needsResume:false,canContinue:false,recoveryError:undefined,confirmation:null});}this.view.accountRunId=undefined;this.view.guide=null;if(this.accountOwned){this.hasRun=false;this.canResume=false;this.view.canContinue=false;this.view.needsResume=false;}}
 }
 private requestAccount(payload:RequestBody,after?:(result:TransactionResult)=>void):boolean {
  if(!this.writerHeld()){this.blockWriter();return false;}
  if(this.view.accountBlocked||this.pendingRequest)return false;
  const generation=this.view.account?.generation??0,operationId=`ui.${Math.floor(this.platform.wallTime?.()??Date.now())}.${generation}.${++this.operationSerial}.${payload.type}`;
  this.pendingRequest={...payload,operationId} as AccountRequest;this.afterAccountAck=after??null;
  return this.acceptAccountResult(this.accountService.transact(this.pendingRequest,generation));
 }
 private acceptAccountResult(result:TransactionResult):boolean {
  this.view.saveStatus=result.message;
  if(result.status!=='acknowledged'||!result.account){
   if(result.status==='unknown'||result.status==='committed_unmirrored'){this.view.accountBlocked=true;this.view.saveStatus='保存结果尚未确认，请重试';this.input?.cancel();}
   else{this.pendingRequest=null;this.afterAccountAck=null;this.view.message=result.message;}
   return false;
  }
  this.publishAccount(result.account);if(result.closedState){this.state=result.closedState;this.accountOwned=true;this.view.screen='game';}this.view.needsResume=false;this.pendingRequest=null;const after=this.afterAccountAck;this.afterAccountAck=null;after?.(result);return true;
 }
 private retryAccount():void {
  if(!this.writerHeld()){this.blockWriter();return;}
  if(this.view.readOnlyReason){this.view.readOnlyReason=undefined;this.view.accountBlocked=false;this.view.saveStatus='每次操作自动保存';return;}
  const operationId=this.pendingRequest?.operationId??this.accountService.getPendingOperationId();
  if(operationId){if(this.acceptAccountResult(this.accountService.retryPending(operationId)))this.closeTerminalAccount();return;}
  if(!this.view.accountBlocked)return;
  const fresh=this.accountService.refresh();this.view.accountStatus=fresh.status;this.view.saveStatus=fresh.message;
  if(fresh.status==='ready'&&fresh.account){this.publishAccount(fresh.account);this.closeTerminalAccount();}
  else if(fresh.status==='empty'){this.view.account=null;this.view.accountBlocked=false;if(!this.hasRun){this.view.screen='menu';this.view.needsResume=false;}}

 }
 private saveAccountElapsed():void {
  const run=this.view.account?.run;if(!this.accountOwned||!run||this.pendingRequest||this.view.accountBlocked||this.view.needsResume||!this.writerHeld())return;
  const elapsedMs=Math.floor(this.view.elapsed);if(elapsedMs<=(run.state.elapsedMs??0))return;
  this.requestAccount({type:'saveElapsed',runId:run.identity.runId,elapsedMs});
 }
 private closeAccount(reason:'failed'|'retired'|'home'|'decline_overtime',after?:()=>void):boolean {
  const run=this.view.account?.run;if(!run){after?.();return true;}
  return this.requestAccount({type:'close',runId:run.identity.runId,reason,elapsedMs:Math.floor(this.view.elapsed)},after);
 }
 private closeTerminalAccount():void {
  const run=this.view.account?.run;if(!run||this.view.accountBlocked||this.pendingRequest||run.state.phase!=='result')return;
  if(isInboundRun(run.state)&&run.state.mode==='standard'&&run.state.result==='won'&&!run.state.overtime&&run.state.endReason==='completed')return;
  this.closeAccount(run.state.endReason==='retired'?'retired':run.state.result==='failed'?'failed':'decline_overtime');
 }
 private beginNewGame(action:Extract<UiAction,{type:'newRun'}>,guide:'guided'|'direct'='direct'):void {
  if(action.mode==='daily'&&!this.allowDailyStart())return;
  const outbound=action.mode==='color_exit',track:GuideTrack=outbound?'outbound':'inbound';this.prepareReturn=outbound?'colorTiers':'inboundMenu';
  if(outbound)this.view.outboundSelectionMode=action.outboundMode??'normal';
  const intent:StartIntent={spec:outbound?{family:'outbound',variant:action.outboundMode??'normal',rulesetVersion:action.outboundMode==='endless'?13:12,seed:0,difficultyId:action.difficultyId??'easy',toolCharges:{rotate:0,clear:0,wildcard:0}}:{family:'inbound',mode:action.mode==='endless'?'endless':action.mode==='daily'?'daily':'standard',rulesetVersion:action.mode==='endless'?14:15,seed:0,guided:guide==='guided',toolCharges:{rotate:0,clear:0,wildcard:0}},items:[],guide};this.view.prepareIntent=intent;this.view.guideTrack=track;
  const migration=this.view.account?null:prepareLegacyMigration(this.platform.storage);
  if(migration?.status==='blocked'){this.view.saveStatus=migration.message;this.view.prepareIntent=null;return;}
  const progress=this.view.account?.guides[track]??(migration?.status==='ready'?migration.account.guides[track]:undefined);this.preparedGuideProgress=progress??null;
  const eligible=outbound?intent.spec.family==='outbound'&&intent.spec.variant==='normal'&&intent.spec.difficultyId==='easy':action.mode==='standard';
  if(guide==='direct'&&eligible&&!progress?.authoredStartConsumed&&!progress?.skipped&&(!progress||!isGuideComplete(track,progress,intent.spec.rulesetVersion))){this.view.screen='guideOffer';return;}
  this.prepareStart();
 }
 private prepareStart():void {
  const intent=this.view.prepareIntent;if(!intent)return;
  if(intent.guide==='direct'&&(intent.spec.family==='outbound'&&[12,13].includes(intent.spec.rulesetVersion)||intent.spec.family==='inbound'&&intent.spec.mode!=='daily')){this.view.screen='prepareTools';return;}
  if(intent.spec.family==='inbound'&&intent.guide==='direct'&&intent.spec.rulesetVersion===9){this.view.screen='prepareCleanup';return;}
  this.startAccountIntent();
 }
 private startAccountIntent():void {
  const intent=this.view.prepareIntent;if(!intent)return;const priorGuide=this.view.account?.guides.inbound??this.preparedGuideProgress;
  if(intent.spec.family==='inbound'&&intent.spec.mode==='daily'&&!this.allowDailyStart()){this.view.prepareIntent=null;this.view.screen=this.prepareReturn;return;}
  this.requestAccount({type:'start',intent},ack=>{this.accountOwned=true;this.input.cancel();this.clearFeedback();this.view.prepareIntent=null;this.view.screen='game';this.view.paused=false;this.view.needsResume=false;this.view.elapsed=0;this.lastTick=this.platform.now();this.normalHintsShown.clear();if(priorGuide)this.showNormalMechanismHint(priorGuide,ack.events??[]);});
 }
 private dispatchAccount(command:GameCommand):void {
  if(this.view.accountBlocked||this.recoveryPending||this.view.paused||this.view.needsResume||this.view.animation||this.view.confirmation||this.view.toolSelection||this.view.toolboxOpen||this.view.supplyUpgrade||this.view.screen!=='game'||this.view.developerMode&&this.view.debug)return;
  const run=this.view.account?.run;if(!run)return;
  const guide=this.view.guide;if(command.type==='place'&&guide?.allowedOrigins&&(!guide.allowedOrigins.some(p=>p.x===command.origin.x&&p.y===command.origin.y)||guide.selectedPieceId&&guide.selectedPieceId!==command.pieceId)){this.view.message='请把提示货件放到提示格，或跳过引导';return;}
  const priorGuide=this.view.account!.guides.inbound,before=this.state,operationId=`ui.${Math.floor(this.platform.wallTime?.()??Date.now())}.${this.view.account!.generation}.${++this.operationSerial}.command`;
  this.pendingRequest={type:'command',runId:run.identity.runId,command,operationId,elapsedMs:Math.floor(this.view.elapsed)};
  this.afterAccountAck=(ack)=>{if([11,14,15].includes(before.rulesetVersion)&&before.phase==='cleanup'&&before.commandIndex===0)this.lastTick=this.platform.now();this.input.cancel();this.view.canContinue=this.state.phase!=='result';this.animateAccountStep(before,command,ack.events??[]);this.showNormalMechanismHint(priorGuide,ack.events??[]);this.closeTerminalAccount();};
  const result=this.accountService.transact(this.pendingRequest,this.view.account!.generation);
  if(!this.acceptAccountResult(result))return;

 }
 private animateAccountStep(before:GameRun,command:GameCommand,events:GameEvent[]):void {
  const placed=events.find(e=>e.type==='placed');if(placed&&placed.type==='placed'){this.placementStarted=this.platform.now();this.view.placementFx=this.profile.settings.reducedMotion?null:{cells:[...placed.cells],progress:0};this.sound('place');}
  const board=[...before.board],traits=before.cellTraits?.map(t=>t?{...t}:null);
  for(const event of events){if(event.type==='placed'){const piece=before.candidates.find(p=>p.id===event.pieceId);if(piece)event.cells.forEach((cell,index)=>{board[cell]=pieceCellCargo(piece,index);if(traits)traits[cell]=piece.trait?{kind:piece.trait,...(piece.trait==='rush'?{remaining:piece.rushTurns}:{})}:null;});}
   if(event.type==='toolUsed'&&event.toolId==='clear'&&event.cells)for(const cell of event.cells){board[cell]=null;if(traits)traits[cell]=null;}
   if(event.type==='shipment'){this.animationQueue.push({shipment:event,board:[...board],cellTraits:traits?.map(t=>t?{...t}:null)});for(const cell of [...event.cells,...('extraClearedCells' in event?event.extraClearedCells??[]:[])]){board[cell]=null;if(traits)traits[cell]=null;}}
  }
  if(events.some(e=>e.type==='result'&&e.result==='failed'&&(!('endReason' in e)||e.endReason!=='retired')))this.pendingNotice={kind:'fail',label:before.mode==='color_exit'&&this.state.board[76]!==null?'入口堵塞':'放不下了'};
  else if(events.some(e=>e.type==='shift'))this.pendingNotice={kind:'shift',label:`第 ${this.state.shift} 班`};
  if(this.animationQueue.length)this.nextAnimation(this.platform.now());else this.startNotice(this.platform.now());
  if(command.type==='upgrade'){this.sound('upgrade');this.growthStarted=this.platform.now();this.view.growthFx={label:'升级已生效',progress:0};}
  const notes=events.filter(e=>e.type==='rushExpired'||e.type==='cleanup'||e.type==='toolUsed').map(e=>e.type==='rushExpired'?'加急到期成为废物':e.type==='cleanup'&&'cells' in e&&e.cells.length?`已清扫${e.cells.length}格旧废物`:e.type==='toolUsed'?'道具已使用':'').filter(Boolean);this.view.message=notes.join(' · ');this.messageExpiresAt=notes.length?this.platform.now()+1800:0;
 }
 private showNormalMechanismHint(progress:GuideProgress,events:GameEvent[]=[]):void {
  if(!isInboundRun(this.state)||this.state.guided||progress.skipped||this.state.phase==='result')return;
  const cleanup=events.find(e=>e.type==='cleanupChosen');
  const hints:{step:GuideStep;present:boolean;text:string}[]=[
   {step:'expired',present:events.some(e=>e.type==='rushExpired'),text:'加急归零成为废物；清扫只处理旧废物。'},
   {step:'upgrade',present:this.state.phase==='upgrade'||events.some(e=>e.type==='upgradeChosen'),text:this.state.phase==='upgrade'?'选择一项升级，效果立即生效。':'升级已生效，会改变本局后续选择。'},
   {step:'sweepChoice',present:!!cleanup,text:cleanup&&cleanup.type==='cleanupChosen'&&cleanup.branch==='orders'?'已选择按单清扫':'已选择定期清扫'},
   {step:'rushTimer',present:this.state.candidates.some(p=>p.trait==='rush')||this.state.cellTraits.some(t=>t?.kind==='rush')||events.some(e=>e.type==='rushTick'),text:'加急放下剩3次；之后有效放置先出货，再扣数。'},
  ];
  const hint=hints.find(h=>h.present&&!progress.learned.includes(h.step)&&!this.normalHintsShown.has(h.step));if(!hint)return;
  this.normalHintsShown.add(hint.step);this.view.message=hint.text;this.messageExpiresAt=this.platform.now()+5000;
 }
 private updateToolPreview():void {
  const tool=this.view.toolSelection;if(!tool||!isToolRun(this.state))return;let command:ToolCommand|undefined;
  if(tool.item==='clear'&&tool.cells.length)command={type:'clear',cells:[...tool.cells]};
  if(tool.item==='wildcard'&&tool.pieceId){if(isOutboundToolsRun(this.state)){if(tool.cargo)command={type:'wildcard',pieceId:tool.pieceId,cargo:tool.cargo};}else command={type:'wildcard',pieceId:tool.pieceId};}
  if(tool.item==='rotate'&&tool.pieceId&&tool.quarterTurns)command={type:'rotate',pieceId:tool.pieceId,quarterTurns:tool.quarterTurns};
  tool.command=command;const result=command?toolPreview(this.state,command):undefined;tool.preview=result&&!result.error?result.state:undefined;tool.error=result?.error;
 }
 private handleAccountAction(action:UiAction):boolean {
  if(this.view.accountBlocked){if(action.type==='retrySave'||action.type==='continue'||action.type==='recoverProfile')this.retryAccount();return true;}
  if(this.view.confirmation&&action.type!=='confirm'&&action.type!=='cancel')return true;
  if(action.type==='selectOutboundMode'){if(this.view.screen==='colorTiers'&&!this.view.needsResume&&!this.view.paused&&(action.mode==='normal'||action.mode==='endless'))this.view.outboundSelectionMode=action.mode;return true;}
  if(action.type==='retrySave'){this.retryAccount();return true;}
  if(action.type==='newRun'&&!action.colorTier){
   if(action.mode==='daily'&&!this.allowDailyStart())return true;
   if(action.mode==='color_exit'&&action.difficultyId!==undefined&&!isOutboundDifficulty(action.difficultyId))return true;
   if(this.hasRun||this.view.account?.run){this.view.confirmation={kind:'newRun',mode:action.mode,difficultyId:action.difficultyId,outboundMode:action.outboundMode};return true;}
   this.beginNewGame(action);return true;
  }
  if(action.type==='confirm'){
   const pending=this.view.confirmation;if(!pending)return true;
   if(pending.kind==='newRun'&&pending.mode==='daily'&&!this.allowDailyStart()){this.view.confirmation=null;return true;}
   if(pending.kind==='purchaseCosmetic'){this.view.confirmation=null;if(pending.cosmeticKind&&pending.cosmeticId)this.requestAccount({type:'purchaseCosmetic',kind:pending.cosmeticKind,id:pending.cosmeticId});return true;}
   if(pending.kind==='purchase'){this.view.confirmation=null;if(pending.item)this.requestAccount({type:'purchase',item:pending.item});return true;}
   if(pending.kind==='newRun'&&!pending.colorTier){this.view.confirmation=null;const start=()=>this.beginNewGame({type:'newRun',mode:pending.mode??'standard',difficultyId:pending.difficultyId,outboundMode:pending.outboundMode});if(this.accountOwned)this.closeAccount('home',start);else {if(this.state.phase==='result'&&!this.recordFinal())return true;this.closeConfirmed(this.prepareReturn);if(!this.hasRun)start();}return true;}
   if(this.accountOwned){this.view.confirmation=null;if(pending.kind==='leaveRun')this.closeAccount(pending.nextScreen==='colorTiers'&&this.state.endReason==='completed'?'decline_overtime':'home',()=>this.openSelection(pending.nextScreen??'menu'));else if(pending.kind==='finishEndless'||pending.kind==='finishOvertime'){const before=this.state,run=this.view.account?.run;if(run){this.view.paused=false;this.requestAccount({type:'close',runId:run.identity.runId,reason:'retired',elapsedMs:Math.floor(this.view.elapsed)},ack=>{this.view.screen='game';this.animateAccountStep(before,[10,13].includes(before.rulesetVersion)?{type:'finishOutboundEndless'}:{type:'finish'},ack.events??[]);});}}else if(pending.kind==='resetProfile')this.requestAccount({type:'resetResults'});return true;}
   if(pending.kind==='resetProfile'){this.view.confirmation=null;if(this.hasRun&&this.state.phase==='result'&&(!this.persist()||!this.recordFinal())){this.view.profileStatus='本局结算尚未确认保存，请重试后再重置';return true;}this.requestAccount({type:'resetResults'});return true;}
   return false;
  }
  if(action.type==='shop'){if(this.view.account?.run){this.view.message='请先结束本局，再进入商店';return true;}this.shopReturn=this.view.screen;this.view.screen='shop';return true;}
  if(action.type==='selectShopTab'){if(this.view.screen==='shop'&&(action.tab==='tools'||action.tab==='cosmetics'))this.view.shopTab=action.tab;return true;}
  if(action.type==='selectCosmeticCategory'){if(this.view.screen==='shop'&&this.view.shopTab==='cosmetics'&&['theme','cargo','forklift'].includes(action.kind))this.view.cosmeticCategory=action.kind;return true;}
  if(action.type==='previewCosmetic'){if(this.view.screen==='shop'&&this.view.shopTab==='cosmetics'&&getCosmetic(action.kind,action.id))this.view.cosmeticPreview={...this.view.cosmeticPreview,[action.kind]:action.id};return true;}
  if(action.type==='purchaseCosmetic'){const item=getCosmetic(action.kind,action.id),owned=accountCosmeticState(this.view.account??null,this.profile).ownedCosmetics;if(this.view.screen==='shop'&&item&&item.price>0&&!owned.includes(item.key)&&(this.view.account?.wallet??0)>=item.price)this.view.confirmation={kind:'purchaseCosmetic',cosmeticKind:item.kind,cosmeticId:item.id};return true;}
  if(action.type==='equipCosmetic'){if(this.view.screen==='shop')this.requestAccount({type:'setCosmetic',kind:action.kind,id:action.id});return true;}
  if(action.type==='setCargoOutline'){if(this.view.screen==='shop')this.requestAccount({type:'setCargoOutline',enabled:action.enabled});return true;}
  if(action.type==='purchase'){this.view.confirmation={kind:'purchase',item:action.item};return true;}
  if(action.type==='toggleItem'){const intent=this.view.prepareIntent;if(!intent||intent.guide!=='direct'||intent.spec.family==='inbound'&&intent.spec.mode==='daily')return true;const index=intent.items.indexOf(action.item);if(index>=0)intent.items=intent.items.filter(i=>i!==action.item);else if(intent.items.length<2&&(this.view.account?.inventory[action.item]??0)>0)intent.items=[...intent.items,action.item];return true;}
  if(action.type==='guidedStart'||action.type==='directStart'){const intent=this.view.prepareIntent;if(!intent)return true;if(action.type==='guidedStart'&&(this.view.screen!=='guideOffer'||intent.spec.family==='outbound'&&(intent.spec.variant!=='normal'||intent.spec.difficultyId!=='easy')))return true;intent.guide=action.type==='guidedStart'?'guided':'direct';if(intent.spec.family==='inbound')intent.spec.guided=intent.guide==='guided';this.prepareStart();return true;}
  if(action.type==='prepareNext'){if(this.view.screen==='prepareTools'){if(this.view.prepareIntent&&[11,12,13,14,15].includes(this.view.prepareIntent.spec.rulesetVersion))this.startAccountIntent();else this.view.screen='prepareCleanup';}return true;}
  if(action.type==='chooseCleanup'){if(this.view.screen==='prepareCleanup'&&this.view.prepareIntent){this.view.prepareIntent.cleanupBranch=action.branch;this.startAccountIntent();}else this.dispatchAccount({type:'chooseCleanup',branch:action.branch});return true;}
  if(action.type==='back'&&['shop','prepareTools','prepareCleanup','guideOffer'].includes(this.view.screen??'')){this.view.screen=this.view.screen==='shop'?this.shopReturn:this.prepareReturn;this.view.prepareIntent=null;return true;}
  if(action.type==='toggleToolbox'){if(this.accountOwned&&isToolRun(this.state)&&['input','rescue'].includes(this.state.phase)&&this.view.screen==='game'&&!this.view.animation&&!this.view.needsResume&&!this.view.paused&&!this.view.toolSelection&&!this.view.supplyUpgrade){this.input.cancel();this.view.toolboxOpen=!this.view.toolboxOpen;}return true;}
  if(action.type==='tool'){if(!isToolRun(this.state)||!this.accountOwned||!['input','rescue'].includes(this.state.phase)||!this.state.toolCharges[action.item]||this.view.animation||this.view.needsResume||this.view.paused)return true;this.input.cancel();this.view.toolboxOpen=false;this.view.toolSelection={item:action.item,pieceId:null,cells:[],quarterTurns:0};return true;}
  if(action.type==='toolPiece'){const t=this.view.toolSelection;if(t&&t.item!=='clear'&&this.state.candidates.some(p=>p.id===action.pieceId)){t.pieceId=action.pieceId;this.view.selectedPieceId=action.pieceId;this.updateToolPreview();}return true;}
  if(action.type==='toolCell'){const t=this.view.toolSelection;if(t?.item==='clear'&&Number.isInteger(action.cell)&&action.cell>=0&&action.cell<this.state.board.length&&!reservedEntryCells(this.state).includes(action.cell)&&this.state.board[action.cell]!==null){t.cells=t.cells.includes(action.cell)?t.cells.filter(c=>c!==action.cell):t.cells.length<2?[...t.cells,action.cell]:t.cells;this.updateToolPreview();}return true;}
  if(action.type==='toolCargo'){const t=this.view.toolSelection;if(t?.item==='wildcard'&&t.pieceId&&isOutboundToolsRun(this.state)&&OUTBOUND_CARGO.includes(action.cargo)){t.cargo=action.cargo;this.updateToolPreview();}return true;}
  if(action.type==='toolRotate'){const t=this.view.toolSelection;if(t?.item==='rotate'){t.quarterTurns=(t.quarterTurns+1)%4 as 0|1|2|3;this.updateToolPreview();}return true;}
  if(action.type==='toolCancel'){this.view.toolboxOpen=false;this.view.toolSelection=null;this.view.selectedPieceId=null;return true;}
  if(action.type==='toolConfirm'){const t=this.view.toolSelection;if(t?.command&&!t.error){const command=t.command;this.view.toolSelection=null;this.dispatchAccount(command);}return true;}
  if(action.type==='chooseUpgrade'){if(!isInboundV9(this.state))return true;if(action.upgradeId==='cargo_supply'&&!this.state.supplyCargo){this.view.supplyUpgrade=action.upgradeId;return true;}this.dispatchAccount({type:'upgrade',upgradeId:action.upgradeId});return true;}
  if(action.type==='supplyCargo'){const upgradeId=this.view.supplyUpgrade;this.view.supplyUpgrade=null;if(upgradeId)this.dispatchAccount({type:'upgrade',upgradeId,cargo:action.cargo});return true;}
  if(action.type==='supplyCancel'){this.view.supplyUpgrade=null;return true;}
  if(action.type==='toggleSound'||action.type==='toggleMotion'){const patch=action.type==='toggleSound'?{sound:!this.profile.settings.sound}:{reducedMotion:!this.profile.settings.reducedMotion};this.requestAccount({type:'setSettings',patch},()=>{if(!this.profile.settings.sound)this.platform.stopSounds?.();});return true;}
  if(action.type==='cosmetic'){this.requestAccount({type:'setCosmetic',kind:action.kind,id:action.id});return true;}
  if(!this.accountOwned)return false;
  if(action.type==='home'||action.type==='chooseInbound'||action.type==='chooseColorTier'){const screen=action.type==='home'?'menu':action.type==='chooseInbound'?'inboundMenu':'colorTiers';if(this.view.account?.run){this.input.cancel();this.view.confirmation={kind:'leaveRun',nextScreen:screen};}else this.openSelection(screen);return true;}
  if(action.type==='skipTutorial'){const run=this.view.account?.run;if(run)this.requestAccount({type:'skipGuide',runId:run.identity.runId,track:this.view.guideTrack??'inbound'},()=>{this.view.message=isInboundRun(this.state)&&this.state.guided?'讲解已跳过，本局第2阶段引入加急；下一局正常起步':'讲解已跳过，可以自由操作';this.messageExpiresAt=this.platform.now()+3500;});return true;}
  if(action.type==='continue'){this.resume();return true;}
  if(action.type==='continueOvertime'){this.view.paused=false;this.view.screen='game';this.dispatchAccount({type:'continueOvertime'});return true;}
  if(action.type==='declineOvertime'){this.closeAccount('decline_overtime',()=>this.openSelection('menu'));return true;}
  if(action.type==='finishEndless'||action.type==='finishOvertime'){if(!this.view.animation&&['input','rescue'].includes(this.state.phase))this.view.confirmation={kind:action.type==='finishEndless'?'finishEndless':'finishOvertime'};return true;}
  return false;
 }
 private daily(){return localDailyChallenge(this.platform.wallTime?.()??Date.now(),CURRENT_RULESET);}
 private refreshDailyAvailability():void {
  const time=this.platform.wallTime?.()??Date.now(),daily=accountDailyAvailability(this.view.account??null,time,15);
  const legacyCompleted=!this.view.account&&Object.values(this.profile.dailyHistory).some(record=>record.day===daily.day&&record.won===true);
  this.view.dailyLabel=daily.day;this.view.dailyLocked=daily.completed||legacyCompleted;this.dailyDateIndex=Math.floor((time+8*60*60*1000)/(24*60*60*1000));
 }
 private allowDailyStart():boolean {
  this.refreshDailyAvailability();if(!this.view.dailyLocked)return true;
  this.view.message='今日挑战已完成';return false;
 }
 private ensureProfileReadable():boolean{
  if(!this.profileReadBlocked)return true;const loaded=loadProfile(this.platform.storage);
  if(loaded.source==='unavailable'||loaded.source==='corrupt'){this.view.profileStatus=loaded.message;this.view.profileNeedsRecovery=true;return false;}
  this.profile=loaded.profile;this.view.profile=this.profile;this.profileReadBlocked=false;this.view.profileNeedsRecovery=loaded.source==='backup';this.view.profileStatus=loaded.message;return true;
 }
 private updateProfile(profile:Profile):void{if(!this.writerHeld()){this.blockWriter();return;}if(this.accountOwned)return;if(this.profileReadBlocked){this.view.profileStatus='长期记录尚未读回，未写入默认数据';return;}this.profile=profile;this.view.profile=profile;const saved=saveProfile(this.platform.storage,profile);this.view.profileStatus=saved.message;if(!saved.ok)this.view.profileNeedsRecovery=true;}
 private serialFloor():number|null{
  if(!this.ensureProfileReadable())return null;
  const closed=closedSerialFloor(this.platform.storage);if(!closed.ok){this.view.saveStatus=closed.message;return null;}
  const runs=RUN_SLOTS.map(slot=>loadRun(this.platform.storage,slot));
  if(runs.some(run=>run.source==='unavailable')){this.view.saveStatus='无法读取另一模式进度，暂不分配新局';return null;}
  return Math.max(1,closed.floor+1,(this.legacyState.runSerial??0)+1,...runs.map(run=>(run.state?.runSerial??0)+1));
 }
 private refreshSlots():void{const status=(slot:RunSlot)=>{const loaded=loadPlayableRun(this.platform.storage,slot);return loaded.state?loaded.state.phase==='result'?'result' as const:'saved' as const:loaded.source==='corrupt'?'corrupt' as const:loaded.source==='unavailable'?'unavailable' as const:'empty' as const;};this.view.modeSlots=Object.fromEntries(RUN_SLOTS.map(slot=>[slot,status(slot)]));this.view.variant=this.slot;}
 private setActiveSlot(slot:RunSlot):boolean{if(!this.writerHeld()){this.blockWriter();return false;}
  let previous:string|null=null,changed=false;
  try{previous=this.platform.storage.get(ACTIVE_SLOT_KEY);this.platform.storage.set(ACTIVE_SLOT_KEY,slot);changed=true;if(this.platform.storage.get(ACTIVE_SLOT_KEY)!==slot)throw Error('readback');return true;}
  catch{if(changed){try{if(previous===null)this.platform.storage.remove(ACTIVE_SLOT_KEY);else this.platform.storage.set(ACTIVE_SLOT_KEY,previous);}catch{/* Both independent run snapshots remain safe even if the selector cannot be restored. */}}this.view.saveStatus='模式切换保存失败，当前进度仍保留';return false;}
 }
 private ensureSerial():boolean{if(!this.writerHeld()){this.blockWriter();return false;}
  if(this.legacyState.runSerial)return true;const assigned=this.view.account?.migration.legacySerials[this.slot];if(assigned){this.legacyState={...this.legacyState,runSerial:assigned};return true;}const floor=this.serialFloor();if(floor===null){this.view.needsResume=true;return false;}
  const allocated=allocateRun(this.profile,floor);this.legacyState={...this.legacyState,runSerial:allocated.serial};this.updateProfile(allocated.profile);return true;
 }
 private recordFinal(run:RunState=this.legacyState):boolean{if(!this.writerHeld()){this.blockWriter();return false;}if(this.accountOwned||run.phase!=='result')return true;return this.requestAccount({type:'recordLegacyResult',slot:this.slot});}
 private sound(name:SoundName):void{if(this.profile.settings.sound)this.platform.playSound(name);}
 private routeCue():void{const now=this.platform.now();if(now-this.lastRouteReady>=200){this.sound('route_ready');this.lastRouteReady=now;}}
 private feedback(kind:'pick'|'routeReady'|'invalid',pieceId?:string):void{
  if(kind==='routeReady'){this.routeCue();return;}
  this.sound(kind);if(kind==='pick'){this.view.invalidFx=null;this.view.message='';this.messageExpiresAt=0;}
  if(kind==='invalid'){this.messageExpiresAt=this.platform.now()+1800;this.invalidStarted=this.platform.now();this.view.invalidFx=pieceId&&!this.profile.settings.reducedMotion?{pieceId,progress:0}:null;}
 }
 private clearFeedback():void{this.view.toolboxOpen=false;this.view.toolSelection=null;this.animationQueue=[];this.view.animation=null;this.view.placementFx=null;this.view.invalidFx=null;this.view.noticeFx=null;this.pendingNotice=null;this.view.message='';this.messageExpiresAt=0;this.platform.stopSounds?.();}
 private startNotice(now:number):void{const notice=this.pendingNotice;this.pendingNotice=null;if(!notice)return;this.sound(notice.kind);this.noticeStarted=now;const duration=notice.kind==='fail'?(this.profile.settings.reducedMotion?MOTION.reduced.failMs:MOTION.failMs):(this.profile.settings.reducedMotion?MOTION.reduced.noticeMs:MOTION.noticeMs);this.view.noticeFx=duration?{...notice,progress:0}:null;}

 dispatch(command:GameCommand):void{
  if(!this.writerHeld()){this.blockWriter();return;}
  if(this.accountOwned){this.dispatchAccount(command);return;}
  if(!['place','upgrade','continueOvertime','finishOvertime','finishEndless'].includes(command.type))return;
  if(this.recoveryPending||this.view.developerMode&&this.view.debug||this.view.paused||this.view.needsResume||this.view.animation||this.view.confirmation||this.view.screen!=='game')return;
  const before=this.legacyState,resolved=applyCommand(before,command as Command);
  if(resolved.error){this.view.message=resolved.error;this.feedback('invalid',command.type==='place'?command.pieceId:undefined);return;}
  this.legacyState=resolved.state;
  if(before.maxOccupancy!==undefined){const placed=resolved.events.find(event=>event.type==='placed');this.legacyState={...this.legacyState,maxOccupancy:Math.max(before.maxOccupancy,before.board.filter(Boolean).length+(placed?.cells.length??0),this.legacyState.board.filter(Boolean).length)};}
  this.hasRun=true;this.canResume=true;this.view.canContinue=this.legacyState.phase!=='result';
  if(this.persist())this.recordFinal();
  const placed=resolved.events.find(event=>event.type==='placed');
  if(placed){this.placementStarted=this.platform.now();this.view.placementFx=this.profile.settings.reducedMotion?null:{cells:placed.cells.slice(),progress:0};this.sound('place');}
  if(resolved.events.some(event=>event.type==='result'&&event.result==='failed'))this.pendingNotice={kind:'fail',label:this.legacyState.rulesetVersion===8&&this.legacyState.board[76]!==null?'入口堵塞':'放不下了'};
  else if(this.legacyState.mode!=='color_exit'&&resolved.events.some(event=>event.type==='shift'))this.pendingNotice={kind:'shift',label:`第 ${this.legacyState.shift} 班`};
  else if(this.legacyState.phase==='result'&&this.legacyState.result==='won'&&this.legacyState.mode!=='tutorial'&&this.legacyState.mode!=='endless'&&!this.legacyState.overtime)this.pendingNotice={kind:'shift',label:this.legacyState.mode==='color_exit'?'目标完成':'五班完成'};
  const board=before.board.slice(),cellTraits=before.cellTraits?.map(trait=>trait?{...trait}:null);
  for(const event of resolved.events){
   if(event.type==='placed'){
    const piece=before.candidates.find(p=>p.id===event.pieceId);
    if(piece)for(const [offset,cell] of event.cells.entries()){board[cell]=pieceCellCargo(piece,offset);if(cellTraits)cellTraits[cell]=piece.trait?{kind:piece.trait,...(piece.trait==='rush'?{remaining:piece.rushTurns,bornAtCommand:this.legacyState.commandIndex}:{})}:null;}
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
 private persist():boolean{if(!this.writerHeld()){this.blockWriter();return false;}if(this.accountOwned)return !this.view.accountBlocked;if(this.recoveryPending){this.view.saveStatus='此模式需先恢复存档，旧文件仍保留';return false;}const elapsedMs=Math.floor(this.view.elapsed);if(this.legacyState.elapsedMs!==elapsedMs)this.legacyState={...this.legacyState,elapsedMs};const result=saveRun(this.platform.storage,this.legacyState,this.slot);this.view.saveStatus=result.message;return result.ok;}
 private nextAnimation(now:number):void{const next=this.animationQueue.shift();this.animationStarted=now;this.animationCues={move:false,delivery:false};this.view.animation=next?{...next,progress:0,...('transport' in next.shipment&&next.shipment.transport==='conveyor'?{transportPlan:buildOutboundTransport(next.shipment as Shipment,next.board)??undefined}:{})}:null;if(next)this.routeCue();else this.startNotice(now);}
 tick(now:number):void{
  if(Math.floor(((this.platform.wallTime?.()??Date.now())+8*60*60*1000)/(24*60*60*1000))!==this.dailyDateIndex)this.refreshDailyAvailability();
  const delta=Math.max(0,now-this.lastTick);this.lastTick=now;
  if(this.view.growthFx){this.view.growthFx.progress=Math.min(1,(now-this.growthStarted)/650);if(this.view.growthFx.progress>=1)this.view.growthFx=null;}
  if(this.view.accountBlocked||this.view.toolSelection||this.view.toolboxOpen&&!this.view.animation||this.view.supplyUpgrade||this.view.confirmation){this.animationStarted+=delta;this.placementStarted+=delta;this.invalidStarted+=delta;this.noticeStarted+=delta;if(this.messageExpiresAt)this.messageExpiresAt+=delta;return;}
  if(this.view.screen==='game'&&!this.view.paused&&!this.view.needsResume&&!this.view.confirmation&&this.state.phase!=='result'&&!([11,14,15].includes(this.state.rulesetVersion)&&this.state.phase==='cleanup'&&this.state.commandIndex===0))this.view.elapsed+=delta;
  if(this.messageExpiresAt&&now>=this.messageExpiresAt){this.view.message='';this.messageExpiresAt=0;}
  const reduced=this.profile.settings.reducedMotion;
  if(this.view.placementFx){this.view.placementFx.progress=Math.max(0,Math.min(1,(now-this.placementStarted)/MOTION.placeMs));if(reduced||this.view.placementFx.progress>=1)this.view.placementFx=null;}
  if(this.view.invalidFx){this.view.invalidFx.progress=Math.max(0,Math.min(1,(now-this.invalidStarted)/MOTION.invalidMs));if(reduced||this.view.invalidFx.progress>=1)this.view.invalidFx=null;}
  if(this.view.noticeFx){const duration=this.view.noticeFx.kind==='fail'?(reduced?MOTION.reduced.failMs:MOTION.failMs):(reduced?MOTION.reduced.noticeMs:MOTION.noticeMs);this.view.noticeFx.progress=duration?Math.max(0,Math.min(1,(now-this.noticeStarted)/duration)):1;if(this.view.noticeFx.progress>=1)this.view.noticeFx=null;}
  if(this.view.animation){const timing=shipmentTiming(reduced),plan=reduced?undefined:this.view.animation.transportPlan,elapsed=Math.max(0,now-this.animationStarted),duration=plan?.durationMs??timing.totalMs,progress=Math.min(1,elapsed/duration);this.view.animation.progress=progress;
   const moveAt=plan?.moveAtMs??timing.routeMs,deliveryAt=plan?.deliveryAtMs??(reduced?0:timing.routeMs+timing.moveMs+timing.collectMs+timing.carryMs);
   if(!this.animationCues.move&&timing.moveMs>0&&elapsed>=moveAt&&elapsed<(plan?deliveryAt:timing.routeMs+timing.moveMs)){this.animationCues.move=true;this.sound('forklift');}
   if(!this.animationCues.delivery&&elapsed>=deliveryAt){this.animationCues.delivery=true;const chain=this.view.animation.shipment.chain;this.sound(chain>=4?'chain4':chain===3?'chain3':chain===2?'chain2':'ship');}
   if(progress>=1)this.nextAnimation(now);
  }

 }
 hide():void{this.view.toolboxOpen=false;this.view.toolSelection=null;if(!this.writerHeld()){this.input.cancel();return;}if(this.accountOwned){this.input.cancel();this.clearFeedback();this.view.paused=!this.view.needsResume&&this.state.phase!=='result';this.lastTick=this.platform.now();this.saveAccountElapsed();return;}this.input.cancel();this.clearFeedback();this.lastTick=this.platform.now();this.view.paused=!this.view.needsResume&&this.hasRun&&this.legacyState.phase!=='result';if(this.hasRun&&!this.view.needsResume&&this.persist())this.recordFinal();}
 show():void{this.lastTick=this.platform.now();this.refreshDailyAvailability();this.view.message='';}
 togglePause():void{if(!this.writerHeld()){this.blockWriter();return;}if(this.accountOwned){if(this.view.accountBlocked||this.view.confirmation)return;this.input.cancel();this.view.paused=!this.view.paused;if(this.view.paused)this.clearFeedback();this.lastTick=this.platform.now();if(this.view.paused)this.saveAccountElapsed();return;}this.input.cancel();this.view.paused=!this.view.paused;if(this.view.paused)this.clearFeedback();this.lastTick=this.platform.now();if(this.view.paused&&this.persist())this.recordFinal();}
 resume():void{this.refreshDailyAvailability();if(!this.writerHeld()){this.blockWriter();return;}if(this.accountOwned){if(this.view.accountBlocked){this.retryAccount();return;}this.view.needsResume=false;this.view.paused=false;this.view.screen='game';this.view.recoveryError=undefined;this.lastTick=this.platform.now();if(isToolRun(this.state)&&this.state.phase==='rescue')this.view.toolboxOpen=true;this.closeTerminalAccount();if(this.view.account)this.showNormalMechanismHint(this.view.account.guides.inbound);return;}
  if(this.closureUncertain||this.view.needsResume&&(!this.hasRun||!this.canResume||!!this.view.recoveryError)){
   const loaded=loadPlayableRun(this.platform.storage,this.slot);
   if(loaded.closed){this.closureUncertain=false;this.openSelection('menu');return;}
   if(!loaded.state||loaded.source==='unavailable'||loaded.source==='corrupt'){this.view.saveStatus=loaded.message;this.view.recoveryError=loaded.message;return;}
   this.legacyState=loaded.state;this.view.elapsed=loaded.state.elapsedMs??0;this.hasRun=true;this.canResume=true;this.closureUncertain=false;this.view.recoveryError=undefined;
  }
  if(!this.canResume&&!this.hasRun){this.view.message='旧档无法读取。请选择新开值班，损坏原文会另存保留';return;}
  const preserved=preserveCorrupt(this.platform.storage,this.slot);if(!preserved.ok){this.view.saveStatus=preserved.message;return;}
  this.recoveryPending=false;
  if(!this.ensureSerial())return;this.view.needsResume=false;this.view.paused=false;this.view.screen='game';this.lastTick=this.platform.now();this.hasRun=true;this.canResume=true;this.view.canContinue=this.legacyState.phase!=='result';if(this.persist())this.recordFinal();this.view.message='';
 }
 restart():void{if(!this.writerHeld()){this.blockWriter();return;}if(this.accountOwned){this.action({type:'newRun',mode:this.state.mode==='color_exit'?'color_exit':this.state.mode==='endless'?'endless':this.state.mode==='daily'?'daily':'standard',...('difficultyId' in this.state?{difficultyId:this.state.difficultyId,outboundMode:[10,13].includes(this.state.rulesetVersion)?'endless':'normal' as const}:{})});return;}if(this.legacyState.mode==='color_exit'&&this.legacyState.rulesetVersion<8){this.navigateSelection('colorTiers');return;}this.action({type:'newRun',mode:this.legacyState.mode==='color_exit'?'color_exit':this.legacyState.mode==='endless'?'endless':this.legacyState.mode==='daily'?'daily':'standard',colorTier:tierForSlot(this.slot),difficultyId:difficultyForSlot(this.slot)});}
 private activate(next:RunState,slot:RunSlot,source:'new'|'saved'|'backup'|'corrupt'|'unavailable'):void{
  this.input.cancel();this.clearFeedback();this.recoveryPending=source==='backup'||source==='corrupt'||source==='unavailable';this.slot=slot;this.legacyState=next;this.hasRun=source==='new'||source==='saved'||source==='backup';this.canResume=source==='saved'||source==='new'||source==='backup';this.lastTick=this.platform.now();
  Object.assign(this.view,{screen:source==='new'&&colorSlot(slot)&&next.rulesetVersion<8?'colorIntro':'game',needsResume:source==='backup'||source==='corrupt'||source==='unavailable',paused:false,animation:null,elapsed:next.elapsedMs??0,recoveryError:source==='corrupt'?'此模式存档无法读取，原文已保留':source==='unavailable'?'无法访问此模式存储':undefined,confirmation:null,canContinue:this.hasRun&&next.phase!=='result',message:''});
  this.refreshSlots();
 }
 private switchMode(slot:RunSlot):void{if(!this.writerHeld()){this.blockWriter();return;}
  if(this.hasRun&&!this.recoveryPending&&!this.view.needsResume&&!this.persist())return;
  const target=loadPlayableRun(this.platform.storage,slot);
  if(target.source==='unavailable'){this.view.saveStatus='无法读取目标模式，当前进度仍保留';return;}
  if(target.state){
   if(target.source==='backup'){if(!this.setActiveSlot(slot))return;this.activate(target.state,slot,'backup');return;}
   let next=target.state,profile:Profile|null=null;
   if(!next.runSerial){const assigned=this.view.account?.migration.legacySerials[slot];if(assigned)next={...next,runSerial:assigned};else{const floor=this.serialFloor();if(floor===null)return;const allocated=allocateRun(this.profile,floor);next={...next,runSerial:allocated.serial};profile=allocated.profile;}}
   const saved=saveRun(this.platform.storage,next,slot);this.view.saveStatus=saved.message;if(!saved.ok)return;
   if(!this.setActiveSlot(slot))return;
   if(profile)this.updateProfile(profile);this.activate(next,slot,'saved');this.recordFinal();
   if(colorSlot(slot)&&this.legacyState.rulesetVersion<8&&this.legacyState.commandIndex===0&&this.legacyState.phase==='input')this.view.screen='colorIntro';
   return;
  }
  if(target.source==='corrupt'){
   if(!this.setActiveSlot(slot))return;
   this.activate(createForSlot(this.legacyState.seed,slot),slot,'corrupt');return;
  }
  this.start(colorSlot(slot)?'color_exit':slot==='inbound_endless'?'endless':this.profile.tutorialComplete?'standard':'tutorial',tierForSlot(slot),undefined,difficultyForSlot(slot));
 }
 private start(mode:'standard'|'daily'|'tutorial'|'color_exit'|'endless',colorTier?:ColorTier,seed?:number,difficultyId?:OutboundDifficulty):void{
  if(!this.writerHeld()){this.blockWriter();return;}
  const target:RunSlot=mode==='color_exit'?(difficultyId?slotForDifficulty(difficultyId,8):colorTier?slotForTier(colorTier):'color_exit'):mode==='endless'?'inbound_endless':'orders';
  if(target!==this.slot&&this.hasRun&&!this.recoveryPending&&!this.view.needsResume&&!this.persist())return;
  const previousLoad=loadPlayableRun(this.platform.storage,target);
  if(previousLoad.source==='unavailable'){this.view.saveStatus=previousLoad.message;return;}
  const initialFloor=this.serialFloor();if(initialFloor===null)return;
  let pointer:string|null;try{pointer=this.platform.storage.get(ACTIVE_SLOT_KEY);}catch{this.view.saveStatus='无法读取当前模式标记，未开始新局';return;}
  if(!this.setActiveSlot(target))return;
  const restorePointer=():void=>{try{if(pointer===null)this.platform.storage.remove(ACTIVE_SLOT_KEY);else this.platform.storage.set(ACTIVE_SLOT_KEY,pointer);}catch{/* Saved runs remain isolated even if the selector cannot be restored. */}};
  const preserved=preserveCorrupt(this.platform.storage,target);if(!preserved.ok){restorePointer();this.view.saveStatus=preserved.message;return;}
  const previous=previousLoad.state;let old=target===this.slot&&this.hasRun?this.legacyState:previous;
  if(old){
   if(!old.runSerial){const numbered=allocateRun(this.profile,initialFloor);old={...old,runSerial:numbered.serial};if(target===this.slot&&this.hasRun)this.legacyState=old;this.updateProfile(numbered.profile);}
   if(old.phase==='result'){const stable=saveRun(this.platform.storage,old,target);if(!stable.ok){restorePointer();this.view.saveStatus=stable.message;return;}if(!this.recordFinal(old)){restorePointer();this.view.saveStatus='本局成绩尚未保存，暂未开始新局';return;}}
   const closed=closeRun(this.platform.storage,target,old);this.view.saveStatus=closed.message;
   if(!closed.ok){restorePointer();if(closed.uncertain){this.closureUncertain=true;this.recoveryPending=true;this.view.needsResume=true;this.view.recoveryError=closed.message;this.clearFeedback();}return;}
   if(target===this.slot){this.recoveryPending=false;this.openSelection(colorSlot(target)?'colorTiers':'inboundMenu');}
  }
  const floor=this.serialFloor();if(floor===null){restorePointer();return;}
  const daily=mode==='daily'?this.daily():null,allocated=allocateRun(this.profile,floor);
  // The unique run serial gives ordinary outbound restarts a new sequence. Saved runs and daily challenges retain their own seed.
  const outboundSeed=difficultyId&&!this.view.developerMode?(this.newRunSeedBase+Math.imul(allocated.serial,0x9e3779b9))>>>0:seed??this.view.comparisonSeed??this.legacyState.seed;
  const next=createForSlot(daily?.seed??(colorTier||difficultyId?outboundSeed:(((previous?.seed??this.legacyState.seed)+1)>>>0)),target,mode==='color_exit'||mode==='endless'?'standard':mode);
  next.runSerial=allocated.serial;next.maxOccupancy=0;if(daily){next.challengeId=daily.id;next.challengeDay=daily.day;}
  const saved=saveRun(this.platform.storage,next,target);
  if(!saved.ok){restorePointer();this.view.saveStatus=old?'旧局已结束；新局保存失败，请重试':saved.message;return;}
  this.updateProfile(allocated.profile);this.activate(next,target,'new');this.view.saveStatus=saved.message;
  if(daily)this.view.message='';
 }

 private openSelection(screen:'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'):void{
  this.input.cancel();this.clearFeedback();this.hasRun=false;this.canResume=false;this.view.screen=screen;this.view.needsResume=false;this.view.paused=false;this.view.canContinue=false;this.view.confirmation=null;this.view.recoveryError=undefined;this.refreshDailyAvailability();this.refreshSlots();
 }
 private closeConfirmed(screen:'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'):void{if(!this.writerHeld()){this.blockWriter();return;}
  if(this.hasRun){
   if(!this.ensureSerial())return;
   const closed=closeRun(this.platform.storage,this.slot,this.legacyState);this.view.saveStatus=closed.message;
   if(!closed.ok){if('uncertain' in closed&&closed.uncertain){this.closureUncertain=true;this.recoveryPending=true;this.view.needsResume=true;this.view.recoveryError=closed.message;this.clearFeedback();}return;}
  }
  this.recoveryPending=false;this.openSelection(screen);
 }
 private navigateSelection(screen:'menu'|'colorTiers'|'inboundMenu'|'legacyRuns'):void{
  this.input.cancel();
  if(this.hasRun&&this.legacyState.phase!=='result'){this.view.confirmation={kind:'leaveRun',nextScreen:screen};return;}
  if(this.hasRun&&this.legacyState.phase==='result'&&!this.recoveryPending&&!this.view.needsResume){if(!this.persist()||!this.recordFinal())return;}
  this.closeConfirmed(screen);
 }
 action(action:UiAction):void{
  if(['home','newRun','chooseInbound','chooseColorTier','settings','help','finishEndless','finishOvertime','purchase'].includes(action.type)){this.view.toolboxOpen=false;this.view.toolSelection=null;}
  if(!this.writerHeld()){this.blockWriter();return;}
  if(this.handleAccountAction(action))return;
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
    if(all.some(run=>run.state?.phase==='result'&&!run.state.runSerial)||this.hasRun&&this.legacyState.phase==='result'&&!this.legacyState.runSerial){this.view.profileStatus='请先打开另一模式的旧结算，再重置长期记录';return;}
    const reset=resetProfile(this.platform.storage,(this.legacyState.runSerial??0)+1,...RUN_SLOTS.map((slot,index)=>({slot,state:slot===this.slot&&this.hasRun?this.legacyState:all[index].state??null}))); this.view.profileStatus=reset.message;
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
  if(action.type==='helpDetails'){if(this.view.screen==='colorIntro'&&this.legacyState.mode!=='color_exit')this.view.screen='helpDetails';return;}
  if(action.type==='helpBack'){if(this.view.screen==='colorIntro'||this.view.screen==='helpDetails'){this.view.screen='game';this.view.paused=this.helpPaused;this.lastTick=this.platform.now();}return;}
  if(action.type==='skipTutorial'){if(this.legacyState.mode==='tutorial'&&this.legacyState.phase==='input'&&!this.view.needsResume&&!this.recoveryPending)this.start('standard');return;}
  if(action.type==='comparisonSeedNext'){
   const next=((this.view.comparisonSeed??this.legacyState.seed)+1)>>>0;let previous:string|null=null,changed=false;
   try{previous=this.platform.storage.get(COMPARISON_SEED_KEY);this.platform.storage.set(COMPARISON_SEED_KEY,String(next));changed=true;if(this.platform.storage.get(COMPARISON_SEED_KEY)!==String(next))throw Error('readback');this.view.comparisonSeed=next;this.view.saveStatus='新局对比种子已更新，已有进度不变';}
   catch{if(changed){try{if(previous===null)this.platform.storage.remove(COMPARISON_SEED_KEY);else this.platform.storage.set(COMPARISON_SEED_KEY,previous);}catch{/* Existing run snapshots are untouched. */}}this.view.saveStatus='对比种子保存失败，仍使用原种子';}return;
  }
  if(action.type==='switchMode'){if(!isRunSlot(action.variant))return;this.view.confirmation={kind:'switchMode',variant:action.variant};return;}
  if(action.type==='introStart'){if(this.legacyState.mode==='color_exit'&&!this.recoveryPending&&!this.view.needsResume){this.view.screen='game';this.view.paused=false;this.lastTick=this.platform.now();}return;}

  if(action.type==='newRun'){
   if(action.colorTier!==undefined&&(action.mode!=='color_exit'||!isColorTier(action.colorTier)))return;
   if(action.difficultyId!==undefined&&(action.mode!=='color_exit'||!isOutboundDifficulty(action.difficultyId)||action.colorTier!==undefined))return;
   const target:RunSlot=action.mode==='color_exit'?(action.difficultyId?slotForDifficulty(action.difficultyId,8):action.colorTier?slotForTier(action.colorTier):'color_exit'):action.mode==='endless'?'inbound_endless':'orders',loaded=loadPlayableRun(this.platform.storage,target);
   if(loaded.source==='unavailable'){this.view.saveStatus='无法读取目标模式，未开始新局';return;}
   const existing=loaded.state;
   if(target===this.slot&&this.hasRun&&this.legacyState.phase!=='result'||!!existing&&existing.phase!=='result'){this.view.confirmation={kind:'newRun',mode:action.mode,colorTier:action.colorTier,difficultyId:action.difficultyId,seed:action.colorTier||action.difficultyId?this.view.comparisonSeed:undefined};return;}
   this.start(action.mode,action.colorTier,undefined,action.difficultyId);return;
  }
  if(action.type==='continue'){if(this.hasRun)this.resume();return;}
  if(action.type==='home'){this.navigateSelection('menu');return;}
  if(action.type==='settings'){this.input.cancel();this.clearFeedback();this.settingsReturn=this.view.screen==='menu'||this.view.screen==='colorTiers'||this.view.screen==='inboundMenu'||this.view.screen==='legacyRuns'?this.view.screen:'game';if(this.settingsReturn==='game')this.view.paused=true;this.view.screen='settings';if(this.accountOwned)this.saveAccountElapsed();this.lastTick=this.platform.now();return;}
  if(action.type==='back'){this.view.screen=this.settingsReturn;return;}
  if(action.type==='toggleSound'){this.updateProfile(setProfileSettings(this.profile,{sound:!this.profile.settings.sound}));if(!this.profile.settings.sound)this.platform.stopSounds?.();return;}
  if(action.type==='toggleMotion'){this.updateProfile(setProfileSettings(this.profile,{reducedMotion:!this.profile.settings.reducedMotion}));return;}
  if(action.type==='cosmetic'){const result=setProfileCosmetic(this.profile,action.kind,action.id);if(result.error){this.view.profileStatus=result.error;return;}this.updateProfile(result.profile);return;}
  if(action.type==='resetProfile'){this.view.confirmation={kind:'resetProfile'};return;}
  if(action.type==='recoverProfile'){const result=recoverProfile(this.platform.storage);this.view.profileStatus=result.message;if(result.ok){const profile=loadProfile(this.platform.storage);this.profile=profile.profile;this.view.profile=this.profile;this.profileReadBlocked=profile.source==='unavailable';this.view.profileNeedsRecovery=this.profileReadBlocked;}return;}
  if(action.type==='finishEndless'){if(this.legacyState.mode==='endless'&&this.legacyState.phase==='input')this.view.confirmation={kind:'finishEndless'};return;}
  if(action.type==='continueOvertime'){this.view.paused=false;this.view.screen='game';this.dispatch({type:'continueOvertime'});return;}
  if(action.type==='finishOvertime'&&this.legacyState.overtime)this.view.confirmation={kind:'finishOvertime'};
 }
}
