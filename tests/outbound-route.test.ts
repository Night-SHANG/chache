import test from 'node:test';
import assert from 'node:assert/strict';
import type { Cell, Point } from '../src/domain/types.ts';
import { findLoadedExitRoute } from '../src/presentation/outbound-route.ts';

type Input = {
  dimension: 7 | 9;
  board: readonly Cell[];
  clearedCells: readonly number[];
  start: Point;
  exit: Point;
  initialAngle: number;
};
type Route = { path: Point[]; moves: number; turnQuarters: number };
const directions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const turn = (from: number, to: number): number => Math.min(Math.abs(from - to), 4 - Math.abs(from - to));
const pointAt = (cell: number, dimension: number): Point => ({ x: cell % dimension, y: Math.floor(cell / dimension) });
const cellAt = (point: Point, dimension: number): number => point.y * dimension + point.x;
const heading = (angle: number): number => ((Math.round(angle / (Math.PI / 2)) + 1) % 4 + 4) % 4;
const gateAt = (input: Input): Point => ({ x: Math.max(0, Math.min(input.dimension - 1, input.exit.x)),
  y: Math.max(0, Math.min(input.dimension - 1, input.exit.y)) });
function fixture(dimension: 7 | 9 = 9): Input {
  const middle = Math.floor(dimension / 2);
  return { dimension, board: Array<Cell>(dimension ** 2).fill(null), clearedCells: [],
    start: { x: middle, y: dimension - 1 }, exit: { x: middle, y: -1 }, initialAngle: -Math.PI / 2 };
}
function safeRoute(input: Input, route: Route | null): asserts route is Route {
  assert.ok(route);
  const cleared = new Set(input.clearedCells);
  let previous = input.start, previousHeading = heading(input.initialAngle), turns = 0;
  for (const point of route.path) {
    assert.ok(Number.isInteger(point.x) && Number.isInteger(point.y));
    assert.ok(point.x >= 0 && point.y >= 0 && point.x < input.dimension && point.y < input.dimension);
    assert.equal(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y), 1);
    assert.ok(input.board[cellAt(point, input.dimension)] === null || cleared.has(cellAt(point, input.dimension)),
      'only empty cells and this shipment’s cleared cells are traversable');
    const nextHeading = heading(Math.atan2(point.y - previous.y, point.x - previous.x));
    turns += turn(previousHeading, nextHeading); previousHeading = nextHeading; previous = point;
  }
  assert.deepEqual(previous, gateAt(input));
  turns += turn(previousHeading, heading(Math.atan2(input.exit.y - previous.y, input.exit.x - previous.x)));
  assert.equal(route.moves, route.path.length);
  assert.equal(route.turnQuarters, turns);
}

for (const dimension of [7, 9] as const) for (const side of ['north', 'east', 'west'] as const) {
  test(`${dimension}×${dimension} loaded cargo goes straight to its ${side} gate`, () => {
    const input = fixture(dimension), middle = Math.floor(dimension / 2);
    if (side !== 'north') {
      input.start = { x: side === 'east' ? 0 : dimension - 1, y: middle };
      input.exit = { x: side === 'east' ? dimension : -1, y: middle };
      input.initialAngle = side === 'east' ? 0 : Math.PI;
    }
    const route = findLoadedExitRoute(input); safeRoute(input, route);
    assert.equal(route.moves, dimension - 1);
    assert.equal(route.turnQuarters, 0);
    assert.notDeepEqual(route.path[0], input.start);
    assert.deepEqual(route.path[route.path.length - 1], gateAt(input));
  });
}

test('an eighty-box load takes eight northbound moves instead of touring its former cells', () => {
  const input = fixture(), startCell = cellAt(input.start, input.dimension);
  input.board = Array<Cell>(81).fill('cargo.food');
  (input.board as Cell[])[startCell] = null;
  input.clearedCells = Array.from({ length: 81 }, (_, cell) => cell).filter(cell => cell !== startCell);
  const route = findLoadedExitRoute(input); safeRoute(input, route);
  assert.deepEqual(route, { path: Array.from({ length: 8 }, (_, index) => ({ x: 4, y: 7 - index })),
    moves: 8, turnQuarters: 0 });
});

