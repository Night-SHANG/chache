import type { RunState, Command, CommandResult, PlacementPreview, Point, Piece, Shipment, DomainEvent, CargoId } from './types.ts';
import { CARGO, SHAPES, DOCKS, UPGRADES, P0_CONFIG } from './content.ts';
import { toIndex, selectOrderGroup } from './board.ts';
import { createRandomState, nextRandom } from './random.ts';
const stack = (state: RunState, id: string): number => state.upgrades.filter(value => value === `upgrade.${id}`).length;
function copyCommand(command: Command): Command {
  return command.type === 'place' ? {...command, origin:{...command.origin}} : {...command};
}
function cloneState(state: RunState): RunState {
  return {...state, board:[...state.board], rngState:[...state.rngState], candidates:state.candidates.map(p => ({...p})),
    orders:state.orders.map(o => ({...o})), upgrades:[...state.upgrades], upgradeChoices:[...state.upgradeChoices], commands:state.commands.map(copyCommand)};
}
function random(state: RunState, min: number, max: number): number {
  const draw = nextRandom(state.rngState,min,max); state.rngState = draw.state; return draw.value;
}
function weighted<T>(state: RunState, values: T[], weights: number[]): T {
  let draw = random(state,1,weights.reduce((sum,value) => sum+value,0));
  for (let i = 0; i < values.length; i++) { draw -= weights[i]; if (draw <= 0) return values[i]; }
  return values[values.length-1];
}
function cargoPool(shift: number): CargoId[] { return CARGO.slice(0,P0_CONFIG.cargoByShift[shift-1]).map(c => c.id); }
/** P0 generator: shift, occupancy, current tray repetition, board cargo presence, upgrades.
 * It never tests which random piece would save the board and never rerolls a bad draw. */
