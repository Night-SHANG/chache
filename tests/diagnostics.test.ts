import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDebugRows} from '../src/presentation/diagnostics.ts';
import {createRun, applyCommand, previewPlacement} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import {orderStatus} from '../src/domain/board.ts';
import {generatePieceV2} from '../src/domain/v2/engine.ts';
import {generatePieceV3} from '../src/domain/v3/engine.ts';
import {nextRandom} from '../src/domain/random.ts';
import type {RunState} from '../src/domain/types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view = (): ViewState => ({selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: true, needsResume: false});
const rowsOf = (state: RunState, current = view()) => buildDebugRows(state, current).join('\n');
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {Object.freeze(value); for (const child of Object.values(value)) freeze(child);}
}

test('debug selector exposes version, config, seed, RNG cursor, command, occupancy and checksum without mutation', () => {
  const state = createRun(82, 'standard', 3), current = view();
  state.board[8] = 'cargo.food';
  const before = structuredClone({state, current}); freeze(state); freeze(current);
  const rows = rowsOf(state, current);
  for (const text of ['ruleset_version 3', 'run_config_id run.standard_v3', 'seed 82', 'phase input', 'command_index 0', 'occupancy 1/49 (2.0%)', `rng_state ${JSON.stringify(state.rngState)}`, `last_checksum ${checksum(state)}`]) assert.ok(rows.includes(text), text);
  for (const piece of state.candidates) assert.ok(rows.includes(`${piece.id} ${piece.shapeId} ${piece.cargo}`));
  assert.deepEqual({state, current}, before);
  assert.equal(rowsOf(state, current), rows, 'diagnostics are deterministic and read-only');
});

for (const version of [1, 2, 3]) {
  test(`v${version} current order eligibility and route are read from the actual rules`, () => {
    const state = createRun(12, 'standard', version);
    state.board.fill(null);
    state.orders = [{id: 'order.ready', dockId: 'dock.north', cargo: 'cargo.food', amount: 3, baseScore: 100}];
    for (const i of [8, 9, 10]) state.board[i] = 'cargo.food';
    const status = orderStatus(state, state.orders[0]);
    const rows = rowsOf(state);
    assert.ok(rows.includes('order.ready dock.north cargo.food 3/3 eligibility ready'));
    assert.ok(rows.includes(`canonical_route order.ready ${status.path.map(p => `(${p.x},${p.y})`).join('>')}`));
    state.board[3] = 'cargo.machine';
    assert.match(rowsOf(state), /eligibility blocked/);
    state.board[8] = null;
    assert.match(rowsOf(state), /2\/3 eligibility need/);
  });
}

test('preview and animation have explicit resolution steps and use their original canonical routes', () => {
  let state = createRun(123, 'tutorial', 3);
  state = applyCommand(state, {type: 'place', pieceId: state.candidates[0].id, origin: {x: 1, y: 1}}).state;
  const current = view();
  current.selectedPieceId = state.candidates[0].id;
  current.hoverOrigin = {x: 3, y: 1};
  current.preview = previewPlacement(state, current.selectedPieceId, current.hoverOrigin);
  const shipment = current.preview.shipments[0];
  assert.ok(shipment);
  assert.match(rowsOf(state, current), /resolution_step 0\/64 preview_steps 1/);
  assert.ok(rowsOf(state, current).includes(`preview_step 1 ${shipment.orderId} canonical_route ${shipment.path.map(p => `(${p.x},${p.y})`).join('>')}`));
  current.animation = {shipment, progress: .5, board: [...state.board]};
  assert.match(rowsOf(state, current), /resolution_step 1\/64 animation/);
  assert.ok(rowsOf(state, current).includes(`animation ${shipment.orderId} canonical_route ${shipment.path.map(p => `(${p.x},${p.y})`).join('>')}`));
  assert.doesNotMatch(rowsOf(state, current), /preview_step /, 'stale preview must not override the playing shipment');
});

test('generation explains exact integer shape weights, occupancy, small-parcel and current-tray repetition', () => {
  const state = createRun(42, 'standard', 3);
  state.board.fill(null);
  for (let i = 0; i < 10; i++) state.board[i] = 'cargo.food';
  state.upgrades = ['upgrade.small_parcels'];
  state.candidates = [{id: 'piece.test', shapeId: 'shape.single', cargo: 'cargo.food'}];
  const rows = rowsOf(state);
  assert.match(rows, /当前状态条件权重/);
  assert.match(rows, /occupancy_bonus 40% small_parcels_bonus 60% repeat_divisor 2/);
  assert.match(rows, /shape.single=2200/);
  assert.match(rows, /shape.domino_h=3600/);
  assert.match(rows, /shape.i3_h=1200/);
  assert.doesNotMatch(rows, /shape.square=/, 'locked shapes must not enter the weight pool');
});

