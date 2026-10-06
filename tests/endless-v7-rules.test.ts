import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunV7, applyCommandV7, previewPlacementV7, findLegalMovesV7, generatePieceV7, generateUpgradeChoicesV7, isUpgradeEligibleV7 } from '../src/domain/v7/engine.ts';
import { createRunV3, applyCommandV3, generatePieceV3 } from '../src/domain/v3/engine.ts';
import { RULES_V3_CONFIG } from '../src/domain/v3/content.ts';
import { UPGRADES_V2 } from '../src/domain/v2/content.ts';
import { orderStatusV2 } from '../src/domain/v2/board.ts';
import type { CargoId, Command, CommandResult, Point, RunState, Shipment } from '../src/domain/types.ts';

const F: CargoId = 'cargo.food', M: CargoId = 'cargo.machine';
const finish: Command = { type: 'finishEndless' };
const route = JSON.parse(readFileSync(new URL('./fixtures/endless-v7-seed1-route.json', import.meta.url), 'utf8')) as { seed: number; commands: Command[] };
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
function asStandard(state: RunState): RunState {
  return { ...copy(state), mode: 'standard', rulesetVersion: 3, runConfigId: RULES_V3_CONFIG.runConfigId };
}
function shipments(result: CommandResult): Shipment[] { return result.events.filter(event => event.type === 'shipment'); }
function place(state: RunState, origin: Point = { x: 3, y: 1 }): CommandResult {
  return applyCommandV7(state, { type: 'place', pieceId: state.candidates[0].id, origin });
}
function readyShipment(completedOrders: number): RunState {
  const state = createRunV7(541);
  state.completedOrders = completedOrders; state.shift = Math.min(5, Math.floor(completedOrders / 6) + 1);
  state.board.fill(null); state.cellTraits!.fill(null); state.board[8] = F; state.board[9] = F;
  state.orders = [{ id: 'old-order', dockId: 'dock.north', cargo: F, amount: 3, baseScore: 200 }];
  state.candidates = [{ id: 'ready-piece', shapeId: 'shape.single', cargo: F }];
  return state;
}

test('direct endless starts at ordinary stage 1 with its own identity and the exact v3 standard supply', () => {
  for (const seed of [0, 1, 44, -83, 2147483647]) {
    const state = createRunV7(seed);
    assert.equal(state.rulesetVersion, 7); assert.equal(state.runConfigId, 'run.endless_v7'); assert.equal(state.mode, 'endless');
    assert.equal(state.board.length, 49); assert.equal(state.shift, 1); assert.equal(state.completedOrders, 0);
    assert.equal(state.tutorialStep, 3); assert.equal(state.overtime, false); assert.equal(state.endReason, null);
    assert.equal(state.phase, 'input'); assert.equal(state.orders.length, 2); assert.equal(state.candidates.length, 3);
    assert.ok(state.candidates.every(piece => !piece.trait)); assert.deepEqual(asStandard(state), createRunV3(seed));
    assert.deepEqual(state, createRunV7(seed));
  }
});

test('direct endless preserves every ordinary v3 state and event through the last command before 30 orders', () => {
  let state = createRunV7(route.seed), ordinary = createRunV3(route.seed);
  for (const command of route.commands.slice(0, -1)) {
    const actual = applyCommandV7(state, command), expected = applyCommandV3(ordinary, command);
    assert.equal(actual.error, undefined); assert.equal(expected.error, undefined); assert.deepEqual(actual.events, expected.events);
    assert.deepEqual(asStandard(actual.state), expected.state); state = actual.state; ordinary = expected.state;
  }
  assert.equal(state.completedOrders, 29); assert.equal(state.upgrades.length, 7); assert.equal(state.shift, 5);
});

test('each six shipments advances the stage with the usual bonus and the stage remains capped at five', () => {
  for (const completed of [5, 11, 17, 23, 29, 35, 1199]) {
    const state = readyShipment(completed), result = place(state), next = result.state;
    assert.equal(result.error, undefined); assert.equal(next.completedOrders, completed + 1);
    assert.equal(next.shift, Math.min(5, Math.floor((completed + 1) / 6) + 1));
    const expectedBonus = (next.shift - state.shift) * RULES_V3_CONFIG.score.shiftBonus;
    assert.equal(next.score, state.score + shipments(result).reduce((sum, event) => sum + event.score, 0) + expectedBonus);
    assert.equal(result.events.filter(event => event.type === 'shift').length, next.shift > state.shift ? 1 : 0);
    assert.equal(next.result, null); assert.equal(next.endReason, null); assert.ok(!result.events.some(event => event.type === 'result'));
  }
});

