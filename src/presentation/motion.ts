import { Easing } from '@tweenjs/tween.js';
import type { Dock, Point, Shipment } from '../domain/types.ts';
import { DOCKS } from '../domain/content.ts';
import { RULES_V2_CONFIG } from '../domain/v2/content.ts';
import { L, cellCenter } from './layout.ts';

/** Presentation-only clocks. The Domain and saved run never depend on these values. */
export const MOTION = {
  placeMs: 100, invalidMs: 140, noticeMs: 650, failMs: 180,
  reduced: { placeMs: 0, invalidMs: 0, noticeMs: 240, failMs: 0 },
} as const;

export function shipmentTiming(reducedMotion: boolean): { routeMs: number; moveMs: number; collectMs: number; carryMs: number; exitMs: number; totalMs: number } {
  return reducedMotion
    ? { routeMs: 0, moveMs: 0, collectMs: 80, carryMs: 0, exitMs: 0, totalMs: 80 }
    : { routeMs: 100, moveMs: 260, collectMs: 140, carryMs: 360, exitMs: 140, totalMs: 1000 };
}
const unit = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
/** One gentle excursion, never a repeating shake or flash. */
const bump = (n: number): number => { const p = unit(n); return p === 0 || p === 1 ? 0 : Math.sin(p * Math.PI); };

export interface ShipmentFrame { stage: 'route' | 'move' | 'collect' | 'carry' | 'exit'; route: number; move: number; collect: number; carry: number; exit: number }
/** The session supplies a linear clock; easing belongs only inside the move segment. */
export function shipmentFrame(progress: number, reducedMotion: boolean): ShipmentFrame {
  if (reducedMotion) return { stage: 'collect', route: 1, move: 0, collect: unit(progress), carry: 0, exit: 0 };
  const timing = shipmentTiming(false), time = unit(progress) * timing.totalMs;
  const loadStart = timing.routeMs + timing.moveMs, carryStart = loadStart + timing.collectMs, exitStart = carryStart + timing.carryMs;
  return {
    stage: time < timing.routeMs ? 'route' : time < loadStart ? 'move' : time < carryStart ? 'collect' : time < exitStart ? 'carry' : 'exit',
    route: unit(time / timing.routeMs),
    move: Easing.Quadratic.InOut(unit((time - timing.routeMs) / timing.moveMs)),
    collect: unit((time - loadStart) / timing.collectMs),
    carry: unit((time - carryStart) / timing.carryMs),
    exit: unit((time - exitStart) / timing.exitMs),
  };
}

/** Canonical path is consumed verbatim. No new path, random jitter or board offset. */
export function routePose(route: Point[], progress: number): (Point & { angle: number }) | null {
  if (!route.length) return null;
  const step = unit(progress) * (route.length - 1), index = Math.floor(step), next = Math.min(route.length - 1, index + 1);
  const from = cellCenter(route[index]), to = cellCenter(route[next]), amount = step - index;
  const headingFrom = next === index ? cellCenter(route[Math.max(0, index - 1)]) : from;
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount, angle: Math.atan2(to.y - headingFrom.y, to.x - headingFrom.x) };
}

export interface ShipmentPose extends Point { angle: number; cargo: Point; loaded: boolean; alpha: number }
type VehiclePose = Point & { angle: number };
const boardCells = L.board.size / L.board.cell;
const gridPoint = (point: Point): boolean => !!point && Number.isInteger(point.x) && Number.isInteger(point.y)
  && point.x >= 0 && point.y >= 0 && point.x < boardCells && point.y < boardCells;
const heading = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);
const angleDelta = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** The path itself identifies the physical entrance, including the unlocked southwest gate. */
function shipmentEntrance(shipment: Shipment): Dock | null {
  const entry = shipment && Array.isArray(shipment.path) ? shipment.path[0] : undefined;
  if (!entry || !gridPoint(entry)) return null;
  const dock = DOCKS.find(candidate => candidate.entry.x === entry.x && candidate.entry.y === entry.y);
  if (dock) return dock;
  const side = RULES_V2_CONFIG.sideEntry;
  return entry.x === side.x && entry.y === side.y
    ? { id: 'gate.side', name: '西南侧门', entry, side: 'west', priority: 4 } : null;
}

/** Doorway feedback belongs to the entrance actually used, independently of the order's score label. */
export function shipmentGate(shipment: Shipment): Point | null {
  const dock = shipmentEntrance(shipment);
  return dock ? dockPosition(dock) : null;
}

/** Short stationary turns preserve canonical corners and keep a carried load in front of the forks. */
function journeyPose(points: Point[], progress: number, initialAngle: number, finalAngle: number, reverse = false): VehiclePose {
  const segments: { from: VehiclePose; to: VehiclePose; weight: number }[] = [];
  let current: VehiclePose = { ...points[0], angle: initialAngle };
  const turn = (angle: number): void => {
    const delta = angleDelta(current.angle, angle);
    if (Math.abs(delta) < 1e-8) return;
    const next = { ...current, angle: current.angle + delta };
    segments.push({ from: current, to: next, weight: Math.abs(delta) * L.board.cell * .22 });
    current = next;
  };
  for (const point of points.slice(1)) {
    turn(reverse ? heading(point, current) : heading(current, point));
    const next = { ...point, angle: current.angle };
    segments.push({ from: current, to: next, weight: Math.hypot(next.x - current.x, next.y - current.y) });
    current = next;
  }
  turn(finalAngle);
  let remaining = unit(progress) * segments.reduce((sum, segment) => sum + segment.weight, 0);
  for (const { from, to, weight } of segments) {
    if (remaining <= weight) {
      const amount = weight ? remaining / weight : 1;
      return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount, angle: from.angle + (to.angle - from.angle) * amount };
    }
    remaining -= weight;
  }
  return current;
}