test('far branches of a gathered group do not add loaded travel', () => {
  const input = fixture(), board = [...input.board];
  input.clearedCells = [4, 13, 22, 21, 20, 19, 18, 23, 24, 25, 26, 35, 44, 53, 62, 71, 80];
  for (const cell of input.clearedCells) board[cell] = 'cargo.food';
  input.board = board;
  const route = findLoadedExitRoute(input); safeRoute(input, route);
  assert.equal(route.moves, 8);
  assert.ok(route.path.every(point => point.x === 4));
});

test('a load cannot escape through residual cargo of another color', () => {
  const input = fixture(7), board = [...input.board];
  input.start = { x: 3, y: 3 };
  for (const cell of [17, 23, 25, 31]) board[cell] = 'cargo.chem';
  input.board = board;
  assert.equal(findLoadedExitRoute(input), null);
});

test('cargo in a future shipment stays blocked even when it has the same color', () => {
  const input = fixture(7), board = [...input.board];
  for (let x = 0; x < 7; x++) board[3 * 7 + x] = 'cargo.food';
  input.clearedCells = [3]; board[3] = 'cargo.food'; input.board = board;
  assert.equal(findLoadedExitRoute(input), null);
  input.clearedCells = [3, 24];
  const route = findLoadedExitRoute(input); safeRoute(input, route);
  assert.equal(route.moves, 6);
});

test('equally short routes minimize turns inherited from the approach', () => {
  const input = fixture(7);
  input.start = { x: 1, y: 3 }; input.initialAngle = 0;
  const route = findLoadedExitRoute(input); safeRoute(input, route);
  assert.deepEqual(route.path, [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }]);
  assert.equal(route.turnQuarters, 1);
});

test('a stable north/east/south/west order breaks equal distance and turn ties', () => {
  const input = fixture(7), board = [...input.board];
  input.start = { x: 3, y: 3 }; board[17] = 'cargo.chem'; input.board = board;
  const route = findLoadedExitRoute(input); safeRoute(input, route);
  assert.deepEqual(route.path, [{ x: 4, y: 3 }, { x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 }, { x: 3, y: 0 }]);
  assert.equal(route.turnQuarters, 4, 'the last quarter turn faces the outside exit');
});

test('a load already at the gate has no moves and still faces outward', () => {
  const input = fixture(); input.start = { x: 4, y: 0 }; input.initialAngle = Math.PI / 2;
  assert.deepEqual(findLoadedExitRoute(input), { path: [], moves: 0, turnQuarters: 2 });
  input.initialAngle = 7 * Math.PI / 2;
  assert.deepEqual(findLoadedExitRoute(input), { path: [], moves: 0, turnQuarters: 0 });
});

test('invalid dimensions, board lengths, coordinates, exits, and headings are rejected', () => {
  const invalid: Partial<Input>[] = [
    { dimension: 8 as 7 }, { board: Array<Cell>(80).fill(null) }, { board: Array<Cell>(82).fill(null) },
    { start: { x: -1, y: 0 } }, { start: { x: 9, y: 0 } }, { start: { x: 4, y: 9 } },
    { start: { x: 4.5, y: 3 } }, { start: { x: NaN, y: 0 } },
    { clearedCells: [-1] }, { clearedCells: [81] }, { clearedCells: [1.5] }, { clearedCells: [NaN] },
    { exit: { x: 4, y: 9 } }, { exit: { x: 3, y: -1 } }, { exit: { x: 4, y: -2 } },
    { exit: { x: 4, y: 0 } }, { exit: { x: 9, y: 3 } }, { exit: { x: -1, y: 3 } },
    { exit: { x: Infinity, y: 4 } }, { initialAngle: NaN }, { initialAngle: Infinity }, { initialAngle: .1 },
  ];
  for (const patch of invalid) assert.equal(findLoadedExitRoute({ ...fixture(), ...patch }), null, JSON.stringify(patch));
});

test('occupied start or gate must belong to this cleared group', () => {
  const input = fixture(), board = [...input.board]; input.board = board;
  board[76] = 'cargo.food'; assert.equal(findLoadedExitRoute(input), null);
  input.clearedCells = [76]; board[4] = 'cargo.chem'; assert.equal(findLoadedExitRoute(input), null);
  input.clearedCells = [76, 4]; safeRoute(input, findLoadedExitRoute(input));
});

