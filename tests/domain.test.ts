import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, applyCommand, previewPlacement, findLegalMoves } from '../src/domain/engine.ts';
import { collectGroups, findRoute, neighbors, orderStatus } from '../src/domain/board.ts';
// This suite is the retained ruleset-v1 baseline, including its original six-item catalogue.
import { CARGO, SHAPES, DOCKS, UPGRADES, P0_CONFIG } from '../src/domain/rulesets/v1/content.ts';
import { createRandomState, nextRandom } from '../src/domain/random.ts';
import type { RunState, CargoId, Order, Shipment } from '../src/domain/types.ts';
const F: CargoId = 'cargo.food';
const M: CargoId = 'cargo.machine';
const C: CargoId = 'cargo.chem';
const K: CargoId = 'cargo.cold';
const idx = (x: number, y: number) => y * 7 + x;
function fixture(): RunState {
  const state = createRun(42);
  state.board.fill(null);
  state.candidates = [{ id: 'test-piece', shapeId: 'shape.single', cargo: K }];
  state.orders = [];
  return state;
}
function order(dockId = 'dock.north', cargo: CargoId = F, amount = 3, id = 'old-order'): Order {
  return { id, dockId, cargo, amount, baseScore: 100 };
}
function put(state: RunState, cargo: CargoId, cells: number[]) { for (const cell of cells) state.board[cell] = cargo; }
function place(state: RunState, x = 0, y = 0) { return applyCommand(state, { type: 'place', pieceId: 'test-piece', origin: { x, y } }); }
function shipments(result: ReturnType<typeof place>): Shipment[] { return result.events.filter(e => e.type === 'shipment'); }
function deepFreeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

