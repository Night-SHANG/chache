import test from 'node:test';
import assert from 'node:assert/strict';
import type { Cell, Point } from '../src/domain/types.ts';
import { selectOutboundRoute as selectRoute } from '../src/presentation/outbound-route.ts';

type Input = {
  dimension: 7 | 9; board: readonly Cell[]; group: readonly number[]; parents: ReadonlyMap<number, number>;
  approach: readonly Point[]; exit: Point; moveMs: number; turnQuarterMs: number;
};
const pointAt = (cell: number, dimension: number): Point => ({ x: cell % dimension, y: Math.floor(cell / dimension) });
const neighbors = (cell: number, dimension: number): number[] => {
  const { x, y } = pointAt(cell, dimension);
  return [y > 0 ? cell - dimension : -1, x + 1 < dimension ? cell + 1 : -1,
    y + 1 < dimension ? cell + dimension : -1, x > 0 ? cell - 1 : -1].filter(next => next !== -1);
};
function fixture(dimension: 7 | 9, group: number[], approach?: Point[]): Input {
  const root = Math.floor(dimension / 2), member = new Set(group), board: Cell[] = Array(dimension ** 2).fill(null);
  for (const cell of group) board[cell] = 'cargo.food';
  const queue = [root], seen = new Set(queue), parents = new Map<number, number>();
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors(queue[cursor], dimension)) {
    if (member.has(next) && !seen.has(next)) { seen.add(next); parents.set(next, queue[cursor]); queue.push(next); }
  }
  assert.equal(seen.size, group.length, 'fixture group is connected to the gate');
  if (!approach) {
    const entrance = dimension * (dimension - 1) + root, access = [entrance], accessParents = new Map([[entrance, -1]]);
    assert.equal(board[entrance], null);
    for (let cursor = 0; cursor < access.length; cursor++) {
      const current = access[cursor];
      if (neighbors(current, dimension).some(next => member.has(next))) {
        approach = [];
        for (let cell = current; cell !== -1; cell = accessParents.get(cell)!) approach.push(pointAt(cell, dimension));
        approach.reverse(); break;
      }
      for (const next of neighbors(current, dimension)) if (board[next] === null && !accessParents.has(next)) {
        accessParents.set(next, current); access.push(next);
      }
    }
  }
  assert.ok(approach);
  return { dimension, board, group, parents, approach, exit: { x: root, y: -1 }, moveMs: 150, turnQuarterMs: 180 };
}
function measure(input: Input, walk: readonly number[]): { moves: number; turnQuarters: number } {
  const { dimension, approach, exit } = input;
  let previous = approach[approach.length - 1];
  const before = approach.length > 1 ? approach[approach.length - 2] : { x: Math.floor(dimension / 2), y: dimension };
  const heading = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);
  let angle = heading(before, previous), turns = 0;
  for (const point of [...walk.map(cell => pointAt(cell, dimension)), exit]) {
    const next = heading(previous, point), delta = Math.atan2(Math.sin(next - angle), Math.cos(next - angle));
    turns += Math.round(Math.abs(delta) / (Math.PI / 2)); angle = next; previous = point;
  }
  return { moves: walk.length, turnQuarters: turns };
}
function safeRoute(input: Input, result: ReturnType<typeof selectRoute>): void {
  const { dimension, board, group, approach, parents } = input, members = new Set(group), picked = new Set<number>();
  let previous = approach[approach.length - 1];
  for (const cell of result.walk) {
    assert.ok(Number.isInteger(cell) && cell >= 0 && cell < dimension ** 2);
    const point = pointAt(cell, dimension);
    assert.equal(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y), 1, 'every move is exactly one orthogonal cell');
    if (!picked.has(cell) && members.has(cell)) picked.add(cell); // The caller completes this pickup before entry.
    assert.ok(board[cell] === null || picked.has(cell), 'entry requires empty space or a completed group pickup');
    previous = point;
  }
  assert.deepEqual([...picked].sort((a, b) => a - b), [...group].sort((a, b) => a - b), 'every group box is picked once');
  assert.equal(result.walk[result.walk.length - 1], group.find(cell => !parents.has(cell)), 'the final cell is the colored gate');
  assert.deepEqual({ moves: result.moves, turnQuarters: result.turnQuarters }, measure(input, result.walk));
  assert.ok(result.moves * input.moveMs + result.turnQuarters * input.turnQuarterMs
    <= result.baselineMoves * input.moveMs + result.baselineTurnQuarters * input.turnQuarterMs, 'presentation cost never exceeds the certified tree tour');
}

test('a five-box loop uses its adjacent cycle edge instead of retracing the cargo tree', () => {
  const input = fixture(9, [4, 13, 14, 22, 23]), result = selectRoute(input);
  safeRoute(input, result);
  assert.equal(result.strategy, 'frontier');
  assert.equal(result.baselineMoves + input.approach.length, 13);
  assert.equal(result.moves + input.approach.length, 11);
  assert.equal(result.baselineTurnQuarters, 6, 'the tree has five turn actions, including one half-turn');
  assert.equal(result.turnQuarters, 4);
});

