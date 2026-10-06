import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { createRun, previewPlacement } from '../src/domain/engine.ts';
import { createProfile } from '../src/application/profile.ts';
import { slotForTier } from '../src/application/run-slots.ts';
import { COLOR_TIERS, MIXED_COLOR_PERCENT } from '../src/domain/v5/content.ts';
import { getUiControls } from '../src/presentation/ui.ts';
import { InputController } from '../src/presentation/input.ts';
import { render } from '../src/presentation/renderer.ts';
import { getTrayRects, L } from '../src/presentation/layout.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
import type { UiAction } from '../src/presentation/ui-types.ts';
import type { ColorTier, Piece, RunState } from '../src/domain/types.ts';

const view = (patch: Partial<ViewState> = {}): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null,
  paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, screen: 'game', profile: createProfile(), ...patch });
const run = (tier: ColorTier = 'entry'): RunState => createRun(97, 'color_exit', 5, tier);
const mixed: Piece = { id: 'mixed', shapeId: 'shape.square', cargo: 'cargo.food', cellCargos: ['cargo.food', 'cargo.food', 'cargo.chem', 'cargo.chem'] };
function surface() {
  const canvas = createCanvas(1080, 1920), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const labels: { text: string; x: number; y: number }[] = [], borders: { x: number; y: number; dash: number[] }[] = [];
  const fillText = ctx.fillText.bind(ctx), strokeRect = ctx.strokeRect.bind(ctx);
  ctx.fillText = (text, x, y) => { labels.push({ text, x, y }); fillText(text, x, y); };
  ctx.strokeRect = (x, y, w, h) => { borders.push({ x, y, dash: ctx.getLineDash() }); strokeRect(x, y, w, h); };
  return { ctx, labels, borders, words: () => labels.map(label => label.text).join('\n') };
}
const tierNames = { entry: '入门', middle: '中段', late: '后段' } as const;

// Old saves remain readable, but all new outbound games start at the v6 selector.
test('legacy state uses the new home selectors', () => {
  const controls = getUiControls(run(), view({ screen: 'menu' }));
  assert.deepEqual(controls.map(control=>control.action.type),['chooseInbound','chooseColorTier','settings']);
  assert.match(controls[1].label,/出库模式/);
});

test('legacy screen offers only existing saved result and corrupt slots', () => {
  const current = view({ screen: 'legacyRuns', modeSlots: { color_exit: 'corrupt', color_exit_entry: 'saved', color_exit_middle: 'result', color_exit_late: 'empty' } });
  const controls = getUiControls(run(), current), out = surface(); render(out.ctx, run(), current);
  assert.deepEqual(controls.flatMap(control=>control.action.type==='switchMode'?[control.action.variant]:[]),['color_exit','color_exit_entry','color_exit_middle']);
  assert.equal(controls.some(control=>control.action.type==='newRun'),false);
  assert.match(controls.find(control => control.action.type === 'switchMode' && control.action.variant === 'color_exit_entry')!.label, /继续/);
  assert.match(controls.find(control => control.action.type === 'switchMode' && control.action.variant === 'color_exit_middle')!.label, /结算/);
  assert.match(controls.find(control => control.action.type === 'switchMode' && control.action.variant === 'color_exit')!.label, /纯色.*\n存档待处理/);
  assert.match(out.words(), /旧版出库.*7×7/);assert.match(out.words(), /9×9难度选择/);
});

test('empty and unavailable legacy slots do not create compatibility controls', () => {
  for (const status of ['empty', 'unavailable'] as const) {
    const controls = getUiControls(run(), view({ screen: 'colorTiers', modeSlots: { color_exit: status } }));
    assert.equal(controls.some(control => control.action.type === 'chooseLegacy'), false);
  }
});

