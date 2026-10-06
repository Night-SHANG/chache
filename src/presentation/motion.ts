import { Easing } from '@tweenjs/tween.js';
import type { Dock, Point } from '../domain/types.ts';
import { L, cellCenter } from './layout.ts';

/** Presentation-only clocks. The Domain and saved run never depend on these values. */
export const MOTION = {
  placeMs: 100, invalidMs: 140, noticeMs: 650, failMs: 180,
  reduced: { placeMs: 0, invalidMs: 0, noticeMs: 240, failMs: 0 },
} as const;

export function shipmentTiming(reducedMotion: boolean): { routeMs: number; moveMs: number; collectMs: number; totalMs: number } {
  return reducedMotion ? { routeMs: 0, moveMs: 0, collectMs: 80, totalMs: 80 } : { routeMs: 140, moveMs: 350, collectMs: 160, totalMs: 650 };
}
const unit = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
/** One gentle excursion, never a repeating shake or flash. */
const bump = (n: number): number => { const p = unit(n); return p === 0 || p === 1 ? 0 : Math.sin(p * Math.PI); };

export interface ShipmentFrame { stage: 'route' | 'move' | 'collect'; route: number; move: number; collect: number }
/** The session supplies a linear clock; easing belongs only inside the move segment. */
export function shipmentFrame(progress: number, reducedMotion: boolean): ShipmentFrame {
  if (reducedMotion) return { stage: 'collect', route: 1, move: 0, collect: unit(progress) };
  const timing = shipmentTiming(false), time = unit(progress) * timing.totalMs;
  return {
    stage: time < timing.routeMs ? 'route' : time < timing.routeMs + timing.moveMs ? 'move' : 'collect',
    route: unit(time / timing.routeMs),
    move: Easing.Quadratic.InOut(unit((time - timing.routeMs) / timing.moveMs)),
    collect: unit((time - timing.routeMs - timing.moveMs) / timing.collectMs),
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
  return { x: source.x + (target.x - source.x) * travel, y: source.y + (target.y - source.y) * travel - lift, scale: 1 - .94 * travel };
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
