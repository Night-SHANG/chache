import type { Cell, Point } from '../domain/types.ts';

interface LoadedExitRouteInput {
  dimension: 7 | 9;
  board: readonly Cell[];
  clearedCells: readonly number[];
  start: Point;
  exit: Point;
  initialAngle: number;
}
export interface LoadedExitRoute {
  /** Excludes the start and ends at the gate immediately before the exterior exit. */
  path: Point[];
  moves: number;
  /** Includes the incoming heading and final turn toward the exterior. */
  turnQuarters: number;
}

const quarterTurns = (from: number, to: number): number => {
  const difference = Math.abs(from - to);
  return Math.min(difference, 4 - difference);
};
const gridPoint = (point: Point, dimension: number): boolean => !!point
  && Number.isInteger(point.x) && Number.isInteger(point.y)
  && point.x >= 0 && point.y >= 0 && point.x < dimension && point.y < dimension;

/** The group is already gathered. Minimize loaded steps, then turns, with N/E/S/W ties. */
export function findLoadedExitRoute(input: LoadedExitRouteInput): LoadedExitRoute | null {
  if (!input) return null;
  const { dimension, board, clearedCells, start, exit, initialAngle } = input;
  if (dimension !== 7 && dimension !== 9 || !Array.isArray(board) || board.length !== dimension ** 2
    || !Array.isArray(clearedCells) || !gridPoint(start, dimension) || !exit || !Number.isFinite(initialAngle)) return null;
  const angleQuarters = initialAngle / (Math.PI / 2), cardinal = Math.round(angleQuarters);
  if (Math.abs(angleQuarters - cardinal) > 1e-8) return null;
  const initialHeading = ((cardinal + 1) % 4 + 4) % 4, middle = Math.floor(dimension / 2);
  const outward = exit.x === middle && exit.y === -1 ? 0
    : exit.x === dimension && exit.y === middle ? 1 : exit.x === -1 && exit.y === middle ? 3 : -1;
  if (outward === -1) return null;
  const cleared = new Set<number>();
  for (const cell of clearedCells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= board.length) return null;
    cleared.add(cell);
  }
  const passable = Array.from({ length: board.length }, (_, cell) => board[cell] === null || cleared.has(cell));
  const gateX = Math.max(0, Math.min(dimension - 1, exit.x));
  const gateY = Math.max(0, Math.min(dimension - 1, exit.y));
  const gate = gateY * dimension + gateX, startCell = start.y * dimension + start.x;
  if (!passable[startCell] || !passable[gate]) return null;

  const offsets = [-dimension, 1, dimension, -1];
  const adjacency = Array.from({ length: board.length }, (_, cell) => {
    const x = cell % dimension, y = Math.floor(cell / dimension);
    const allowed = [y > 0, x < dimension - 1, y < dimension - 1, x > 0];
    return offsets.flatMap((offset, direction) => allowed[direction] && passable[cell + offset]
      ? [{ cell: cell + offset, direction }] : []);
  });
  const distances = Array<number>(board.length).fill(-1), queue = [gate];
  distances[gate] = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    for (const edge of adjacency[cell]) if (distances[edge.cell] === -1) {
      distances[edge.cell] = distances[cell] + 1;
      queue.push(edge.cell);
    }
  }
  if (distances[startCell] === -1) return null;

  // BFS order makes decreasing-distance edges acyclic: at most 81 × 4 heading states.
  const turns = Array<number>(board.length * 4).fill(Infinity);
  const nextDirection = Array<number>(board.length * 4).fill(-1);
  for (let incoming = 0; incoming < 4; incoming++) turns[gate * 4 + incoming] = quarterTurns(incoming, outward);
  for (const cell of queue) {
    if (cell === gate) continue;
    for (let incoming = 0; incoming < 4; incoming++) for (const edge of adjacency[cell]) {
      if (distances[edge.cell] !== distances[cell] - 1) continue;
      const cost = quarterTurns(incoming, edge.direction) + turns[edge.cell * 4 + edge.direction];
      if (cost < turns[cell * 4 + incoming]) {
        turns[cell * 4 + incoming] = cost;
        nextDirection[cell * 4 + incoming] = edge.direction;
      }
    }
  }
  const path: Point[] = [];
  let cell = startCell, direction = initialHeading;
  while (cell !== gate) {
    direction = nextDirection[cell * 4 + direction];
    cell += offsets[direction];
    path.push({ x: cell % dimension, y: Math.floor(cell / dimension) });
  }
  return { path, moves: distances[startCell], turnQuarters: turns[startCell * 4 + initialHeading] };
}