test('content has five cargo classes and twenty connected normalized unique shapes', () => {
  assert.equal(CARGO.length, 5);
  assert.equal(SHAPES.length, 20);
  assert.equal(new Set(SHAPES.map(s => s.id)).size, 20);
  assert.equal(new Set(CARGO.map(c => c.icon)).size, 5);
  for (const shape of SHAPES) {
    assert.equal(Math.min(...shape.cells.map(c => c.x)), 0);
    assert.equal(Math.min(...shape.cells.map(c => c.y)), 0);
    assert.equal(new Set(shape.cells.map(c => `${c.x},${c.y}`)).size, shape.cells.length);
    const reachable = new Set([`${shape.cells[0].x},${shape.cells[0].y}`]);
    for (let i = 0; i < shape.cells.length; i++) for (const p of shape.cells) if (shape.cells.some(q => reachable.has(`${q.x},${q.y}`) && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1)) reachable.add(`${p.x},${p.y}`);
    assert.equal(reachable.size, shape.cells.length);
    assert.ok(shape.weight > 0);
  }
  assert.equal(DOCKS.length, 4);
  assert.ok(UPGRADES.length >= 3 && UPGRADES.length <= 6);
  assert.equal(P0_CONFIG.balanced, false);
});
test('standard start is empty, 7x7, three candidates, two distinct cargo orders', () => {
  const state = createRun(42);
  assert.equal(state.board.length, 49);
  assert.ok(state.board.every(c => c === null));
  assert.equal(state.candidates.length, 3);
  assert.equal(state.orders.length, 2);
  assert.equal(new Set(state.orders.map(o => o.cargo)).size, 2);
  assert.equal(state.phase, 'input');
  assert.equal(state.shift, 1);
  assert.equal(state.rngState.length, 4);
});
test('RNG snapshots restore the identical pure-rand sequence without mutating input', () => {
  const initial = createRandomState(213);
  const saved = [...initial];
  const first = nextRandom(initial, 0, 10000);
  assert.deepEqual(initial, saved);
  assert.deepEqual(nextRandom(initial, 0, 10000), first);
  assert.deepEqual(nextRandom(JSON.parse(JSON.stringify(first.state)), 0, 10000), nextRandom(first.state, 0, 10000));
});
test('four-neighbor traversal does not wrap board edges', () => { assert.deepEqual(neighbors(0), [1, 7]); assert.ok(!neighbors(6).includes(7)); });
test('diagonal equal cargo does not join a group', () => {
  const state = fixture(); put(state, F, [0, 8, 16]);
  assert.deepEqual(collectGroups(state.board).map(g => g.cells), [[0], [8], [16]]);
});
test('BFS uses empty cells and a canonical N E S W tie order', () => {
  const state = fixture(); put(state, F, [idx(4, 2)]);
  assert.deepEqual(findRoute(state.board, DOCKS[0], [idx(4, 2)]), [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }]);
});
test('occupied Dock entrance blocks shipment even if cargo touches the dock', () => {
  const state = fixture(); put(state, F, [idx(3, 0), idx(3, 1), idx(3, 2)]); state.orders = [order()];
  assert.equal(findRoute(state.board, DOCKS[0], [3, 10, 17]), null);
  assert.equal(shipments(place(state)).length, 0);
});
test('an enclosed group of sufficient size cannot ship', () => {
  const state = fixture(); put(state, F, [23, 24, 25]); put(state, M, [16, 17, 18, 22, 26, 30, 31, 32]); state.orders = [order()];
  assert.equal(shipments(place(state)).length, 0);
});
test('bounds, overlap, unknown piece and fractional origins are rejected without mutation', () => {
  const state = fixture(); state.board[0] = M; const before = JSON.stringify(state);
  for (const command of [
    { type: 'place' as const, pieceId: 'test-piece', origin: { x: -1, y: 0 } },
    { type: 'place' as const, pieceId: 'test-piece', origin: { x: 7, y: 0 } },
    { type: 'place' as const, pieceId: 'test-piece', origin: { x: 0, y: 0 } },
    { type: 'place' as const, pieceId: 'missing', origin: { x: 1, y: 0 } },
    { type: 'place' as const, pieceId: 'test-piece', origin: { x: 1.5, y: 0 } },
  ]) { const result = applyCommand(state, command); assert.ok(result.error); assert.equal(result.state, state); assert.deepEqual(result.events, []); }
  assert.equal(JSON.stringify(state), before);
});
test('valid command accepts frozen input and copies command coordinates', () => {
  const state = deepFreeze(fixture());
  const command = { type: 'place' as const, pieceId: 'test-piece', origin: { x: 0, y: 0 } };
  const result = applyCommand(state, command);
  assert.equal(result.error, undefined); assert.notEqual(result.state, state);
  command.origin.x = 6;
  assert.equal(result.state.commands[0].type === 'place' && result.state.commands[0].origin.x, 0);
  assert.equal(state.board[0], null);
});
test('orders require minimum four-connected group size and ship the whole overfilled group', () => {
  const state = fixture(); put(state, F, [15, 16, 17, 18]); state.orders = [order()];
  const result = place(state);
  assert.deepEqual(shipments(result)[0].cells, [15, 16, 17, 18]);
  assert.ok([15, 16, 17, 18].every(i => result.state.board[i] === null));
  assert.ok(shipments(result)[0].score > 100);
});
test('too-small cargo group is not shipped', () => { const state = fixture(); put(state, F, [15, 16]); state.orders = [order()]; assert.equal(shipments(place(state)).length, 0); });
test('shortest route wins over a larger farther group', () => {
  const state = fixture(); put(state, F, [1, 2, 8]); put(state, F, [29, 30, 31, 32]); state.orders = [order()];
  assert.deepEqual(shipments(place(state, 6, 6))[0].cells, [1, 2, 8]);
});
test('equal route distance chooses larger cargo group', () => {
  const state = fixture(); put(state, F, [0, 1, 2]); put(state, F, [4, 5, 6, 12]); state.orders = [order()];
  assert.deepEqual(shipments(place(state, 0, 6))[0].cells, [4, 5, 6, 12]);
});
test('equal route and size chooses lowest scan index', () => {
  const state = fixture(); put(state, F, [0, 1, 2]); put(state, F, [4, 5, 6]); state.orders = [order()];
  assert.deepEqual(shipments(place(state, 0, 6))[0].cells, [0, 1, 2]);
});
test('Dock priority is fixed even when order array is reversed', () => {
  const state = fixture(); put(state, F, [0, 1, 2]); put(state, M, [18, 19, 20]); state.orders = [order('dock.east', M, 3, 'east'), order('dock.north', F, 3, 'north')];
  assert.deepEqual(shipments(place(state, 0, 6)).map(s => s.orderId), ['north', 'east']);
});
test('three old orders cascade only after previous shipments open their Dock entrances', () => {
  const state = fixture(); state.completedOrders = 12; state.shift = 3;
  put(state, F, [21, 22, 23, 24, 25, 26, 27]); put(state, M, [31, 38, 45]); put(state, C, [42, 43, 44]);
  state.orders = [order('dock.south', C, 3, 'third'), order('dock.east', M, 3, 'second'), order('dock.north', F, 3, 'first')];
  assert.equal(findRoute(state.board, DOCKS[1], [31, 38, 45]), null);
  assert.equal(findRoute(state.board, DOCKS[2], [42, 43, 44]), null);
  const result = place(state);
  assert.deepEqual(shipments(result).map(s => s.orderId), ['first', 'second', 'third']);
  assert.deepEqual(shipments(result).map(s => s.chain), [1, 2, 3]);
  assert.equal(result.state.lastChain, 3); assert.equal(result.state.maxChain, 3);
  assert.equal(result.state.completedOrders, 15);
});
test('new random orders never join the frozen old-order chain', () => {
  const state = fixture(); put(state, F, [0, 1, 2, 7, 8, 9]); put(state, M, [35, 36, 37, 42, 43, 44]); state.orders = [order()];
  const result = place(state, 6, 0);
  assert.equal(shipments(result).length, 1);
  assert.equal(shipments(result)[0].orderId, 'old-order');
  assert.ok(result.state.orders.every(o => o.id !== 'old-order'));
});
test('preview matches actual shipment selection and consumes no RNG or input state', () => {
  const state = fixture(); put(state, F, [15, 16, 17]); state.orders = [order()]; const before = JSON.stringify(state);
  const preview = previewPlacement(state, 'test-piece', { x: 0, y: 0 });
  assert.equal(preview.valid, true); assert.equal(JSON.stringify(state), before);
  assert.deepEqual(preview.shipments, shipments(place(state)));
});
test('failure occurs only when every candidate has no legal placement', () => {
  const state = fixture(); state.board.fill(M); state.board[0] = null;
  const result = place(state); assert.equal(result.state.phase, 'result'); assert.equal(result.state.result, 'failed');
  assert.equal(findLegalMoves(result.state).length, 0);
});
test('one unplaceable candidate does not end a run when another fits', () => {
  const state = fixture(); state.board.fill(M); state.board[0] = null;
  state.candidates = [{ id: 'large', shapeId: 'shape.domino_h', cargo: F }, { id: 'small', shapeId: 'shape.single', cargo: F }];
  assert.deepEqual(findLegalMoves(state), [{ pieceId: 'small', origin: { x: 0, y: 0 } }]);
});
test('six orders advances shift, adds third Dock, and preserves distinct order cargo', () => {
  const state = fixture(); state.completedOrders = 5; put(state, F, [15, 16, 17]); state.orders = [order()];
  const result = place(state); assert.equal(result.state.shift, 2); assert.equal(result.state.orders.length, 3);
  assert.equal(new Set(result.state.orders.map(o => o.cargo)).size, 3);
  assert.ok(result.events.some(e => e.type === 'shift' && e.shift === 2));
});
test('fourth completed order opens three unique effective upgrades and choosing resumes board', () => {
  const state = fixture(); state.completedOrders = 3; put(state, F, [15, 16, 17]); state.orders = [order()];
  const result = place(state); assert.equal(result.state.phase, 'upgrade');
  assert.equal(new Set(result.state.upgradeChoices).size, 3);
  const rejected = applyCommand(result.state, { type: 'upgrade', upgradeId: 'missing' }); assert.equal(rejected.state, result.state); assert.ok(rejected.error);
  const chosen = applyCommand(result.state, { type: 'upgrade', upgradeId: result.state.upgradeChoices[0] });
  assert.equal(chosen.state.phase, 'input'); assert.deepEqual(chosen.state.board, result.state.board); assert.equal(chosen.state.upgrades.length, 1);
});
test('upgrade fallback remains three unique useful choices after capped upgrades are exhausted', () => {
  const state = fixture(); state.completedOrders = 3; put(state, F, [15, 16, 17]); state.orders = [order()];
  for (const upgrade of UPGRADES.filter(u => u.maxStack < 99)) state.upgrades.push(...Array<string>(upgrade.maxStack).fill(upgrade.id));
  const first = place(state).state; const second = place(state).state;
  assert.equal(first.upgradeChoices.length, 3); assert.equal(new Set(first.upgradeChoices).size, 3); assert.deepEqual(first.upgradeChoices, second.upgradeChoices);
});
test('Overfill upgrade increases surplus cargo score', () => {
  const state = fixture(); put(state, F, [15, 16, 17, 18]); state.orders = [order()];
  const base = shipments(place(state))[0].score; state.upgrades = ['upgrade.overfill'];
  assert.ok(shipments(place(state))[0].score > base);
});
test('deep-route upgrade rewards a distant shipment', () => {
  const state = fixture(); put(state, F, [42, 43, 44]); state.orders = [order()];
  const base = shipments(place(state))[0].score; state.upgrades = ['upgrade.deep_route'];
  assert.ok(shipments(place(state))[0].score > base);
});
test('contract upgrade increases order score', () => {
  const state = fixture(); put(state, F, [15, 16, 17]); state.orders = [order()];
  const base = shipments(place(state))[0].score; state.upgrades = ['upgrade.contract']; assert.ok(shipments(place(state))[0].score > base);
});
test('thirty completed orders wins fifth shift without another upgrade', () => {
  const state = fixture(); state.completedOrders = 29; state.shift = 5; put(state, F, [15, 16, 17]); state.orders = [order()];
  const result = place(state); assert.equal(result.state.completedOrders, 30); assert.equal(result.state.shift, 5); assert.equal(result.state.result, 'won'); assert.equal(result.state.phase, 'result');
});
test('tutorial first two prescribed moves achieve a real first shipment', () => {
  let state = createRun(123, 'tutorial');
  const first = applyCommand(state, { type: 'place', pieceId: state.candidates[0].id, origin: { x: 1, y: 1 } });
  assert.equal(first.error, undefined); assert.equal(shipments(first).length, 0); state = first.state;
  const second = applyCommand(state, { type: 'place', pieceId: state.candidates[1].id, origin: { x: 3, y: 1 } });
  assert.equal(second.error, undefined); assert.equal(shipments(second).length, 1); assert.equal(second.state.completedOrders, 1);
});
test('commands in upgrade or result phase cannot place pieces', () => {
  for (const phase of ['upgrade', 'result'] as const) { const state = fixture(); state.phase = phase; const result = place(state); assert.equal(result.state, state); assert.ok(result.error); }
});

