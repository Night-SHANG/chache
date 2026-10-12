import {createRunV16} from '../domain/v16/engine.ts';
import {createRunV12} from '../domain/v12/engine.ts';
import {applyPlayableCommand} from '../domain/playable.ts';
import type {GameRun,GameCommand,GameEvent} from '../domain/playable.ts';
import type {GuideProgress} from './account-types.ts';
import {freshGuideProgress} from './account-guides.ts';
import {advanceGuide,guideOverlay,isGuideComplete} from './tutorials.ts';
import type {GuideOverlay} from './tutorials.ts';
import {INBOUND_GUIDE_V16} from './inbound-guide-v16.ts';
import {OUTBOUND_GUIDE_V12} from './outbound-guide-v12.ts';
export type PracticeKind='inbound'|'outbound'|'daily';
export interface PracticeRun {kind:PracticeKind;state:GameRun;progress:GuideProgress;completed:boolean;observedExpiry:boolean}
export const isPracticeKind=(kind:unknown):kind is PracticeKind=>typeof kind==='string'&&['inbound','outbound','daily'].includes(kind);
const DAILY_PLACEMENTS:readonly (readonly [string,number,number])[]=[['piece.5',0,0],['piece.4',4,0],['piece.7',5,0],['piece.8',0,1],['piece.3',1,1],['piece.6',3,1]];
/** Only pure reducers and local guidance: this module has no account, storage or clock. */
export function createPractice(kind:PracticeKind):PracticeRun {
 if(!isPracticeKind(kind))throw Error('未知教学练习');
 const zero={rotate:0,clear:0,wildcard:0} as const;
 const state=kind==='outbound'?createRunV12(OUTBOUND_GUIDE_V12.seed,'easy',zero):createRunV16({seed:kind==='daily'?7:INBOUND_GUIDE_V16.seed,mode:kind==='daily'?'daily':'standard',guided:kind==='inbound',inboundDifficulty:'normal',toolCharges:zero});
 return {kind,state,progress:freshGuideProgress(),completed:false,observedExpiry:false};
}
export function practiceOverlay(run:PracticeRun):GuideOverlay|null {
 if(run.completed)return null;
 if(run.kind!=='daily')return guideOverlay(run.kind,run.progress,run.state);
 if(run.state.phase==='cleanup')return {step:'sweepChoice',text:'选择一种清扫方式'};
 const placement=DAILY_PLACEMENTS[run.state.commandIndex-1];if(!placement)return null;
 const [pieceId,x,y]=placement,step=run.state.commandIndex;
 const text=step===1?'拖入加急货；候选区不扣数':step===2?'刚放下剩3次；不是秒':step===3?'成功放置后，先出货再扣数':step===4?'再放一次，加急归零变废物':step===5?'归零变废物；凑食品订单，等待清扫':run.state.rulesetVersion===16&&'cleanup' in run.state&&run.state.cleanup?.branch==='orders'?'再出一单，按单清扫旧废物':'第6次放置，定期清扫旧废物';
 return {step:step>=5?'expired':'rushTimer',text,selectedPieceId:pieceId,allowedOrigins:[{x,y}],expectedCommand:{type:'place',pieceId,origin:{x,y}}};
}
export function applyPracticeCommand(run:PracticeRun,command:GameCommand):{practice:PracticeRun;events:GameEvent[];error?:string} {
 const reject=()=>({practice:run,events:[],error:'请完成提示操作，或结束练习'});
 if(run.completed||!command||typeof command!=='object')return reject();
 const expected=practiceOverlay(run)?.expectedCommand;
 if(run.kind==='daily'&&run.state.phase==='cleanup'){
  if(command.type!=='chooseCleanup'||!['orders','placements'].includes(command.branch)||Object.keys(command).length!==2)return reject();
 }else if(!expected||command.type!=='place'||expected.type!=='place'||Object.keys(command).length!==3||command.pieceId!==expected.pieceId||!command.origin||Object.keys(command.origin).length!==2||command.origin.x!==expected.origin.x||command.origin.y!==expected.origin.y)return reject();
 const result=applyPlayableCommand(run.state,command);if(result.error)return {practice:run,events:[],error:result.error};
 const progress=advanceGuide(run.kind,run.progress,run.state,command,result),observedExpiry=run.observedExpiry||result.events.some(event=>event.type==='rushExpired');
 const completed=run.kind==='daily'?observedExpiry&&result.state.commandIndex===7&&result.events.some(event=>event.type==='cleanup'&&event.cells.includes(0)):isGuideComplete(run.kind,progress,result.state.rulesetVersion);
 return {practice:{...run,state:result.state,progress,observedExpiry,completed},events:result.events};
}
