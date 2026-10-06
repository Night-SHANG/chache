import type { RunState, Command, CommandResult, PlacementPreview, Point, Piece, Shipment, DomainEvent, CargoId, TraitId, Upgrade } from '../types.ts';
import { CARGO, SHAPES, DOCKS, UPGRADES_V2, upgradeStackV2 as stack, upgradeParamV2 as param } from '../v2/content.ts';
import { RULES_V3_CONFIG as CONFIG } from './content.ts';
import { toIndex, neighbors, selectOrderGroupV2, cellUnitsV2 } from '../v2/board.ts';
import { createRandomState, nextRandom } from '../random.ts';
function copyCommand(command:Command):Command{return command.type==='place'?{...command,origin:{...command.origin}}:{...command};}
function cloneState(state:RunState):RunState {
  return {...state,board:[...state.board],cellTraits:state.board.map((cell,i)=>cell===null?null:state.cellTraits?.[i]?{...state.cellTraits[i]!}:null),
    generatedPieces:state.generatedPieces??0,rngState:[...state.rngState],candidates:state.candidates.map(p=>({...p})),orders:state.orders.map(o=>({...o})),
    upgrades:[...state.upgrades],upgradeChoices:[...state.upgradeChoices],commands:state.commands.map(copyCommand)};
}
function random(state:RunState,min:number,max:number):number {const result=nextRandom(state.rngState,min,max);state.rngState=result.state;return result.value;}
function weighted<T>(state:RunState,values:T[],weights:number[]):T {
  if(!values.length||values.length!==weights.length||weights.some(w=>!Number.isSafeInteger(w)||w<0)||!weights.some(w=>w>0))throw new Error('Invalid v3 weighted pool');
  let draw=random(state,1,weights.reduce((sum,w)=>sum+w,0));
  for(let i=0;i<values.length;i++){draw-=weights[i];if(draw<=0)return values[i];}
  throw new Error('Invalid v3 random draw');
}
function cargoPool(shift:number):CargoId[]{return CARGO.slice(0,CONFIG.cargoByShift[shift-1]).map(c=>c.id);}
function inventoryUnits(state:RunState,cargo:CargoId):number{return state.board.reduce<number>((sum,cell,i)=>sum+(cell===cargo?cellUnitsV2(state,i):0),0);}
/** Internal generator mutates only the reducer's owned state; no rescue search or reroll. */
export function generatePieceV3(state:RunState):Piece {
  state.generatedPieces=(state.generatedPieces??0)+1;
  let trait:TraitId|undefined;
  if(state.shift>=CONFIG.special.minShift){
    if(stack(state,'pallet_supply')&&state.generatedPieces%param('pallet_supply','interval')===0)trait='pallet';
    else {
      const bonus=stack(state,'wild_supply')*param('wild_supply','weightBonus'),weights=CONFIG.special.weights;
      const selected=weighted(state,['normal','pallet','rush','hazard','wildcard'] as const,[weights.normal-bonus,weights.pallet,weights.rush,weights.hazard,weights.wildcard+bonus]);
      if(selected!=='normal')trait=selected;
    }
  }
  let shapeId='shape.single';
  if(!trait){
    const shapes=SHAPES.filter(shape=>shape.minShift<=state.shift),occupancy=state.board.filter(Boolean).length;
    const smallBonus=stack(state,'small_parcels')*param('small_parcels','weightPercent');
    const weights=shapes.map(shape=>{
      let weight=shape.weight*100;
      if(shape.cells.length<=2)weight=Math.floor(weight*(100+smallBonus+Math.floor(occupancy*CONFIG.generation.occupancySmallPercent/49))/100);
      if(state.candidates.some(piece=>piece.shapeId===shape.id))weight=Math.floor(weight/CONFIG.generation.recentShapeDivisor);
      return Math.max(1,weight);
    });
    shapeId=weighted(state,shapes,weights).id;
  }
  const pool=cargoPool(state.shift),cargo=weighted(state,pool,pool.map(id=>20+inventoryUnits(state,id)*CONFIG.generation.cargoPresenceWeight));
  const piece:Piece={id:`piece.${state.nextId++}`,shapeId,cargo};
  if(trait){piece.trait=trait;if(trait==='rush')piece.rushTurns=CONFIG.special.rushTurns+stack(state,'rush_buffer')*param('rush_buffer','extraTurns');}
  return piece;
}
function refreshOrders(state:RunState):void {
  for(const dock of DOCKS.slice(0,CONFIG.docksByShift[state.shift-1])){
    if(state.orders.some(order=>order.dockId===dock.id))continue;
    const pool=cargoPool(state.shift).filter(cargo=>!state.orders.some(order=>order.cargo===cargo));
    if(!pool.length)throw new Error('No distinct cargo available for active Dock');
    const cargo=stack(state,'stock_orders')?weighted(state,pool,pool.map(id=>param('stock_orders','baseCargoWeight')+inventoryUnits(state,id)*param('stock_orders','unitWeight'))):pool[random(state,0,pool.length-1)];
    const drawnAmount=random(state,CONFIG.orderMinByShift[state.shift-1],CONFIG.orderMaxByShift[state.shift-1]);
    const amount=stack(state,'light_orders')?Math.max(param('light_orders','floor'),drawnAmount-param('light_orders','reduction')):drawnAmount;
    state.orders.push({id:`order.${state.nextId++}`,dockId:dock.id,cargo,amount,baseScore:CONFIG.score.orderBase+(state.shift-1)*CONFIG.score.orderPerShift});
  }
  state.orders.sort((a,b)=>DOCKS.findIndex(d=>d.id===a.dockId)-DOCKS.findIndex(d=>d.id===b.dockId));
}
export function isUpgradeEligibleV3(state:RunState,upgrade:Upgrade):boolean {
  return state.shift>=(upgrade.minShift??1)&&state.upgrades.filter(id=>id===upgrade.id).length<upgrade.maxStack
    &&(upgrade.prerequisites??[]).every(id=>state.upgrades.includes(id))
    &&!(upgrade.conflicts??[]).some(id=>state.upgrades.includes(id))
    &&!UPGRADES_V2.some(u=>state.upgrades.includes(u.id)&&u.conflicts?.includes(upgrade.id));
}
/** Reserve two behavior slots first. Stable-ID order is the deterministic fallback for a zero-weight pool.
 * Eight early behavior IDs (small_parcels has three stacks) and five Shift3 additions leave at least
 * two behaviors after any six prior choices. The score pool can always fill the third slot in seven choices. */
