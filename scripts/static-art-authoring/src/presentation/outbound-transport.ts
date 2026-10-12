import {findLoadedExitRoute} from './outbound-route.ts';
import type { Cell, Point, Shipment } from '../domain/types.ts';
import { boardGeometry } from './board-geometry.ts';
import { shipmentTiming } from './motion.ts';

export interface OutboundTransportStep {
  kind: 'route' | 'move' | 'turn' | 'collect' | 'exit' | 'hold';
  from: Point;
  to: Point;
  fromAngle: number;
  toAngle: number;
  startMs: number;
  endMs: number;
  loadedCount: number;
}
export interface OutboundTransportPlan {
  steps: OutboundTransportStep[];
  cargoCells: number[];
  durationMs: number;
  moveAtMs: number;
  deliveryAtMs: number;
  dimension: 7 | 9;
  exit: Point;
  route?:{moves:number;turnQuarters:number};
}
const sharedTiming = shipmentTiming(false);
/** Fixed stage budgets match inbound; path length changes speed, never rules or capacity. */
export const OUTBOUND_TRANSPORT_TIMING = {
  routeMs: sharedTiming.routeMs, approachMs: sharedTiming.moveMs, collectMs: sharedTiming.collectMs,
  carryMs: sharedTiming.carryMs, exitMs: sharedTiming.exitMs * .72, holdMs: sharedTiming.exitMs * .28,
  totalMs: sharedTiming.totalMs,
} as const;

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const toCell = (point: Point, dimension: number): number => point.y * dimension + point.x;
const toPoint = (cell: number, dimension: number): Point => ({ x: cell % dimension, y: Math.floor(cell / dimension) });
const gridPoint = (point: Point, dimension: number): boolean => !!point && Number.isInteger(point.x) && Number.isInteger(point.y)
  && point.x >= 0 && point.y >= 0 && point.x < dimension && point.y < dimension;
const unit = (amount: number): number => Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));

/** A snapshot certifies empty access and same-color cargo; event paths certify the one shared tree. */
export function buildOutboundTransport(shipment: Shipment, board: Cell[]): OutboundTransportPlan | null {
  if (!shipment || shipment.type !== 'shipment' || shipment.transport !== 'conveyor'
    || shipment.boardSize !== undefined && shipment.boardSize !== 9 || !Array.isArray(board)) return null;
  const geometry = boardGeometry(shipment), dimension = geometry.dimension;
  const dock = geometry.colorExits.find(dock => dock.id === shipment.dockId && dock.cargo === shipment.cargo);
  if (!dock || board.length !== dimension ** 2 || !Array.isArray(shipment.cells) || !shipment.cells.length
    || !Array.isArray(shipment.path) || !shipment.path.length || !Array.isArray(shipment.cargoPaths)
    || shipment.cargoPaths.length !== shipment.cells.length) return null;
  const group = new Set<number>();
  for (const cell of shipment.cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= board.length || board[cell] !== shipment.cargo || group.has(cell)) return null;
    group.add(cell);
  }
  const root = toCell(dock.entry, dimension), approach = shipment.path;
  if (!group.has(root)) return null;
  const accessCells = new Set<number>();
  for (let index = 0; index < approach.length; index++) {
    const point = approach[index];
    if (!gridPoint(point, dimension) || board[toCell(point, dimension)] !== null
      || index === 0 && !same(point, geometry.entry.entry)
      || index > 0 && distance(point, approach[index - 1]) !== 1 || accessCells.has(toCell(point, dimension))) return null;
    accessCells.add(toCell(point, dimension));
  }
  const parents = new Map<number, number>(), pathCells = new Set<number>();
  for (const cargo of shipment.cargoPaths) {
    if (!cargo || !group.has(cargo.cell) || pathCells.has(cargo.cell) || !Array.isArray(cargo.path) || !cargo.path.length) return null;
    pathCells.add(cargo.cell);
    const seen = new Set<number>();
    for (let index = 0; index < cargo.path.length; index++) {
      const point = cargo.path[index];
      if (!gridPoint(point, dimension)) return null;
      const cell = toCell(point, dimension);
      if (!group.has(cell) || seen.has(cell) || index === 0 && cell !== cargo.cell) return null;
      seen.add(cell);
      if (index === cargo.path.length - 1) { if (cell !== root) return null; }
      else {
        const next = cargo.path[index + 1];
        if (!gridPoint(next, dimension) || distance(point, next) !== 1 || cell === root) return null;
        const parent = toCell(next, dimension);
        if (parents.has(cell) && parents.get(cell) !== parent) return null;
        parents.set(cell, parent);
      }
    }
  }
  if (parents.size !== group.size - 1) return null;
  const endpoint = approach[approach.length - 1];
  if(![...group].some(cell=>distance(endpoint,toPoint(cell,dimension))===1))return null;

  const timing = OUTBOUND_TRANSPORT_TIMING, steps: OutboundTransportStep[] = [], cargoCells=[...shipment.cells];
  const outside: Point = { x: Math.floor(dimension / 2), y: dimension };
  const exit = dock.side === 'north' ? { x: dock.entry.x, y: -1 }
    : { x: dock.side === 'east' ? dimension : -1, y: dock.entry.y };
  let position = outside, angle = -Math.PI / 2;
  let loadedCount=0;
  // Movement and stationary turns share their stage's fixed budget, like inbound journeyPose.
  const append = (kind: OutboundTransportStep['kind'], to: Point, toAngle: number, weight: number): void => {
    steps.push({ kind, from: { ...position }, to: { ...to }, fromAngle: angle, toAngle, startMs: 0, endMs: weight,
      loadedCount });
    position = { ...to }; angle = toAngle;
  };
  const turn = (to: Point): void => {
    const target = Math.atan2(to.y - position.y, to.x - position.x);
    const delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
    if (Math.abs(delta) > 1e-8) append('turn', position, angle + delta, Math.abs(delta) * .22);
  };
  const move = (to: Point): void => {
    turn(to);
    append('move', to, angle, 1);
  };
  append('route', position, angle, timing.routeMs);
  for (const point of approach) move(point);
  const contact=Math.min(...cargoCells.filter(cell=>distance(endpoint,toPoint(cell,dimension))===1));
  turn(toPoint(contact,dimension));
  const collectIndex=steps.length;
  append('collect',position,angle,timing.collectMs);
  loadedCount=cargoCells.length;
  const route=findLoadedExitRoute({dimension,board,clearedCells:cargoCells,start:position,exit,initialAngle:angle});
  if(!route)return null;
  for(const point of route.path)move(point);
  turn(exit);
  if(steps.length===collectIndex+1)append('hold',position,angle,1);
  const exitIndex=steps.length;
  append('exit', exit, angle, timing.exitMs);
  append('hold', exit, angle, timing.holdMs);
  const phase=(first:number,last:number,start:number,end:number):void=>{
    const weight=steps.slice(first,last).reduce((sum,step)=>sum+step.endMs,0);
    let time=start;
    for(let index=first;index<last;index++){
      const step=steps[index],duration=(end-start)*step.endMs/weight;
      step.startMs=time;step.endMs=index===last-1?end:time+duration;time=step.endMs;
    }
  };
  const collectAt=timing.routeMs+timing.approachMs,carryAt=collectAt+timing.collectMs,exitAt=carryAt+timing.carryMs,deliveryAt=exitAt+timing.exitMs;
  phase(0,1,0,timing.routeMs);
  phase(1,collectIndex,timing.routeMs,collectAt);
  phase(collectIndex,collectIndex+1,collectAt,carryAt);
  phase(collectIndex+1,exitIndex,carryAt,exitAt);
  phase(exitIndex,exitIndex+1,exitAt,deliveryAt);
  phase(exitIndex+1,steps.length,deliveryAt,timing.totalMs);
  return { steps, cargoCells, durationMs:timing.totalMs, moveAtMs: timing.routeMs, deliveryAtMs: deliveryAt, dimension, exit: { ...exit },route:{moves:route.moves,turnQuarters:route.turnQuarters} };
}

