import test from 'node:test';
import assert from 'node:assert/strict';
import * as layout from '../src/presentation/layout.ts';
import { render } from '../src/presentation/renderer.ts';
import { cargoBox, PALETTE } from '../src/presentation/assets.ts';
import { createRun } from '../src/domain/engine.ts';
import type { CellTrait, RunState, Shipment } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';

interface Label { value: string; x: number; y: number; size: number }
/** Canvas2D output capture, restricted to the same baseline as the host adapters. */
function canvasSurface() {
  const labels: Label[] = [], fills: string[] = [], outlines: layout.Rect[] = [], scales: number[][] = [];
  const methods = new Set(['save', 'restore', 'clearRect', 'fillRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'arc', 'ellipse', 'stroke', 'clip', 'translate', 'scale', 'rotate', 'setLineDash', 'strokeText']);
  const values: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return (value: string) => ({ width: value.length * Number(String(values.font).match(/([\d.]+)px/)?.[1] ?? 25) });
      if (key === 'fillText') return (value: string, x: number, y: number) => labels.push({ value, x, y, size: Number(String(values.font).match(/([\d.]+)px/)?.[1] ?? 0) });
      if (key === 'fill') return () => fills.push(String(values.fillStyle));
      if (key === 'scale') return (x: number, y: number) => scales.push([x, y]);
      if (key === 'strokeRect') return (x: number, y: number, w: number, h: number) => outlines.push({ x, y, w, h });
      if (methods.has(key)) return () => {};
      if (key in values) return values[key];
      throw new Error(`Unsupported Canvas API: ${key}`);
    },
    set(_target, key, value) {
      if (['filter', 'shadowBlur'].includes(String(key))) throw new Error(`Unsupported Canvas property: ${String(key)}`);
      values[String(key)] = value; return true;
    },
  }) as CanvasRenderingContext2D;
  return { ctx, labels, fills, outlines, scales };
}
const baseView = (): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false });
function v2State(): RunState {
  const state = createRun(10, 'standard');
  return { ...state, rulesetVersion: 2, runConfigId: 'run.standard_v2', board: Array(49).fill(null), cellTraits: Array(49).fill(null), candidates: [], orders: [], shift: 3 };
}
const labelsOf = (surface: ReturnType<typeof canvasSurface>) => surface.labels.map(label => label.value);
const shipment = (overrides: Partial<Shipment> = {}): Shipment => ({ type: 'shipment', dockId: 'dock.north', orderId: 'order.old', cargo: 'cargo.food', cells: [8], path: [{ x: 3, y: 0 }, { x: 3, y: 1 }], score: 100, chain: 1, ...overrides });

