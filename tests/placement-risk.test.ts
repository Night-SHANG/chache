import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createRun } from '../src/domain/engine.ts';
import { checksum } from '../src/domain/replay.ts';
import type { CargoId, Point, RunState } from '../src/domain/types.ts';

const helper = await import('../src/presentation/placement-risk.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
  throw error;
});
const F: CargoId = 'cargo.food', M: CargoId = 'cargo.machine', C: CargoId = 'cargo.chem';
function risk(state: RunState, origin: Point, pieceId = 'fixture.single') {
  assert.ok(helper, 'The read-only placement risk helper must exist');
  return helper.placementRisk(state, pieceId, origin);
}
function prepared(version = 4, cargo: CargoId = F): RunState {
  const state = version === 7 ? createRun(17, 'endless', 7) : version >= 4 ? createRun(17, 'color_exit', version, version === 6 ? 'easy' : version === 5 ? 'entry' : undefined) : createRun(17, 'standard', version);
  state.board.fill(null); state.cellTraits?.fill(null);
  state.candidates = [{ id: 'fixture.single', shapeId: 'shape.single', cargo }];
  if (version < 4 || version === 7) state.orders = [{ id: 'fixture.order', dockId: 'dock.north', cargo: F, amount: 99, baseScore: 100 }];
  return state;
}
function stock(state: RunState, cells: number[], cargo: CargoId = M): void { for (const cell of cells) state.board[cell] = cargo; }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

// Mutation targets: entry occupancy ignored, warnings accidentally made into placement bans.
for (const version of [4, 5]) test(`v${version} occupied forklift entry warns while the actual placement remains legal`, () => {
  const state = prepared(version), origin = { x: 3, y: 6 }, warning = risk(state, origin);
  assert.equal(applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin }).error, undefined);
  assert.deepEqual(warning, { level: 'warning', kind: 'entry-blocked', message: '落子后入口被占：南入口', cells: [45], dockIds: ['dock.south'] });
});

test('an already occupied entry is described as a resulting state, not blamed on an unrelated placement', () => {
  const state = prepared(); stock(state, [45]);
  const warning = risk(state, { x: 0, y: 0 });
  assert.equal(warning?.kind, 'entry-blocked'); assert.equal(warning.message, '落子后入口被占：南入口');
  assert.deepEqual(warning.cells, [45]); assert.doesNotMatch(warning.message, /导致|将堵|会堵|此次|本次/);
});

// Mutation targets: checking only the entrance cell, or using lost area as the highlight.
test('an empty entrance isolated by the new piece warns and highlights only the blocker and entry', () => {
  const state = prepared(); stock(state, [44, 46]);
  const warning = risk(state, { x: 3, y: 5 });
  assert.equal(warning?.kind, 'route-cut'); assert.equal(warning.level, 'warning');
  assert.deepEqual(warning.cells, [38, 45]); assert.deepEqual(warning.dockIds, ['dock.south']);
  assert.match(warning.message, /通路.*南入口|南入口.*通路/);
});

test('closing an interior bottleneck detects newly unreachable empty space without flooding the board highlight', () => {
  const state = prepared(); stock(state, [35, 36, 37, 39, 40, 41]);
  const warning = risk(state, { x: 3, y: 5 });
  assert.equal(warning?.kind, 'route-cut'); assert.deepEqual(warning.cells, [38, 45]);
});

// Mutation target: warning on the ordinary occupied footprint, or any decrease in free area.
test('an ordinary placement and a partially narrowed passage do not warn', () => {
  assert.equal(risk(prepared(), { x: 3, y: 3 }), null);
  const state = prepared(); stock(state, [35, 36, 39, 40, 41]);
  assert.equal(risk(state, { x: 2, y: 5 }), null);
});