test('readonly inputs stay intact and repeated calls own deterministic result points', () => {
  const input = fixture(7); input.start = { x: 1, y: 3 }; input.clearedCells = [3, 10, 17];
  const before = JSON.stringify(input);
  Object.freeze(input.start); Object.freeze(input.exit); Object.freeze(input.board); Object.freeze(input.clearedCells); Object.freeze(input);
  const first = findLoadedExitRoute(input), second = findLoadedExitRoute(input); safeRoute(input, first);
  assert.deepEqual(first, second); assert.equal(JSON.stringify(input), before);
  first.path[0].x = 999; first.path.push({ x: 999, y: 999 });
  assert.deepEqual(findLoadedExitRoute(input), second);
  assert.equal(JSON.stringify(input), before);
});

/** Independent forward lexicographic Dijkstra oracle, including heading as part of the state. */
function oracle(input: Input): { moves: number; turnQuarters: number } | null {
  const gate = gateAt(input), outward = heading(Math.atan2(input.exit.y - gate.y, input.exit.x - gate.x));
  const cleared = new Set(input.clearedCells), start = cellAt(input.start, input.dimension);
  const queue = [{ cell: start, direction: heading(input.initialAngle), moves: 0, turns: 0 }];
  const best = new Map<string, [number, number]>();
  let result: { moves: number; turnQuarters: number } | null = null;
  while (queue.length) {
    queue.sort((a, b) => a.moves - b.moves || a.turns - b.turns);
    const current = queue.shift()!, key = `${current.cell}:${current.direction}`, known = best.get(key);
    if (known && (known[0] < current.moves || known[0] === current.moves && known[1] <= current.turns)) continue;
    best.set(key, [current.moves, current.turns]);
    if (result && current.moves > result.moves) break;
    const point = pointAt(current.cell, input.dimension);
    if (point.x === gate.x && point.y === gate.y) {
      const total = current.turns + turn(current.direction, outward);
      if (!result || total < result.turnQuarters) result = { moves: current.moves, turnQuarters: total };
      continue;
    }
    for (let direction = 0; direction < directions.length; direction++) {
      const next = { x: point.x + directions[direction].x, y: point.y + directions[direction].y };
      if (next.x < 0 || next.y < 0 || next.x >= input.dimension || next.y >= input.dimension) continue;
      const cell = cellAt(next, input.dimension);
      if (input.board[cell] !== null && !cleared.has(cell)) continue;
      queue.push({ cell, direction, moves: current.moves + 1, turns: current.turns + turn(current.direction, direction) });
    }
  }
  return result;
}

test('seeded maps match an independent shortest-distance and turn oracle', () => {
  let seed = 981237;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (const dimension of [7, 9] as const) for (let sample = 0; sample < 100; sample++) {
    const input = fixture(dimension), middle = Math.floor(dimension / 2), cleared: number[] = [];
    const board = Array.from({ length: dimension ** 2 }, (_, cell): Cell => {
      if (random() % 5 > 1) return null;
      if (random() % 3 === 0) cleared.push(cell);
      return random() % 2 ? 'cargo.food' : 'cargo.chem';
    });
    input.start = pointAt(random() % board.length, dimension);
    input.exit = sample % 3 === 0 ? { x: middle, y: -1 } : { x: sample % 3 === 1 ? dimension : -1, y: middle };
    input.initialAngle = (random() % 4 - 1) * Math.PI / 2;
    board[cellAt(input.start, dimension)] = null; board[cellAt(gateAt(input), dimension)] = null;
    input.board = board; input.clearedCells = cleared;
    const expected = oracle(input), actual = findLoadedExitRoute(input);
    if (!expected) assert.equal(actual, null);
    else {
      safeRoute(input, actual);
      assert.deepEqual({ moves: actual.moves, turnQuarters: actual.turnQuarters }, expected,
        `dimension ${dimension}, sample ${sample}`);
      assert.deepEqual(findLoadedExitRoute(input), actual);
    }
  }
});