test('v2 tray geometry preserves three slots and fits four equal separated candidates', () => {
  assert.equal(typeof layout.getTrayRects, 'function');
  assert.deepEqual(layout.getTrayRects(3), layout.L.trays);
  const rects = layout.getTrayRects(4);
  assert.equal(rects.length, 4);
  for (const [index, rect] of rects.entries()) {
    assert.equal(rect.w, rects[0].w);
    assert.equal(rect.y, layout.L.trays[0].y);
    assert.equal(rect.h, layout.L.trays[0].h);
    assert.ok(rect.x >= 0 && rect.x + rect.w <= layout.L.width);
    assert.ok(layout.hitTestPoint({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, rect));
    if (index) assert.ok(rects[index - 1].x + rects[index - 1].w < rect.x);
  }
});

test('v2 renderer displays the fourth tray at its shared hit-test center', () => {
  const state = v2State(), surface = canvasSurface();
  state.candidates = ['pallet', 'rush', 'hazard', 'wildcard'].map((trait, index) => ({ id: `piece.${index}`, shapeId: 'shape.single', cargo: 'cargo.food', trait: trait as 'pallet' | 'rush' | 'hazard' | 'wildcard', rushTurns: 3 }));
  render(surface.ctx, state, baseView());
  assert.ok(labelsOf(surface).includes('04'));
  const label = surface.labels.find(item => item.value === '万能 · 食品');
  assert.ok(label, 'the fourth candidate has its own explicit trait/cargo label');
  const rect = layout.getTrayRects(4)[3];
  assert.equal(label.x, rect.x + rect.w / 2);
});

for (const [kind, expected] of [['pallet', '×2'], ['rush', '余3次'], ['hazard', '危险'], ['wildcard', '万能'], ['waste', '废弃物']] as const) {
  test(`special cargo ${kind} has a non-color-only symbol/label`, () => {
    const surface = canvasSurface();
    cargoBox(surface.ctx, 'cargo.food', 0, 0, 110, 1, { kind, remaining: 3 });
    assert.ok(labelsOf(surface).includes(expected));
    if (kind === 'waste') {
      assert.ok(surface.fills.includes('#727b83'), 'waste uses its neutral gray front');
      assert.equal(surface.fills.includes(PALETTE['cargo.food'].light), false, 'waste is not drawn as ordinary food');
    }
  });
}

test('board and drag ghost show Rush remaining legal-placement countdown', () => {
  const state = v2State(), surface = canvasSurface(), view = baseView();
  state.board[8] = 'cargo.food'; state.cellTraits![8] = { kind: 'rush', remaining: 2 };
  state.candidates = [{ id: 'piece.rush', cargo: 'cargo.cold', shapeId: 'shape.single', trait: 'rush', rushTurns: 5 }];
  view.selectedPieceId = 'piece.rush'; view.dragPoint = { x: 540, y: 900 };
  render(surface.ctx, state, view);
  assert.ok(labelsOf(surface).includes('余2次'));
  assert.equal(labelsOf(surface).filter(value => value === '余5次').length, 2, 'tray and drag ghost both render the deadline');
});

test('animation uses its cell-trait snapshot instead of authoritative expired metadata', () => {
  const state = v2State(), surface = canvasSurface(), view = baseView();
  state.board[8] = 'cargo.food'; state.cellTraits![8] = { kind: 'waste' };
  const cellTraits: (CellTrait | null)[] = Array(49).fill(null); cellTraits[8] = { kind: 'rush', remaining: 1 };
  view.animation = { shipment: shipment({ cells: [9] }), progress: .2, board: state.board.slice(), cellTraits };
  render(surface.ctx, state, view);
  assert.ok(labelsOf(surface).includes('余1次'));
  assert.equal(labelsOf(surface).includes('废弃物'), false);
});

test('legacy animation without a trait snapshot does not borrow final cell metadata', () => {
  const state = v2State(), surface = canvasSurface(), view = baseView();
  state.board[8] = 'cargo.food'; state.cellTraits![8] = { kind: 'waste' };
  view.animation = { shipment: shipment({ cells: [9] }), progress: .2, board: state.board.slice() };
  render(surface.ctx, state, view);
  assert.equal(labelsOf(surface).includes('废弃物'), false);
});

test('pallet shipment reports order units separately from occupied cells', () => {
  const state = v2State(), surface = canvasSurface(), view = baseView();
  state.orders = [{ id: 'order.new', dockId: 'dock.north', cargo: 'cargo.machine', amount: 3, baseScore: 100 }];
  view.animation = { shipment: shipment({ units: 2 }), progress: .3, board: state.board.slice(), cellTraits: state.cellTraits };
  render(surface.ctx, state, view);
  assert.ok(labelsOf(surface).includes('2件·1格'));
});

test('side gate is explicitly labeled at southwest cell and stays distinct from the west gate', () => {
  const state = v2State(), surface = canvasSurface(); state.upgrades = ['upgrade.side_gate'];
  render(surface.ctx, state, baseView());
  const label = surface.labels.find(item => item.value === '侧门');
  assert.ok(label);
  assert.ok(label.x < layout.L.board.x);
  assert.ok(Math.abs(label.y - layout.cellCenter({ x: 0, y: 6 }).y) < 80);
  const regular = canvasSurface(); state.upgrades = []; render(regular.ctx, state, baseView());
  assert.equal(labelsOf(regular).includes('侧门'), false);
});

test('preview preserves exact selected cells and marks extra clear separately with text', () => {
  const state = v2State(), surface = canvasSurface(), view = baseView();
  view.preview = { valid: true, cells: [30], shipments: [shipment({ cells: [8, 9], units: 3, usedPalletPass: true, extraClearedCells: [15] })] };
  render(surface.ctx, state, view);
  assert.deepEqual(surface.outlines.filter(rect => rect.w === 112 && rect.h === 112), [8, 9].map(index => ({ x: layout.L.board.x + index % 7 * 120 + 4, y: layout.L.board.y + Math.floor(index / 7) * 120 + 4, w: 112, h: 112 })));
  assert.ok(labelsOf(surface).some(value => value.includes('托盘保留')));
  assert.ok(labelsOf(surface).some(value => value.includes('额外清理1格')));
  assert.ok(surface.outlines.some(rect => rect.x === layout.L.board.x + 120 + 9 && rect.y === layout.L.board.y + 240 + 9 && rect.w === 102));
});

test('failure explains placement exhaustion while optional details retain expiry and cleanup costs', () => {
  const state = v2State(), view = baseView(); state.candidates = Array.from({ length: 4 }, (_, i) => ({ id: `p.${i}`, cargo: 'cargo.food', shapeId: 'shape.single' })); state.phase = 'result'; state.result = 'failed';
  const failed = canvasSurface(); render(failed.ctx, state, view);
  assert.ok(labelsOf(failed).includes('所有货件都放不下了'));
  state.phase = 'input'; view.paused = true; view.screen = 'helpDetails'; const paused = canvasSurface(); render(paused.ctx, state, view);
  assert.ok(labelsOf(paused).some(value => value.includes('有效放置') && value.includes('废弃物')));
  assert.ok(labelsOf(paused).some(value => value.includes('不计分')));
});

test('upgrade visuals communicate effect semantics instead of candidate-index cargo art', async () => {
  const { UPGRADES } = await import('../src/domain/content.ts');
  const state = v2State(); state.phase = 'upgrade';
  for (const upgrade of UPGRADES) {
    state.upgradeChoices = [upgrade.id]; const surface = canvasSurface(); render(surface.ctx, state, baseView());
    assert.ok(labelsOf(surface).includes(upgrade.title));
    assert.equal(labelsOf(surface).some(label=>label==='规则变化'||label==='计分 / 补给'),false, 'the actual effect replaces a redundant category');
    const effectLabel = surface.labels.find(label => label.y === layout.L.upgradeRects[0].y + 284);
    assert.ok(effectLabel && effectLabel.value.length > 1, `${upgrade.id} has its own plain-language modifier`);
  }
});

test('three-tray compatibility alias stays identical and invalid counts do not invent hit targets', () => {
  assert.deepEqual(layout.L.trays3, layout.L.trays);
  assert.deepEqual(layout.getTrayRects(0), []);
  assert.deepEqual(layout.getTrayRects(5), []);
  assert.deepEqual(layout.getTrayRects(Number.NaN), []);
});

test('v2 order cards use Domain units and distinguish blocked entry from an unreachable aisle', () => {
  for (const [reason, expected] of [['ready', '已就绪 · 等待放置'], ['entry', '入口堵塞'], ['route', '无空路']] as const) {
    const state = v2State(), surface = canvasSurface();
    state.orders = [{ id: 'order.food', dockId: 'dock.north', cargo: 'cargo.food', amount: 3, baseScore: 100 }];
    const indices = reason === 'route' ? [28, 29] : [8, 9];
    indices.forEach(index => { state.board[index] = 'cargo.food'; }); state.cellTraits![indices[0]] = { kind: 'pallet' };
    if (reason === 'entry') state.board[3] = 'cargo.machine';
    if (reason === 'route') [2, 4, 10].forEach(index => { state.board[index] = 'cargo.machine'; });
    render(surface.ctx, state, baseView());
    assert.ok(labelsOf(surface).includes('3/3'), 'units come from Domain, including the two-unit pallet');
    assert.ok(labelsOf(surface).includes(expected));
  }
});

test('order status during animation uses the same prior traits as its board', () => {
  const state = v2State(), surface = canvasSurface(), view = baseView();
  state.orders = [{ id: 'order.food', dockId: 'dock.north', cargo: 'cargo.food', amount: 3, baseScore: 100 }];
  state.board[8] = 'cargo.food'; state.board[9] = 'cargo.food'; state.cellTraits![8] = { kind: 'waste' };
  const cellTraits: (CellTrait | null)[] = Array(49).fill(null); cellTraits[8] = { kind: 'pallet' };
  view.animation = { shipment: shipment({ dockId: 'dock.east', cells: [20] }), progress: .2, board: state.board.slice(), cellTraits };
  render(surface.ctx, state, view);
  assert.ok(labelsOf(surface).includes('3/3'));
  assert.equal(labelsOf(surface).includes('1/3'), false);
});

test('explicit developer diagnostics identify the active rules version without a permanent footer', () => {
  for (const version of [1, 2]) {
    const state = v2State(), surface = canvasSurface(), view = baseView(); state.rulesetVersion = version; view.debug = true; view.developerMode = true;
    render(surface.ctx, state, view);
    assert.equal(labelsOf(surface).filter(label => label.includes(`规则 v${version} · 开发版`)).length, 1);
    assert.equal(labelsOf(surface).some(label => label.startsWith('P0')), false);
  }
});


test('single-cell special tray artwork is large enough to read its deadline', () => {
  const state = v2State(), surface = canvasSurface();
  state.candidates = [{ id: 'rush', cargo: 'cargo.food', shapeId: 'shape.single', trait: 'rush', rushTurns: 3 }];
  render(surface.ctx, state, baseView());
  assert.ok(surface.scales.some(([x, y]) => x === 102 / 110 && y === 102 / 110));
});

test('upgrade descriptions translate internal Dock and Shift labels before wrapping', () => {
  const state = v2State(), surface = canvasSurface(); state.phase = 'upgrade'; state.upgradeChoices = ['upgrade.small_order_first', 'upgrade.pallet_supply'];
  render(surface.ctx, state, baseView());
  const prose = surface.labels.filter(label => label.y >= layout.L.upgradeRects[0].y + 377 && label.y < layout.L.upgradeRects[0].y + layout.L.upgradeRects[0].h - 75);
  assert.ok(prose.length);
  assert.equal(prose.some(label => /[A-Za-z]/.test(label.value)), false, 'players see Chinese descriptions without split engine terminology');
});
