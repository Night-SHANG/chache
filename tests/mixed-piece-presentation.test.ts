import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { createProfile } from '../src/application/profile.ts';
import { applyCommand, createRun, previewPlacement } from '../src/domain/engine.ts';
import { checksum } from '../src/domain/replay.ts';
import type { CargoId, Piece, RunState, Shipment } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
import { colorExitBoardHint, colorExitFeedback, drawColorExitCards, drawColorExitHelpDiagram, drawMixedRemainder } from '../src/presentation/color-exit-renderer.ts';
import { L } from '../src/presentation/layout.ts';
import { PALETTE } from '../src/presentation/assets.ts';
import { mixedPiecePreview, pieceCaption } from '../src/presentation/mixed-piece-feedback.ts';

const FOOD = 'cargo.food', CHEM = 'cargo.chem';
function mixedPiece(): Piece & { cellCargos: CargoId[] } {
  return { id: 'piece.mixed', shapeId: 'shape.square', cargo: FOOD, cellCargos: [FOOD, FOOD, CHEM, CHEM] };
}
function run(): RunState {
  const state = createRun(7, 'color_exit', 5, 'entry'); state.board.fill(null); state.candidates = [mixedPiece()]; return state;
}
function view(patch: Partial<ViewState> = {}): ViewState {
  return { selectedPieceId: 'piece.mixed', hoverOrigin: null, preview: { valid: true, cells: [3, 4, 10, 11], shipments: [] }, dragPoint: null,
    paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile: createProfile(), ...patch };
}
function surface() {
  const canvas = createCanvas(1080, 1920), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const labels: string[] = [], fillText = ctx.fillText.bind(ctx), strokeRect = ctx.strokeRect.bind(ctx);
  const borders: { x: number; y: number; w: number; h: number; dash: number[]; color: string | CanvasGradient | CanvasPattern }[] = [];
  ctx.fillText = (value, x, y) => { labels.push(value); fillText(value, x, y); };
  ctx.strokeRect = (x, y, w, h) => { borders.push({ x, y, w, h, dash: ctx.getLineDash(), color: ctx.strokeStyle }); strokeRect(x, y, w, h); };
  return { ctx, labels, borders, words: () => labels.join('\n'), pixels: () => canvas.toBuffer('image/png') };
}

// Painting all four cells with piece.cargo would falsely turn two food crates into a complete batch.
test('mixed preview counts each actual cell cargo without combining a 2+2 square into four food crates', () => {
  const state = run(), v = view(), before = JSON.stringify([state, v]);
  const food = colorExitFeedback(state, state.orders.find(order => order.cargo === FOOD)!, v);
  const chem = colorExitFeedback(state, state.orders.find(order => order.cargo === CHEM)!, v);
  assert.equal(food.status.count, 2); assert.equal(food.status.largestGroupCount, 2); assert.equal(food.status.reason, 'insufficient');
  assert.equal(chem.status.largestGroupCount, 2); assert.equal(food.previewShipment, undefined);
  const drawn = surface(); drawColorExitCards(drawn.ctx, state, v);
  assert.match(drawn.words(), /已连接 2\/4件/); assert.doesNotMatch(drawn.words(), /已连接 4\/4件/);
  assert.equal(JSON.stringify([state, v]), before, 'read-only preview must not mutate saved or view state');
});

function event(cargo: CargoId, cells: number[]): Shipment {
  return { type: 'shipment', transport: 'conveyor', cargo, cells, path: [], cargoPaths: [], dockId: cargo === FOOD ? 'dock.north' : 'dock.east',
    orderId: cargo === FOOD ? 'exit.food' : 'exit.chem', score: cells.length * 10, chain: 1 };
}
function previewView(shipments: Shipment[] = []): ViewState {
  return view({ preview: { valid: true, cells: [10, 11, 17, 18], shipments } });
}

// The shipment total includes old stock, while the remainder belongs only to this candidate.
test('mixed hint separates a four-food shipment with old stock from the two new chemical crates left in place', () => {
  const state = run(); state.board[3] = FOOD; state.board[4] = FOOD;
  const hint = colorExitBoardHint(state, previewView([event(FOOD, [3, 4, 10, 11])]));
  assert.match(hint, /预计出货：食品4件/); assert.match(hint, /留下化工2件/);
  assert.doesNotMatch(hint, /食品2件.*留下|全部出货/);
});

test('mixed hint with no shipment lists both retained colors and never implies that 2+2 reaches a batch', () => {
  const hint = colorExitBoardHint(run(), previewView());
  assert.match(hint, /暂不出货/); assert.match(hint, /留下食品2件、化工2件/);
  assert.doesNotMatch(hint, /预计出货|全部出货/);
});