test('30 shipments never triggers a win, completion bonus, overtime command or supply interruption', () => {
  const initial = readyShipment(29), result = place(initial), state = result.state;
  assert.equal(result.error, undefined); assert.equal(state.completedOrders, 30); assert.equal(state.phase, 'input');
  assert.equal(state.result, null); assert.equal(state.endReason, null); assert.equal(state.overtime, false);
  assert.equal(state.score, initial.score + shipments(result)[0].score); assert.equal(state.candidates.length, 3);
  assert.equal(state.orders.length, 4); assert.equal(state.generatedPieces, initial.generatedPieces! + 3);
  assert.ok(!result.events.some(event => event.type === 'result' || event.type === 'upgrade' || event.type === 'overtimeStarted'));
});

test('only the seven pre-30 boundaries offer capped ordinary upgrades', () => {
  for (let completed = 0; completed <= 40; completed++) {
    const result = place(readyShipment(completed)), next = result.state;
    const eligibleBoundary = next.completedOrders < 30 && next.completedOrders % 4 === 0;
    assert.equal(next.phase, eligibleBoundary ? 'upgrade' : 'input', `completed ${next.completedOrders}`);
    assert.equal(next.upgradeChoices.length, eligibleBoundary ? 3 : 0);
    assert.equal(result.events.filter(event => event.type === 'upgrade').length, eligibleBoundary ? 1 : 0);
    for (const id of next.upgradeChoices) assert.ok(isUpgradeEligibleV7(next, UPGRADES_V2.find(upgrade => upgrade.id === id)!));
  }
});

test('crossing a boundary in an old-order chain offers just once and chains reaching 30 stop offers', () => {
  for (const completed of [3, 7, 11, 15, 19, 23, 27]) {
    const state = readyShipment(completed);
    state.orders.push({ id: 'second-old', dockId: 'dock.south', cargo: M, amount: 3, baseScore: 200 });
    for (const index of [36, 37, 38]) state.board[index] = M;
    const result = place(state);
    assert.equal(shipments(result).length, 2); assert.equal(result.state.completedOrders, completed + 2);
    assert.equal(result.events.filter(event => event.type === 'upgrade').length, 1);
  }
  const state = readyShipment(27);
  state.orders.push({ id: 'second-old', dockId: 'dock.south', cargo: M, amount: 3, baseScore: 200 },
    { id: 'third-old', dockId: 'dock.east', cargo: 'cargo.chem', amount: 3, baseScore: 200 });
  for (const index of [36, 37, 38]) state.board[index] = M;
  for (const index of [18, 19, 20]) state.board[index] = 'cargo.chem';
  const result = place(state);
  assert.equal(shipments(result).length, 3); assert.equal(result.state.completedOrders, 30);
  assert.equal(result.state.phase, 'input'); assert.deepEqual(result.state.upgradeChoices, []);
});

test('exhausted upgrade content never traps the run in an empty offer', () => {
  const state = readyShipment(27);
  state.upgrades = UPGRADES_V2.flatMap(upgrade => Array<string>(upgrade.maxStack).fill(upgrade.id));
  assert.deepEqual(generateUpgradeChoicesV7(copy(state)), []);
  const result = place(state);
  assert.equal(result.state.phase, 'input'); assert.equal(result.state.result, null); assert.deepEqual(result.state.upgradeChoices, []);
  assert.ok(!result.events.some(event => event.type === 'upgrade'));
});

test('after 30 upgrade generation and even forged pending upgrades cannot inflate scores or consume RNG', () => {
  for (const completed of [30, 31, 32, 1200]) {
    const state = readyShipment(completed), rng = [...state.rngState];
    assert.deepEqual(generateUpgradeChoicesV7(state), []); assert.deepEqual(state.rngState, rng);
    state.phase = 'upgrade'; state.upgradeChoices = ['upgrade.contract'];
    const result = applyCommandV7(state, { type: 'upgrade', upgradeId: 'upgrade.contract' });
    assert.ok(result.error); assert.equal(result.state, state); assert.deepEqual(result.events, []);
  }
});

