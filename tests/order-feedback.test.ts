import {legacyPresentationPreview as previewPlacement} from './helpers/presentation-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createRun} from '../src/domain/engine.ts';
import { orderStatus } from '../src/domain/board.ts';
import { boardHint, orderFeedback } from '../src/presentation/order-feedback.ts';
import type { CargoId, CellTrait, Order, RunState, Shipment } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';

const order = (patch: Partial<Order> = {}): Order => ({ id: 'order.food', dockId: 'dock.north', cargo: 'cargo.food', amount: 3, baseScore: 100, ...patch });
const view = (patch: Partial<ViewState> = {}): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, ...patch });
const run = (version = 3, seed = 7): RunState => ({ ...createRun(seed, 'standard', version), board: Array(49).fill(null), cellTraits: Array(49).fill(null), candidates: [{ id: 'piece.red', cargo: 'cargo.food', shapeId: 'shape.single' }], orders: [order()] });
const stock = (state: RunState, cells: number[], cargo: CargoId): void => { for (const index of cells) state.board[index] = cargo; };
const shipment = (patch: Partial<Shipment> = {}): Shipment => ({ type: 'shipment', dockId: 'dock.north', orderId: 'order.old', cargo: 'cargo.food', cells: [8, 9, 10], path: [{ x: 3, y: 0 }], score: 125, chain: 1, ...patch });
function readyRun(): RunState {
  const state = run(); state.orders = [order({ id: 'order.machine', cargo: 'cargo.machine' })]; stock(state, [8, 9, 10], 'cargo.machine'); return state;
}

// A generic "ready means shipping" label would fail these committed-state checks.
test('ready means the next legal placement checks orders, without claiming shipment or order history', () => {
  const state = readyRun(), feedback = orderFeedback(state, state.orders[0], view());
  assert.deepEqual(feedback.status, orderStatus(state, state.orders[0]));
  assert.equal(feedback.label, '已就绪 · 等待放置');
  assert.equal(feedback.shipping, undefined); assert.equal(feedback.previewShipment, undefined);
  assert.equal(boardHint(state, view()), '已就绪 · 等待放置');
  assert.doesNotMatch(feedback.label + boardHint(state, view()), /新单|刚刚|红色|同色/);
});

for (const version of [1, 2, 3]) test(`v${version} shortage uses the largest connected group and the correct quantity unit`, () => {
  const state = run(version); stock(state, [8, 9, 40], 'cargo.food');
  const feedback = orderFeedback(state, state.orders[0], view());
  assert.equal(feedback.status.count, 2); assert.equal(feedback.status.status, 'need');
  assert.equal(feedback.label, `还差1${version >= 2 ? '件' : '格'}`);
});

test('pallet quantity comes from Domain units, not occupied cells', () => {
  const state = run(); state.orders[0].amount = 4; stock(state, [8, 9], 'cargo.food'); state.cellTraits![8] = { kind: 'pallet' };
  const feedback = orderFeedback(state, state.orders[0], view());
  assert.equal(feedback.status.count, 3); assert.equal(feedback.label, '还差1件');
});

test('enough cargo with an occupied entry explains the entrance obstruction', () => {
  const state = readyRun(); stock(state, [3], 'cargo.chem');
  assert.equal(orderFeedback(state, state.orders[0], view()).label, '入口堵塞');
});

test('enough cargo beyond a sealed empty entry explains the missing empty route', () => {
  const state = run(); stock(state, [28, 29, 30], 'cargo.food'); stock(state, [2, 4, 10], 'cargo.machine');
  assert.equal(orderStatus(state, state.orders[0]).reason, 'route-blocked');
  assert.equal(orderFeedback(state, state.orders[0], view()).label, '无空路');
});

// This is an actual engine preview: newly placed red Food dispatches existing green Machine.
test('real preview can ship a different cargo from the dragged piece', () => {
  const state = readyRun(), preview = previewPlacement(state, 'piece.red', { x: 0, y: 6 });
  assert.equal(preview.valid, true); assert.equal(preview.shipments[0]?.cargo, 'cargo.machine');
  const current = view({ selectedPieceId: 'piece.red', dragPoint: { x: 0, y: 6 }, preview });
  const feedback = orderFeedback(state, state.orders[0], current);
  assert.equal(feedback.label, '预计出货');
  assert.equal(feedback.previewShipment, preview.shipments[0]); assert.equal(feedback.shipping, undefined);
  assert.equal(boardHint(state, current), '预计出货：机械');
});