test('mixed hint confirms all four new cells leave only when both colors appear in actual preview shipments', () => {
  const hint = colorExitBoardHint(run(), previewView([event(FOOD, [3, 4, 10, 11]), event(CHEM, [17, 18, 19, 20])]));
  assert.match(hint, /预计出货：食品4件、化工4件/); assert.doesNotMatch(hint, /留下|本件4格全部出货/);
  assert.doesNotMatch(hint, /本件留下/);
});

test('unrelated old-stock shipment does not clear or miscount any new mixed-piece cell', () => {
  const hint = colorExitBoardHint(run(), previewView([event(FOOD, [0, 1, 2, 3])]));
  assert.match(hint, /预计出货：食品4件/); assert.match(hint, /留下食品2件、化工2件/);
  assert.doesNotMatch(hint, /全部出货/);
});

test('mixed landing which blocks the southern entrance still names every retained crate', () => {
  const hint = colorExitBoardHint(run(), view({ preview: { valid: true, cells: [38, 39, 45, 46], shipments: [] } }));
  assert.match(hint, /入口堵塞/); assert.match(hint, /留下食品2件、化工2件/);
});

test('mixed remainder overlay marks only the two retained new cells with cargo-colored small dashed borders', () => {
  const state = run(), v = previewView([event(FOOD, [3, 4, 10, 11])]), drawn = surface(), before = JSON.stringify([state, v]);
  drawn.ctx.setLineDash([2, 3]); drawn.ctx.strokeStyle = '#123456';
  drawMixedRemainder(drawn.ctx, state, v);
  assert.equal(drawn.borders.length, 2);
  for (const [index, border] of drawn.borders.entries()) {
    const cell = [17, 18][index]; assert.ok(border.dash.length > 0); assert.equal(border.color, PALETTE[CHEM].light);
    assert.ok(border.x >= L.board.x + cell % 7 * 120); assert.ok(border.x + border.w <= L.board.x + (cell % 7 + 1) * 120);
    assert.ok(border.y >= L.board.y + Math.floor(cell / 7) * 120); assert.ok(border.y + border.h <= L.board.y + (Math.floor(cell / 7) + 1) * 120);
  }
  assert.deepEqual(drawn.labels, [], 'no large text obscures the board');
  assert.deepEqual(drawn.ctx.getLineDash(), [2, 3]);
  // @napi-rs/canvas restores the actual brush, but its strokeStyle getter retains the last assigned string.
  drawn.ctx.setLineDash([]); drawn.ctx.lineWidth = 5; drawn.ctx.strokeRect(4, 4, 12, 12);
  assert.deepEqual([...drawn.ctx.getImageData(4, 8, 1, 1).data], [18, 52, 86, 255]);
  assert.equal(JSON.stringify([state, v]), before);
});

test('mixed remainder overlay does not mark shipped cells, old inventory, animations, invalid previews, or pure pieces', () => {
  const state = run(), all = previewView([event(FOOD, [3, 4, 10, 11]), event(CHEM, [17, 18, 19, 20])]);
  const invalid = view({ preview: { valid: false, cells: [10, 11, 17, 18], shipments: [] } });
  const animation = view({ animation: { shipment: event(FOOD, [3, 4, 10, 11]), board: [...state.board], progress: .5 } });
  for (const v of [all, invalid, animation, view({ preview: null }), view({ selectedPieceId: null })]) {
    const drawn = surface(); drawMixedRemainder(drawn.ctx, state, v); assert.equal(drawn.borders.length, 0);
  }
  state.candidates = [{ id: 'piece.mixed', shapeId: 'shape.square', cargo: FOOD }];
  const pure = surface(); drawMixedRemainder(pure.ctx, state, previewView()); assert.equal(pure.borders.length, 0);
  state.candidates = [mixedPiece()];
  const none = surface(); drawMixedRemainder(none.ctx, state, previewView()); assert.equal(none.borders.length, 4);
  const old = surface(); drawMixedRemainder(old.ctx, state, previewView([event(FOOD, [0, 1, 2, 3])])); assert.equal(old.borders.length, 4);
});

