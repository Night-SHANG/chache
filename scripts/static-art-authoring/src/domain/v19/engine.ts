import {cloneData} from '../../shared/data.ts';
import {createRandomState} from '../random.ts';
import {applyCommandV16,findLegalMovesV16,settlePhaseV16} from '../v16/engine.ts';
import {placementCellsV16} from '../v16/board.ts';
import {emptyLevelsV16,inboundConfigIdV16,validToolChargesV16} from '../v16/content.ts';
import {refreshOrdersV16} from '../v16/generation.ts';
import {applyToolV16,findRescuePlanV16} from '../v16/tools.ts';
import type {InboundRunV16,InboundStepResultV16,ToolCommandV16} from '../v16/types.ts';
import {isInboundDifficultyV18,scaledScoreV18} from '../v18/content.ts';
import {rushConfigIdV19} from './content.ts';
import type {Point,RushDifficultyV19,RushRunV19,StartRushV19,RushCommandV19,RushEventV19,RushStepResultV19,RushPreviewV19} from './types.ts';

function hasDateIdentity(state:object):boolean {return ['date','dateKey','dailyKey','dailyDate','dailyId','challengeDay'].some(key=>Object.prototype.hasOwnProperty.call(state,key));}
function assertIdentity(state:InboundRunV16|RushRunV19,version:16|19):void {
 if(!state||state.rulesetVersion!==version||!Number.isInteger(state.seed)||state.seed<-2147483648||state.seed>4294967295||!isInboundDifficultyV18(state.inboundDifficulty)||state.runConfigId!==(version===19?rushConfigIdV19(state.inboundDifficulty):inboundConfigIdV16(state.inboundDifficulty))||state.mode!==(version===19?'rush':'daily')||state.guided!==false||state.overtime!==false||hasDateIdentity(state))throw new Error('Invalid v19 projection identity');
 if(!validToolChargesV16(state.toolCharges,'standard')||!Array.isArray(state.usedToolIds)||new Set(state.usedToolIds).size!==state.usedToolIds.length||state.usedToolIds.some(id=>!['rotate','clear','wildcard'].includes(id)||state.toolCharges[id]!==0)||state.usedToolIds.length+state.toolCharges.rotate+state.toolCharges.clear+state.toolCharges.wildcard>2)throw new Error('Invalid v19 tool state');
}
/** Gameplay always projects to daily16; only the isolated tool policy temporarily uses standard. */
export function asV16(state:RushRunV19):InboundRunV16 {
 assertIdentity(state,19);
 if(!Number.isSafeInteger(state.score)||state.score<0||scaledScoreV18(state.rawScore,state.inboundDifficulty)!==state.score)throw new Error('Invalid v19 score projection');
 const projected=cloneData(state) as unknown as InboundRunV16&{rawScore?:number};
 delete projected.rawScore;projected.rulesetVersion=16;projected.runConfigId=inboundConfigIdV16(state.inboundDifficulty);projected.mode='daily';projected.score=state.rawScore;
 return projected;
}
export function fromV16(state:InboundRunV16):RushRunV19 {
 assertIdentity(state,16);
 if(Object.prototype.hasOwnProperty.call(state,'rawScore'))throw new Error('Invalid raw score in v16 projection');
 const inboundDifficulty=state.inboundDifficulty as RushDifficultyV19,score=scaledScoreV18(state.score,inboundDifficulty);
 return {...cloneData(state),rulesetVersion:19,runConfigId:rushConfigIdV19(inboundDifficulty),mode:'rush',inboundDifficulty,guided:false,overtime:false,rawScore:state.score,score};
}
export function createRunV19(options:StartRushV19):RushRunV19 {
 if(!options||Object.keys(options).some(key=>!['seed','mode','inboundDifficulty','guided','toolCharges'].includes(key))||!Number.isInteger(options.seed)||options.seed<-2147483648||options.seed>4294967295||options.mode!=='rush'||options.guided!==undefined&&options.guided!==false)throw new Error('Invalid v19 start');
 const inboundDifficulty=options.inboundDifficulty===undefined?'hard':options.inboundDifficulty;
 if(!isInboundDifficultyV18(inboundDifficulty))throw new Error('Invalid v19 difficulty');
 const toolCharges=options.toolCharges===undefined?{rotate:0 as const,clear:0 as const,wildcard:0 as const}:options.toolCharges;
 if(!validToolChargesV16(toolCharges,'standard'))throw new Error('Invalid v19 tool charges');
 // No discarded ordinary-tier or candidate draws: only the chosen tier's actual opening orders.
 const pristine:InboundRunV16={rulesetVersion:16,runConfigId:inboundConfigIdV16(inboundDifficulty),inboundDifficulty,seed:options.seed,mode:'daily',guided:false,boardSize:7,board:Array(49).fill(null),cellTraits:Array(49).fill(null),rngState:createRandomState(options.seed),nextId:1,candidates:[],orders:[],phase:'cleanup',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,levels:emptyLevelsV16(),upgradeChoices:[],pendingThresholds:[],claimedThresholds:[],supplyCargo:null,cleanup:null,successfulPlacements:0,generatedPieces:0,toolCharges:{...toolCharges},usedToolIds:[],commandIndex:0,commandBaseIndex:0,commands:[],overtime:false,result:null,endReason:null,maxOccupancy:0};
 return fromV16(refreshOrdersV16(pristine));
}
/** Daily16 has no inventory rescue. Reconsider only its new blocked result using frozen tool search. */
function restoreToolRescue(result:InboundStepResultV16):InboundStepResultV16 {
 if(result.state.result!=='failed'||result.state.endReason!=='blocked')return result;
 const available={...result.state,phase:'input' as const,result:null,endReason:null};
 const plan=findRescuePlanV16({...available,mode:'standard'});
 if(!plan?.length)return result;
 return {state:{...available,phase:'rescue'},events:[...result.events.filter(event=>event.type!=='result'),{type:'rescue',plan}]};
}
export function findRescuePlanV19(state:RushRunV19):ToolCommandV16[]|null {
 const raw=asV16(state);if(raw.cleanup===null||raw.phase==='cleanup')return null;
 return findRescuePlanV16({...raw,mode:'standard'});
}
export function settlePhaseV19(state:RushRunV19):RushRunV19 {
 const raw=asV16(state);if(raw.result!==null)return fromV16(raw);
 return fromV16(restoreToolRescue({state:settlePhaseV16(raw),events:[]}).state);
}
export function applyCommandV19(state:RushRunV19,command:RushCommandV19):RushStepResultV19 {
 const raw=asV16(state);
 let result:InboundStepResultV16;
 if(command?.type==='rotate'||command?.type==='clear'||command?.type==='wildcard'){
  result=applyToolV16({...raw,mode:'standard'},command);
  if(result.error)return {state,events:[],error:result.error};
  const settled=settlePhaseV16({...result.state,mode:'daily'});result={state:settled,events:result.events};
  if(settled.result!==null)result.events.push({type:'result',result:settled.result,endReason:settled.endReason!});
 }else result=applyCommandV16(raw,command);
 if(result.error)return {state,events:[],error:result.error};
 if(raw.result===null)result=restoreToolRescue(result);
 return {state:fromV16(result.state),events:scaleEvents(result.events,state.rawScore,state.inboundDifficulty)};
}
function scaleEvents(events:RushEventV19[],rawScore:number,difficulty:RushDifficultyV19):RushEventV19[] {
 let cumulative=rawScore;
 return events.map(event=>{
  if(event.type!=='shipment')return event;
  const previous=scaledScoreV18(cumulative,difficulty);cumulative+=event.score;
  return {...event,score:scaledScoreV18(cumulative,difficulty)-previous};
 });
}
export function previewPlacementV19(state:RushRunV19,pieceId:string,origin:Point):RushPreviewV19 {
 const checked=placementCellsV16(asV16(state),pieceId,origin),result=applyCommandV19(state,{type:'place',pieceId,origin});
 if(result.error)return {valid:false,cells:checked.cells,shipments:[],events:[],reason:result.error};
 return {valid:true,cells:checked.cells,shipments:result.events.filter(event=>event.type==='shipment'),events:result.events,stateAfter:result.state};
}
export function findLegalMovesV19(state:RushRunV19):{pieceId:string;origin:Point}[] {return findLegalMovesV16(asV16(state));}
