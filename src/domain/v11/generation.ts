import {cloneData} from '../../shared/data.ts';
import { CARGO,SHAPES } from '../rulesets/v1/content.ts';
import { nextRandom } from '../random.ts';
import { RULES_V11_CONFIG as CONFIG } from './content.ts';
import { cellUnitsV11,docksV11 } from './board.ts';
import type { CargoId } from '../types.ts';
import type { InboundRunV11,GenerationDistributionV11,PieceV11 } from './types.ts';

function probabilities(weights:number[]):number[]{const total=weights.reduce((sum,weight)=>sum+weight,0);return weights.map(weight=>weight/total);}
function inventoryUnits(state:InboundRunV11,cargo:CargoId):number{return state.board.reduce<number>((n,c,i)=>n+(c===cargo?cellUnitsV11(state,i):0),0);}
export function generationDistributionV11(state:InboundRunV11):GenerationDistributionV11 {
 const traits=state.guided&&state.shift===1?{normal:1,pallet:0,rush:0,hazard:0,wildcard:0}:state.shift<3?{normal:.94,pallet:0,rush:.06,hazard:0,wildcard:0}:{normal:.85,pallet:.05,rush:.06,hazard:.03,wildcard:.01};
 const shapes=SHAPES.filter(s=>s.minShift<=state.shift),occupancy=state.board.filter(c=>c!==null).length;
 const weights=shapes.map(s=>{
  let weight=s.weight*100;
  if(s.cells.length<=2)weight=Math.floor(weight*(100+Math.floor(occupancy*CONFIG.generation.occupancySmallPercent/state.board.length))/100);
  if(state.candidates.some(p=>p.shapeId===s.id))weight=Math.floor(weight/CONFIG.generation.recentShapeDivisor);
  return Math.max(1,weight);
 });
 const shapeProb=probabilities(weights);
 const cargos=CARGO.slice(0,CONFIG.cargoByShift[state.shift-1]).map(c=>c.id),cargoProb=probabilities(cargos.map(c=>20+inventoryUnits(state,c)*CONFIG.generation.cargoPresenceWeight));
 return {traits,ordinaryShapes:shapes.map((s,i)=>({shapeId:s.id,probability:shapeProb[i]})),nonWildcardCargos:cargos.map((cargo,i)=>({cargo,probability:cargoProb[i]}))};
}
function random(state:InboundRunV11,min:number,max:number):number{const draw=nextRandom(state.rngState,min,max);state.rngState=draw.state;return draw.value;}
/** Keep frozen sampling precision and draw order for the unchanged cargo generator. */
function sample<T>(state:InboundRunV11,values:T[],probabilities:number[]):T {
 const draw=random(state,0,0xffffffff)/0x100000000;let cumulative=0;
 for(let i=0;i<values.length;i++){cumulative+=probabilities[i];if(draw<cumulative)return values[i];}
 return values[values.length-1];
}
export function generatePieceV11(state:InboundRunV11):{state:InboundRunV11;piece:PieceV11}{
 const next=cloneData(state),distribution=generationDistributionV11(next);
 const trait=sample(next,['normal','pallet','rush','hazard','wildcard'] as const,Object.values(distribution.traits));
 const shapeId=trait==='normal'?sample(next,distribution.ordinaryShapes.map(s=>s.shapeId),distribution.ordinaryShapes.map(s=>s.probability)):'shape.single';
 // Wildcard has no cargo-class draw.
 const cargo=trait==='wildcard'?distribution.nonWildcardCargos[0].cargo:sample(next,distribution.nonWildcardCargos.map(c=>c.cargo),distribution.nonWildcardCargos.map(c=>c.probability));
 const piece:PieceV11={id:`piece.${next.nextId++}`,shapeId,cargo,quarterTurns:0};
 if(trait!=='normal'){piece.trait=trait;if(trait==='rush')piece.rushTurns=3;}
 next.generatedPieces++;return {state:next,piece};
}
export function refreshOrdersV11(state:InboundRunV11):InboundRunV11 {
 const next=cloneData(state);
 for(const dock of docksV11(next).slice(0,CONFIG.docksByShift[next.shift-1])){
  if(next.orders.some(o=>o.dockId===dock.id))continue;
  const cargos=CARGO.slice(0,CONFIG.cargoByShift[next.shift-1]).map(c=>c.id).filter(c=>!next.orders.some(o=>o.cargo===c));
  const cargo=cargos[random(next,0,cargos.length-1)],raw=random(next,CONFIG.orderMinByShift[next.shift-1],CONFIG.orderMaxByShift[next.shift-1]);
  next.orders.push({id:`order.${next.nextId++}`,dockId:dock.id,cargo,amount:raw,baseScore:CONFIG.score.orderBase+(next.shift-1)*CONFIG.score.orderPerShift});
 }
 const docks=docksV11(next);next.orders.sort((a,b)=>docks.findIndex(d=>d.id===a.dockId)-docks.findIndex(d=>d.id===b.dockId));return next;
}
export function refillCandidateV11(state:InboundRunV11,slot:number):InboundRunV11 {
 if(!Number.isInteger(slot)||slot<0||slot>state.candidates.length)throw new Error('Invalid candidate slot');
 const remaining=cloneData(state);remaining.candidates=remaining.candidates.filter((_,index)=>index!==slot);
 const draw=generatePieceV11(remaining);draw.state.candidates=state.candidates.map(p=>({...p}));draw.state.candidates[slot]=draw.piece;return draw.state;
}