test('order status exposes need, blocked, and canonical ready path without mutating state', () => {
  const state = fixture(); const active = order();
  assert.deepEqual(orderStatus(state, active), {count: 0, status: 'need', path: []});
  put(state, F, [15, 16, 17]);
  assert.equal(orderStatus(state, active).status, 'ready');
  state.board[3] = M;
  assert.deepEqual(orderStatus(state, active), {count: 3, status: 'blocked', path: []});
});
test('small-parcel upgrade materially changes generated shape distribution with deterministic draws', () => {
  let baseSmall = 0, upgradedSmall = 0;
  for (let seed = 0; seed < 120; seed++) {
    const state = fixture(); const seeded = createRun(seed); state.rngState = seeded.rngState;
    const base = place(state).state.candidates[0];
    state.upgrades = ['upgrade.small_parcels', 'upgrade.small_parcels', 'upgrade.small_parcels'];
    const upgraded = place(state).state.candidates[0];
    if (SHAPES.find(s => s.id === base.shapeId)!.cells.length <= 2) baseSmall++;
    if (SHAPES.find(s => s.id === upgraded.shapeId)!.cells.length <= 2) upgradedSmall++;
  }
  assert.ok(upgradedSmall > baseSmall + 10, `${upgradedSmall} vs ${baseSmall}`);
});
test('chain and variety upgrades each improve their corresponding second shipment', () => {
  const state = fixture(); put(state, F, [0, 1, 2]); put(state, M, [18, 19, 20]); state.orders = [order('dock.east', M, 3, 'east'), order('dock.north', F, 3, 'north')];
  const base = shipments(place(state, 0, 6))[1].score;
  for (const upgrade of ['upgrade.chain','upgrade.variety']) { state.upgrades = [upgrade]; assert.ok(shipments(place(state, 0, 6))[1].score > base); }
});

