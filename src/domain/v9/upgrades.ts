import {cloneData} from '../../shared/data.ts';
import { CARGO } from '../rulesets/v1/content.ts';
import { nextRandom } from '../random.ts';
import { UPGRADES_V9,RULES_V9_CONFIG as CONFIG } from './content.ts';
import { expandBoardV9,openSideGateV9 } from './board.ts';
import { refillCandidateV9 } from './generation.ts';
import type { CargoId } from '../types.ts';
import type { InboundRunV9,UpgradeIdV9,InboundStepResultV9 } from './types.ts';

export function reducedOrderAmountV9(amount:number,level:0|1):number{return level?Math.min(amount,Math.max(3,amount-1)):amount;}
export function eligibleUpgradesV9(state:InboundRunV9):UpgradeIdV9[]{return UPGRADES_V9.filter(u=>state.completedOrders>=u.unlockOrders&&state.levels[u.id]<u.maxStack).map(u=>u.id);}
export function enqueueThresholdsV9(state:InboundRunV9,previousOrders:number):InboundRunV9 {
 const next=cloneData(state);
 for(const threshold of CONFIG.upgradeThresholds)if(previousOrders<threshold&&next.completedOrders>=threshold&&!next.claimedThresholds.includes(threshold)&&!next.pendingThresholds.includes(threshold))next.pendingThresholds.push(threshold);
 next.pendingThresholds.sort((a,b)=>a-b);return next;
}
export function generateOfferV9(state:InboundRunV9):InboundRunV9 {
 if(!state.pendingThresholds.length||state.upgradeChoices.length)return cloneData(state);
 const next=cloneData(state),pool=eligibleUpgradesV9(next),choices:UpgradeIdV9[]=[];
 function choose(ids:UpgradeIdV9[]):void {
  if(!ids.length)throw new Error('V9 upgrade pool exhausted');
  // Low benefit reduces weight while preserving eligibility and strictly positive probability.
  const weights=ids.map(id=>Math.max(1,Math.floor(100/(next.levels[id]+1)/(id==='light_orders'&&next.orders.every(o=>o.amount<=3)?2:1))));
  const draw=nextRandom(next.rngState,1,weights.reduce((n,w)=>n+w,0));next.rngState=draw.state;let value=draw.value;
  for(let i=0;i<ids.length;i++){value-=weights[i];if(value<=0){choices.push(ids[i]);pool.splice(pool.indexOf(ids[i]),1);return;}}
 }
 for(let i=0;i<2;i++)choose(pool.filter(id=>UPGRADES_V9.find(u=>u.id===id)!.functional));
 choose(pool);next.upgradeChoices=choices;return next;
}
export function chooseUpgradeV9(state:InboundRunV9,id:UpgradeIdV9,cargo?:CargoId):InboundStepResultV9 {
 const reject=(error:string):InboundStepResultV9=>({state,events:[],error});
 if(state.phase!=='upgrade'||!state.pendingThresholds.length||!state.upgradeChoices.includes(id)||!eligibleUpgradesV9(state).includes(id))return reject('当前不能选择此升级');
 const unlocked=CARGO.slice(0,CONFIG.cargoByShift[state.shift-1]).map(c=>c.id);
 if(id==='cargo_supply'&&(!state.supplyCargo&&(!cargo||!unlocked.includes(cargo))||state.supplyCargo&&cargo!==undefined&&cargo!==state.supplyCargo))return reject('请选择已解锁的专供货类');
 if(id!=='cargo_supply'&&cargo!==undefined)return reject('此升级不选择货类');
 let next=cloneData(state);
 if(id==='warehouse_expand')next=expandBoardV9(next);
 else if(id==='side_gate')next=openSideGateV9(next);
 else next.levels[id]++;
 if(id==='cargo_supply'&&!next.supplyCargo)next.supplyCargo=cargo!;
 if(id==='light_orders')next.orders=next.orders.map(o=>({...o,amount:reducedOrderAmountV9(o.amount,1)}));
 if(id==='candidate_slots')while(next.candidates.length<3+next.levels.candidate_slots)next=refillCandidateV9(next,next.candidates.length);
 const threshold=next.pendingThresholds.shift()!;next.claimedThresholds.push(threshold);next.upgradeChoices=[];next.phase=next.pendingThresholds.length?'upgrade':'input';
 next.commandIndex++;next.commands.push({type:'upgrade',upgradeId:id,...(cargo===undefined?{}:{cargo})});
 next=generateOfferV9(next);
 const events:InboundStepResultV9['events']=[{type:'upgradeChosen',upgradeId:id,level:next.levels[id],...(id==='cargo_supply'?{cargo:next.supplyCargo!}:{})}];
 if(next.pendingThresholds.length)events.push({type:'upgrade',threshold:next.pendingThresholds[0],choices:[...next.upgradeChoices]});
 return {state:next,events};
}
export function shipmentBonusV9(state:InboundRunV9,units:number,amount:number,chain:number):number{return state.levels.order_bonus*50+Math.max(0,units-amount)*state.levels.overfill_bonus*10+(chain>=2?state.levels.chain_bonus*100:0);}