test('the host north-loop cuts both travel and turning', () => {
  const input = fixture(9, [4, 13, 14, 23, 22, 21, 12]), result = selectRoute(input);
  safeRoute(input, result);
  assert.ok(result.moves < result.baselineMoves);
  assert.ok(result.turnQuarters < result.baselineTurnQuarters);
});

for (const dimension of [7, 9] as const) test(`${dimension}×${dimension} dense cargo avoids the tree tour's repeated crossings`, () => {
  const entrance = dimension * (dimension - 1) + Math.floor(dimension / 2);
  const input = fixture(dimension, Array.from({ length: dimension ** 2 }, (_, cell) => cell).filter(cell => cell !== entrance));
  let boardReads = 0;
  input.board = new Proxy(input.board, { get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) boardReads++;
    return Reflect.get(target, key, receiver);
  } });
  const result = selectRoute(input), readsDuringSelection = boardReads;
  safeRoute(input, result);
  assert.ok(result.moves < result.baselineMoves * .7, 'dense cargo has materially less retracing');
  assert.ok(result.moves <= input.group.length + 5);
  assert.ok(readsDuringSelection <= 4 * input.group.length * dimension ** 2 * 4 + 4 * dimension ** 2 * 4,
    'four sweeps visit at most one grid per pickup round, plus their final returns');
});

test('forks, a narrow corridor, and a gate-first group are no worse than the original tree route', () => {
  const cases = [fixture(9, [4, 13, 22, 21, 20, 23, 24, 31]),
    fixture(9, Array.from({ length: 8 }, (_, y) => y * 9 + 4)),
    fixture(9, [2, 3, 4, 5, 6], Array.from({ length: 8 }, (_, i) => ({ x: 4, y: 8 - i })))];
  for (const input of cases) safeRoute(input, selectRoute(input));
  assert.equal(selectRoute(cases[1]).strategy, 'tree', 'an identical candidate retains the stable tree fallback');
  assert.equal(selectRoute(cases[2]).walk[0], 4, 'a required gate-first pickup is allowed');
});

test('cost inherits the final approach heading and includes a quarter-turn toward the exterior', () => {
  const approach = [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 },
    ...Array.from({ length: 6 }, (_, i) => ({ x: 2, y: 7 - i })), { x: 3, y: 2 }];
  const input = fixture(9, [4, 13, 22], approach), result = selectRoute(input);
  safeRoute(input, result);
  assert.deepEqual(result.walk, [22, 13, 4]);
  assert.equal(result.turnQuarters, 1, 'the first move continues the eastward approach heading');

  const sideInput = fixture(9, [4, 5], Array.from({ length: 9 }, (_, i) => ({ x: 3, y: 8 - i })));
  const sideResult = selectRoute(sideInput); safeRoute(sideInput, sideResult);
  assert.deepEqual(sideResult.walk, [4, 5, 4]);
  assert.equal(sideResult.turnQuarters, 4, 'east, west, then north include the final exit turn');
});

test('the route cannot use foreign cargo or cargo belonging to a future chain', () => {
  const input = fixture(9, [4, 13, 14, 22, 23]), board = [...input.board];
  for (const cell of [3, 5, 12, 15, 21, 24]) board[cell] = cell % 2 ? 'cargo.food' : 'cargo.chem';
  input.board = board;
  const result = selectRoute(input); safeRoute(input, result);
  for (const cell of [3, 5, 12, 15, 21, 24]) assert.ok(!result.walk.includes(cell));
});

test('approach, board, group, and parent metadata remain immutable and route selection is deterministic', () => {
  const input = fixture(9, [4, 13, 14, 23, 22, 21, 12]);
  const before = JSON.stringify({ ...input, parents: [...input.parents] });
  input.approach.forEach(Object.freeze); Object.freeze(input.approach); Object.freeze(input.board); Object.freeze(input.group); Object.freeze(input);
  const first = selectRoute(input), second = selectRoute(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ ...input, parents: [...input.parents] }), before);
  first.walk.push(999); assert.deepEqual(selectRoute(input), second, 'result arrays are not shared');
});

test('seeded connected groups retain safe adjacency and the tree cost bound across turn prices', () => {
  let seed = 72341;
  const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (const dimension of [7, 9] as const) for (let sample = 0; sample < 45; sample++) {
    const root = Math.floor(dimension / 2), entrance = (dimension - 1) * dimension + root, group = [root], member = new Set(group);
    const target = 1 + random() % (dimension ** 2 - 1);
    while (group.length < target) {
      const boundary = group.flatMap(cell => neighbors(cell, dimension)).filter(cell => cell !== entrance && !member.has(cell));
      const next = boundary[random() % boundary.length]; member.add(next); group.push(next);
    }
    const input = fixture(dimension, group); input.turnQuarterMs = [0, 30, 120, 600][sample % 4];
    const result = selectRoute(input); safeRoute(input, result); assert.deepEqual(selectRoute(input), result);
  }
});