test('upgrade max stacks are positive and small-parcel choice is offered while eligible', () => {
  assert.ok(UPGRADES.every(u => u.maxStack > 0));
  for (let seed = 0; seed < 20; seed++) {
    const state = fixture(); state.rngState = createRun(seed).rngState; state.completedOrders = 3; put(state, F, [15, 16, 17]); state.orders = [order()];
    assert.ok(place(state).state.upgradeChoices.includes('upgrade.small_parcels'));
  }
});
test('all shift transitions use the configured Dock and cargo pool progression', () => {
  for (const [completed, previousShift, expectedShift, docks, cargoCount] of [[5,1,2,3,3],[11,2,3,3,4],[17,3,4,4,5],[23,4,5,4,5]]) {
    const state = fixture(); state.completedOrders=completed; state.shift=previousShift; put(state,F,[15,16,17]); state.orders=[order()];
    const result=place(state);
    assert.equal(result.state.shift,expectedShift); assert.equal(result.state.orders.length,docks);
    assert.equal(new Set(result.state.orders.map(o=>o.cargo)).size,docks);
    assert.ok(result.state.orders.every(o=>CARGO.slice(0,cargoCount).some(c=>c.id===o.cargo)));
    assert.ok(result.state.candidates.every(p=>SHAPES.find(s=>s.id===p.shapeId)!.minShift<=expectedShift));
  }
});
test('a replacement draw is not rerolled to guarantee a legal rescue piece', () => {
  let failures=0, survivors=0;
  for (let seed=0;seed<60;seed++) {
    const state=createRun(seed); state.board.fill(M); state.board[0]=null;state.board[1]=null;state.board[48]=null;state.orders=[];
    state.candidates=[{id:'test-piece',shapeId:'shape.domino_h',cargo:F},{id:'blocked.1',shapeId:'shape.domino_h',cargo:C},{id:'blocked.2',shapeId:'shape.domino_v',cargo:C}];
    const result=place(state);
    if(result.state.result==='failed')failures++;else survivors++;
  }
  assert.ok(failures>0,'some seeded draws must remain unplaceable despite a single empty cell');
  assert.ok(survivors>0,'ordinary weighted randomness still sometimes produces a single');
});
test('successful placement refills exactly its candidate slot and rejects its consumed ID', () => {
  const state=createRun(111); const piece=state.candidates[1]; const move=findLegalMoves(state).find(m=>m.pieceId===piece.id)!;
  const result=applyCommand(state,{type:'place',...move});
  assert.equal(result.state.candidates.length,3); assert.equal(result.state.candidates[0].id,state.candidates[0].id);assert.equal(result.state.candidates[2].id,state.candidates[2].id);
  assert.notEqual(result.state.candidates[1].id,piece.id);
  assert.ok(applyCommand(result.state,{type:'place',...move}).error);
});
test('limited upgrades stop appearing exactly at their declared stack boundary', () => {
  const state=fixture();state.completedOrders=3;put(state,F,[15,16,17]);state.orders=[order()];
  const cap=UPGRADES.find(u=>u.id==='upgrade.small_parcels')!.maxStack;
  state.upgrades=Array<string>(cap-1).fill('upgrade.small_parcels');
  assert.ok(place(state).state.upgradeChoices.includes('upgrade.small_parcels'));
  state.upgrades.push('upgrade.small_parcels');
  assert.ok(!place(state).state.upgradeChoices.includes('upgrade.small_parcels'));
});
test('daily mode retains the same seeded gameplay sequence as standard mode', () => {
  const normal=createRun(2043),daily=createRun(2043,'daily');
  assert.deepEqual(normal.candidates,daily.candidates);assert.deepEqual(normal.orders,daily.orders);assert.deepEqual(normal.rngState,daily.rngState);
});