// Mutation target: comparing the raw placed board instead of the reducer settlement.
for (const version of [4, 5]) test(`v${version} a barrier that ships in this move produces no stale route-cut warning`, () => {
  const state = prepared(version, C); stock(state, [14, 15, 16, 18, 19, 20, 27], C);
  const origin = { x: 3, y: 2 }, settled = applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin });
  assert.ok(settled.events.some(event => event.type === 'shipment' && event.cells.includes(17)));
  assert.ok(settled.state.board.every(cell => cell === null)); assert.equal(risk(state, origin), null);
});

test('mixed cargo is evaluated after the clearing chain reopens the route', () => {
  const state = prepared(5); state.candidates = [{ id: 'fixture.single', shapeId: 'shape.square', cargo: F, cellCargos: [F, F, C, C] }];
  stock(state, [3, 4], F); stock(state, [14, 15, 16, 19, 20, 27], C);
  const origin = { x: 3, y: 1 }, settled = applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin });
  assert.deepEqual(settled.events.filter(event => event.type === 'shipment').map(event => event.cargo), [C, F]);
  assert.equal(risk(state, origin), null);
});

// Mutation target: rebuilding final cells from shipment.cells while omitting hazard side effects.
for (const version of [3, 7]) test(`v${version} hazard clearing an occupied entrance in the same move removes its warning`, () => {
  const state = prepared(version); state.orders.push({ id: 'fixture.south', dockId: 'dock.south', cargo: F, amount: 3, baseScore: 100 });
  state.orders[0].cargo = M; stock(state, [3], M); state.cellTraits![3] = { kind: 'waste' };
  stock(state, [10, 17], F); state.cellTraits![10] = { kind: 'hazard' };
  const origin = { x: 3, y: 3 }, settled = applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin });
  assert.ok(settled.events.some(event => event.type === 'shipment' && event.extraClearedCells?.includes(3)));
  assert.equal(settled.state.board[3], null); assert.equal(risk(state, origin), null);
});

for (const version of [3, 7]) test(`v${version} inbound warnings use only active order entrances and show human-readable names`, () => {
  const state = prepared(version); assert.equal(risk(state, { x: 3, y: 6 }), null);
  assert.deepEqual(risk(state, { x: 3, y: 0 })?.dockIds, ['dock.north']);
  state.orders.push({ id: 'fixture.east', dockId: 'dock.east', cargo: C, amount: 99, baseScore: 100 }); stock(state, [3, 27]);
  const warning = risk(state, { x: 0, y: 0 });
  assert.deepEqual(warning?.dockIds, ['dock.north', 'dock.east']); assert.deepEqual(warning.cells, [3, 27]);
  assert.match(warning.message, /北门/); assert.match(warning.message, /东门/); assert.doesNotMatch(warning.message, /dock\./);
});

test('an entrance activated by this settlement is included in the resulting blockage warning', () => {
  const state = prepared(3); state.completedOrders = 5; state.orders[0].amount = 3;
  state.orders.push({ id: 'fixture.east', dockId: 'dock.east', cargo: C, amount: 99, baseScore: 100 });
  stock(state, [8, 9], F); stock(state, [45]);
  const origin = { x: 3, y: 1 }, settled = applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin });
  assert.equal(settled.state.shift, 2); assert.ok(settled.state.orders.some(order => order.dockId === 'dock.south'));
  const warning = risk(state, origin); assert.equal(warning?.kind, 'entry-blocked');
  assert.deepEqual(warning.dockIds, ['dock.south']); assert.deepEqual(warning.cells, [45]);
});

test('a completed winning settlement does not discourage the winning placement with a route warning', () => {
  const state = prepared(4, M); state.completedOrders = 29; state.shift = 5;
  stock(state, [1, 7, 9]); stock(state, [3, 4, 5, 12], F);
  const origin = { x: 1, y: 2 }, settled = applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin });
  assert.equal(settled.state.phase, 'result'); assert.equal(settled.state.result, 'won'); assert.equal(settled.state.board[8], null);
  assert.equal(risk(state, origin), null);
});

for (const version of [2, 3, 7]) test(`v${version} side gate preserves effective inbound reachability when the normal entry becomes occupied`, () => {
  const state = prepared(version); state.upgrades = ['upgrade.side_gate']; stock(state, [2, 4]);
  assert.equal(risk(state, { x: 3, y: 0 }), null);
});

