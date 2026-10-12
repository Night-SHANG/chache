import {cloneData} from '../../shared/data.ts';
import {createRandomState} from '../random.ts';
import {applyCommandV16,createRunV16,findLegalMovesV16,previewPlacementV16,settlePhaseV16} from '../v16/engine.ts';
import {RULES_V16_CONFIG,emptyLevelsV16,inboundConfigIdV16,validToolChargesV16} from '../v16/content.ts';
import {refillCandidateV16,refreshOrdersV16} from '../v16/generation.ts';
import {findRescuePlanV16} from '../v16/tools.ts';
import type {InboundRunV16} from '../v16/types.ts';
import {inboundConfigIdV18,isInboundDifficultyV18,scaledScoreV18} from './content.ts';
import type {Point} from '../types.ts';
import type {InboundCommandV18,InboundDifficultyV18,InboundEventV18,InboundRunV18,InboundStepResultV18,PlacementPreviewV18,StartV18} from './types.ts';

function assertIdentity(state:InboundRunV16|InboundRunV18,version:16|18):void {
 if(!state||state.rulesetVersion!==version||!Number.isInteger(state.seed)||state.seed<-2147483648||state.seed>4294967295||!isInboundDifficultyV18(state.inboundDifficulty)||state.runConfigId!==(version===18?inboundConfigIdV18(state.inboundDifficulty):inboundConfigIdV16(state.inboundDifficulty))||state.guided!==false||typeof state.mode!=='string'||!['standard','daily','endless'].includes(state.mode)||state.mode==='daily'&&state.inboundDifficulty!=='hard')throw new Error('Invalid v18 projection identity');
}
/** Frozen16 receives the original cumulative score and never sees the18 rawScore field. */
export function asV16(state:InboundRunV18):InboundRunV16 {
 assertIdentity(state,18);
 if(!Number.isSafeInteger(state.score)||state.score<0||scaledScoreV18(state.rawScore,state.inboundDifficulty)!==state.score)throw new Error('Invalid v18 score projection');
 const projected=cloneData(state) as unknown as InboundRunV16&{rawScore?:number};
 delete projected.rawScore;projected.rulesetVersion=16;projected.runConfigId=inboundConfigIdV16(state.inboundDifficulty);projected.score=state.rawScore;
 return projected;
}
/** Only raw16 totals are scaled; corrupt identity or score input is rejected, never normalized. */
export function fromV16(state:InboundRunV16):InboundRunV18 {
 assertIdentity(state,16);
 if(Object.prototype.hasOwnProperty.call(state,'rawScore'))throw new Error('Invalid raw score in v16 projection');
 const score=scaledScoreV18(state.score,state.inboundDifficulty as InboundRunV18['inboundDifficulty']);
 return {...cloneData(state),rulesetVersion:18,runConfigId:inboundConfigIdV18(state.inboundDifficulty as InboundRunV18['inboundDifficulty']),inboundDifficulty:state.inboundDifficulty as InboundRunV18['inboundDifficulty'],guided:false,rawScore:state.score,score};
}
export function createRunV18(options:StartV18):InboundRunV18 {
 if(!options||!Number.isInteger(options.seed)||options.seed<-2147483648||options.seed>4294967295||typeof options.mode!=='string'||!['standard','daily','endless'].includes(options.mode)||options.guided!==undefined&&options.guided!==false)throw new Error('Invalid v18 start');
 const inboundDifficulty=options.inboundDifficulty===undefined?'hard':options.inboundDifficulty;
 if(!isInboundDifficultyV18(inboundDifficulty)||options.mode==='daily'&&inboundDifficulty!=='hard')throw new Error('Invalid v18 difficulty');
 const toolCharges=options.toolCharges===undefined?{rotate:0 as const,clear:0 as const,wildcard:0 as const}:options.toolCharges;
 if(!validToolChargesV16(toolCharges,options.mode))throw new Error('Invalid v18 tool charges');
 if(options.mode!=='daily')return fromV16({...createRunV16({seed:options.seed,mode:'standard',inboundDifficulty,guided:false,toolCharges}),mode:options.mode});
 // The only new creation boundary: pristine daily C orders, with no discarded A/candidate draws.
 const pristine:InboundRunV16={rulesetVersion:16,runConfigId:inboundConfigIdV16(inboundDifficulty),inboundDifficulty,seed:options.seed,mode:'daily',guided:false,boardSize:7,board:Array(49).fill(null),cellTraits:Array(49).fill(null),rngState:createRandomState(options.seed),nextId:1,candidates:[],orders:[],phase:'cleanup',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,levels:emptyLevelsV16(),upgradeChoices:[],pendingThresholds:[],claimedThresholds:[],supplyCargo:null,cleanup:null,successfulPlacements:0,generatedPieces:0,toolCharges:{...toolCharges},usedToolIds:[],commandIndex:0,commandBaseIndex:0,commands:[],overtime:false,result:null,endReason:null,maxOccupancy:0};
 return fromV16(refreshOrdersV16(pristine));
}
export function applyCommandV18(state:InboundRunV18,command:InboundCommandV18):InboundStepResultV18 {
 const raw=asV16(state);
 if(command?.type==='continueOvertime'){
  if(raw.mode!=='standard'||raw.phase!=='result'||raw.result!=='won'||raw.endReason!=='completed'||raw.overtime)return {state,events:[],error:'只有完成五班的困难或专业局可以继续加班'};
  // Only16's tier restriction changes. Generation, rescue and settlement remain frozen16.
  let next=raw;next.overtime=true;next.phase='input';next.result=null;next.endReason=null;next.commandIndex++;next.commands.push({type:'continueOvertime'});
  next=refreshOrdersV16(next);while(next.candidates.length<RULES_V16_CONFIG.candidateCount)next=refillCandidateV16(next,next.candidates.length);
  const settled=settlePhaseV16(next),events:InboundEventV18[]=[{type:'overtimeStarted'}];
  if(settled.phase==='rescue')events.push({type:'rescue',plan:findRescuePlanV16(settled)!});
  if(settled.phase==='result')events.push({type:'result',result:settled.result!,endReason:settled.endReason!});
  return {state:fromV16(settled),events};
 }
 const result=applyCommandV16(raw,command);
 return result.error?{state,events:[],error:result.error}:{state:fromV16(result.state),events:scaleEvents(result.events,state.rawScore,state.inboundDifficulty)};
}
function scaleEvents(events:InboundEventV18[],rawScore:number,difficulty:InboundDifficultyV18):InboundEventV18[] {
 let cumulative=rawScore;
 return events.map(event=>{
  if(event.type!=='shipment')return event;
  const previous=scaledScoreV18(cumulative,difficulty);cumulative+=event.score;
  return {...event,score:scaledScoreV18(cumulative,difficulty)-previous};
 });
}
export function previewPlacementV18(state:InboundRunV18,pieceId:string,origin:Point):PlacementPreviewV18 {
 const result=previewPlacementV16(asV16(state),pieceId,origin);
 const {stateAfter,...preview}=result,events=scaleEvents(result.events,state.rawScore,state.inboundDifficulty);
 return {...preview,events,shipments:events.filter(event=>event.type==='shipment'),...(stateAfter?{stateAfter:fromV16(stateAfter)}:{})};
}
export function findLegalMovesV18(state:InboundRunV18):{pieceId:string;origin:Point}[] {return findLegalMovesV16(asV16(state));}
