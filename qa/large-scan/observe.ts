import type { CellTrait, Command, CommandResult, Order, Piece, RunState, Shipment, TraitId } from '../../src/domain/types.ts';
import { CARGO, DOCKS, SHAPES, UPGRADES_V2, upgradeStackV2 as stack, upgradeParamV2 as param } from '../../src/domain/v2/content.ts';
import { RULES_V3_CONFIG as CONFIG } from '../../src/domain/v3/content.ts';
import { cellUnitsV2, neighbors, selectOrderGroupV2, toIndex } from '../../src/domain/v2/board.ts';
import { nextRandom } from '../../src/domain/random.ts';

type Json = null | boolean | number | string | Json[] | { [key:string]:Json };
type TraitCounts = Record<TraitId | 'normal',number>;
export interface Witness { commandIndex:number; command:Command|null; eventSummary:Record<string,Json> }
/** All fields are additive JSON counters, except first witnesses and explanatory strings.
 * generated/placed count pieces; shipped counts physical cells because piece identity is not retained on board.
 * Reuse one accumulator across runs, calling observeInitial exactly once for each fresh run.
 * A mismatch increments anomalies and throws immediately; the caller must retain the failing run.
 */
export interface Coverage {
  initialStates:number; commands:number; successfulCommands:number; rejectedCommands:number;
  generatedPieces:number; placedCells:number; shipments:number; shippedUnits:number;
  traits:{generated:TraitCounts;placed:TraitCounts;shipped:TraitCounts};
  rushExpired:{events:number;cells:number}; waste:{generated:number;cleared:number};
  pallet:{shippedCells:number;shippedUnits:number;bonusUnits:number};
  wildcard:{shippedCells:number;crossCargoCells:number;crossCargoShipments:number};
  actualEffects:Record<string,number>; probabilityOpportunities:Record<string,number>;
  firstWitness:Record<string,Witness>; unobservedReason:Record<string,string>;
  checks:Record<string,number>; anomalies:Record<string,number>; firstAnomaly:Record<string,Witness>;
}
const probabilityEffects=['small_parcels','stock_orders','wild_supply'] as const;
const scoreEffects=['contract','overfill','deep_route','chain','variety'] as const;
function traits():TraitCounts{return {normal:0,pallet:0,rush:0,hazard:0,wildcard:0};}
export function createCoverage():Coverage {
  return {
    initialStates:0,commands:0,successfulCommands:0,rejectedCommands:0,generatedPieces:0,placedCells:0,shipments:0,shippedUnits:0,
    traits:{generated:traits(),placed:traits(),shipped:traits()},rushExpired:{events:0,cells:0},waste:{generated:0,cleared:0},
    pallet:{shippedCells:0,shippedUnits:0,bonusUnits:0},wildcard:{shippedCells:0,crossCargoCells:0,crossCargoShipments:0},
    actualEffects:Object.fromEntries(UPGRADES_V2.map(u=>[u.effect,0])),probabilityOpportunities:Object.fromEntries(probabilityEffects.map(id=>[id,0])),
    firstWitness:{},unobservedReason:Object.fromEntries(UPGRADES_V2.map(u=>[u.effect,probabilityEffects.some(id=>id===u.effect)
      ?'Only eligible generation opportunities are observed. An individual random outcome is not attributed to this upgrade.'
      :'No qualifying actual-effect witness has been observed.'])),checks:{},anomalies:{},firstAnomaly:{},
  };
}
interface Context {coverage:Coverage;command:Command|null;commandIndex:number}
function makeWitness(ctx:Context,eventSummary:Record<string,Json>):Witness {
  // Detach every stored witness, including event arrays and the command's origin.
  return JSON.parse(JSON.stringify({commandIndex:ctx.commandIndex,command:ctx.command,eventSummary})) as Witness;
}
function witness(ctx:Context,key:string,summary:Record<string,Json>):void {
  if(!ctx.coverage.firstWitness[key])ctx.coverage.firstWitness[key]=makeWitness(ctx,summary);
}
function check(ctx:Context,key:string,valid:boolean,summary:Record<string,Json>):void {
  ctx.coverage.checks[key]=(ctx.coverage.checks[key]??0)+1;
  if(valid)return;
  ctx.coverage.anomalies[key]=(ctx.coverage.anomalies[key]??0)+1;
  if(!ctx.coverage.firstAnomaly[key])ctx.coverage.firstAnomaly[key]=makeWitness(ctx,summary);
  throw new Error(`Coverage ${key} at command ${ctx.commandIndex}: ${JSON.stringify(summary)}`);
}
function effect(ctx:Context,id:string,summary:Record<string,Json>):void {
  ctx.coverage.actualEffects[id]++;delete ctx.coverage.unobservedReason[id];witness(ctx,id,summary);
}
function opportunity(ctx:Context,id:typeof probabilityEffects[number],summary:Record<string,Json>):void {
  ctx.coverage.probabilityOpportunities[id]++;witness(ctx,`opportunity.${id}`,summary);
}
function supported(ctx:Context,state:RunState):void {
  check(ctx,'supported',state.rulesetVersion===3&&state.mode==='standard',{rulesetVersion:state.rulesetVersion,mode:state.mode});
}
function equalNumbers(a:readonly number[],b:readonly number[]):boolean{return a.length===b.length&&a.every((v,i)=>v===b[i]);}
function pieceNumber(piece:Piece):number {return /^piece\.\d+$/.test(piece.id)?Number(piece.id.slice(6)):NaN;}
function generated(ctx:Context,state:RunState,piece:Piece,ordinal:number):void {
  const kind=piece.trait??'normal',summary={pieceId:piece.id,trait:kind,generatedOrdinal:ordinal,shift:state.shift};
  check(ctx,'generation.trait',kind in ctx.coverage.traits.generated,{pieceId:piece.id,trait:kind});
  const forced=state.shift>=CONFIG.special.minShift&&stack(state,'pallet_supply')>0&&ordinal%param('pallet_supply','interval')===0;
  if(forced)check(ctx,'generation.palletSupply',piece.trait==='pallet',summary);
  if(piece.trait==='rush')check(ctx,'generation.rushTurns',piece.rushTurns===CONFIG.special.rushTurns+stack(state,'rush_buffer')*param('rush_buffer','extraTurns'),{...summary,rushTurns:piece.rushTurns??null});
  ctx.coverage.generatedPieces++;ctx.coverage.traits.generated[kind]++;witness(ctx,`trait.generated.${kind}`,summary);
  if(forced)effect(ctx,'pallet_supply',summary);
  if(piece.trait==='rush'&&stack(state,'rush_buffer'))effect(ctx,'rush_buffer',{...summary,rushTurns:piece.rushTurns!});
  if(!piece.trait&&stack(state,'small_parcels'))opportunity(ctx,'small_parcels',summary);
  if(state.shift>=CONFIG.special.minShift&&!forced&&stack(state,'wild_supply'))opportunity(ctx,'wild_supply',summary);
}
export function observeInitial(coverage:Coverage,state:RunState):void {
  const ctx:Context={coverage,command:null,commandIndex:state.commandIndex};supported(ctx,state);
  check(ctx,'initial.fresh',state.commandIndex===0&&state.generatedPieces===state.candidates.length,{commandIndex:state.commandIndex,generatedPieces:state.generatedPieces??null,candidates:state.candidates.length});
  const pieces=[...state.candidates].sort((a,b)=>pieceNumber(a)-pieceNumber(b));
  check(ctx,'generation.ids',pieces.every((p,i)=>Number.isSafeInteger(pieceNumber(p))&&(i===0||pieceNumber(p)>pieceNumber(pieces[i-1]))),{pieceIds:pieces.map(p=>p.id)});
  coverage.initialStates++;pieces.forEach((piece,i)=>generated(ctx,state,piece,i+1));
}
function adjacent(cells:number[]):number[]{return [...new Set(cells.flatMap(neighbors))].sort((a,b)=>a-b);}
function clear(shadow:RunState,cells:number[]):void{for(const i of cells){shadow.board[i]=null;shadow.cellTraits![i]=null;}}
function shipmentSummary(shipment:Shipment):Record<string,Json>{
  return {type:'shipment',orderId:shipment.orderId,dockId:shipment.dockId,cargo:shipment.cargo,cells:[...shipment.cells],path:shipment.path.map(p=>({x:p.x,y:p.y})),score:shipment.score,chain:shipment.chain,units:shipment.units??null,extraClearedCells:[...(shipment.extraClearedCells??[])],usedPalletPass:shipment.usedPalletPass??false};
}
function expectedScore(state:RunState,order:Order,shipment:Shipment,varied:boolean,without?:string):number {
  const count=(id:string)=>id===without?0:stack(state,id),depth=shipment.path.length-1;
  const base=order.baseScore+count('contract')*param('contract','points');
  const overfill=Math.max(0,shipment.units!-order.amount)*(CONFIG.score.overfill+count('overfill')*param('overfill','points'));
  const route=depth*(CONFIG.score.routeDepth+(depth>=param('deep_route','minDepth')?count('deep_route')*param('deep_route','points'):0));
  const variety=varied?count('variety')*param('variety','points'):0;
  return Math.floor((base+overfill+route+variety)*(100+(shipment.chain-1)*(CONFIG.score.chainPercent+count('chain')*param('chain','percent')))/100);
}
function observeShipment(ctx:Context,shadow:RunState,shipment:Shipment,pending:Order[],previous:Shipment|undefined,ordinal:number):void {
  const summary=shipmentSummary(shipment),order=pending.find(o=>o.id===shipment.orderId);
  check(ctx,'shipment.oldOrder',!!order&&order.cargo===shipment.cargo&&order.dockId===shipment.dockId,{...summary,pendingOrderIds:pending.map(o=>o.id)});
  check(ctx,'shipment.chain',shipment.chain===ordinal,{...summary,expectedChain:ordinal});
  check(ctx,'shipment.cells',shipment.cells.length>0&&new Set(shipment.cells).size===shipment.cells.length&&shipment.cells.every(i=>Number.isInteger(i)&&i>=0&&i<49&&shadow.board[i]!==null&&shadow.cellTraits![i]?.kind!=='waste'&&(shadow.board[i]===shipment.cargo||shadow.cellTraits![i]?.kind==='wildcard')),summary);
  const units=shipment.cells.reduce((sum,i)=>sum+cellUnitsV2(shadow,i),0);
  check(ctx,'shipment.units',shipment.units===units&&units>=order!.amount,{...summary,expectedUnits:units,oldOrderAmount:order!.amount});
  const varied=previous!==undefined&&previous.cargo!==shipment.cargo,score=expectedScore(shadow,order!,shipment,varied);
  check(ctx,'shipment.score',shipment.score===score,{...summary,expectedScore:score,oldOrderAmount:order!.amount,oldOrderBase:order!.baseScore});

  // Compare first reachable order, not merely the first sorted entry (which may be blocked).
  if(stack(shadow,'small_order_first')){
    const priority=(dockId:string)=>DOCKS.find(d=>d.id===dockId)?.priority??99;
    const defaultFirst=[...pending].sort((a,b)=>priority(a.dockId)-priority(b.dockId)).find(o=>selectOrderGroupV2(shadow,o,ordinal===1&&stack(shadow,'pallet_pass')>0));
    check(ctx,'shipment.defaultReachable',!!defaultFirst,summary);
    if(defaultFirst!.id!==shipment.orderId)effect(ctx,'small_order_first',{...summary,defaultFirstOrderId:defaultFirst!.id});
  }
  for(const id of scoreEffects)if(stack(shadow,id)&&score>expectedScore(shadow,order!,shipment,varied,id))effect(ctx,id,{...summary,withoutUpgradeScore:expectedScore(shadow,order!,shipment,varied,id),oldOrderAmount:order!.amount});
  if(stack(shadow,'side_gate')&&shipment.path[0]?.x===0&&shipment.path[0]?.y===6)effect(ctx,'side_gate',summary);
  if(stack(shadow,'pallet_pass')&&ordinal===1&&shipment.usedPalletPass===true)effect(ctx,'pallet_pass',summary);

  let crossed=0;
  for(const cell of shipment.cells){
    const kind=(shadow.cellTraits![cell]?.kind??'normal') as TraitId|'normal';ctx.coverage.traits.shipped[kind]++;
    witness(ctx,`trait.shipped.${kind}`,summary);
    if(kind==='pallet'){ctx.coverage.pallet.shippedCells++;ctx.coverage.pallet.shippedUnits+=2;ctx.coverage.pallet.bonusUnits++;witness(ctx,'pallet.units',summary);}
    if(kind==='wildcard'){ctx.coverage.wildcard.shippedCells++;if(shadow.board[cell]!==shipment.cargo)crossed++;}
  }
  if(crossed){ctx.coverage.wildcard.crossCargoCells+=crossed;ctx.coverage.wildcard.crossCargoShipments++;witness(ctx,'wildcard.crossCargo',{...summary,crossCargoCells:crossed});}
  const hazard=shipment.cells.some(i=>shadow.cellTraits![i]?.kind==='hazard');
  const hazardWaste=hazard?adjacent(shipment.cells).filter(i=>shadow.cellTraits![i]?.kind==='waste').slice(0,stack(shadow,'hazard_clearance')?param('hazard_clearance','maxWaste'):1):[];
  clear(shadow,shipment.cells);clear(shadow,hazardWaste);
  const routeNeighbors=ordinal===1?adjacent(shipment.path.map(toIndex)):[];
  const sweepWaste=ordinal===1&&stack(shadow,'sweep_route')?routeNeighbors.filter(i=>shadow.cellTraits![i]?.kind==='waste').slice(0,param('sweep_route','maxWaste')):[];
  clear(shadow,sweepWaste);
  const pickup=ordinal===1&&stack(shadow,'extra_pickup')?routeNeighbors.filter(i=>shadow.board[i]!==null&&shadow.board[i]!==shipment.cargo&&shadow.cellTraits![i]===null).slice(0,param('extra_pickup','maxCargo')):[];
  clear(shadow,pickup);
  const extra=[...hazardWaste,...sweepWaste,...pickup].sort((a,b)=>a-b);
  check(ctx,'shipment.extraClearedCells',equalNumbers(extra,shipment.extraClearedCells??[]),{...summary,expectedExtra:extra,hazardWaste,sweepWaste,pickup});
  if(hazardWaste.length>1&&stack(shadow,'hazard_clearance'))effect(ctx,'hazard_clearance',{...summary,hazardWaste});
  if(sweepWaste.length)effect(ctx,'sweep_route',{...summary,sweepWaste});
  if(pickup.length)effect(ctx,'extra_pickup',{...summary,pickup});
  ctx.coverage.waste.cleared+=hazardWaste.length+sweepWaste.length;
  if(hazardWaste.length+sweepWaste.length)witness(ctx,'waste.cleared',{...summary,hazardWaste,sweepWaste});
  ctx.coverage.shipments++;ctx.coverage.shippedUnits+=units;pending.splice(pending.indexOf(order!),1);
}
/** Only refreshOrders draws are reconstructed, on a detached RNG cursor. No engine command,
 * generation retry, alternate outcome, or mutation of the observed RNG ever occurs here. */
