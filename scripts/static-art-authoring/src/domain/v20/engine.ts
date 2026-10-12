import {cloneData} from '../../shared/data.ts';
import {createRunV16,applyCommandV16,findLegalMovesV16,settlePhaseV16} from '../v16/engine.ts';
import {placementCellsV16} from '../v16/board.ts';
import {inboundConfigIdV16,validToolChargesV16} from '../v16/content.ts';
import {applyToolV16,findRescuePlanV16} from '../v16/tools.ts';
import type {InboundRunV16,InboundStepResultV16,ToolCommandV16} from '../v16/types.ts';
import {rushConfigIdV20} from './content.ts';
import type {Point,RushRunV20,StartRushV20,RushCommandV20,RushStepResultV20,RushPreviewV20} from './types.ts';

function assertIdentity(state:InboundRunV16|RushRunV20,version:16|20):void {
 if(!state||state.rulesetVersion!==version||!Number.isInteger(state.seed)||state.seed<-2147483648||state.seed>4294967295||state.inboundDifficulty!=='normal'||state.runConfigId!==(version===20?rushConfigIdV20():inboundConfigIdV16('normal'))||state.mode!==(version===20?'rush':'daily')||state.guided!==false||state.overtime!==false||['date','dateKey','dailyKey','dailyDate','dailyId','challengeDay'].some(key=>Object.prototype.hasOwnProperty.call(state,key)))throw new Error('Invalid v20 projection identity');
 if(!validToolChargesV16(state.toolCharges,'standard')||!Array.isArray(state.usedToolIds)||new Set(state.usedToolIds).size!==state.usedToolIds.length||state.usedToolIds.some(id=>!['rotate','clear','wildcard'].includes(id)||state.toolCharges[id]!==0)||state.usedToolIds.length+state.toolCharges.rotate+state.toolCharges.clear+state.toolCharges.wildcard>2)throw new Error('Invalid v20 tool state');
}
function assertScore(score:number):void {if(!Number.isSafeInteger(score)||score<0)throw new RangeError('Invalid v20 score');}
/** Gameplay projects to the frozen normal daily16 engine; tools use its isolated standard policy. */
export function asV16(state:RushRunV20):InboundRunV16 {
 assertIdentity(state,20);assertScore(state.rawScore);
 if(state.score!==state.rawScore)throw new Error('Invalid v20 score projection');
 const projected=cloneData(state) as unknown as InboundRunV16&{rawScore?:number};
 delete projected.rawScore;projected.rulesetVersion=16;projected.runConfigId=inboundConfigIdV16('normal');projected.mode='daily';return projected;
}
export function fromV16(state:InboundRunV16):RushRunV20 {
 assertIdentity(state,16);assertScore(state.score);
 if(Object.prototype.hasOwnProperty.call(state,'rawScore'))throw new Error('Invalid raw score in v16 projection');
 return {...cloneData(state),rulesetVersion:20,runConfigId:rushConfigIdV20(),mode:'rush',inboundDifficulty:'normal',guided:false,overtime:false,rawScore:state.score};
}
export function createRunV20(options:StartRushV20):RushRunV20 {
 if(!options||Object.keys(options).some(key=>!['seed','mode','inboundDifficulty','guided','toolCharges'].includes(key))||!Number.isInteger(options.seed)||options.seed<-2147483648||options.seed>4294967295||options.mode!=='rush'||options.guided!==undefined&&options.guided!==false||options.inboundDifficulty!==undefined&&options.inboundDifficulty!=='normal')throw new Error('Invalid v20 start');
 const toolCharges=options.toolCharges===undefined?{rotate:0 as const,clear:0 as const,wildcard:0 as const}:options.toolCharges;
 if(!validToolChargesV16(toolCharges,'standard'))throw new Error('Invalid v20 tool charges');
 const pristine=createRunV16({seed:options.seed,mode:'daily',inboundDifficulty:'normal',guided:false});
 return fromV16({...pristine,toolCharges:{...toolCharges}});
}
function restoreToolRescue(result:InboundStepResultV16):InboundStepResultV16 {
 if(result.state.result!=='failed'||result.state.endReason!=='blocked')return result;
 const available={...result.state,phase:'input' as const,result:null,endReason:null},plan=findRescuePlanV16({...available,mode:'standard'});
 if(!plan?.length)return result;
 return {state:{...available,phase:'rescue'},events:[...result.events.filter(event=>event.type!=='result'),{type:'rescue',plan}]};
}
export function findRescuePlanV20(state:RushRunV20):ToolCommandV16[]|null {
 const raw=asV16(state);if(raw.cleanup===null||raw.phase==='cleanup')return null;return findRescuePlanV16({...raw,mode:'standard'});
}
export function settlePhaseV20(state:RushRunV20):RushRunV20 {
 const raw=asV16(state);if(raw.result!==null)return fromV16(raw);return fromV16(restoreToolRescue({state:settlePhaseV16(raw),events:[]}).state);
}
export function applyCommandV20(state:RushRunV20,command:RushCommandV20):RushStepResultV20 {
 const raw=asV16(state);let result:InboundStepResultV16;
 if(command?.type==='rotate'||command?.type==='clear'||command?.type==='wildcard'){
  result=applyToolV16({...raw,mode:'standard'},command);if(result.error)return {state,events:[],error:result.error};
  const settled=settlePhaseV16({...result.state,mode:'daily'});result={state:settled,events:result.events};
  if(settled.result!==null)result.events.push({type:'result',result:settled.result,endReason:settled.endReason!});
 }else result=applyCommandV16(raw,command);
 if(result.error)return {state,events:[],error:result.error};if(raw.result===null)result=restoreToolRescue(result);
 return {state:fromV16(result.state),events:result.events};
}
export function previewPlacementV20(state:RushRunV20,pieceId:string,origin:Point):RushPreviewV20 {
 const checked=placementCellsV16(asV16(state),pieceId,origin),result=applyCommandV20(state,{type:'place',pieceId,origin});
 if(result.error)return {valid:false,cells:checked.cells,shipments:[],events:[],reason:result.error};
 return {valid:true,cells:checked.cells,shipments:result.events.filter(event=>event.type==='shipment'),events:result.events,stateAfter:result.state};
}
export function findLegalMovesV20(state:RushRunV20):{pieceId:string;origin:Point}[] {return findLegalMovesV16(asV16(state));}
