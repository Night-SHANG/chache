import test from 'node:test';
import assert from 'node:assert/strict';
import { L, getLayout, hitTestPoint, pointToCell, cellCenter, mapClientPoint } from '../src/presentation/layout.ts';

test('layout keeps a complete 7 by 7 board and three separated trays in the canvas', () => {
  const layout = getLayout();
  assert.equal(layout.board.size, layout.board.cell * 7);
  assert.equal(layout.trays.length, 3);
  for (const r of [layout.pause, layout.restart, layout.resume, ...layout.trays, ...layout.upgradeRects]) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1080 && r.y + r.h <= 1920);
  }
  assert.ok(layout.trays[0].x + layout.trays[0].w < layout.trays[1].x);
});

test('rect hit tests use half-open edges to avoid ambiguous adjacent targets', () => {
  const r = { x: 10, y: 20, w: 100, h: 50 };
  assert.equal(hitTestPoint({ x: 10, y: 20 }, r), true);
  assert.equal(hitTestPoint({ x: 109.9, y: 69.9 }, r), true);
  assert.equal(hitTestPoint({ x: 110, y: 20 }, r), false);
  assert.equal(hitTestPoint({ x: 10, y: 70 }, r), false);
});

test('board coordinates map exactly to all 49 cells and reject the far edge', () => {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    assert.deepEqual(pointToCell(cellCenter({ x, y })), { x, y });
  }
  assert.equal(pointToCell({ x: L.board.x - 1, y: L.board.y }), null);
  assert.equal(pointToCell({ x: L.board.x + L.board.size, y: L.board.y }), null);
  assert.equal(pointToCell({ x: L.board.x, y: L.board.y + L.board.size }), null);
});

test('letterbox mapping handles wide and narrow viewports without stretching', () => {
  assert.deepEqual(mapClientPoint({ x: 500, y: 1000 }, { x: 0, y: 0, w: 1000, h: 2000 }), { x: 540, y: 960 });
  assert.deepEqual(mapClientPoint({ x: 540, y: 960 }, { x: 0, y: 0, w: 1080, h: 1920 }), { x: 540, y: 960 });
  assert.equal(mapClientPoint({ x: 1, y: 1 }, { x: 0, y: 0, w: 2000, h: 1920 }), null);
  assert.equal(mapClientPoint({ x: 20, y: 20 }, { x: 0, y: 0, w: 0, h: 1920 }), null);
});

import { render } from '../src/presentation/renderer.ts';
import { createRun } from '../src/domain/engine.ts';
import { UPGRADES } from '../src/domain/content.ts';
import type { ViewState } from '../src/presentation/view-types.ts';

/** Strict base Canvas2D test surface; unsupported platform methods fail loudly. */
function canvasSurface(): { ctx: CanvasRenderingContext2D; labels: string[]; outlines: { x: number; y: number; w: number; h: number }[] } {
  const labels: string[] = [], outlines: { x: number; y: number; w: number; h: number }[] = [];
  const supported = new Set(['save','restore','clearRect','fillRect','strokeRect','beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','rect','arc','ellipse','fill','stroke','clip','translate','scale','rotate','setLineDash']);
  const values: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return (value: string) => ({ width: value.length * 25 });
      if (key === 'fillText') return (value: string) => labels.push(value);
      if (key === 'strokeRect') return (x: number, y: number, w: number, h: number) => outlines.push({ x, y, w, h });
      if (key === 'strokeText') return () => {};
      if (supported.has(key)) return () => {};
      if (key in values) return values[key];
      throw new Error(`Unsupported Canvas API: ${key}`);
    },
    set(_target, key, value) {
      if (['filter', 'shadowBlur'].includes(String(key))) throw new Error(`Unsupported Canvas property: ${String(key)}`);
      values[String(key)] = value; return true;
    },
  }) as CanvasRenderingContext2D;
  return { ctx, labels, outlines };
}
const baseView = (): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 60_000, animation: null, debug: false, needsResume: false });

test('renderer uses base Canvas2D APIs across gameplay and each blocking overlay', () => {
  for (const phase of ['input', 'upgrade', 'result', 'pause', 'resume', 'debug'] as const) {
    const state = createRun(10, 'tutorial'), view = baseView(), { ctx, labels } = canvasSurface();
    if (phase === 'upgrade') { state.phase = phase; state.upgradeChoices = UPGRADES.slice(0, 3).map(u => u.id); }
    if (phase === 'result') { state.phase = phase; state.result = 'failed'; }
    if (phase === 'pause') view.paused = true;
    if (phase === 'resume') view.needsResume = true;
    if (phase === 'debug') view.debug = true;
    render(ctx, state, view);
    // Active rule version now identifies debug builds; the rest of the v1 overlay contract stays intact.
    const expected = { input: '待入库', upgrade: '选择一项升级', result: '爆仓了！', pause: '休息一下', resume: '仓库还在等你', debug: '规则 v1 · 开发版' }[phase];
    assert.ok(labels.includes(expected), `${phase} label is rendered`);
  }
});