function observeOrders(ctx:Context,before:RunState,after:RunState,shadow:RunState,pending:Order[]):number {
  const active=[...pending],newOrders=after.orders.filter(o=>!before.orders.some(old=>old.id===o.id));
  let rng=[...before.rngState];
  const draw=(min:number,max:number)=>{const next=nextRandom(rng,min,max);rng=next.state;return next.value;};
  for(const old of pending){const retained=after.orders.find(o=>o.id===old.id);check(ctx,'order.retained',!!retained&&retained.dockId===old.dockId&&retained.cargo===old.cargo&&retained.amount===old.amount&&retained.baseScore===old.baseScore,{oldOrderId:old.id});}
  // Final wins and upgrade selections do not refresh orders.
  const refresh=ctx.command?.type==='continueOvertime'||(ctx.command?.type==='place'&&!(after.phase==='result'&&after.result==='won'&&!after.overtime));
  const docks=refresh?DOCKS.slice(0,CONFIG.docksByShift[after.shift-1]).filter(d=>!active.some(o=>o.dockId===d.id)):[];
  check(ctx,'order.count',newOrders.length===docks.length,{newOrderIds:newOrders.map(o=>o.id),missingDocks:docks.map(d=>d.id)});
  for(let index=0;index<docks.length;index++){
    const dock=docks[index],pool=CARGO.slice(0,CONFIG.cargoByShift[after.shift-1]).map(c=>c.id).filter(id=>!active.some(o=>o.cargo===id));
    let cargo:typeof pool[number];
    if(stack(after,'stock_orders')){
      const weights=pool.map(id=>param('stock_orders','baseCargoWeight')+shadow.board.reduce<number>((sum,cell,i)=>sum+(cell===id?cellUnitsV2(shadow,i):0),0)*param('stock_orders','unitWeight'));
      let chosen=draw(1,weights.reduce((sum,n)=>sum+n,0)),selected=0;
      for(;selected<weights.length-1;selected++){chosen-=weights[selected];if(chosen<=0)break;}
      cargo=pool[selected];
    }else cargo=pool[draw(0,pool.length-1)];
    const raw=draw(CONFIG.orderMinByShift[after.shift-1],CONFIG.orderMaxByShift[after.shift-1]);
    const amount=stack(after,'light_orders')?Math.max(param('light_orders','floor'),raw-param('light_orders','reduction')):raw;
    const actual=newOrders.find(o=>o.dockId===dock.id),summary={orderId:actual?.id??null,dockId:dock.id,cargo,rawAmount:raw,amount};
    check(ctx,'order.generated',!!actual&&actual.id===`order.${before.nextId+index}`&&actual.cargo===cargo&&actual.baseScore===CONFIG.score.orderBase+(after.shift-1)*CONFIG.score.orderPerShift,summary);
    check(ctx,'order.amount',actual!.amount===amount,{...summary,actualAmount:actual!.amount});
    if(stack(after,'light_orders')&&amount<raw)effect(ctx,'light_orders',summary);
    if(stack(after,'stock_orders'))opportunity(ctx,'stock_orders',summary);
    active.push(actual!);
  }
  return newOrders.length;
}
export function observeCommand(coverage:Coverage,before:RunState,command:Command,result:CommandResult):void {
  const after=result.state,ctx:Context={coverage,command,commandIndex:before.commandIndex+1};supported(ctx,before);coverage.commands++;
  if(result.error){coverage.rejectedCommands++;check(ctx,'rejected.unchanged',after===before&&result.events.length===0,{error:result.error});return;}
  supported(ctx,after);check(ctx,'command.index',after.commandIndex===ctx.commandIndex,{before:before.commandIndex,after:after.commandIndex});coverage.successfulCommands++;
  const shadow:RunState={...before,board:[...before.board],cellTraits:before.board.map((_,i)=>before.cellTraits?.[i]?{...before.cellTraits[i]!}:null)},pending=[...before.orders];
  const placedEvents=result.events.filter(e=>e.type==='placed'),shipmentEvents=result.events.filter((e):e is Shipment=>e.type==='shipment');
  if(command.type==='place'){
    const piece=before.candidates.find(p=>p.id===command.pieceId),shape=SHAPES.find(s=>s.id===piece?.shapeId),placed=placedEvents[0];
    check(ctx,'placement.event',!!piece&&!!shape&&placedEvents.length===1&&placed.pieceId===piece.id,{pieceId:command.pieceId,placedEvents:placedEvents.length});
    const cells=shape!.cells.map(p=>toIndex({x:p.x+command.origin.x,y:p.y+command.origin.y}));
    check(ctx,'placement.cells',equalNumbers(cells,placed.cells)&&cells.every(i=>shadow.board[i]===null),{expectedCells:cells,actualCells:placed.cells});
    const kind=piece!.trait??'normal';coverage.traits.placed[kind]++;coverage.placedCells+=cells.length;witness(ctx,`trait.placed.${kind}`,{type:'placed',pieceId:piece!.id,cells,trait:kind});
    for(const cell of cells){shadow.board[cell]=piece!.cargo;shadow.cellTraits![cell]=piece!.trait?piece!.trait==='rush'?{kind:'rush',remaining:piece!.rushTurns!,bornAtCommand:ctx.commandIndex}:{kind:piece!.trait}:null;}
  }else check(ctx,'nonplacement.events',placedEvents.length===0&&shipmentEvents.length===0,{commandType:command.type,placements:placedEvents.length,shipments:shipmentEvents.length});
  shipmentEvents.forEach((shipment,i)=>observeShipment(ctx,shadow,shipment,pending,shipmentEvents[i-1],i+1));
  const expired:number[]=[];
  if(command.type==='place')for(let i=0;i<49;i++){
    const trait=shadow.cellTraits![i];if(trait?.kind!=='rush'||trait.bornAtCommand===ctx.commandIndex)continue;
    trait.remaining!--;if(trait.remaining!<=0){shadow.cellTraits![i]={kind:'waste'};expired.push(i);}
  }
  const expiryEvents=result.events.filter(e=>e.type==='rushExpired'),eventExpired=expiryEvents.flatMap(e=>e.cells);
  check(ctx,'rushExpired.cells',equalNumbers(expired,eventExpired)&&expiryEvents.length===(expired.length?1:0),{expectedCells:expired,actualCells:eventExpired});
  coverage.rushExpired.events+=expiryEvents.length;coverage.rushExpired.cells+=expired.length;coverage.waste.generated+=expired.length;
  if(expired.length){witness(ctx,'rushExpired',{type:'rushExpired',cells:expired});witness(ctx,'waste.generated',{type:'rushExpired',cells:expired});}
  check(ctx,'reconcile.board',shadow.board.length===after.board.length&&shadow.board.every((cell,i)=>cell===after.board[i]),{expectedBoard:shadow.board,actualBoard:after.board});
  const sameTrait=(a:CellTrait|null,b:CellTrait|null|undefined)=>a===null?b===null:!!b&&a.kind===b.kind&&a.remaining===b.remaining&&a.bornAtCommand===b.bornAtCommand;
  const mismatch=shadow.cellTraits!.findIndex((trait,i)=>!sameTrait(trait,after.cellTraits?.[i]));
  check(ctx,'reconcile.traits',after.cellTraits?.length===49&&mismatch===-1,{mismatchCell:mismatch,expectedTrait:mismatch<0?null:{...shadow.cellTraits![mismatch]} as Json,actualTrait:mismatch<0?null:{...after.cellTraits?.[mismatch]} as Json});
  const shiftBonus=command.type==='place'?(after.result==='won'&&!after.overtime?CONFIG.score.shiftBonus:Math.max(0,after.shift-before.shift)*CONFIG.score.shiftBonus):0;
  const score=before.score+shipmentEvents.reduce((sum,s)=>sum+s.score,0)+shiftBonus;
  check(ctx,'reconcile.score',after.score===score,{expectedScore:score,actualScore:after.score,shiftBonus});
  const newOrderCount=observeOrders(ctx,before,after,shadow,pending);
  const newPieces=after.candidates.filter(p=>!before.candidates.some(old=>old.id===p.id)).sort((a,b)=>pieceNumber(a)-pieceNumber(b));
  const delta=(after.generatedPieces??NaN)-(before.generatedPieces??NaN);
  check(ctx,'generation.count',Number.isSafeInteger(delta)&&delta===newPieces.length,{before:before.generatedPieces??null,after:after.generatedPieces??null,newPieceIds:newPieces.map(p=>p.id)});
  check(ctx,'generation.ids',newPieces.every((p,i)=>pieceNumber(p)===before.nextId+newOrderCount+i)&&after.nextId===before.nextId+newOrderCount+newPieces.length,{newPieceIds:newPieces.map(p=>p.id),beforeNextId:before.nextId,afterNextId:after.nextId,newOrderCount});
  newPieces.forEach((piece,i)=>generated(ctx,after,piece,before.generatedPieces!+i+1));
  if(command.type==='upgrade'&&command.upgradeId==='upgrade.four_choices'){
    check(ctx,'upgrade.fourChoices',before.candidates.length===CONFIG.candidateCount&&after.candidates.length===param('four_choices','candidateCount')&&delta===1&&stack(after,'four_choices')===1,{beforeCandidates:before.candidates.length,afterCandidates:after.candidates.length,generatedDelta:delta});
    effect(ctx,'four_choices',{type:'upgrade',upgradeId:command.upgradeId,beforeCandidates:before.candidates.length,afterCandidates:after.candidates.length,newPieceIds:newPieces.map(p=>p.id)});
  }
}