test('tier controls are nonoverlapping, in bounds, and each responds to a real tap', () => {
  const state = run(), v = view({ screen: 'colorTiers', modeSlots: { color_exit: 'saved' } }), actions: UiAction[] = [];
  const input = new InputController({ getState: () => state, getView: () => v, patchView: patch => Object.assign(v, patch), preview: () => ({ valid: false, cells: [], shipments: [] }), dispatch: () => assert.fail('selector cannot place'), togglePause: () => {}, restart: () => {}, resume: () => {}, toggleDebug: () => {}, action: action => actions.push(action) });
  const controls = getUiControls(state, v); assert.equal(controls.length, 7);
  for (const [index, control] of controls.entries()) {
    const r = control.rect; assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= L.width && r.y + r.h <= L.height);
    for (const other of controls.slice(index + 1)) assert.ok(!(r.x < other.rect.x + other.rect.w && r.x + r.w > other.rect.x && r.y < other.rect.y + other.rect.h && r.y + r.h > other.rect.y));
    const point = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; input.down(point); input.up(point);
    assert.deepEqual(actions[actions.length - 1], control.action);
  }
});

test('legacy terminal restart leads to new difficulty selection without recreating v5', () => {
  for (const tier of COLOR_TIERS) for (const screen of ['game', 'menu'] as const) {
    const state = { ...run(tier), phase: 'result' as const, result: 'won' as const };
    const controls=getUiControls(state,view({screen}));
    assert.ok(controls.some(control=>control.action.type==='chooseColorTier'));
    assert.equal(controls.some(control=>control.action.type==='newRun'),false);
  }
});

test('legacy switches identify target save and restart asks before leaving for new difficulties', () => {
  for (const tier of COLOR_TIERS) {
    const state = run(tier), switched = surface(), restarted = surface();
    render(switched.ctx, state, view({ confirmation: { kind: 'switchMode', variant: slotForTier(tier) } }));
    assert.match(switched.words(), new RegExp(`切换到.*${tierNames[tier]}`)); assert.match(switched.words(), /保留/); assert.match(switched.words(), /取消/);
    render(restarted.ctx, state, view({ confirmation: { kind: 'leaveRun', nextScreen:'colorTiers' } }));
    assert.match(restarted.words(), /结束本局并选择新难度？/);assert.match(restarted.words(), /当前棋盘进度不会保留/);assert.match(restarted.words(), /历史成绩和设置不受影响/);
  }
});

test('v5 header, footer, pause, result and recovery retain tier identity without pretending shape stages change mixed ratio', () => {
  for (const tier of COLOR_TIERS) for (const shift of [1, 5]) for (const patch of [{}, { paused: true }, { needsResume: true }, { result: true }]) {
    const state = { ...run(tier), shift }, v = view(patch); if ('result' in patch) Object.assign(state, { phase: 'result', result: 'won', completedOrders: 30 });
    const out = surface(); render(out.ctx, state, v);
    assert.match(out.words(), new RegExp(`${tierNames[tier]}.*${MIXED_COLOR_PERCENT[tier]}%`));
    assert.match(out.words(), new RegExp(`形状.*${shift}|形状开放.*${shift}`));
    assert.doesNotMatch(out.words(), /第 [15] 档|托盘占1格|加急.*废弃物/);
    if ('result' in patch) assert.match(out.words(), /本档.*成绩|各档.*独立/);
  }
});

test('v5 first help explicitly shows two-plus-two is not four of one color and the other half stays', () => {
  const out = surface(); render(out.ctx, run('middle'), view({ screen: 'colorIntro' }));
  assert.match(out.words(), /中段.*30%/); assert.match(out.words(), /2.*\+.*2.*不等于.*同色4件/); assert.match(out.words(), /机械2件留原格/); assert.match(out.words(), /逐件概率/);
});