export function generateUpgradeChoicesV3(state:RunState):string[] {
  const pool=UPGRADES_V2.filter(u=>isUpgradeEligibleV3(state,u)),choices:string[]=[];
  function choose(values:Upgrade[]):void {
    if(!values.length)return;
    const ownedTags=new Set(UPGRADES_V2.filter(u=>state.upgrades.includes(u.id)).flatMap(u=>u.tags??[]));
    const weights=values.map(u=>{
      const duplicate=state.upgrades.filter(id=>id===u.id).length,synergy=(u.tags??[]).some(tag=>ownedTags.has(tag))?125:100;
      // Existing choice IDs discourage immediate repeats when this helper is used to refresh a pending offer.
      const antiRepeat=state.upgradeChoices.includes(u.id)?50:100;
      return Math.max(0,Math.floor((u.params?.baseWeight??100)*synergy*antiRepeat/10000/(1+duplicate)));
    });
    const selected=weights.some(w=>w>0)?weighted(state,values,weights):[...values].sort((a,b)=>a.id.localeCompare(b.id))[0];
    choices.push(selected.id);pool.splice(pool.indexOf(selected),1);
  }
  for(let i=0;i<2;i++)choose(pool.filter(u=>u.behavior));
  while(choices.length<3&&pool.length)choose(pool);
  // A malformed externally constructed state may exhaust content, but never creates duplicate or capped offers.
  return choices;
}
/** Tutorial content is authored rules data, never a generated run or a saved Profile effect. */
function tutorialPiece(state:RunState,shapeId:string,cargo:CargoId):Piece {
  state.generatedPieces=(state.generatedPieces??0)+1;
  return {id:`piece.${state.nextId++}`,shapeId,cargo};
}
function tutorialOrder(state:RunState,dockId:string,cargo:CargoId,amount:number) {
  return {id:`order.${state.nextId++}`,dockId,cargo,amount,baseScore:CONFIG.score.orderBase};
}
function advanceTutorial(state:RunState,events:DomainEvent[]):void {
  state.tutorialStep=(state.tutorialStep??0)+1;
  if(state.tutorialStep===1){
    state.candidates=[tutorialPiece(state,'shape.single','cargo.food')];
  }else if(state.tutorialStep===2){
    // A distinct second lesson: its authored wall is intentionally not presented as a random board.
    state.board.fill(null);state.cellTraits!.fill(null);
    for(const cell of CONFIG.tutorial.lessonFoodCells)state.board[cell]='cargo.food';
    for(const cell of CONFIG.tutorial.lessonWallCells)state.board[cell]='cargo.machine';
    state.orders=[tutorialOrder(state,'dock.north','cargo.food',CONFIG.tutorial.foodAmount),tutorialOrder(state,'dock.south','cargo.machine',CONFIG.tutorial.machineAmount)];
    state.candidates=[tutorialPiece(state,'shape.single','cargo.machine')];
  }else{
    state.phase='result';state.result='won';state.endReason='completed';
  }
  events.push({type:'tutorialAdvanced',step:state.tutorialStep});
  if(state.phase==='result')events.push({type:'result',result:'won'});
}
export function createRunV3(seed:number,mode:RunState['mode']='standard'):RunState {
  const state:RunState={rulesetVersion:3,runConfigId:CONFIG.runConfigId,seed,mode,rngState:createRandomState(seed),board:Array(49).fill(null),cellTraits:Array(49).fill(null),generatedPieces:0,
    candidates:[],orders:[],phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:1,result:null,
    tutorialStep:mode==='tutorial'?0:3,overtime:false,endReason:null};
  if(mode==='tutorial'){
    state.orders=[tutorialOrder(state,'dock.north','cargo.food',CONFIG.tutorial.foodAmount)];
    state.candidates=[tutorialPiece(state,'shape.domino_h','cargo.food')];
  }else{
    refreshOrders(state);for(let i=0;i<CONFIG.candidateCount;i++)state.candidates.push(generatePieceV3(state));
  }
  return state;
}
function placement(state:RunState,pieceId:string,origin:Point):{cells:number[];reason?:string}{
  if(state.phase!=='input')return {cells:[],reason:'当前阶段不能入库'};
  const piece=state.candidates.find(p=>p.id===pieceId),shape=SHAPES.find(s=>s.id===piece?.shapeId);
  if(!piece||!shape)return {cells:[],reason:'货件已不存在'};
  if(piece.trait&&(!['pallet','rush','hazard','wildcard'].includes(piece.trait)||shape.cells.length!==1))return {cells:[],reason:'特殊货件必须为合法单格'};
  if(piece.trait==='rush'&&(!Number.isSafeInteger(piece.rushTurns)||piece.rushTurns!<=0))return {cells:[],reason:'加急货件期限无效'};
  if(!origin||!Number.isInteger(origin.x)||!Number.isInteger(origin.y))return {cells:[],reason:'落点必须是完整格子'};
  if(state.mode==='tutorial'){
    const hint=CONFIG.tutorial.origins[state.tutorialStep??0];
    if(!hint||origin.x!==hint.x||origin.y!==hint.y)return {cells:[],reason:'请将货件放到教学提示格'};
  }
  const points=shape.cells.map(cell=>({x:cell.x+origin.x,y:cell.y+origin.y})),cells=points.map(toIndex);
  if(points.some(p=>p.x<0||p.y<0||p.x>=7||p.y>=7))return {cells,reason:'超出仓库边界'};
  if(cells.some(i=>state.board[i]!==null))return {cells,reason:'这里已有货物'};
  return {cells};
}
function placePiece(state:RunState,piece:Piece,cells:number[]):void {
  for(const cell of cells){state.board[cell]=piece.cargo;state.cellTraits![cell]=piece.trait?piece.trait==='rush'?{kind:'rush',remaining:piece.rushTurns!,bornAtCommand:state.commandIndex+1}:{kind:piece.trait}:null;}
}
function clear(state:RunState,cells:number[]):void{for(const i of cells){state.board[i]=null;state.cellTraits![i]=null;}}
function shipmentScore(state:RunState,base:number,units:number,amount:number,depth:number,chain:number,varied:boolean):number {
  const orderBase=base+stack(state,'contract')*param('contract','points');
  const overfill=Math.max(0,units-amount)*(CONFIG.score.overfill+stack(state,'overfill')*param('overfill','points'));
  const route=depth*(CONFIG.score.routeDepth+(depth>=param('deep_route','minDepth')?stack(state,'deep_route')*param('deep_route','points'):0));
  const variety=varied?stack(state,'variety')*param('variety','points'):0;
  return Math.floor((orderBase+overfill+route+variety)*(100+(chain-1)*(CONFIG.score.chainPercent+stack(state,'chain')*param('chain','percent')))/100);
}
function adjacentCells(cells:number[]):number[]{return [...new Set(cells.flatMap(neighbors))].sort((a,b)=>a-b);}
/** No random draw occurs inside frozen resolution, including all special/route side effects. */
function resolveOldOrders(state:RunState):Shipment[]{
  const priority=(dockId:string)=>DOCKS.find(d=>d.id===dockId)?.priority??99;
  const pending=[...state.orders].sort((a,b)=>(stack(state,'small_order_first')?a.amount-b.amount:0)||priority(a.dockId)-priority(b.dockId));
  const shipments:Shipment[]=[];
  while(pending.length){
    let selected:ReturnType<typeof selectOrderGroupV2>=null,index=-1;
    for(let i=0;i<pending.length;i++){selected=selectOrderGroupV2(state,pending[i],shipments.length===0&&stack(state,'pallet_pass')>0);if(selected){index=i;break;}}
    if(!selected)break;
    if(shipments.length>=CONFIG.resolutionLimit)throw new Error('Resolution exceeded 64 steps');
    const [order]=pending.splice(index,1),chain=shipments.length+1;
    const score=shipmentScore(state,order.baseScore,selected.group.units,order.amount,selected.path.length-1,chain,shipments.length>0&&shipments[shipments.length-1].cargo!==order.cargo);
    const hazard=selected.group.cells.some(i=>state.cellTraits![i]?.kind==='hazard');
    const extra=hazard?adjacentCells(selected.group.cells).filter(i=>state.cellTraits![i]?.kind==='waste').slice(0,stack(state,'hazard_clearance')?param('hazard_clearance','maxWaste'):1):[];
    clear(state,selected.group.cells);clear(state,extra);
    if(chain===1){
      const adjacent=adjacentCells(selected.path.map(toIndex));
      if(stack(state,'sweep_route')){const waste=adjacent.filter(i=>state.cellTraits![i]?.kind==='waste').slice(0,param('sweep_route','maxWaste'));clear(state,waste);extra.push(...waste);}
      if(stack(state,'extra_pickup')){const cargo=adjacent.filter(i=>state.board[i]!==null&&state.board[i]!==order.cargo&&state.cellTraits![i]===null).slice(0,param('extra_pickup','maxCargo'));clear(state,cargo);extra.push(...cargo);}
    }
    shipments.push({type:'shipment',dockId:order.dockId,orderId:order.id,cargo:order.cargo,cells:selected.group.cells,path:selected.path,score,chain,units:selected.group.units,
      extraClearedCells:extra.sort((a,b)=>a-b),usedPalletPass:selected.usedPalletPass});
    state.score+=score;state.completedOrders++;
  }
  state.orders=pending;state.lastChain=shipments.length;state.maxChain=Math.max(state.maxChain,shipments.length);return shipments;
}
function ageRush(state:RunState):number[]{
  const expired:number[]=[];
  for(let i=0;i<49;i++){
    const trait=state.cellTraits![i];if(trait?.kind!=='rush'||trait.bornAtCommand===state.commandIndex)continue;
    trait.remaining!--;if(trait.remaining!<=0){state.cellTraits![i]={kind:'waste'};expired.push(i);}
  }
  return expired;
}
export function previewPlacementV3(state:RunState,pieceId:string,origin:Point):PlacementPreview {
  const checked=placement(state,pieceId,origin);if(checked.reason)return {valid:false,cells:checked.cells,shipments:[],reason:checked.reason};
  const next=cloneState(state),piece=state.candidates.find(p=>p.id===pieceId)!;placePiece(next,piece,checked.cells);
  return {valid:true,cells:checked.cells,shipments:resolveOldOrders(next)};
}
export function findLegalMovesV3(state:RunState):{pieceId:string;origin:Point}[]{
  const moves:{pieceId:string;origin:Point}[]=[],input=state.phase==='input'?state:{...state,phase:'input' as const};
  for(const piece of state.candidates)for(let y=0;y<7;y++)for(let x=0;x<7;x++)if(!placement(input,piece.id,{x,y}).reason)moves.push({pieceId:piece.id,origin:{x,y}});
  return moves;
}
function candidateCount(state:RunState):number{return stack(state,'four_choices')?param('four_choices','candidateCount'):CONFIG.candidateCount;}
export function applyCommandV3(state:RunState,command:Command):CommandResult {
  const reject=(error:string):CommandResult=>({state,events:[],error});
  if(!command||(command.type!=='place'&&command.type!=='upgrade'&&command.type!=='continueOvertime'&&command.type!=='finishOvertime'))return reject('未知指令');
  if(command.type==='continueOvertime'){
    if(state.mode!=='standard'||state.phase!=='result'||state.result!=='won'||state.overtime||state.shift!==CONFIG.shiftCount||state.completedOrders<CONFIG.ordersPerShift*CONFIG.shiftCount)return reject('只有完成五班的标准局可以继续加班');
    const next=cloneState(state);next.overtime=true;next.phase='input';next.result=null;next.endReason=null;next.upgradeChoices=[];
    next.commands.push(copyCommand(command));next.commandIndex++;
    // Continue from the existing RNG cursor and preserve every surviving order and candidate.
    refreshOrders(next);while(next.candidates.length<candidateCount(next))next.candidates.push(generatePieceV3(next));
    const events:DomainEvent[]=[{type:'overtimeStarted'}];
    if(!findLegalMovesV3(next).length){next.phase='result';next.result='failed';next.endReason='blocked';events.push({type:'result',result:'failed'});}
    return {state:next,events};
  }
  if(command.type==='finishOvertime'){
    if(state.mode!=='standard'||!state.overtime||state.phase!=='input')return reject('只有加班进行中可以主动结算');
    const next=cloneState(state);next.phase='result';next.result='won';next.endReason='retired';next.commands.push(copyCommand(command));next.commandIndex++;
    return {state:next,events:[{type:'result',result:'won'}]};
  }
  if(command.type==='upgrade'){
    const upgrade=UPGRADES_V2.find(u=>u.id===command.upgradeId);
    if(state.mode==='tutorial'||state.overtime||state.phase!=='upgrade'||!state.upgradeChoices.includes(command.upgradeId)||!upgrade||!isUpgradeEligibleV3(state,upgrade))return reject('当前不能选择此升级');
    const next=cloneState(state);next.upgrades.push(command.upgradeId);next.upgradeChoices=[];next.phase='input';next.commands.push(copyCommand(command));next.commandIndex++;
    if(upgrade.effect==='four_choices')while(next.candidates.length<candidateCount(next))next.candidates.push(generatePieceV3(next));
    return {state:next,events:[]};
  }
  const checked=placement(state,command.pieceId,command.origin);if(checked.reason)return reject(checked.reason);
  const next=cloneState(state),index=next.candidates.findIndex(piece=>piece.id===command.pieceId),piece=next.candidates[index];
  placePiece(next,piece,checked.cells);next.candidates.splice(index,1);
  const events:DomainEvent[]=[{type:'placed',pieceId:piece.id,cells:checked.cells},...resolveOldOrders(next)];
  next.commands.push(copyCommand(command));next.commandIndex++;
  const expired=ageRush(next);if(expired.length)events.push({type:'rushExpired',cells:expired});
  if(next.mode==='tutorial'){advanceTutorial(next,events);return {state:next,events};}
  if(!next.overtime&&next.completedOrders>=CONFIG.ordersPerShift*CONFIG.shiftCount){next.phase='result';next.result='won';next.endReason='completed';next.score+=CONFIG.score.shiftBonus;events.push({type:'result',result:'won'});return {state:next,events};}
  const shift=Math.min(CONFIG.shiftCount,Math.floor(next.completedOrders/CONFIG.ordersPerShift)+1);
  if(shift>next.shift){next.score+=(shift-next.shift)*CONFIG.score.shiftBonus;next.shift=shift;events.push({type:'shift',shift});}
  refreshOrders(next);next.candidates.splice(index,0,generatePieceV3(next));while(next.candidates.length<candidateCount(next))next.candidates.push(generatePieceV3(next));
  if(!findLegalMovesV3(next).length){next.phase='result';next.result='failed';next.endReason='blocked';events.push({type:'result',result:'failed'});}
  else if(!next.overtime&&Math.floor(next.completedOrders/CONFIG.upgradeEvery)>Math.floor(state.completedOrders/CONFIG.upgradeEvery)){next.phase='upgrade';next.upgradeChoices=generateUpgradeChoicesV3(next);events.push({type:'upgrade'});}
  return {state:next,events};
}
