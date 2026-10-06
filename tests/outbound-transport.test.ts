import test from 'node:test';
import assert from 'node:assert/strict';
import type { CargoId, Cell, Point, Shipment } from '../src/domain/types.ts';
import { buildOutboundTransport, sampleOutboundTransport, OUTBOUND_TRANSPORT_TIMING } from '../src/presentation/outbound-transport.ts';
import type { OutboundTransportPlan } from '../src/presentation/outbound-transport.ts';

type Side = 'north' | 'east' | 'west';
const cellAt = (p: Point, dimension: number): number => p.y * dimension + p.x;
const pointAt = (cell: number, dimension: number): Point => ({ x: cell % dimension, y: Math.floor(cell / dimension) });
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const angleNear = (actual: number, expected: number): void => near(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)), 0);
function neighbors(cell: number, dimension: number): number[] {
  const p = pointAt(cell, dimension);
  return [{ x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }]
    .filter(p => p.x >= 0 && p.y >= 0 && p.x < dimension && p.y < dimension).map(p => cellAt(p, dimension));
}
function fixture(dimension: 7 | 9, points: Point[], side: Side = 'north', path?: Point[]): { shipment: Shipment; board: Cell[] } {
  const middle = Math.floor(dimension / 2), cargo: CargoId = side === 'north' ? 'cargo.food' : side === 'east' ? 'cargo.chem' : 'cargo.machine';
  const exit = side === 'north' ? { x: middle, y: 0 } : { x: side === 'east' ? dimension - 1 : 0, y: middle };
  const cells = points.map(p => cellAt(p, dimension)), group = new Set(cells), root = cellAt(exit, dimension), board: Cell[] = Array(dimension ** 2).fill(null);
  for (const cell of cells) board[cell] = cargo;
  const queue = [root], parents = new Map<number, number>([[root, -1]]);
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors(queue[cursor], dimension)) if (group.has(next) && !parents.has(next)) {
    parents.set(next, queue[cursor]); queue.push(next);
  }
  assert.equal(parents.size, cells.length, 'test group is gate-connected');
  const cargoPaths = cells.map(cell => {
    const route: Point[] = [];
    for (let at = cell; at !== -1; at = parents.get(at)!) route.push(pointAt(at, dimension));
    return { cell, path: route };
  });
  if (!path) {
    const start = cellAt({ x: middle, y: dimension - 1 }, dimension), accessQueue = [start], accessParents = new Map<number, number>([[start, -1]]);
    assert.equal(board[start], null, 'test entrance is empty');
    for (let cursor = 0; cursor < accessQueue.length; cursor++) {
      const current = accessQueue[cursor];
      if (neighbors(current, dimension).some(cell => group.has(cell))) {
        path = [];
        for (let at = current; at !== -1; at = accessParents.get(at)!) path.push(pointAt(at, dimension));
        path.reverse(); break;
      }
      for (const next of neighbors(current, dimension)) if (board[next] === null && !accessParents.has(next)) {
        accessParents.set(next, current); accessQueue.push(next);
      }
    }
  }
  assert.ok(path);
  return { board, shipment: { type: 'shipment', ...(dimension === 9 ? { boardSize: 9 as const } : {}), transport: 'conveyor', cargo, cells,
    path, cargoPaths, dockId: `dock.${side}`, orderId: `exit.${cargo.slice(6)}`, score: cells.length * 10, chain: 1 } };
}
const forkPoints = [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 3 }];
function planFor(event: ReturnType<typeof fixture>): OutboundTransportPlan {
  const plan = buildOutboundTransport(event.shipment, event.board); assert.ok(plan); return plan;
}
function assertSafeTour(event: ReturnType<typeof fixture>, plan: OutboundTransportPlan): void {
  const { shipment, board } = event, dimension = plan.dimension, picked = new Set<number>(), group = new Set(shipment.cells);
  const treeEdges = new Set(shipment.cargoPaths!.flatMap(cargo => cargo.path.slice(1).map((to, index) => [cellAt(cargo.path[index], dimension), cellAt(to, dimension)].sort((a, b) => a - b).join(':'))));
  let previous = plan.steps[0];
  for (const step of plan.steps) {
    assert.deepEqual(step.from, previous.to); near(step.startMs, previous === step ? 0 : previous.endMs);
    assert.ok(step.endMs > step.startMs); assert.equal(step.loadedCount, picked.size);
    angleNear(step.fromAngle, previous === step ? -Math.PI / 2 : previous.toAngle);
    if (step.kind === 'pickup') {
      assert.deepEqual(step.from, step.to); assert.ok(step.pickupCell !== undefined); assert.ok(!picked.has(step.pickupCell));
      assert.equal(board[step.pickupCell], shipment.cargo); assert.equal(distance(step.from, pointAt(step.pickupCell, dimension)), 1);
      angleNear(step.fromAngle, Math.atan2(Math.floor(step.pickupCell / dimension) - step.from.y, step.pickupCell % dimension - step.from.x));
      picked.add(step.pickupCell);
    } else if (step.kind === 'move' || step.kind === 'exit') {
      assert.equal(distance(step.from, step.to), 1); angleNear(step.fromAngle, step.toAngle);
      angleNear(step.fromAngle, Math.atan2(step.to.y - step.from.y, step.to.x - step.from.x));
      const destination = cellAt(step.to, dimension);
      if (step.to.x >= 0 && step.to.x < dimension && step.to.y >= 0 && step.to.y < dimension) {
        assert.ok(board[destination] === null || picked.has(destination), 'entry requires a completed pickup');
        const source = cellAt(step.from, dimension);
        if (group.has(source) && group.has(destination)) assert.ok(treeEdges.has([source, destination].sort((a, b) => a - b).join(':')), 'cargo travel follows certified tree edges');
      }
      if (step.kind === 'exit') assert.equal(picked.size, shipment.cells.length, 'last box is aboard before leaving');
    } else assert.deepEqual(step.from, step.to, 'route, turns and hold are stationary');
    previous = step;
  }
  assert.deepEqual([...picked].sort((a, b) => a - b), [...shipment.cells].sort((a, b) => a - b));
  assert.deepEqual(plan.pickupOrder, [...picked]); near(previous.endMs, plan.durationMs);
}