test('chain announcement owns the status row without regular status text painted over it', () => {
  const state = createRun(10, 'tutorial'), view = baseView(), { ctx, labels } = canvasSurface();
  view.message = '普通落子提示';
  view.animation = { board: state.board, progress: .8, shipment: { type: 'shipment', dockId: 'dock.north', orderId: 'order.test', cargo: 'cargo.food', cells: [20], path: [{ x: 3, y: 0 }, { x: 3, y: 1 }], score: 125, chain: 2 } };
  render(ctx, state, view);
  assert.ok(labels.includes('2 连锁出库！'));
  assert.equal(labels.includes(view.message), false);
});

test('animation Dock card describes the old shipment while authoritative orders have refreshed', () => {
  const state = createRun(10, 'tutorial'), view = baseView(), { ctx, labels } = canvasSurface();
  state.orders[0].cargo = 'cargo.machine';
  view.animation = { board: state.board, progress: .3, shipment: { type: 'shipment', dockId: state.orders[0].dockId, orderId: 'old.order', cargo: 'cargo.cold', cells: [20, 21, 22, 23], path: [{ x: 3, y: 0 }], score: 125, chain: 1 } };
  render(ctx, state, view);
  assert.ok(labels.includes('冷藏'));
  assert.ok(labels.includes('4格'));
  assert.ok(labels.includes('出库中 · +125'));
});

test('upgrade selection waits for the current shipment animation to finish', () => {
  const state = createRun(10, 'tutorial'), view = baseView(), { ctx, labels } = canvasSurface();
  state.phase = 'upgrade'; state.upgradeChoices = UPGRADES.slice(0, 3).map(u => u.id);
  view.animation = { board: state.board, progress: .3, shipment: { type: 'shipment', dockId: state.orders[0].dockId, orderId: 'old.order', cargo: 'cargo.food', cells: [20], path: [{ x: 3, y: 0 }], score: 125, chain: 1 } };
  render(ctx, state, view);
  assert.equal(labels.includes('选择一项升级'), false);
});

test('corrupt-save recovery never claims that a readable previous run was found', () => {
  const state = createRun(10, 'tutorial'), view = baseView(), { ctx, labels } = canvasSurface();
  view.needsResume = true;
  view.recoveryError = '主档与备份均无法读取';
  render(ctx, state, view);
  assert.ok(labels.includes('存档需要处理'));
  assert.equal(labels.includes('已找到本机保存的进度'), false);
  assert.equal(labels.includes('继续上次班次'), false);
});

test('chain and board hint rows do not intersect the adjacent frame geometry', () => {
  assert.ok(L.chain.y >= L.pause.y + L.pause.h);
  assert.ok(L.chain.y + L.chain.h < 226, 'chain stays above shift panel');
  assert.ok(L.boardHint.y > 492, 'hint stays below order cards');
  assert.ok(L.boardHint.y + L.boardHint.h < 525, 'hint stays above north gate');
});

test('first two tutorial placements have visible actionable instructions', async () => {
  const { applyCommand } = await import('../src/domain/engine.ts');
  const initial = createRun(10, 'tutorial');
  const first = canvasSurface(); render(first.ctx, initial, baseView());
  assert.ok(first.labels.includes('第1步：把左侧食品拖进虚线框'));
  assert.ok(first.labels.includes('食品 ×2'));
  const placed = applyCommand(initial, { type: 'place', pieceId: initial.candidates[0].id, origin: { x: 1, y: 1 } }).state;
  const second = canvasSurface(); render(second.ctx, placed, baseView());
  assert.ok(second.labels.includes('第2步：把中间食品接在右侧，凑成3格'));
  assert.ok(second.labels.includes('食品 ×1'));
});


test('equal-route order preview outlines only the canonical selected group', async () => {
  const { previewPlacement } = await import('../src/domain/engine.ts');
  const state = createRun(10, 'standard'), view = baseView(), surface = canvasSurface();
  state.board[2] = 'cargo.food'; state.board[4] = 'cargo.food';
  state.orders = [{ id: 'order.tie', dockId: 'dock.north', cargo: 'cargo.food', amount: 1, baseScore: 100 }];
  state.candidates[0] = { id: 'piece.preview', shapeId: 'shape.single', cargo: 'cargo.machine' };
  view.selectedPieceId = 'piece.preview'; view.hoverOrigin = { x: 0, y: 6 };
  view.preview = previewPlacement(state, 'piece.preview', view.hoverOrigin);
  assert.deepEqual(view.preview.shipments[0].cells, [2]);
  render(surface.ctx, state, view);
  const highlights = surface.outlines.filter(r => r.w === 112 && r.h === 112);
  assert.deepEqual(highlights, [{ x: L.board.x + 2 * L.board.cell + 4, y: L.board.y + 4, w: 112, h: 112 }]);
});