test('preview shipment must match the current order ID, not just its Dock', () => {
  const state = readyRun(), old = shipment({ cargo: 'cargo.machine' });
  const current = view({ preview: { valid: true,events:[], cells: [40], shipments: [old] } });
  const feedback = orderFeedback(state, state.orders[0], current);
  assert.equal(feedback.previewShipment, undefined);
  assert.equal(feedback.label, '暂不出货');
});

test('a valid placement blocking a currently ready entrance must not promise shipment', () => {
  const state = readyRun(), preview = previewPlacement(state, 'piece.red', { x: 3, y: 0 });
  assert.equal(preview.valid, true); assert.equal(preview.shipments.length, 0);
  const current = view({ preview, selectedPieceId: 'piece.red' });
  const feedback = orderFeedback(state, state.orders[0], current);
  assert.equal(feedback.status.status, 'ready'); assert.equal(feedback.previewShipment, undefined);
  assert.equal(feedback.label, '暂不出货');
  assert.equal(boardHint(state, current), '暂不出货');
});

test('invalid preview never claims a dispatch, even with stale shipment data', () => {
  const state = readyRun(), stale = shipment({ orderId: state.orders[0].id, cargo: 'cargo.machine' });
  const current = view({ preview: { valid: false,events:[], cells: [8], shipments: [stale] } });
  assert.equal(orderFeedback(state, state.orders[0], current).label, '这里放不下');
  assert.equal(orderFeedback(state, state.orders[0], current).previewShipment, undefined);
  assert.equal(boardHint(state, current), '这里放不下，换个位置');
});

test('real animation identifies its old shipment by Dock even after the card was replaced', () => {
  const state = readyRun(), active = shipment(), current = view({ animation: { shipment: active, progress: .3, board: state.board.slice() }, preview: { valid: true,events:[], cells: [40], shipments: [shipment({ cargo: 'cargo.chem' })] } });
  const feedback = orderFeedback(state, state.orders[0], current);
  assert.equal(feedback.shipping, active); assert.equal(feedback.previewShipment, undefined);
  assert.equal(feedback.label, '出货中 · +125'); assert.equal(boardHint(state, current), '食品出货中');
});

test('another Dock animation never marks an unrelated order as shipping', () => {
  const state = readyRun(), current = view({ animation: { shipment: shipment({ dockId: 'dock.east' }), progress: .2, board: state.board.slice() } });
  const feedback = orderFeedback(state, state.orders[0], current);
  assert.equal(feedback.shipping, undefined); assert.equal(feedback.label, '已就绪 · 等待放置');
});

test('animation status uses both its board and matching trait snapshot', () => {
  const state = run(); stock(state, [8, 9], 'cargo.food'); state.cellTraits![8] = { kind: 'waste' };
  const cellTraits: (CellTrait | null)[] = Array(49).fill(null); cellTraits[8] = { kind: 'pallet' };
  const current = view({ animation: { shipment: shipment({ dockId: 'dock.east' }), progress: .2, board: state.board.slice(), cellTraits } });
  assert.equal(orderFeedback(state, state.orders[0], current).status.count, 3);
  delete current.animation!.cellTraits;
  assert.equal(orderFeedback(state, state.orders[0], current).status.count, 2, 'missing historical traits never borrow final-board metadata');
});

test('preview board hint names every real cargo once in dispatch order', () => {
  const current = view({ preview: { valid: true,events:[], cells: [40], shipments: [shipment({ cargo: 'cargo.chem' }), shipment({ cargo: 'cargo.food' }), shipment({ cargo: 'cargo.chem' })] } });
  assert.equal(boardHint(run(), current), '预计出货：化工、食品');
});

test('selected ordinary cargo with no current matching order gets a temporary stock hint', () => {
  const state = run(); state.candidates = [{ id: 'piece.machine', cargo: 'cargo.machine', shapeId: 'shape.single' }];
  assert.equal(boardHint(state, view({ selectedPieceId: 'piece.machine' })), '机械暂无订单');
});

test('ready current orders take priority over a selected unmatched cargo', () => {
  const state = readyRun();
  assert.equal(boardHint(state, view({ selectedPieceId: 'piece.red' })), '已就绪 · 等待放置');
});

test('selected wildcard is usable for current differently colored orders', () => {
  const state = run(); state.candidates = [{ id: 'piece.wild', cargo: 'cargo.machine', shapeId: 'shape.single', trait: 'wildcard' }];
  const hint = boardHint(state, view({ selectedPieceId: 'piece.wild' }));
  assert.equal(hint, '');
});