for (const dimension of [7, 9] as const) for (const side of ['north', 'east', 'west'] as const) test(`${dimension}×${dimension} ${side} pickup carries every box out the matching exit`, () => {
  const middle = Math.floor(dimension / 2), north = [{ x: middle, y: 0 }, { x: middle, y: 1 }, { x: middle + 1, y: 1 }, { x: middle + 1, y: 2 }];
  const points = north.map(p => side === 'north' ? p : side === 'east' ? { x: dimension - 1 - p.y, y: p.x } : { x: p.y, y: dimension - 1 - p.x });
  const event = fixture(dimension, points, side), plan = planFor(event); assertSafeTour(event, plan);
  assert.equal(plan.dimension, dimension); assert.ok(plan.durationMs >= 1000 && plan.durationMs <= 1600);
  const start = sampleOutboundTransport(plan, 0), final = sampleOutboundTransport(plan, 1);
  assert.deepEqual(start.position, { x: middle, y: dimension }); angleNear(start.angle, -Math.PI / 2);
  assert.equal(start.loadedCount, 0); assert.equal(start.finished, false);
  assert.deepEqual(final.position, side === 'north' ? { x: middle, y: -1 } : { x: side === 'east' ? dimension : -1, y: middle });
  angleNear(final.angle, side === 'north' ? -Math.PI / 2 : side === 'east' ? 0 : Math.PI);
  assert.equal(final.loadedCount, 4); assert.equal(final.alpha, 0); assert.equal(final.finished, true);
  const exit = plan.steps.find(step => step.kind === 'exit')!;
  near(plan.deliveryAtMs, exit.endMs); assert.deepEqual(plan.exit, final.position);
  assert.equal(plan.steps[0].kind, 'route'); near(plan.steps[0].endMs, OUTBOUND_TRANSPORT_TIMING.routeMs);
  near(plan.moveAtMs, plan.steps[0].endMs);
});

test('a fork visits each side branch and returns before reserving the path toward the exit for last', () => {
  const event = fixture(9, forkPoints), plan = planFor(event); assertSafeTour(event, plan);
  assert.equal(plan.pickupOrder[0], 31); assert.equal(plan.pickupOrder[plan.pickupOrder.length - 1], 4);
  const returns = plan.steps.filter(step => step.kind === 'move' && cellAt(step.to, 9) === 22);
  assert.equal(returns.length, 3, 'enter the junction and return from both side branches');
});

test('a loop follows only certified tree edges and picks each box once', () => {
  const event = fixture(9, [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 1 }]);
  assertSafeTour(event, planFor(event));
});

test('the exit can be picked first when required but the loaded vehicle leaves only after both branches', () => {
  const points = [2, 3, 4, 5, 6].map(x => ({ x, y: 0 })), path = Array.from({ length: 8 }, (_, i) => ({ x: 4, y: 8 - i }));
  const event = fixture(9, points, 'north', path), plan = planFor(event); assertSafeTour(event, plan);
  assert.equal(plan.pickupOrder[0], 4); assert.equal(plan.steps[plan.steps.length - 2].kind, 'exit');
  assert.equal(plan.steps[plan.steps.length - 2].loadedCount, 5);
});

