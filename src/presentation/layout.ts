import type { Point } from '../domain/types.ts';

export interface Rect { x: number; y: number; w: number; h: number }

const trays3 = [
  { x: 48, y: 1530, w: 316, h: 272 },
  { x: 382, y: 1530, w: 316, h: 272 },
  { x: 716, y: 1530, w: 316, h: 272 },
] as const;

/** One geometry source for Canvas rendering and pointer/touch hit testing. */
export const L = {
  width: 1080,
  height: 1920,
  board: { x: 120, y: 560, cell: 120, size: 840 },
  trays: trays3,
  trays3,
  pause: { x: 938, y: 54, w: 96, h: 100 },
  chain: { x: 938, y: 168, w: 96, h: 42 },
  boardHint: { x: 120, y: 496, w: 840, h: 27 },
  restart: { x: 246, y: 1240, w: 588, h: 114 },
  resume: { x: 246, y: 1090, w: 588, h: 114 },
  recoveryMenu: {x:246,y:1424,w:588,h:72},
  upgradeRects: [
    { x: 54, y: 650, w: 312, h: 592 },
    { x: 384, y: 650, w: 312, h: 592 },
    { x: 714, y: 650, w: 312, h: 592 },
  ],
  debug: { x: 880, y: 1836, w: 152, h: 48 },
} as const;

export function getLayout() { return L; }

/** Candidate count changes layout, never the board or logical coordinate system. */
export function getTrayRects(count: number): Rect[] {
  if (count === 3) return L.trays.map(rect => ({ ...rect }));
  if (!Number.isInteger(count) || count < 1 || count > 4) return [];
  const gap = 18, x = 48, width = 984;
  const w = (width - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({ x: x + index * (w + gap), y: 1530, w, h: 272 }));
}

export function hitTestPoint(point: Point, rect: Rect): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= rect.x && point.y >= rect.y
    && point.x < rect.x + rect.w && point.y < rect.y + rect.h;
}

export function pointToCell(point: Point): Point | null {
  const { x, y, cell, size } = L.board;
  if (!hitTestPoint(point, { x, y, w: size, h: size })) return null;
  return { x: Math.floor((point.x - x) / cell), y: Math.floor((point.y - y) / cell) };
}

export function cellCenter(point: Point): Point {
  return { x: L.board.x + (point.x + 0.5) * L.board.cell, y: L.board.y + (point.y + 0.5) * L.board.cell };
}

/** Match a contain/letterbox canvas placed inside a client-space viewport. */
export function mapClientPoint(point: Point, viewport: Rect): Point | null {
  if (viewport.w <= 0 || viewport.h <= 0) return null;
  const scale = Math.min(viewport.w / L.width, viewport.h / L.height);
  const x = viewport.x + (viewport.w - L.width * scale) / 2;
  const y = viewport.y + (viewport.h - L.height * scale) / 2;
  const logical = { x: (point.x - x) / scale, y: (point.y - y) / scale };
  return hitTestPoint(logical, { x: 0, y: 0, w: L.width, h: L.height }) ? logical : null;
}