function generatePiece(state: RunState): Piece {
  const shapes = SHAPES.filter(shape => shape.minShift <= state.shift);
  const occupancy = state.board.filter(Boolean).length;
  const smallBonus = stack(state,'small_parcels') * P0_CONFIG.upgrade.smallWeightPercent;
  const weights = shapes.map(shape => {
    let weight = shape.weight * 100;
    if (shape.cells.length <= 2) weight = Math.floor(weight * (100 + smallBonus + Math.floor(occupancy * P0_CONFIG.generation.occupancySmallPercent / 49)) / 100);
    if (state.candidates.some(piece => piece.shapeId === shape.id)) weight = Math.floor(weight / P0_CONFIG.generation.recentShapeDivisor);
    return Math.max(1,weight);
  });
  const shape = weighted(state,shapes,weights), pool = cargoPool(state.shift);
  const cargo = weighted(state,pool,pool.map(id => 20 + state.board.filter(cell => cell === id).length * P0_CONFIG.generation.cargoPresenceWeight));
  return {id:`piece.${state.nextId++}`,shapeId:shape.id,cargo};
}
function refreshOrders(state: RunState): void {
  for (const dock of DOCKS.slice(0,P0_CONFIG.docksByShift[state.shift-1])) {
    if (state.orders.some(order => order.dockId === dock.id)) continue;
    const pool = cargoPool(state.shift).filter(cargo => !state.orders.some(order => order.cargo === cargo));
    if (!pool.length) throw new Error('No distinct cargo available for active Dock');
    state.orders.push({id:`order.${state.nextId++}`,dockId:dock.id,cargo:pool[random(state,0,pool.length-1)],
      amount:random(state,P0_CONFIG.orderMinByShift[state.shift-1],P0_CONFIG.orderMaxByShift[state.shift-1]),
      baseScore:P0_CONFIG.score.orderBase + (state.shift-1)*P0_CONFIG.score.orderPerShift});
  }
  state.orders.sort((a,b) => DOCKS.findIndex(d => d.id === a.dockId)-DOCKS.findIndex(d => d.id === b.dockId));
}
function upgradeChoices(state: RunState): string[] {
  const pool = UPGRADES.filter(u => state.upgrades.filter(id => id === u.id).length < u.maxStack);
  const choices: string[] = [];
  // Keep one real generation modifier visible while it can still be selected.
  const behavior = pool.findIndex(u => u.id === 'upgrade.small_parcels');
  if (behavior >= 0) choices.push(pool.splice(behavior,1)[0].id);
  while (choices.length < 3 && pool.length) {
    const selected = weighted(state,pool,pool.map(u => Math.max(1,Math.floor(100/(1+state.upgrades.filter(id => id === u.id).length)))));
    choices.push(selected.id); pool.splice(pool.indexOf(selected),1);
  }
  // Three high-cap, meaningfully stacking upgrades keep this invariant true for all seven selections in a reachable run.
  if (choices.length !== 3) throw new Error('Upgrade fallback content invariant violated');
  return choices;
}
export function createRun(seed: number, mode: RunState['mode'] = 'standard'): RunState {
  const state: RunState = {
    rulesetVersion:P0_CONFIG.rulesetVersion,runConfigId:P0_CONFIG.runConfigId,seed,mode,rngState:createRandomState(seed),
    board:Array(49).fill(null),candidates:[],orders:[],phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,
    upgrades:[],upgradeChoices:[],commandIndex:0,commands:[],nextId:1,result:null,
  };
  refreshOrders(state);
  for (let i = 0; i < P0_CONFIG.candidateCount; i++) state.candidates.push(generatePiece(state));
  if (mode === 'tutorial') {
    state.orders[0] = {...state.orders[0],cargo:'cargo.food',amount:3};
    state.orders[1] = {...state.orders[1],cargo:'cargo.machine',amount:3};
    state.candidates[0] = {...state.candidates[0],shapeId:'shape.domino_h',cargo:'cargo.food'};
    state.candidates[1] = {...state.candidates[1],shapeId:'shape.single',cargo:'cargo.food'};
    state.candidates[2] = {...state.candidates[2],shapeId:'shape.domino_v',cargo:'cargo.machine'};
  }
  return state;
}
function placement(state: RunState, pieceId: string, origin: Point): {cells:number[];reason?:string} {
  if (state.phase !== 'input') return {cells:[],reason:'当前阶段不能入库'};
  const piece = state.candidates.find(p => p.id === pieceId), shape = SHAPES.find(s => s.id === piece?.shapeId);
  if (!piece || !shape) return {cells:[],reason:'货件已不存在'};
  if (!origin || !Number.isInteger(origin.x) || !Number.isInteger(origin.y)) return {cells:[],reason:'落点必须是完整格子'};
  const points = shape.cells.map(cell => ({x:cell.x+origin.x,y:cell.y+origin.y})), cells = points.map(toIndex);
  if (points.some(p => p.x<0 || p.y<0 || p.x>=7 || p.y>=7)) return {cells,reason:'超出仓库边界'};
  if (cells.some(index => state.board[index] !== null)) return {cells,reason:'这里已有货物'};
  return {cells};
}
function shipmentScore(state: RunState, base: number, size: number, amount: number, depth: number, chain: number, varied: boolean): number {
  const orderBase = base + stack(state,'contract')*P0_CONFIG.upgrade.contract;
  const overfill = Math.max(0,size-amount)*(P0_CONFIG.score.overfill+stack(state,'overfill')*P0_CONFIG.upgrade.overfill);
  const route = depth*(P0_CONFIG.score.routeDepth + (depth>=3 ? stack(state,'deep_route')*P0_CONFIG.upgrade.deepRoute : 0));
  const variety = varied ? stack(state,'variety')*P0_CONFIG.upgrade.variety : 0;
  const chainPercent = 100 + (chain-1)*(P0_CONFIG.score.chainPercent+stack(state,'chain')*P0_CONFIG.upgrade.chainPercent);
  return Math.floor((orderBase+overfill+route+variety)*chainPercent/100);
}
/** Resolve only the frozen orders. No generator is called until this function returns. */
function resolveOldOrders(state: RunState): Shipment[] {
  const pending = [...state.orders].sort((a,b) => (DOCKS.find(d => d.id === a.dockId)?.priority ?? 99)-(DOCKS.find(d => d.id === b.dockId)?.priority ?? 99));
  const shipments: Shipment[] = [];
  while (pending.length) {
    let selected: ReturnType<typeof selectOrderGroup> = null, selectedIndex = -1;
    for (let i = 0; i < pending.length; i++) { selected = selectOrderGroup(state.board,pending[i]); if (selected) { selectedIndex=i; break; } }
    if (!selected) break;
    if (shipments.length >= P0_CONFIG.resolutionLimit) throw new Error('Resolution exceeded 64 steps');
    const [order] = pending.splice(selectedIndex,1), chain = shipments.length+1;
    const score = shipmentScore(state,order.baseScore,selected.group.cells.length,order.amount,selected.path.length-1,chain,shipments.length>0 && shipments[shipments.length-1].cargo!==order.cargo);
    for (const cell of selected.group.cells) state.board[cell]=null;
    shipments.push({type:'shipment',dockId:order.dockId,orderId:order.id,cargo:order.cargo,cells:selected.group.cells,path:selected.path,score,chain});
    state.score += score; state.completedOrders++;
  }
  state.orders = pending; state.lastChain = shipments.length; state.maxChain = Math.max(state.maxChain,shipments.length);
  return shipments;
}
export function previewPlacement(state: RunState, pieceId: string, origin: Point): PlacementPreview {
  const checked = placement(state,pieceId,origin);
  if (checked.reason) return {valid:false,cells:checked.cells,shipments:[],reason:checked.reason};
  const next = cloneState(state), piece = state.candidates.find(p => p.id === pieceId)!;
  for (const cell of checked.cells) next.board[cell]=piece.cargo;
  return {valid:true,cells:checked.cells,shipments:resolveOldOrders(next)};
}
export function findLegalMoves(state: RunState): {pieceId:string;origin:Point}[] {
  const result: {pieceId:string;origin:Point}[] = [];
  // Geometric moves remain queryable in an upgrade phase so the presentation can inspect the board.
  const input = state.phase === 'input' ? state : {...state,phase:'input' as const};
  for (const piece of state.candidates) for (let y=0;y<7;y++) for (let x=0;x<7;x++) {
    if (!placement(input,piece.id,{x,y}).reason) result.push({pieceId:piece.id,origin:{x,y}});
  }
  return result;
}
export function applyCommand(state: RunState, command: Command): CommandResult {
  const reject = (error: string): CommandResult => ({state,events:[],error});
  if (!command || (command.type !== 'place' && command.type !== 'upgrade')) return reject('未知指令');
  if (command.type === 'upgrade') {
    if (state.phase !== 'upgrade' || !state.upgradeChoices.includes(command.upgradeId)) return reject('当前不能选择此升级');
    const next=cloneState(state); next.upgrades.push(command.upgradeId); next.upgradeChoices=[]; next.phase='input';
    next.commands.push(copyCommand(command)); next.commandIndex++;
    return {state:next,events:[]};
  }
  const checked = placement(state,command.pieceId,command.origin); if (checked.reason) return reject(checked.reason);
  const next=cloneState(state), index=next.candidates.findIndex(piece => piece.id===command.pieceId), piece=next.candidates[index];
  for (const cell of checked.cells) next.board[cell]=piece.cargo;
  next.candidates.splice(index,1);
  const events: DomainEvent[] = [{type:'placed',pieceId:piece.id,cells:checked.cells},...resolveOldOrders(next)];
  next.commands.push(copyCommand(command)); next.commandIndex++;
  if (next.completedOrders >= P0_CONFIG.ordersPerShift*P0_CONFIG.shiftCount) {
    next.phase='result'; next.result='won'; next.score += P0_CONFIG.score.shiftBonus; events.push({type:'result',result:'won'});
    return {state:next,events};
  }
  const shift = Math.min(P0_CONFIG.shiftCount,Math.floor(next.completedOrders/P0_CONFIG.ordersPerShift)+1);
  if (shift > next.shift) { next.score += (shift-next.shift)*P0_CONFIG.score.shiftBonus; next.shift=shift; events.push({type:'shift',shift}); }
  refreshOrders(next);
  next.candidates.splice(index,0,generatePiece(next));
  while (next.candidates.length<P0_CONFIG.candidateCount) next.candidates.push(generatePiece(next));
  if (!findLegalMoves(next).length) { next.phase='result'; next.result='failed'; events.push({type:'result',result:'failed'}); }
  else if (Math.floor(next.completedOrders/P0_CONFIG.upgradeEvery)>Math.floor(state.completedOrders/P0_CONFIG.upgradeEvery)) {
    next.phase='upgrade'; next.upgradeChoices=upgradeChoices(next); events.push({type:'upgrade'});
  }
  return {state:next,events};
}