test('when access touches the exit and another tree cell, start farther from the gate so the exit is picked last', () => {
  const points = [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 6, y: 1 }];
  const path = Array.from({ length: 8 }, (_, i) => ({ x: 4, y: 8 - i })), event = fixture(9, points, 'north', path), plan = planFor(event);
  assertSafeTour(event, plan); assert.equal(plan.pickupOrder[0], 14); assert.equal(plan.pickupOrder[plan.pickupOrder.length - 1], 4);
});

test('exact pickup boundaries include the newly loaded box immediately even after progress normalization', () => {
  const plan = planFor(fixture(9, forkPoints));
  let count = 0;
  for (const step of plan.steps) if (step.kind === 'pickup') {
    count++; const frame = sampleOutboundTransport(plan, step.endMs / plan.durationMs);
    assert.equal(frame.loadedCount, count); assert.ok(frame.pickedCells.includes(step.pickupCell!));
    assert.equal(frame.pickup, undefined);
  }
});

test('a long single-cell corridor is entered only after each adjacent pickup finishes', () => {
  const event = fixture(9, Array.from({ length: 8 }, (_, y) => ({ x: 4, y }))), plan = planFor(event); assertSafeTour(event, plan);
  assert.deepEqual(plan.pickupOrder, [67, 58, 49, 40, 31, 22, 13, 4]);
});

test('residual cargo of another color stays outside the route and the pickup order', () => {
  const event = fixture(9, forkPoints); event.board[30] = 'cargo.chem'; event.board[32] = 'cargo.machine';
  const before = JSON.stringify(event), plan = planFor(event); assertSafeTour(event, plan);
  assert.ok(!plan.pickupOrder.includes(30)); assert.ok(!plan.pickupOrder.includes(32)); assert.equal(JSON.stringify(event), before);
});

test('an eighty-box group has no carrying limit and a deterministic bounded readable ending', () => {
  const points = Array.from({ length: 81 }, (_, cell) => pointAt(cell, 9)).filter(p => p.x !== 4 || p.y !== 8);
  const event = fixture(9, points), plan = planFor(event); assertSafeTour(event, plan);
  assert.equal(plan.pickupOrder.length, 80); assert.ok(plan.durationMs <= 3200);
  assert.deepEqual(planFor(event), plan);
  const exit = plan.steps[plan.steps.length - 2], hold = plan.steps[plan.steps.length - 1];
  near(exit.endMs - exit.startMs, OUTBOUND_TRANSPORT_TIMING.exitMs); near(hold.endMs - hold.startMs, OUTBOUND_TRANSPORT_TIMING.holdMs);
  const final = sampleOutboundTransport(plan, 1); assert.equal(final.loadedCount, 80); assert.equal(final.pickedCells.length, 80);
});

test('sampling retains a box until its individual pickup completes and never cuts a corner', () => {
  const event = fixture(9, forkPoints), plan = planFor(event);
  for (const step of plan.steps) {
    const time = (step.startMs + step.endMs) / 2, frame = sampleOutboundTransport(plan, time / plan.durationMs);
    assert.equal(frame.stage, step.kind); assert.equal(frame.loadedCount, step.loadedCount);
    if (step.kind === 'pickup') { assert.ok(frame.pickup); assert.equal(frame.pickup.cell, step.pickupCell); near(frame.pickup.progress, .5); assert.ok(!frame.pickedCells.includes(step.pickupCell!)); }
    else assert.equal(frame.pickup, undefined);
    if (step.kind === 'turn') assert.deepEqual(frame.position, step.from);
    if (step.kind === 'move' || step.kind === 'exit') {
      near(frame.position.x, (step.from.x + step.to.x) / 2); near(frame.position.y, (step.from.y + step.to.y) / 2); angleNear(frame.angle, step.fromAngle);
    }
  }
  assert.ok(plan.steps.some(step => step.kind === 'turn'));
  for (const progress of [0, .82, .1, .99, .32, 1, .4]) {
    const frame = sampleOutboundTransport(plan, progress), expected = plan.steps.filter(step => step.kind === 'pickup' && step.endMs <= progress * plan.durationMs).map(step => step.pickupCell!);
    assert.deepEqual(frame.pickedCells, expected); assert.equal(frame.loadedCount, expected.length);
  }
});