test('v1 cargo weights count cells while v2+ count pallets twice and exclude waste', () => {
  for (const version of [1, 2, 3]) {
    const state = createRun(3, 'standard', version);
    state.board.fill(null);
    for (const i of [8, 9]) state.board[i] = 'cargo.food';
    state.cellTraits = Array(49).fill(null);
    state.cellTraits[8] = {kind: 'pallet'}; state.cellTraits[9] = {kind: 'waste'};
    state.board[10] = 'cargo.machine'; state.cellTraits[10] = {kind: 'pallet'};
    const rows = rowsOf(state);
    assert.match(rows, /cargo.food=24/);
    assert.ok(rows.includes(`cargo.machine=${version === 1 ? 22 : 24}`));
    assert.match(rows, /cargo.chem=20/);
  }
});

test('special weights show shift gates, fixed pallet cadence, wildcard bonus and rush buffer', () => {
  const state = createRun(3, 'standard', 3);
  assert.match(rowsOf(state), /special disabled shift<3/);
  state.shift = 3; state.generatedPieces = 6;
  state.upgrades = ['upgrade.pallet_supply', 'upgrade.wild_supply', 'upgrade.rush_buffer'];
  assert.match(rowsOf(state), /special next_generation 7 normal=86 pallet=5 rush=3 hazard=3 wildcard=3/);
  assert.match(rowsOf(state), /rush_turns 5/);
  state.generatedPieces = 7;
  assert.match(rowsOf(state), /special next_generation 8 forced=pallet interval=4 shape=shape.single/);
  assert.doesNotMatch(rowsOf(state), /normal=86/, 'forced cadence does not draw from the special pool');
});

test('v3 authored tutorial does not claim to draw from random generation weights', () => {
  const rows = rowsOf(createRun(123, 'tutorial', 3));
  assert.match(rows, /generation authored tutorial_step 0/);
  assert.doesNotMatch(rows, /shape_weight|cargo_weight|special next_generation/);
});

test('reported weights reproduce the actual v2 and v3 next generator draws', () => {
  const cases = [
    ...[1, 19, 83, 734, 3, 13, 59, 68].map(seed => ({seed, shift: 4, count: 6})),
    {seed: 3, shift: 4, count: 7}, // Guaranteed pallet consumes no special or shape draw.
    {seed: 13, shift: 1, count: 7}, // Before Shift3, cadence and special draws are disabled.
  ];
  const traits = new Set<string>();
  for (const version of [2, 3]) for (const {seed, shift, count} of cases) {
    const state = createRun(seed, 'standard', version);
    state.shift = shift; state.generatedPieces = count;
    state.upgrades = ['upgrade.small_parcels', 'upgrade.wild_supply', 'upgrade.pallet_supply'];
    for (let i = 0; i < 12; i++) state.board[i] = i % 2 ? 'cargo.machine' : 'cargo.food';
    state.cellTraits![0] = {kind: 'pallet'}; state.cellTraits![1] = {kind: 'waste'};
    const rows = buildDebugRows(state, view());
    let rng = [...state.rngState];
    const draw = (entries: [string, number][]): string => {
      const result = nextRandom(rng, 1, entries.reduce((sum, [, weight]) => sum + weight, 0)); rng = result.state;
      let remaining = result.value;
      for (const [id, weight] of entries) {remaining -= weight; if (remaining <= 0) return id;}
      throw Error('reported weights do not cover the random draw');
    };
    const weights = (prefix: string): [string, number][] => rows.filter(row => row.startsWith(prefix)).flatMap(row => [...row.matchAll(/([a-z][a-z0-9_.]*)=(\d+)/g)].map((match): [string, number] => [match[1], Number(match[2])]));
    const special = rows.some(row => row.includes('forced=pallet')) ? 'pallet' : shift < 3 ? 'normal' : draw(weights('special next_generation'));
    const shape = special === 'normal' ? draw(weights('shape_weight')) : 'shape.single';
    const cargo = draw(weights('cargo_weight'));
    const generated = (version === 2 ? generatePieceV2 : generatePieceV3)(structuredClone(state));
    assert.equal(generated.trait ?? 'normal', special);
    assert.equal(generated.shapeId, shape);
    assert.equal(generated.cargo, cargo);
    traits.add(special);
  }
  assert.deepEqual([...traits].sort(), ['hazard', 'normal', 'pallet', 'rush', 'wildcard']);
});