/** Presentation-only pickup and reverse journey. It never derives a replacement gameplay path. */
export function shipmentPose(shipment: Shipment, frame: ShipmentFrame): ShipmentPose | null {
  const dock = shipmentEntrance(shipment);
  if (!dock || !Array.isArray(shipment.cells) || Array.from(shipment.path).some((point, index, path) => !gridPoint(point)
    || index > 0 && Math.abs(point.x - path[index - 1].x) + Math.abs(point.y - path[index - 1].y) !== 1)) return null;
  const end = shipment.path[shipment.path.length - 1];
  const adjacent = shipment.cells.filter(index => Number.isInteger(index) && index >= 0 && index < boardCells ** 2
    && Math.abs(index % boardCells - end.x) + Math.abs(Math.floor(index / boardCells) - end.y) === 1);
  if (!adjacent.length) return null;
  const cell = Math.min(...adjacent), centers = shipment.path.map(cellCenter), entry = centers[0], pickup = centers[centers.length - 1], gate = dockPosition(dock);
  const inward = { x: dock.side === 'west' ? 1 : dock.side === 'east' ? -1 : 0, y: dock.side === 'north' ? 1 : dock.side === 'south' ? -1 : 0 };
  // The crate, pallet and 52 px downward count badge all clear the board before fading.
  const outside = { x: entry.x - inward.x * L.board.cell * 1.6, y: entry.y - inward.y * L.board.cell * 1.6 };
  const entryAngle = Math.atan2(inward.y, inward.x), pickupAngle = heading(pickup, cellCenter({ x: cell % boardCells, y: Math.floor(cell / boardCells) }));
  const reduced = frame.stage === 'collect' && frame.move === 0;
  let pose: VehiclePose = { ...pickup, angle: pickupAngle }, alpha = 1;
  if (frame.stage === 'route') pose = { ...outside, angle: entryAngle };
  else if (frame.stage === 'move') pose = journeyPose([outside, ...centers], frame.move, entryAngle, pickupAngle);
  else if (frame.stage === 'carry') pose = journeyPose([...centers].reverse().concat(gate), frame.carry, pickupAngle, entryAngle, true);
  else if (frame.stage === 'exit') {
    const amount = unit(frame.exit), travel = unit(amount / .72);
    pose = { x: gate.x + (outside.x - gate.x) * travel, y: gate.y + (outside.y - gate.y) * travel, angle: entryAngle };
    alpha = 1 - unit((amount - .72) / .28);
  }
  return { ...pose, cargo: { x: pose.x + Math.cos(pose.angle) * L.board.cell * .48, y: pose.y + Math.sin(pose.angle) * L.board.cell * .48 },
    loaded: !reduced && (frame.stage === 'carry' || frame.stage === 'exit' || frame.stage === 'collect' && unit(frame.collect) === 1), alpha };
}

/** Same position is used for the physical gate, collection and its restrained flash. */
export function dockPosition(dock: Dock): Point {
  const p = cellCenter(dock.entry);
  return {
    x: dock.side === 'west' ? L.board.x - 24 : dock.side === 'east' ? L.board.x + L.board.size + 24 : p.x,
    y: dock.side === 'north' ? L.board.y - 10 : dock.side === 'south' ? L.board.y + L.board.size + 15 : p.y,
  };
}

export function collectPose(source: Point, target: Point, progress: number, reducedMotion: boolean): Point & { scale: number } {
  if (reducedMotion) return { ...source, scale: 1 };
  const p = unit(progress), travel = Easing.Cubic.InOut(unit((p - .22) / .78));
  const lift = p < .22 ? 12 * Easing.Quadratic.Out(p / .22) : 12 * (1 - travel);
  return { x: source.x + (target.x - source.x) * travel, y: source.y + (target.y - source.y) * travel - lift, scale: 1 - (1 - 64 / 110) * travel };
}

export function chainFeedback(chain: number): { particles: number; dust: number; flash: number; fontSize: number; pulse: boolean } {
  const level = Math.max(1, Math.min(4, Math.floor(chain) || 1));
  return { particles: [4, 7, 10, 12][level - 1], dust: level + 2, flash: .1 + level * .04, fontSize: 32 + level * 4, pulse: level === 4 };
}

/** At most six dust motes or twelve Dock specks; no allocation grows with chain length. */
export function feedbackParticles(origin: Point, chain: number, progress: number, stage: 'move' | 'collect', reducedMotion = false): (Point & { radius: number; alpha: number })[] {
  if (reducedMotion) return [];
  const p = unit(progress); if (p <= 0 || p >= 1) return [];
  const feedback = chainFeedback(chain), count = stage === 'move' ? feedback.dust : feedback.particles;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963229728653 + (stage === 'move' ? Math.PI : 0);
    const distance = (stage === 'move' ? 7 + p * 20 : 9 + p * 48) + index % 3;
    return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance,
      radius: stage === 'move' ? 2 + index % 2 : 3 + index % 3, alpha: (stage === 'move' ? .28 : .46) * bump(p) };
  });
}

export function placementPose(progress: number, reducedMotion: boolean): Point {
  const amount = reducedMotion ? 0 : bump(progress);
  return { x: 1 + amount * .04, y: 1 - amount * .08 };
}

export function reboundOffset(progress: number, reducedMotion: boolean): number {
  return reducedMotion || bump(progress) === 0 ? 0 : -8 * bump(progress);
}