test('1200 further prepared shipments stay playable without repeated bonuses or upgrades', () => {
  let state = readyShipment(29);
  for (let turn = 0; turn < 1200; turn++) {
    // Prepared reachable orders isolate reducer longevity from unmeasured survival balance.
    state.board.fill(null); state.cellTraits!.fill(null); state.board[8] = F; state.board[9] = F;
    state.orders = [{ id: `order.long.${turn}`, dockId: 'dock.north', cargo: F, amount: 3, baseScore: 200 }];
    state.candidates = [{ id: `piece.long.${turn}`, shapeId: 'shape.single', cargo: F }];
    const result = place(state);
    assert.equal(result.error, undefined); assert.equal(result.state.phase, 'input'); assert.equal(result.state.result, null);
    assert.equal(result.state.endReason, null); assert.equal(result.state.shift, 5); assert.equal(result.state.overtime, false);
    assert.equal(result.state.score, state.score + shipments(result)[0].score);
    assert.ok(!result.events.some(event => ['result', 'upgrade', 'shift', 'overtimeStarted'].includes(event.type)));
    assert.equal(result.state.candidates.length, 3); assert.equal(result.state.orders.length, 4); state = result.state;
  }
  assert.equal(state.completedOrders, 1229); assert.equal(state.upgrades.length, 0);
});

test('only an explicit finishEndless in input voluntarily settles and leaves gameplay and RNG unchanged', () => {
  for (const initial of [createRunV7(1), readyShipment(29), readyShipment(1200)]) {
    const state = freeze(initial), before = JSON.stringify(state), result = applyCommandV7(state, finish);
    assert.equal(result.error, undefined); assert.equal(result.state.phase, 'result'); assert.equal(result.state.result, 'won');
    assert.equal(result.state.endReason, 'retired'); assert.equal(result.state.overtime, false);
    assert.deepEqual(result.events, [{ type: 'result', result: 'won' }]);
    assert.equal(result.state.commandIndex, state.commandIndex + 1); assert.deepEqual(result.state.commands[result.state.commands.length - 1], finish);
    for (const key of ['board', 'cellTraits', 'candidates', 'orders', 'score', 'completedOrders', 'shift', 'rngState', 'upgrades', 'nextId', 'generatedPieces'] as const) {
      assert.deepEqual(result.state[key], state[key]);
    }
    assert.equal(JSON.stringify(state), before);
  }
});

test('wrong commands, invalid placements and non-input settlement reject atomically', () => {
  const state = createRunV7(71);
  const invalid: Command[] = [{ type: 'continueOvertime' }, { type: 'finishOvertime' }, { type: 'upgrade', upgradeId: 'upgrade.contract' },
    { type: 'cancel' } as unknown as Command, { type: 'place', pieceId: 'absent', origin: { x: 0, y: 0 } },
    { type: 'place', pieceId: state.candidates[0].id, origin: { x: 7, y: 0 } }];
  for (const command of invalid) {
    const before = JSON.stringify(state), result = applyCommandV7(freeze(state), command);
    assert.ok(result.error); assert.equal(result.state, state); assert.deepEqual(result.events, []); assert.equal(JSON.stringify(state), before);
  }
  for (const invalidState of [{ ...copy(state), phase: 'upgrade' as const }, { ...copy(state), phase: 'result' as const },
    { ...copy(state), mode: 'standard' as const }, { ...copy(state), mode: 'tutorial' as const }]) {
    const result = applyCommandV7(invalidState, finish); assert.ok(result.error); assert.equal(result.state, invalidState); assert.deepEqual(result.events, []);
  }
});

test('filling the final space fails blocked at any stage and terminal states cannot continue or retire twice', () => {
  for (const completed of [0, 29, 30, 1200]) {
    const state = readyShipment(completed); state.board.fill(M); state.cellTraits!.fill(null); state.board[0] = null;
    const result = place(state, { x: 0, y: 0 });
    assert.equal(result.error, undefined); assert.equal(result.state.phase, 'result'); assert.equal(result.state.result, 'failed');
    assert.equal(result.state.endReason, 'blocked'); assert.equal(result.state.completedOrders, completed);
    assert.deepEqual(result.events.filter(event => event.type === 'result'), [{ type: 'result', result: 'failed' }]);
    for (const command of [finish, { type: 'continueOvertime' } as Command, { type: 'place', pieceId: result.state.candidates[0].id, origin: { x: 0, y: 0 } } as Command]) {
      const rejected = applyCommandV7(result.state, command); assert.ok(rejected.error); assert.equal(rejected.state, result.state);
    }
  }
  const retired = applyCommandV7(createRunV7(2), finish).state;
  assert.ok(applyCommandV7(retired, finish).error);
});

test('special supply remains frozen v3 generation and begins only at stage three', () => {
  const observed = new Set<string>();
  for (let seed = 0; seed < 80; seed++) for (const shift of [1, 2, 3, 5]) {
    const state = createRunV7(seed); state.shift = shift; state.completedOrders = (shift - 1) * 6;
    const ordinary = asStandard(state);
    for (let index = 0; index < 5; index++) {
      const actual = generatePieceV7(state), expected = generatePieceV3(ordinary);
      assert.deepEqual(actual, expected); assert.deepEqual(state.rngState, ordinary.rngState);
      if (shift < 3) assert.equal(actual.trait, undefined);
      if (actual.trait) { assert.equal(actual.shapeId, 'shape.single'); observed.add(actual.trait); }
    }
  }
  assert.deepEqual([...observed].sort(), ['hazard', 'pallet', 'rush', 'wildcard']);
});

