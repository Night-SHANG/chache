import {cloneData} from '../../shared/data.ts';
import { CARGO,SHAPES } from '../rulesets/v1/content.ts';
import { nextRandom } from '../random.ts';
import { RULES_V9_CONFIG as CONFIG } from './content.ts';
import { cellUnitsV9,docksV9 } from './board.ts';
import type { CargoId } from '../types.ts';
import type { InboundRunV9,GenerationDistributionV9,PieceV9 } from './types.ts';

export function boostProbabilityV9(base:number,levels:number,increment:number,cap:number):number{return Math.max(base,Math.min(cap,base+levels*increment));}
function probabilities(weights:number[]):number[]{const total=weights.reduce((s,w)=>s+w,0);return weights.map(w=>w/total);}
function boostGroup(base:number[],indices:number[],levels:number,cap:number):number[]{
 const selected=new Set(indices),mass=indices.reduce((s,i)=>s+base[i],0);
 if(!levels||mass===0||mass===1)return base;
 const boosted=boostProbabilityV9(mass,levels,.1,cap);
 return base.map((p,i)=>selected.has(i)?p*boosted/mass:p*(1-boosted)/(1-mass));
}
function inventoryUnits(state:InboundRunV9,cargo:CargoId):number{return state.board.reduce<number>((n,c,i)=>n+(c===cargo?cellUnitsV9(state,i):0),0);}
export function generationDistributionV9(state:InboundRunV9):GenerationDistributionV9 {
 const pallet=state.shift>=3?5+5*state.levels.pallet_rate:0;
 const traits=state.guided&&state.shift===1?{normal:1,pallet:0,rush:0,hazard:0,wildcard:0}:state.shift<3?{normal:.94,pallet:0,rush:.06,hazard:0,wildcard:0}:{normal:(90-pallet)/100,pallet:pallet/100,rush:.06,hazard:.03,wildcard:.01};
 const shapes=SHAPES.filter(s=>s.minShift<=state.shift),occupancy=state.board.filter(c=>c!==null).length;
 const weights=shapes.map(s=>{
  let weight=s.weight*100;
  if(s.cells.length<=2)weight=Math.floor(weight*(100+Math.floor(occupancy*CONFIG.generation.occupancySmallPercent/state.board.length))/100);
  if(state.candidates.some(p=>p.shapeId===s.id))weight=Math.floor(weight/CONFIG.generation.recentShapeDivisor);
  return Math.max(1,weight);
 });
 const shapeProb=boostGroup(probabilities(weights),shapes.map((s,i)=>s.cells.length<=2?i:-1).filter(i=>i>=0),state.levels.small_parcels,.9);
 const cargos=CARGO.slice(0,CONFIG.cargoByShift[state.shift-1]).map(c=>c.id),cargoProb=probabilities(cargos.map(c=>20+inventoryUnits(state,c)*CONFIG.generation.cargoPresenceWeight));
 const supplyIndex=cargos.indexOf(state.supplyCargo!);
 const boostedCargo=supplyIndex>=0?boostGroup(cargoProb,[supplyIndex],state.levels.cargo_supply,.8):cargoProb;
 return {traits,ordinaryShapes:shapes.map((s,i)=>({shapeId:s.id,probability:shapeProb[i]})),nonWildcardCargos:cargos.map((cargo,i)=>({cargo,probability:boostedCargo[i]}))};
}
function random(state:InboundRunV9,min:number,max:number):number{const draw=nextRandom(state.rngState,min,max);state.rngState=draw.state;return draw.value;}
/** Float cumulative probabilities avoid converting boosted probabilities into rounded integer weights. */
function sample<T>(state:InboundRunV9,values:T[],probabilities:number[]):T {
 const draw=random(state,0,0xffffffff)/0x100000000;let cumulative=0;
 for(let i=0;i<values.length;i++){cumulative+=probabilities[i];if(draw<cumulative)return values[i];}
 return values[values.length-1];
}
export function generatePieceV9(state:InboundRunV9):{state:InboundRunV9;piece:PieceV9}{
 const next=cloneData(state),distribution=generationDistributionV9(next);
 const trait=sample(next,['normal','pallet','rush','hazard','wildcard'] as const,Object.values(distribution.traits));
 const shapeId=trait==='normal'?sample(next,distribution.ordinaryShapes.map(s=>s.shapeId),distribution.ordinaryShapes.map(s=>s.probability)):'shape.single';
 // Wildcard has no cargo-class draw and is excluded from the supply denominator.
 const cargo=trait==='wildcard'?distribution.nonWildcardCargos[0].cargo:sample(next,distribution.nonWildcardCargos.map(c=>c.cargo),distribution.nonWildcardCargos.map(c=>c.probability));
 const piece:PieceV9={id:`piece.${next.nextId++}`,shapeId,cargo,quarterTurns:0};
 if(trait!=='normal'){piece.trait=trait;if(trait==='rush')piece.rushTurns=3;}
 next.generatedPieces++;return {state:next,piece};
}
export function refreshOrdersV9(state:InboundRunV9):InboundRunV9 {
 const next=cloneData(state);
 for(const dock of docksV9(next).slice(0,CONFIG.docksByShift[next.shift-1])){
  if(next.orders.some(o=>o.dockId===dock.id))continue;
  const cargos=CARGO.slice(0,CONFIG.cargoByShift[next.shift-1]).map(c=>c.id).filter(c=>!next.orders.some(o=>o.cargo===c));
  const cargo=cargos[random(next,0,cargos.length-1)],raw=random(next,CONFIG.orderMinByShift[next.shift-1],CONFIG.orderMaxByShift[next.shift-1]);
  next.orders.push({id:`order.${next.nextId++}`,dockId:dock.id,cargo,amount:next.levels.light_orders?Math.min(raw,Math.max(3,raw-1)):raw,baseScore:CONFIG.score.orderBase+(next.shift-1)*CONFIG.score.orderPerShift});
 }
 const docks=docksV9(next);next.orders.sort((a,b)=>docks.findIndex(d=>d.id===a.dockId)-docks.findIndex(d=>d.id===b.dockId));return next;
}
export function refillCandidateV9(state:InboundRunV9,slot:number):InboundRunV9 {
 if(!Number.isInteger(slot)||slot<0||slot>state.candidates.length)throw new Error('Invalid candidate slot');
 const remaining=cloneData(state);remaining.candidates=remaining.candidates.filter((_,index)=>index!==slot);
 const draw=generatePieceV9(remaining);draw.state.candidates=state.candidates.map(p=>({...p}));draw.state.candidates[slot]=draw.piece;return draw.state;
}