test('mixed help shows a retained machine half and explicitly keeps the minimum separate for each color', () => {
  const rect = { x: 100, y: 400, w: 880, h: 450 }, mixed = surface(), legacy = surface(), explicitLegacy = surface();
  drawColorExitHelpDiagram(mixed.ctx, rect, true); drawColorExitHelpDiagram(legacy.ctx, rect); drawColorExitHelpDiagram(explicitLegacy.ctx, rect, false);
  assert.match(mixed.words(), /虚线.*叉车通路/); assert.match(mixed.words(), /实线.*出货路线/);
  assert.match(mixed.words(), /食品4件出货/); assert.match(mixed.words(), /机械2件留下/); assert.doesNotMatch(mixed.words(), /概率|2.*\+.*2.*不等于/);
  assert.doesNotMatch(mixed.words(), /整块.*消失|双色.*自动.*清/);
  assert.notDeepEqual(mixed.pixels(), legacy.pixels()); assert.deepEqual(legacy.pixels(), explicitLegacy.pixels());
});

test('piece caption names both cell colors once in shape order while keeping old pure-cargo captions', () => {
  assert.equal(pieceCaption(mixedPiece()), '双色·食品/化工');
  assert.equal(pieceCaption({ ...mixedPiece(), cellCargos: [FOOD, CHEM, FOOD, CHEM] }), '双色·食品/化工');
  assert.equal(pieceCaption({ ...mixedPiece(), cargo: CHEM, cellCargos: [CHEM, CHEM, FOOD, FOOD] }), '双色·化工/食品');
  assert.equal(pieceCaption({ id: 'pure', shapeId: 'shape.l3_ne', cargo: FOOD }), '食品');
});

test('actual v5 preview and committed half-shipment agree with the per-cell remainder without changing checksum', () => {
  const state = run(); for (const cell of [3, 4]) state.board[cell] = FOOD;
  const before = checksum(state), preview = previewPlacement(state, 'piece.mixed', { x: 3, y: 1 }), v = view({ preview });
  assert.deepEqual(preview.shipments.map(item => item.cargo), [FOOD]);
  const feedback = mixedPiecePreview(state, v); assert.ok(feedback);
  assert.deepEqual(feedback.shipped, [{ cell: 10, cargo: FOOD }, { cell: 11, cargo: FOOD }]);
  assert.deepEqual(feedback.remaining, [{ cell: 17, cargo: CHEM }, { cell: 18, cargo: CHEM }]);
  const next = applyCommand(state, { type: 'place', pieceId: 'piece.mixed', origin: { x: 3, y: 1 } });
  for (const item of feedback.placed) assert.equal(next.state.board[item.cell], feedback.remaining.some(cell => cell.cell === item.cell) ? item.cargo : null);
  assert.match(colorExitBoardHint(state, v), /食品4件.*留下化工2件/);
  const normal = surface(), reduced = surface(); drawMixedRemainder(normal.ctx, state, v);
  v.profile!.settings.reducedMotion = true; drawMixedRemainder(reduced.ctx, state, v);
  assert.deepEqual(normal.pixels(), reduced.pixels()); assert.equal(checksum(state), before);
});

test('actual v5 route-opening chain consumes both bands and the preview does not leave phantom boxes', () => {
  const state = run(); for (const cell of [3, 4]) state.board[cell] = FOOD;
  for (const cell of [14, 15, 16, 19, 20, 27]) state.board[cell] = CHEM;
  const preview = previewPlacement(state, 'piece.mixed', { x: 3, y: 1 }), v = view({ preview });
  assert.deepEqual(preview.shipments.map(item => item.cargo), [CHEM, FOOD]);
  assert.deepEqual(mixedPiecePreview(state, v)?.remaining, []);
  assert.match(colorExitBoardHint(state, v), /预计出货：化工8件、食品4件$/);
  const drawn = surface(); drawMixedRemainder(drawn.ctx, state, v); assert.equal(drawn.borders.length, 0);
});

test('mixed help keeps both mechanical crates visibly in the same board cells after food leaves', () => {
  const drawn = surface(); drawColorExitHelpDiagram(drawn.ctx, { x: 0, y: 0, w: 800, h: 430 }, true);
  for (const column of [3, 4]) {
    const before = drawn.ctx.getImageData(38 + column * 32 + 4, 105 + 2 * 32 + 4, 24, 24);
    const after = drawn.ctx.getImageData(332 + column * 32 + 4, 105 + 2 * 32 + 4, 24, 24);
    assert.ok(after.data.every((value, index) => Math.abs(value - before.data[index]) <= 2), 'the same crate art stays at the same grid offset; allow two raster rounding levels');
    for (const row of [0, 1]) assert.deepEqual([...drawn.ctx.getImageData(332 + column * 32 + 16, 105 + row * 32 + 16, 1, 1).data], [86, 99, 106, 255]);
  }
});