test('fading begins outside with vehicle and the full load together', () => {
  const plan = planFor(fixture(9, forkPoints));
  const before = sampleOutboundTransport(plan, (plan.deliveryAtMs - 1) / plan.durationMs), during = sampleOutboundTransport(plan, (plan.deliveryAtMs + OUTBOUND_TRANSPORT_TIMING.holdMs / 2) / plan.durationMs);
  assert.equal(before.alpha, 1); near(during.alpha, .5); assert.deepEqual(during.position, plan.exit); assert.equal(during.loadedCount, 8);
});

test('sampling clamps jumps, negative values, NaN and infinities without mutable cached state', () => {
  const plan = planFor(fixture(9, forkPoints)), before = JSON.stringify(plan), start = sampleOutboundTransport(plan, 0), end = sampleOutboundTransport(plan, 1);
  assert.deepEqual(sampleOutboundTransport(plan, -2), start); assert.deepEqual(sampleOutboundTransport(plan, NaN), start);
  assert.deepEqual(sampleOutboundTransport(plan, Infinity), start); assert.deepEqual(sampleOutboundTransport(plan, -Infinity), start);
  assert.deepEqual(sampleOutboundTransport(plan, 2), end); assert.equal(JSON.stringify(plan), before);
  end.position.x = 999; end.pickedCells.push(999); assert.equal(JSON.stringify(plan), before);
});

test('frozen input events and board snapshots remain unchanged', () => {
  const event = fixture(9, forkPoints), before = JSON.stringify(event);
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } };
  freeze(event); const plan = planFor(event); for (const progress of [0, .1, .6, 1]) sampleOutboundTransport(plan, progress);
  assert.equal(JSON.stringify(event), before);
});

test('invalid shipment, board, route, cargo and inconsistent tree metadata are rejected safely', () => {
  const base = fixture(9, forkPoints), copy = (): ReturnType<typeof fixture> => structuredClone(base), invalid: ReturnType<typeof fixture>[] = [];
  const mutate = (change: (event: ReturnType<typeof fixture>) => void): void => { const event = copy(); change(event); invalid.push(event); };
  mutate(e => { e.shipment.transport = undefined; }); mutate(e => { e.shipment.boardSize = 7 as 9; });
  mutate(e => { e.shipment.cells = []; }); mutate(e => { e.shipment.cells.push(e.shipment.cells[0]); });
  mutate(e => { e.shipment.cells[0] = NaN; }); mutate(e => { e.shipment.cells[0] = 81; });
  mutate(e => { e.shipment.path = []; }); mutate(e => { e.shipment.path[0] = { x: 3, y: 8 }; });
  mutate(e => { e.shipment.path[1] = { x: NaN, y: 7 }; }); mutate(e => { delete e.shipment.path[1]; });
  mutate(e => { e.shipment.path[1] = { x: 8, y: 0 }; }); mutate(e => { e.shipment.path.push(e.shipment.path[e.shipment.path.length - 1]); });
  mutate(e => { e.shipment.path = [{ x: 4, y: 8 }]; });
  mutate(e => { e.board[cellAt(e.shipment.path[1], 9)] = 'cargo.chem'; });
  mutate(e => { e.board[e.shipment.cells[1]] = 'cargo.machine'; }); mutate(e => { e.board.pop(); });
  mutate(e => { e.shipment.cargo = 'cargo.chem'; }); mutate(e => { e.shipment.dockId = 'dock.west'; });
  mutate(e => { e.shipment.cargoPaths = undefined; }); mutate(e => { e.shipment.cargoPaths!.pop(); });
  mutate(e => { e.shipment.cargoPaths!.push(e.shipment.cargoPaths![0]); });
  mutate(e => { e.shipment.cargoPaths![1].path.reverse(); });
  mutate(e => { e.shipment.cargoPaths![1].path.push({ x: 4, y: 1 }); });
  mutate(e => { e.shipment.cargoPaths![1].path[0] = { x: 5, y: 1 }; });
  mutate(e => { e.shipment.cargoPaths![3].path.splice(1, 1); });
  mutate(e => { delete e.shipment.cargoPaths![1].path[0]; });
  mutate(e => { e.shipment = null as unknown as Shipment; }); mutate(e => { e.board = null as unknown as Cell[]; });
  for (const event of invalid) assert.doesNotThrow(() => assert.equal(buildOutboundTransport(event.shipment, event.board), null));
  const loop = fixture(9, [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 2 }]);
  loop.shipment.cargoPaths!.find(cargo => cargo.cell === 23)!.path = [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 }];
  loop.shipment.cargoPaths!.find(cargo => cargo.cell === 22)!.path = [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 0 }];
  assert.equal(buildOutboundTransport(loop.shipment, loop.board), null, 'individually valid paths cannot certify contradictory parents');
});