// With the same board and shape, each mixed tile must match the corresponding pure-cargo tile artwork.
test('tray, hover and drag draw each mixed cell with its own cargo artwork', () => {
  const state = run(); state.board.fill(null); state.candidates = [mixed];
  for (const presentation of ['tray', 'hover', 'drag'] as const) {
    const v = view(presentation === 'tray' ? {} : presentation === 'hover'
      ? { selectedPieceId: 'mixed', hoverOrigin: { x: 1, y: 2 }, preview: { valid: true, cells: [15, 16, 22, 23], shipments: [] } }
      : { selectedPieceId: 'mixed', dragPoint: { x: 520, y: 940 } });
    const output = surface(); render(output.ctx, state, v); assert.match(output.words(), /双色·食品\/化工/);
    for (const [index, cargo] of mixed.cellCargos!.entries()) {
      const pure = surface(), pureState = { ...state, candidates: [{ id: 'mixed', shapeId: 'shape.square', cargo }] };
      render(pure.ctx, pureState, v);
      const tray = getTrayRects(1)[0];
      const cell = presentation === 'tray' ? 74 : 120;
      const x = presentation === 'tray' ? tray.x + (tray.w - 148) / 2 : presentation === 'hover' ? L.board.x + 120 + 5 : 520 - 55;
      const y = presentation === 'tray' ? tray.y + 31 + (166 - 148) / 2 : presentation === 'hover' ? L.board.y + 240 + 4 : 940 - 55;
      const pixelX = Math.round(x + index % 2 * cell + 25), pixelY = Math.round(y + Math.floor(index / 2) * cell + 25);
      assert.deepEqual([...output.ctx.getImageData(pixelX, pixelY, 12, 12).data], [...pure.ctx.getImageData(pixelX, pixelY, 12, 12).data], `${presentation}: cell ${index} should match ${cargo}`);
    }
  }
});

test('actual renderer integrates retained mixed-cell outlines after a half shipment preview', () => {
  const state = run(); state.board.fill(null); state.board[3] = 'cargo.food'; state.board[4] = 'cargo.food'; state.candidates = [mixed];
  const out = surface(); render(out.ctx, state, view({ selectedPieceId: mixed.id, hoverOrigin: { x: 3, y: 1 }, preview: previewPlacement(state, mixed.id, { x: 3, y: 1 }) }));
  const retained = out.borders.filter(border => border.dash.join(',') === '8,6');
  assert.deepEqual(retained.map(border => [border.x, border.y]), [[L.board.x + 3 * 120 + 7, L.board.y + 2 * 120 + 7], [L.board.x + 4 * 120 + 7, L.board.y + 2 * 120 + 7]]);
  assert.match(out.words(), /食品4件.*化工2件/);
});

test('a dragged mixed piece also keeps both cargo bands visible in its landing preview', () => {
  const state = run(); state.board.fill(null); state.candidates = [mixed];
  const v = view({ selectedPieceId: mixed.id, hoverOrigin: { x: 1, y: 2 }, dragPoint: { x: 780, y: 1100 }, preview: { valid: true, cells: [15, 16, 22, 23], shipments: [] } });
  const mixedOut = surface(), allFood = surface(); render(mixedOut.ctx, state, v); render(allFood.ctx, { ...state, candidates: [{ id: mixed.id, shapeId: 'shape.square', cargo: 'cargo.food' }] }, v);
  const x = L.board.x + 120 + 30, y = L.board.y + 360 + 29;
  assert.notDeepEqual([...mixedOut.ctx.getImageData(x, y, 12, 12).data], [...allFood.ctx.getImageData(x, y, 12, 12).data], 'chemical landing cell must not be a generic green footprint during drag');
});

test('legacy scores appear only in compatibility screen and stay separate per tier', () => {
  const profile = createProfile();
  profile.colorExit = { stats: { runs: 1, batches: 4, wins: 0, maxChain: 1 }, bestScores: { v4: { score: 900, chain: 1 } }, lastRecordedRun: null };
  profile.colorComparisons = Object.fromEntries(COLOR_TIERS.map((tier, index) => [tier, { stats: { runs: 1, batches: 1, wins: 0, maxChain: 1 }, bestScores: { v5: { score: 100 + index * 100, chain: 1 } }, lastRecordedRun: null }]));
  const current=view({screen:'legacyRuns',profile,modeSlots:{color_exit:'result',color_exit_entry:'saved',color_exit_middle:'result',color_exit_late:'saved'}}),legacy=surface();render(legacy.ctx,run(),current);
  assert.match(legacy.words(), /旧纯色最高分 900/);
  for (const index of [0,1,2]) assert.match(legacy.words(), new RegExp(`本档最高分 ${100 + index * 100}`));
  for(const screen of ['menu','colorTiers'] as const){const output=surface();render(output.ctx,run(),{...current,screen});assert.doesNotMatch(output.words(),/最高分 (900|100|200|300)/);}
});