test('all old orders resolve through a clearing chain and new ready orders wait until the next placement', () => {
  const chain = readyShipment(30); chain.board.fill(null); chain.cellTraits!.fill(null);
  for (const index of [42, 43, 44]) chain.board[index] = F;
  for (const index of [21, 22, 23, 24, 25, 26, 27]) chain.board[index] = M;
  chain.orders = [{ id: 'north-old', dockId: 'dock.north', cargo: F, amount: 3, baseScore: 100 },
    { id: 'south-old', dockId: 'dock.south', cargo: M, amount: 8, baseScore: 100 }];
  chain.candidates = [{ id: 'chain-piece', shapeId: 'shape.single', cargo: M }];
  assert.equal(orderStatusV2(chain, chain.orders[0]).status, 'blocked');
  const result = place(chain, { x: 3, y: 4 });
  assert.deepEqual(shipments(result).map(event => event.orderId), ['south-old', 'north-old']);
  assert.deepEqual(shipments(result).map(event => event.chain), [1, 2]); assert.equal(result.state.completedOrders, 32);

  const nextOrder = readyShipment(30); nextOrder.board.fill(null); nextOrder.cellTraits!.fill(null); nextOrder.orders = [];
  for (const index of [8, 9, 10, 11, 12, 15, 16, 17, 18, 19]) nextOrder.board[index] = F;
  for (const index of [29, 30, 31, 32, 33, 36, 37, 38, 39, 40]) nextOrder.board[index] = M;
  nextOrder.candidates = [{ id: 'first-place', shapeId: 'shape.single', cargo: 'cargo.electronic' }];
  const first = place(nextOrder, { x: 0, y: 0 });
  assert.equal(shipments(first).length, 0); assert.equal(first.state.completedOrders, 30);
  assert.ok(first.state.orders.some(order => orderStatusV2(first.state, order).status === 'ready'));
  const move = findLegalMovesV7(first.state).find(move => previewPlacementV7(first.state, move.pieceId, move.origin).shipments.length > 0)!;
  assert.ok(move); const second = applyCommandV7(first.state, { type: 'place', ...move });
  assert.ok(shipments(second).length > 0); assert.ok(shipments(second).every(event => first.state.orders.some(order => order.id === event.orderId)));
});

test('a real command-only seed-1 run crosses 30 directly and every preview, JSON checkpoint and replay agrees', () => {
  let state = createRunV7(route.seed); const commands: Command[] = [], checkpoints: RunState[] = [copy(state)];
  function step(command: Command): void {
    const before = JSON.stringify(state), frozen = freeze(copy(state));
    const preview = command.type === 'place' ? previewPlacementV7(frozen, command.pieceId, command.origin) : null;
    const result = applyCommandV7(frozen, command); assert.equal(result.error, undefined);
    if (preview) { assert.equal(preview.valid, true); assert.deepEqual(preview.shipments, shipments(result)); }
    assert.equal(JSON.stringify(frozen), before); state = result.state; commands.push(copy(command)); checkpoints.push(copy(state));
  }
  for (const command of route.commands) step(command);
  assert.equal(state.completedOrders, 30); assert.equal(state.phase, 'input'); assert.equal(state.result, null);
  assert.equal(state.score, 6309 - RULES_V3_CONFIG.score.shiftBonus); assert.equal(state.commandIndex, 63);
  for (let turn = 0; turn < 12 && state.completedOrders === 30; turn++) {
    const moves = findLegalMovesV7(state);
    assert.ok(moves.length);
    const scored = moves.map(move => ({ move, shipments: previewPlacementV7(state, move.pieceId, move.origin).shipments.length }));
    scored.sort((a, b) => b.shipments - a.shipments);
    step({ type: 'place', ...scored[0].move });
    assert.equal(state.phase, 'input');
  }
  assert.ok(state.completedOrders > 30, 'The live run must ship at least once beyond the former finish line');
  step(finish); assert.equal(state.endReason, 'retired'); assert.deepEqual(state.commands, commands);
  for (let boundary = 0; boundary < checkpoints.length; boundary++) {
    let restored = checkpoints[boundary];
    for (const command of commands.slice(boundary)) { const next = applyCommandV7(restored, copy(command)); assert.equal(next.error, undefined); restored = next.state; }
    assert.deepEqual(restored, state, `JSON boundary ${boundary}`);
  }
});
