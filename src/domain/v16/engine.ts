import {cloneData} from '../../shared/data.ts';
import { createRandomState } from '../random.ts';
import { RULES_V16_CONFIG as CONFIG,inboundConfigIdV16,isInboundDifficultyV16,emptyLevelsV16,getStageV16,validToolChargesV16 } from './content.ts';
import { docksV16,neighborsV16,placementCellsV16,selectOrderGroupV16,findLegalMovesV16 } from './board.ts';
import { refillCandidateV16,refreshOrdersV16 } from './generation.ts';
import { applyToolV16,findRescuePlanV16 } from './tools.ts';
import type { InboundRunV16,InboundCommandV16,InboundStepResultV16,InboundEventV16,ShipmentV16,PlacementPreviewV16,StartV16 } from './types.ts';
import type { Point } from '../types.ts';
export {findLegalMovesV16} from './board.ts';

function refillAll(state:InboundRunV16):InboundRunV16 {let next=state;while(next.candidates.length<CONFIG.candidateCount)next=refillCandidateV16(next,next.candidates.length);return next;}
export function createRunV16(options:StartV16):InboundRunV16 {
 if(!options||!Number.isInteger(options.seed)||options.seed<-2147483648||options.seed>4294967295||!['standard','daily','endless'].includes(options.mode)||options.guided!==undefined&&typeof options.guided!=='boolean'||options.guided&&options.mode!=='standard')throw new Error('Invalid v16 start');
 const inboundDifficulty=options.inboundDifficulty===undefined?'normal':options.inboundDifficulty;if(!isInboundDifficultyV16(inboundDifficulty)||inboundDifficulty!=='normal'&&(options.mode!=='standard'||options.guided))throw new Error('Invalid v16 difficulty');
 const toolCharges=options.toolCharges??{rotate:0,clear:0,wildcard:0};if(!validToolChargesV16(toolCharges,options.mode))throw new Error('Invalid v16 tool charges');
 let state:InboundRunV16={rulesetVersion:16,runConfigId:inboundConfigIdV16(inboundDifficulty),inboundDifficulty,seed:options.seed,mode:options.mode,guided:options.guided??false,boardSize:7,board:Array(49).fill(null),cellTraits:Array(49).fill(null),rngState:createRandomState(options.seed),nextId:1,candidates:[],orders:[],phase:options.mode==='daily'?'cleanup':'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,levels:emptyLevelsV16(),upgradeChoices:[],pendingThresholds:[],claimedThresholds:[],supplyCargo:null,cleanup:null,successfulPlacements:0,generatedPieces:0,toolCharges:{...toolCharges},usedToolIds:[],commandIndex:0,commandBaseIndex:0,commands:[],overtime:false,result:null,endReason:null,maxOccupancy:0};
 state=refreshOrdersV16(state);if(state.mode!=='daily')state=refillAll(state);return state;
}
export function settlePhaseV16(state:InboundRunV16):InboundRunV16 {
 const next=cloneData(state);if(next.result!==null)return next;
 if(next.mode!=='endless'&&!next.overtime&&next.completedOrders>=30){next.phase='result';next.result='won';next.endReason='completed';next.score+=CONFIG.score.shiftBonus;return next;}
 if(next.mode==='daily'&&next.cleanup===null){next.phase='cleanup';return next;}
 if(findLegalMovesV16(next).length){next.phase='input';return next;}
 if(findRescuePlanV16(next)){next.phase='rescue';return next;}
 next.phase='result';next.result='failed';next.endReason='blocked';return next;
}
function settleWithEvents(state:InboundRunV16,events:InboundEventV16[]):InboundStepResultV16 {
 const next=settlePhaseV16(state);
 if(next.phase==='rescue')events.push({type:'rescue',plan:findRescuePlanV16(next)!});
 if(next.phase==='result'&&state.result===null)events.push({type:'result',result:next.result!,endReason:next.endReason!});
 return {state:next,events};
}
function clear(state:InboundRunV16,cells:number[]):void{for(const i of cells){state.board[i]=null;state.cellTraits[i]=null;}}
function resolveOrders(state:InboundRunV16):ShipmentV16[]{
 const docks=docksV16(state),pending=[...state.orders].sort((a,b)=>docks.findIndex(d=>d.id===a.dockId)-docks.findIndex(d=>d.id===b.dockId)),shipments:ShipmentV16[]=[];
 while(pending.length){let selected:ReturnType<typeof selectOrderGroupV16>=null,index=-1;for(let i=0;i<pending.length;i++){selected=selectOrderGroupV16(state,pending[i]);if(selected){index=i;break;}}if(!selected)break;
  const [order]=pending.splice(index,1),chain=shipments.length+1;
  const base=order.baseScore+Math.max(0,selected.group.units-order.amount)*CONFIG.score.overfill+(selected.path.length-1)*CONFIG.score.routeDepth;
  const score=Math.floor(base*(100+(chain-1)*CONFIG.score.chainPercent)/100);
  const hazard=selected.group.cells.some(i=>state.cellTraits[i]?.kind==='hazard');
  const extra=hazard?[...new Set(selected.group.cells.flatMap(i=>neighborsV16(i,state.boardSize)))].sort((a,b)=>a-b).filter(i=>state.cellTraits[i]?.kind==='waste').slice(0,1):[];
  clear(state,selected.group.cells);clear(state,extra);state.score+=score;state.completedOrders++;
  shipments.push({type:'shipment',boardSize:state.boardSize,dockId:order.dockId,gateId:selected.gateId,orderId:order.id,cargo:order.cargo,cells:selected.group.cells,path:selected.path,score,chain,units:selected.group.units,extraClearedCells:extra});
 }
 state.orders=pending;state.lastChain=shipments.length;state.maxChain=Math.max(state.maxChain,shipments.length);return shipments;
}
function cleanup(state:InboundRunV16,oldWaste:number[],shipments:number,events:InboundEventV16[]):void {
 if(!state.cleanup)return;const config=state.cleanup,target=CONFIG.cleanup[config.branch],total=config.progress+(config.branch==='orders'?shipments:1),triggers=Math.floor(total/target);config.progress=total%target;
 const cells=oldWaste.filter(i=>state.cellTraits[i]?.kind==='waste').slice(0,triggers);clear(state,cells);
 if(cells.length)events.push({type:'cleanup',branch:config.branch,cells,triggers,progress:config.progress});
}
function ageRush(state:InboundRunV16,events:InboundEventV16[]):void {
 const expired:number[]=[],ticks:{cell:number;remaining:number}[]=[];
 for(let i=0;i<state.board.length;i++){const trait=state.cellTraits[i];if(trait?.kind!=='rush'||trait.bornAtPlacement===state.successfulPlacements)continue;trait.remaining!--;if(trait.remaining!<=0){state.cellTraits[i]={kind:'waste'};expired.push(i);}else ticks.push({cell:i,remaining:trait.remaining!});}
 if(ticks.length)events.push({type:'rushTick',cells:ticks});if(expired.length)events.push({type:'rushExpired',cells:expired});
}
export function applyCommandV16(state:InboundRunV16,command:InboundCommandV16):InboundStepResultV16 {
 const reject=(error:string):InboundStepResultV16=>({state,events:[],error});
 if(!command||!['place','chooseCleanup','rotate','clear','wildcard','continueOvertime','finish'].includes(command.type))return reject('未知指令');
 if(command.type==='continueOvertime'){
  if(state.inboundDifficulty!=='normal'||state.mode!=='standard'||state.phase!=='result'||state.result!=='won'||state.endReason!=='completed'||state.overtime)return reject('只有完成五班的普通局可以继续加班');
  let next=cloneData(state);next.overtime=true;next.phase='input';next.result=null;next.endReason=null;next.commandIndex++;next.commands.push({type:'continueOvertime'});next=refillAll(refreshOrdersV16(next));return settleWithEvents(next,[{type:'overtimeStarted'}]);
 }
 if(state.phase==='result'||state.result!==null)return reject('本局已经结束');
 if(command.type==='finish'){
  if(state.phase!=='input'&&state.phase!=='rescue')return reject('请先选择清扫方式');
  const next=cloneData(state);next.phase='result';next.result=next.mode==='standard'&&next.overtime?'won':'failed';next.endReason='retired';next.commandIndex++;next.commands.push({type:'finish'});return {state:next,events:[{type:'result',result:next.result,endReason:'retired'}]};
 }
 if(command.type==='chooseCleanup'){
  if(state.mode!=='daily'||state.phase!=='cleanup'||state.cleanup!==null||!['orders','placements'].includes(command.branch))return reject('当前不能选择清扫');
  let next=cloneData(state);next.cleanup={branch:command.branch,progress:0};next.commandIndex++;next.commands.push({...command});next=refillAll(next);return settleWithEvents(next,[{type:'cleanupChosen',branch:command.branch}]);
 }
 if(command.type==='rotate'||command.type==='clear'||command.type==='wildcard'){const tool=applyToolV16(state,command);return tool.error?tool:settleWithEvents(tool.state,tool.events);}
 if(state.phase!=='input')return reject('当前阶段不能入库');
 const checked=placementCellsV16(state,command.pieceId,command.origin);if(checked.reason)return reject(checked.reason);
 let next=cloneData(state);const slot=next.candidates.findIndex(p=>p.id===command.pieceId),piece=next.candidates[slot];
 const oldWaste=next.cellTraits.map((t,i)=>t?.kind==='waste'?i:-1).filter(i=>i>=0);next.successfulPlacements++;
 for(const cell of checked.cells){next.board[cell]=piece.cargo;next.cellTraits[cell]=piece.trait?piece.trait==='rush'?{kind:'rush',remaining:piece.rushTurns!,bornAtPlacement:next.successfulPlacements}:{kind:piece.trait}:null;}
 next.maxOccupancy=Math.max(next.maxOccupancy??0,next.board.filter(c=>c!==null).length);
 const events:InboundEventV16[]=[{type:'placed',pieceId:piece.id,cells:checked.cells}];const shipments=resolveOrders(next);events.push(...shipments);cleanup(next,oldWaste,shipments.length,events);ageRush(next,events);
 const shift=getStageV16(next.completedOrders);if(shift>next.shift){next.score+=(shift-next.shift)*CONFIG.score.shiftBonus;next.shift=shift;events.push({type:'shift',shift});}
 // Completion keeps only unconsumed cargo and unresolved original orders. No unused RNG draws.
 if(next.mode!=='endless'&&!next.overtime&&next.completedOrders>=30)next.candidates.splice(slot,1);
 else {next=refreshOrdersV16(next);next=refillCandidateV16(next,slot);next=refillAll(next);}
 next.commandIndex++;next.commands.push(cloneData(command));return settleWithEvents(next,events);
}
export function previewPlacementV16(state:InboundRunV16,pieceId:string,origin:Point):PlacementPreviewV16 {
 const checked=placementCellsV16(state,pieceId,origin),result=applyCommandV16(state,{type:'place',pieceId,origin});
 if(result.error)return {valid:false,cells:checked.cells,shipments:[],events:[],reason:result.error};
 return {valid:true,cells:checked.cells,shipments:result.events.filter((e):e is ShipmentV16=>e.type==='shipment'),events:result.events,stateAfter:result.state};
}
