import { COLOR_EXIT_DOCKS, COLOR_EXIT_ENTRY, DOCKS } from '../domain/content.ts';
import type { CargoId, Dock, RunState, Shipment } from '../domain/types.ts';

/** Passing an Array.map index remains compatible with legacy map(cellCenter) callers. */
export type GeometrySource = RunState | Shipment | { boardSize?: number } | number;
export interface BoardGeometry {
  boardSize: 7 | 9;
  dimension: 7 | 9;
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

function makeGeometry(dimension: 7 | 9): BoardGeometry {
  const cell = 840 / dimension, scale = cell / 120, middle = Math.floor(dimension / 2);
  const adapt = <T extends Dock>(dock: T): T => dimension === 7 ? dock : { ...dock, entry: {
    x: dock.side === 'west' ? 0 : dock.side === 'east' ? dimension - 1 : middle,
    y: dock.side === 'north' ? 0 : dock.side === 'south' ? dimension - 1 : middle,
  } };
  return { boardSize: dimension, dimension, x: 120, y: 560, size: 840, cell, boxSize: 110 * scale, scale,
    docks: DOCKS.map(adapt), colorExits: COLOR_EXIT_DOCKS.map(adapt), entry: adapt(COLOR_EXIT_ENTRY) };
}
const LEGACY = makeGeometry(7), OUTBOUND = makeGeometry(9);

/** Explicit v6 metadata selects 9×9. Missing metadata never moves a legacy gate or crate. */
export function boardGeometry(source?: GeometrySource): BoardGeometry {
  return source && typeof source === 'object' && 'boardSize' in source && source.boardSize === 9 ? OUTBOUND : LEGACY;
}