test('inbound with a side gate warns only once all of that dock’s entrances are occupied', () => {
  const state = prepared(7); state.upgrades = ['upgrade.side_gate']; stock(state, [3]);
  assert.equal(risk(state, { x: 0, y: 0 }), null);
  const warning = risk(state, { x: 0, y: 6 });
  assert.equal(warning?.kind, 'entry-blocked'); assert.deepEqual(warning.cells, [3, 42]);
  assert.deepEqual(warning.dockIds, ['dock.north']); assert.equal(warning.message, '落子后入口被占：北门、西南侧门');
});

// Mutation targets: hard-coded seven-cell stride, gate at (3, 6), or v6 exits mistaken for entrances.
test('v6 uses the sole forklift entrance at (4, 8), not a seven-grid entry or cargo exit', () => {
  const state = prepared(6);
  assert.deepEqual(risk(state, { x: 4, y: 8 }), { level: 'warning', kind: 'entry-blocked', message: '落子后入口被占：南入口', cells: [76], dockIds: ['dock.south'] });
  for (const origin of [{ x: 3, y: 6 }, { x: 4, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }]) assert.equal(risk(state, origin), null);
});

test('v6 detects an isolated empty entrance on the actual nine-wide graph', () => {
  const state = prepared(6); stock(state, [75, 77]);
  const warning = risk(state, { x: 4, y: 7 });
  assert.equal(warning?.kind, 'route-cut'); assert.deepEqual(warning.cells, [67, 76]);
});

test('v6 already isolated empty space is not attributed to an unrelated placement', () => {
  const state = prepared(6); stock(state, [67, 75, 77]);
  assert.equal(risk(state, { x: 0, y: 0 }), null);
});

test('v6 warns on a surviving mixed barrier but not when its clearing chain reopens the route', () => {
  const state = prepared(6); state.candidates = [{ id: 'fixture.single', shapeId: 'shape.square', cargo: F, cellCargos: [F, F, C, C] }];
  stock(state, [4, 5], F); stock(state, [18, 19, 20, 21, 24, 25, 26], C);
  const origin = { x: 4, y: 1 }, warning = risk(state, origin);
  assert.equal(warning?.kind, 'route-cut'); assert.deepEqual(warning.cells, [22, 23, 76]);
  stock(state, [35, 44], C);
  const settled = applyCommand(state, { type: 'place', pieceId: 'fixture.single', origin });
  assert.deepEqual(settled.events.filter(event => event.type === 'shipment').map(event => event.cargo), [C, F]);
  assert.equal(risk(state, origin), null);
});

test('invalid placements return no warning and never throw away the normal invalid-preview handling', () => {
  const state = prepared(); stock(state, [0]);
  for (const origin of [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 7, y: 0 }, { x: 0.5, y: 1 }]) assert.equal(risk(state, origin), null);
  assert.equal(risk(state, { x: 3, y: 6 }, 'missing'), null); state.phase = 'result'; assert.equal(risk(state, { x: 3, y: 6 }), null);
});

// Mutation targets: reducer applied in-place, preview RNG advancement, or recorded preview commands.
for (const version of [1, 2, 3, 4, 5, 6, 7]) test(`v${version} repeated warning checks preserve the frozen input, checksum, RNG and command history`, () => {
  const state = prepared(version), before = JSON.stringify(state), hash = checksum(state), rng = [...state.rngState], commands = [...state.commands];
  freeze(state); const origin = version === 6 ? { x: 4, y: 8 } : version < 4 || version === 7 ? { x: 3, y: 0 } : { x: 3, y: 6 }, first = risk(state, origin);
  assert.deepEqual(risk(state, origin), first); assert.equal(JSON.stringify(state), before); assert.equal(checksum(state), hash);
  assert.deepEqual(state.rngState, rng); assert.deepEqual(state.commands, commands); assert.equal(state.commandIndex, 0);
});