/** Stateless sampling supports skipped frames, backward scrubbing, and one atomic completed group load. */
export function sampleOutboundTransport(plan: OutboundTransportPlan, progress: number): {
  position: Point; angle: number; loadedCount: number; pickedCells: number[];
  collect?: { progress: number }; stage: OutboundTransportStep['kind']; alpha: number; finished: boolean;
} {
  const amount = unit(progress), time = amount * plan.durationMs;
  // Retain exact group-load boundaries even after normalized-progress rounding.
  const boundaryTime = time + plan.durationMs * Number.EPSILON * 4;
  const step = plan.steps.find(step => boundaryTime < step.endMs) ?? plan.steps[plan.steps.length - 1];
  const linear = unit((time - step.startMs) / (step.endMs - step.startMs));
  const smooth=(value:number):number=>value*value*(3-2*value);
  const fraction=smooth(linear);
  let from=step.from,to=step.to,movementFraction=fraction;
  if(step.kind==='move'){
    const index=plan.steps.indexOf(step);let first=index,last=index;
    const sameLine=(a:OutboundTransportStep,b:OutboundTransportStep):boolean=>a.kind==='move'&&b.kind==='move'&&Math.abs(a.fromAngle-b.fromAngle)<1e-8;
    while(first>0&&sameLine(plan.steps[first-1],step))first--;
    while(last+1<plan.steps.length&&sameLine(plan.steps[last+1],step))last++;
    from=plan.steps[first].from;to=plan.steps[last].to;
    movementFraction=smooth(unit((time-plan.steps[first].startMs)/(plan.steps[last].endMs-plan.steps[first].startMs)));
  }
  const collection=plan.steps.find(step=>step.kind==='collect');
  const pickedCells=collection&&collection.endMs<=boundaryTime?[...plan.cargoCells]:[];
  return {
    position: { x: from.x + (to.x - from.x) * movementFraction, y: from.y + (to.y - from.y) * movementFraction },
    angle: step.fromAngle + (step.toAngle - step.fromAngle) * fraction, loadedCount: pickedCells.length, pickedCells,
    ...(step.kind === 'collect' ? {collect:{progress:linear}} : {}),
    stage: step.kind, alpha: step.kind === 'hold' && time >= plan.deliveryAtMs ? 1 - fraction : 1, finished: amount === 1,
  };
}
