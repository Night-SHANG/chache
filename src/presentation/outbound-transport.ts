import type { Cell, Point, Shipment } from '../domain/types.ts';
import { boardGeometry } from './board-geometry.ts';

export interface OutboundTransportStep {
  kind: 'route' | 'move' | 'turn' | 'pickup' | 'exit' | 'hold';
  from: Point;
  to: Point;
  fromAngle: number;
  toAngle: number;
  startMs: number;
  endMs: number;
  loadedCount: number;
  pickupCell?: number;
}
export interface OutboundTransportPlan {
  steps: OutboundTransportStep[];
  pickupOrder: number[];
  durationMs: number;
  moveAtMs: number;
  deliveryAtMs: number;
  dimension: 7 | 9;
  exit: Point;
}
/** These clocks and weights affect presentation only, never the shipment or its capacity. */
export const OUTBOUND_TRANSPORT_TIMING = {
  routeMs: 90, exitMs: 170, holdMs: 140, smallGroupMs: 1400, extraCellMs: 30, maxMs: 3200,
  moveWeight: 75, returnWeight: 42, turnWeight: 45, pickupWeight: 90,
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
  const parents = new Map<number, number>(), depths = new Map<number, number>(), pathCells = new Set<number>();
  for (const cargo of shipment.cargoPaths) {
    if (!cargo || !group.has(cargo.cell) || pathCells.has(cargo.cell) || !Array.isArray(cargo.path) || !cargo.path.length) return null;
    pathCells.add(cargo.cell);
    depths.set(cargo.cell, cargo.path.length);
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
  // Prefer the deepest adjacent tree cell, leaving the longest available gateward spine until last.
  const start = [...group].filter(cell => distance(endpoint, toPoint(cell, dimension)) === 1)
    .sort((a, b) => depths.get(b)! - depths.get(a)! || a - b)[0];
  if (start === undefined) return null;
  const children = new Map<number, number[]>();
  for (const [cell, parent] of parents) {
    const siblings = children.get(parent) ?? []; siblings.push(cell); children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a - b);

  const timing = OUTBOUND_TRANSPORT_TIMING, steps: OutboundTransportStep[] = [], pickupOrder: number[] = [];
  const outside: Point = { x: Math.floor(dimension / 2), y: dimension };
  const exit = dock.side === 'north' ? { x: dock.entry.x, y: -1 }
    : { x: dock.side === 'east' ? dimension : -1, y: dock.entry.y };
  let position = outside, angle = -Math.PI / 2;
  const picked = new Set<number>(), entered = new Set<number>();
  // Active step lengths temporarily store relative weights. Fixed entrance/exit clocks are reserved below.
  const append = (kind: OutboundTransportStep['kind'], to: Point, toAngle: number, weight: number, pickupCell?: number): void => {
    steps.push({ kind, from: { ...position }, to: { ...to }, fromAngle: angle, toAngle, startMs: 0, endMs: weight,
      loadedCount: picked.size, ...(pickupCell === undefined ? {} : { pickupCell }) });
    position = { ...to }; angle = toAngle;
  };
  const turn = (to: Point): void => {
    const target = Math.atan2(to.y - position.y, to.x - position.x);
    const delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
    if (Math.abs(delta) > 1e-8) append('turn', position, angle + delta, timing.turnWeight * Math.abs(delta) / (Math.PI / 2));
  };
  const move = (to: Point): void => {
    turn(to);
    const cell = toCell(to, dimension);
    append('move', to, angle, entered.has(cell) ? timing.returnWeight : timing.moveWeight); entered.add(cell);
  };
  const pickupAndEnter = (cell: number): void => {
    const target = toPoint(cell, dimension); turn(target);
    if (!picked.has(cell)) {
      append('pickup', position, angle, timing.pickupWeight, cell); picked.add(cell); pickupOrder.push(cell);
    }
    move(target);
  };
  append('route', position, angle, timing.routeMs);
  for (const point of approach) move(point);
  pickupAndEnter(start);

  // A branch tour returns along cleared tree edges. At each junction, reserve its parent/gate edge for last.
  const visitBranch = (cell: number): void => {
    const returnTo = { ...position }; pickupAndEnter(cell);
    for (const child of children.get(cell) ?? []) visitBranch(child);
    move(returnTo);
  };
  for (let current = start; ;) {
    for (const child of children.get(current) ?? []) if (!picked.has(child)) visitBranch(child);
    if (current === root) break;
    current = parents.get(current)!; pickupAndEnter(current);
  }
  turn(exit);
  const durationMs = Math.min(timing.maxMs, timing.smallGroupMs + Math.max(0, group.size - 4) * timing.extraCellMs);
  const activeMs = durationMs - timing.routeMs - timing.exitMs - timing.holdMs;
  const totalWeight = steps.slice(1).reduce((sum, step) => sum + step.endMs, 0);
  let time = 0;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index], duration = index === 0 ? timing.routeMs : activeMs * step.endMs / totalWeight;
    step.startMs = time; step.endMs = time += duration;
  }
  // Anchor the fixed ending to its exact budget, avoiding cumulative floating point drift.
  time = durationMs - timing.exitMs - timing.holdMs;
  steps[steps.length - 1].endMs = time;
  append('exit', exit, angle, timing.exitMs);
  const departure = steps[steps.length - 1]; departure.startMs = time; departure.endMs = time += timing.exitMs;
  append('hold', exit, angle, timing.holdMs);
  const hold = steps[steps.length - 1]; hold.startMs = time; hold.endMs = durationMs;
  return { steps, pickupOrder, durationMs, moveAtMs: timing.routeMs, deliveryAtMs: time, dimension, exit: { ...exit } };
}

/** Stateless sampling supports skipped frames, backward scrubbing, and exact completed-pickup counts. */
export function sampleOutboundTransport(plan: OutboundTransportPlan, progress: number): {
  position: Point; angle: number; loadedCount: number; pickedCells: number[];
  pickup?: { cell: number; progress: number }; stage: OutboundTransportStep['kind']; alpha: number; finished: boolean;
} {
  const amount = unit(progress), time = amount * plan.durationMs;
  // A normalized boundary can round a fraction of an ULP below its original millisecond value.
  const boundaryTime = time + plan.durationMs * Number.EPSILON * 4;
  const step = plan.steps.find(step => boundaryTime < step.endMs) ?? plan.steps[plan.steps.length - 1];
  const fraction = unit((time - step.startMs) / (step.endMs - step.startMs));
  const pickedCells = plan.steps.filter(step => step.kind === 'pickup' && step.endMs <= boundaryTime).map(step => step.pickupCell!);
  return {
    position: { x: step.from.x + (step.to.x - step.from.x) * fraction, y: step.from.y + (step.to.y - step.from.y) * fraction },
    angle: step.fromAngle + (step.toAngle - step.fromAngle) * fraction, loadedCount: pickedCells.length, pickedCells,
    ...(step.kind === 'pickup' ? { pickup: { cell: step.pickupCell!, progress: fraction } } : {}),
    stage: step.kind, alpha: step.kind === 'hold' ? 1 - fraction : 1, finished: amount === 1,
  };
}