test('idle hint chooses the most occupied unmatched cargo, skipping waste and wildcard cells', () => {
  const state = run(); stock(state, [8, 9, 10], 'cargo.machine'); stock(state, [28, 29], 'cargo.chem'); stock(state, [40, 41, 42, 43], 'cargo.cold');
  for (const index of [40, 41, 42]) state.cellTraits![index] = { kind: 'wildcard' };
  state.cellTraits![43] = { kind: 'waste' };
  state.orders[0].amount = 9;
  assert.equal(boardHint(state, view()), '机械暂无订单');
});

test('idle stock ranking counts occupied cells rather than pallet units and has a stable cargo tie-break', () => {
  const state = run(); stock(state, [8, 9], 'cargo.machine'); stock(state, [28, 29], 'cargo.chem'); state.cellTraits![28] = { kind: 'pallet' };
  assert.equal(boardHint(state, view()), '机械暂无订单');
});

test('selected cargo hint takes priority over larger idle unmatched stock', () => {
  const state = run(); stock(state, [8, 9, 10], 'cargo.machine'); state.candidates = [{ id: 'piece.chem', cargo: 'cargo.chem', shapeId: 'shape.single' }];
  assert.equal(boardHint(state, view({ selectedPieceId: 'piece.chem' })), '化工暂无订单');
});

test('dragging does not introduce an unrelated idle inventory hint', () => {
  const state = run(); stock(state, [8, 9, 10], 'cargo.machine');
  assert.equal(boardHint(state, view({ dragPoint: { x: 500, y: 900 } })), '');
});

test('legacy cargo semantics ignore unsupported trait metadata', () => {
  const state = run(1); stock(state, [8], 'cargo.machine'); state.cellTraits![8] = { kind: 'wildcard' };
  assert.equal(boardHint(state, view()), '机械暂无订单');
});

test('selectors are deterministic and leave Domain and ViewState untouched', () => {
  const state = readyRun(), current = view({ selectedPieceId: 'piece.red', preview: previewPlacement(state, 'piece.red', { x: 0, y: 6 }) });
  const before = JSON.stringify({ state, current });
  const first = { card: orderFeedback(state, state.orders[0], current), hint: boardHint(state, current) };
  assert.deepEqual({ card: orderFeedback(state, state.orders[0], current), hint: boardHint(state, current) }, first);
  assert.equal(JSON.stringify({ state, current }), before);
});

// Seed 2 provides a real post-resolution refresh, rather than inferring history from a screenshot.
test('a refreshed ready Machine order waits for the next legal red Food placement', () => {
  const state = run(3, 2);
  stock(state, [8, 9, 10, 11, 12], 'cargo.machine'); stock(state, [28, 29, 30], 'cargo.food');
  state.candidates = [
    { id: 'piece.red.first', cargo: 'cargo.food', shapeId: 'shape.single' },
    { id: 'piece.red.next', cargo: 'cargo.food', shapeId: 'shape.single' },
  ];
  const first = applyCommand(state, { type: 'place', pieceId: 'piece.red.first', origin: { x: 0, y: 6 } });
  assert.equal(first.error, undefined);
  assert.deepEqual(first.events.filter(event => event.type === 'shipment').map(event => event.orderId), ['order.food']);
  const refreshed = first.state.orders.find(order => order.cargo === 'cargo.machine');
  assert.ok(refreshed); assert.notEqual(refreshed.id, 'order.food');
  assert.equal(first.state.board.filter(cargo => cargo === 'cargo.machine').length, 5);
  assert.equal(orderStatus(first.state, refreshed).status, 'ready');
  assert.equal(orderFeedback(first.state, refreshed, view()).label, '已就绪 · 等待放置');
  const invalid = applyCommand(first.state, { type: 'place', pieceId: 'piece.red.next', origin: { x: 1, y: 1 } });
  assert.ok(invalid.error); assert.deepEqual(invalid.events, []);
  assert.equal(orderStatus(invalid.state, refreshed).status, 'ready');
  const preview = previewPlacement(first.state, 'piece.red.next', { x: 1, y: 6 });
  assert.equal(preview.valid, true); assert.equal(preview.shipments[0]?.orderId, refreshed.id);
  const current = view({ selectedPieceId: 'piece.red.next', preview });
  assert.equal(orderFeedback(first.state, refreshed, current).label, '预计出货');
  assert.equal(boardHint(first.state, current), '预计出货：机械');
  const second = applyCommand(first.state, { type: 'place', pieceId: 'piece.red.next', origin: { x: 1, y: 6 } });
  assert.equal(second.error, undefined);
  assert.ok(second.events.some(event => event.type === 'shipment' && event.orderId === refreshed.id && event.cargo === 'cargo.machine'));
});
