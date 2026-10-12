import { COLOR_EXIT_DOCKS, COLOR_EXIT_ENTRY, DOCKS } from '../domain/content.ts';
import type { GameRun, GameShipment } from '../domain/playable.ts';
import type { CargoId, Dock, Shipment } from '../domain/types.ts';

/** Passing an Array.map index remains compatible with legacy map(cellCenter) callers. */
export type GeometrySource = GameRun | GameShipment | { boardSize?: number } | number;
export interface BoardGeometry {
  boardSize: 7 | 8 | 9;
  dimension: 7 | 8 | 9;
  x: number;
  y: number;
  size: number;
  cell: number;
  boxSize: number;
  scale: number;
  docks: Dock[];
  colorExits: (Dock & { cargo: CargoId })[];
  entry: Dock;
}

function makeGeometry(dimension: 7 | 8 | 9): BoardGeometry {
  const cell = 840 / dimension, scale = cell / 120, middle = dimension === 8 ? 3 : Math.floor(dimension / 2);
  const adapt = <T extends Dock>(dock: T): T => dimension === 7 ? dock : { ...dock, entry: {
    x: dock.side === 'west' ? 0 : dock.side === 'east' ? dimension - 1 : middle,
    y: dock.side === 'north' ? 0 : dock.side === 'south' ? dimension - 1 : middle,
  } };
  return { boardSize: dimension, dimension, x: 120, y: 560, size: 840, cell, boxSize: 110 * scale, scale,
    docks: DOCKS.map(adapt), colorExits: COLOR_EXIT_DOCKS.map(adapt), entry: adapt(COLOR_EXIT_ENTRY) };
}
const LEGACY = makeGeometry(7), EXPANDED = makeGeometry(8), OUTBOUND = makeGeometry(9);

/** Explicit run metadata selects expanded inbound or outbound; legacy pixels stay fixed. */
export function boardGeometry(source: Shipment): BoardGeometry & { boardSize: 7 | 9; dimension: 7 | 9 };
export function boardGeometry(source?: GeometrySource): BoardGeometry;
export function boardGeometry(source?: GeometrySource): BoardGeometry {
  if (source && typeof source === 'object' && 'boardSize' in source) {
    if (source.boardSize === 8) return EXPANDED;
    if (source.boardSize === 9) return OUTBOUND;
  }
  return LEGACY;
}
