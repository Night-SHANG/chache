import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, applyCommand } from '../src/domain/engine.ts';
import { createProfile, FORKLIFTS } from '../src/application/profile.ts';
import { L, hitTestPoint, getTrayRects, type Rect } from '../src/presentation/layout.ts';
import { getUiControls } from '../src/presentation/ui.ts';
import { render } from '../src/presentation/renderer.ts';
import { cargoBox, forklift } from '../src/presentation/assets.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
import type { RunState } from '../src/domain/types.ts';

const view = (patch: Partial<ViewState> = {}): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, screen: 'game', profile: createProfile(), ...patch });
const run = (): RunState => createRun(7, 'standard', 3);
const result = (patch: Partial<RunState> = {}): RunState => ({ ...run(), phase: 'result', result: 'won', shift: 5, completedOrders: 30, ...patch });
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function surface() {
  const labels: { value: string; x: number; y: number }[] = [], fills: string[] = [], strokes: { color: string; width: number }[] = [], gradients: string[] = [];
  const values: Record<string, unknown> = { globalAlpha: 1 };
  const operations = new Set(['save', 'restore', 'clearRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'arc', 'ellipse', 'clip', 'translate', 'scale', 'rotate', 'setLineDash', 'strokeText']);
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === 'fillText') return (value: string, x: number, y: number) => labels.push({ value, x, y });
      if (key === 'fill' || key === 'fillRect') return () => fills.push(String(values.fillStyle));
      if (key === 'stroke' || key === 'strokeRect') return () => strokes.push({ color: String(values.strokeStyle), width: Number(values.lineWidth) });
      if (key === 'createLinearGradient') return () => ({ addColorStop(_at: number, color: string) { gradients.push(color); } });
      if (key === 'measureText') return (value: string) => ({ width: value.length * Number(String(values.font).match(/([\d.]+)px/)?.[1] ?? 24) });
      if (operations.has(String(key))) return () => {};
      if (key in values) return values[String(key)];
      throw Error(`Unsupported Canvas API ${String(key)}`);
    },
    set(_target, key, value) { values[String(key)] = value; return true; },
  }) as CanvasRenderingContext2D;
  return { ctx, labels, fills, strokes, gradients, words: () => labels.map(label => label.value).join('\n') };
}

test('menu exposes both independent modes and the selected-mode new-run action', () => {
  const controls=getUiControls(run(),view({screen:'menu',modeSlots:{orders:'empty',color_exit:'empty'}}));
  assert.deepEqual(controls.map(c=>c.action),[{type:'switchMode',variant:'orders'},{type:'chooseColorTier'},{type:'newRun',mode:'standard'},{type:'newRun',mode:'daily'},{type:'settings'}]);
  assert.match(controls[0].label,/开始/);
  const saved=getUiControls(run(),view({screen:'menu',modeSlots:{orders:'saved',color_exit:'result'}}));assert.match(saved[0].label,/继续进度/);assert.equal(saved[1].action.type,'chooseColorTier');
});

test('all screen controls are positive, nonoverlapping and inside the shared logical viewport', () => {
  const screens: ViewState[] = [view({ screen: 'menu' }), view({ screen: 'settings', profileStatus: '长期记录无法读取', profileNeedsRecovery: true }), view({ paused: true }), view(), ...(['newRun', 'resetProfile', 'finishOvertime'] as const).map(kind => view({ confirmation: { kind } }))];
  for (const current of screens) {
    const controls = getUiControls(result({ overtime: true }), current);
    assert.ok(controls.length >= 2);
    for (const [index, control] of controls.entries()) {
      const r = control.rect;
      assert.ok(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= L.width && r.y + r.h <= L.height);
      assert.ok(hitTestPoint({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, r));
      for (const other of controls.slice(index + 1)) assert.equal(overlaps(r, other.rect), false);
    }
  }
});

test('confirmation is the only actionable layer even above settings, pause and an old-save overlay', () => {
  const current = view({ screen: 'settings', paused: true, needsResume: true, confirmation: { kind: 'resetProfile' } });
  assert.deepEqual(getUiControls(result(), current).map(c => c.action.type), ['cancel', 'confirm']);
  assert.deepEqual(getUiControls(run(), view({ needsResume: true })), []);
  assert.deepEqual(getUiControls(run(), view()), []);
});

test('menu and settings controls take precedence over paused and terminal runs', () => {
  assert.equal(getUiControls(result(), view({ screen: 'menu', paused: true }))[0]?.action.type, 'switchMode');
  assert.equal(getUiControls(result(), view({ screen: 'settings', paused: true }))[0]?.action.type, 'toggleSound');
});

test('settings use Profile metadata, show real toggles, and disable only locked forklift skins', () => {
  const profile = createProfile(); profile.settings.sound = false; profile.settings.reducedMotion = true;
  let controls = getUiControls(run(), view({ screen: 'settings', profile }));
  assert.equal(controls.find(c => c.action.type === 'toggleSound')?.selected, false);
  assert.equal(controls.find(c => c.action.type === 'toggleMotion')?.selected, true);
  assert.equal(controls.filter(c => c.action.type === 'cosmetic').length, 7);
  for (const skin of FORKLIFTS) assert.equal(controls.find(c => c.action.type === 'cosmetic' && c.action.kind === 'forklift' && c.action.id === skin.id)?.disabled, !!skin.achievementId);
  profile.achievements = ['first_shipment', 'five_shifts'];
  controls = getUiControls(run(), view({ screen: 'settings', profile, profileStatus: '主记录不可用，可恢复上一份长期记录备份', profileNeedsRecovery: true }));
  assert.equal(controls.filter(c => c.action.type === 'cosmetic' && c.disabled).length, 0);
  assert.ok(controls.some(c => c.action.type === 'recoverProfile'));
  assert.ok(controls.some(c => c.action.type === 'resetProfile'));
  assert.equal(getUiControls(run(), view({ screen: 'settings', profileStatus: '长期记录已保存' })).some(c => c.action.type === 'recoverProfile'), false);
});

test('pause offers continue, preserved home and settings; only overtime can be finished', () => {
  assert.deepEqual(getUiControls(run(), view({ paused: true })).map(c => c.action.type), ['continue', 'home', 'settings']);
  assert.deepEqual(getUiControls({ ...run(), overtime: true }, view({ paused: true })).map(c => c.action.type), ['continue', 'home', 'settings', 'finishOvertime']);
});

test('only v3 five-shift standard victory offers overtime; every terminal mode offers home', () => {
  assert.ok(getUiControls(result(), view()).some(c => c.action.type === 'continueOvertime'));
  for (const patch of [{ mode: 'daily' as const }, { mode: 'tutorial' as const }, { overtime: true }, { result: 'failed' as const }, { rulesetVersion: 2 }, { shift: 4 }]) {
    const controls = getUiControls(result(patch), view());
    assert.equal(controls.some(c => c.action.type === 'continueOvertime'), false);
    assert.ok(controls.some(c => c.action.type === 'home'));
  }
  const daily = getUiControls(result({ mode: 'daily' }), view()).find(c => c.action.type === 'newRun');
  assert.deepEqual(daily?.action, { type: 'newRun', mode: 'daily' });
  assert.equal(getUiControls(result({ mode: 'tutorial' }), view()).find(c => c.action.type === 'newRun')?.label, '开始正式值班');
});

test('controls are pure geometry and their visible captions share hit-test centers', () => {
  const state = result(), current = view({ screen: 'menu', canContinue: true, dailyLabel: '2031-04-07' });
  const before = JSON.stringify({ state, current });
  const controls = getUiControls(state, current), output = surface(); assert.equal(controls.length, 5); render(output.ctx, state, current);
  assert.equal(JSON.stringify({ state, current }), before);
  for (const control of controls) assert.ok(output.labels.some(label => label.value === control.label && label.x === control.rect.x + control.rect.w / 2 && label.y === control.rect.y + control.rect.h / 2));
});

test('menu shows local achievements, versioned best score, supplied Beijing date and real save status', () => {
  const profile = createProfile(); profile.bestScores['standard.v3'] = { score: 7654, chain: 3 }; profile.bestScores['overtime.v3'] = { score: 19876, chain: 5 }; profile.achievements = ['first_shipment'];
  const output = surface(); render(output.ctx, run(), view({ screen: 'menu', profile, dailyLabel: '2031-04-07', profileStatus: '保存失败，尚未持久化' }));
  assert.match(output.words(), /7,654/); assert.match(output.words(), /加班最高分.*19,876/); assert.match(output.words(), /首次出货/); assert.match(output.words(), /2031-04-07/);
  assert.match(output.words(), /北京时间/); assert.match(output.words(), /本地每日挑战/); assert.match(output.words(), /无在线排行/);
  assert.match(output.words(), /保存失败，尚未持久化/); assert.doesNotMatch(output.words(), /云同步/);
});

test('confirmation copy explains resets and retains two explicit cancel/confirm buttons', () => {
  const output = surface(); render(output.ctx, run(), view({ screen: 'settings', confirmation: { kind: 'resetProfile' } }));
  assert.match(output.words(), /当前值班.*保留/); assert.match(output.words(), /之后.*结算.*新记录/);
  assert.match(output.words(), /取消/); assert.match(output.words(), /确认重置/);
});

test('v3 tutorial uses one shared tray, two food placements and the south-to-north route-clearing lesson', () => {
  let state = createRun(7, 'tutorial', 3);
  const expected = [/第1步.*食品.*虚线/, /第2步.*食品.*3/, /第3步.*机械.*清路/];
  for (let step = 0; step < 3; step++) {
    const output = surface(); render(output.ctx, state, view());
    assert.match(output.words(), expected[step]); assert.equal(state.candidates.length, 1);
    const r = getTrayRects(1)[0];
    assert.ok(output.labels.some(label => label.value === (step === 2 ? '机械' : '食品') && label.x === r.x + r.w / 2));
    if (step === 2) { assert.match(output.words(), /南门.*北门/); assert.ok(output.labels.some(label => label.value === '机械 ×1' && label.y > L.board.y + 4 * L.board.cell)); }
    state = applyCommand(state, { type: 'place', pieceId: state.candidates[0].id, origin: step === 0 ? { x: 1, y: 1 } : step === 1 ? { x: 3, y: 1 } : { x: 3, y: 4 } }).state;
  }
});

test('terminal copy distinguishes tutorial, daily, standard and voluntary overtime without claiming five shifts for tutorial', () => {
  for (const [patch, expected] of [[{ mode: 'tutorial' }, /教学完成/], [{ mode: 'daily' }, /本地每日挑战/], [{ mode: 'standard' }, /五个班次/], [{ overtime: true, endReason: 'retired' }, /加班结算/]] as const) {
    const output = surface(); render(output.ctx, result(patch), view({ dailyLabel: '2031-04-07' }));
    assert.match(output.words(), expected);
    if (patch.mode === 'tutorial') assert.doesNotMatch(output.words(), /五个班次全部完成/);
  }
});

test('theme, forklift color and cargo outline affect canvas output without changing the run', () => {
  const state = run(); state.board[8] = 'cargo.food'; const snapshot = JSON.stringify(state);
  const day = surface(), night = surface(), profile = createProfile();
  render(day.ctx, state, view({ profile }));
  profile.cosmetics = { theme: 'night', forklift: 'blue', cargo: 'outline' };
  render(night.ctx, state, view({ profile }));
  assert.notDeepEqual(day.gradients, night.gradients); assert.notDeepEqual(day.fills, night.fills); assert.notDeepEqual(day.strokes, night.strokes);
  assert.equal(JSON.stringify(state), snapshot);
});

test('optional assets arguments preserve defaults and draw distinct red/blue paint and stronger cargo outlines', () => {
  const yellow = surface(), blue = surface(), red = surface();
  forklift(yellow.ctx, 0, 0, 110, 0); forklift(blue.ctx, 0, 0, 110, 0, 'blue'); forklift(red.ctx, 0, 0, 110, 0, 'red');
  assert.notDeepEqual(yellow.fills, blue.fills); assert.notDeepEqual(blue.fills, red.fills);
  const classic = surface(), outline = surface();
  cargoBox(classic.ctx, 'cargo.food', 0, 0, 110); cargoBox(outline.ctx, 'cargo.food', 0, 0, 110, 1, undefined, 'outline');
  assert.ok(outline.strokes.some(stroke => stroke.width > Math.max(...classic.strokes.map(item => item.width))));
});

test('outline style follows single tray artwork and its dragged ghost, not only the board', () => {
  const state = run(), profile = createProfile(), output = surface();
  state.board = Array(49).fill(null); state.candidates = [{ id: 'chosen', cargo: 'cargo.food', shapeId: 'shape.single' }];
  profile.cosmetics.cargo = 'outline';
  render(output.ctx, state, view({ profile, selectedPieceId: 'chosen', dragPoint: { x: 540, y: 950 } }));
  assert.equal(output.strokes.filter(stroke => stroke.color === '#fff6d6' && stroke.width === 5).length, 2);
});

test('terminal commands and result overlay stay hidden while the final shipment is animating', () => {
  const state = result(), current = view({ animation: { board: state.board, progress: .5, shipment: { type: 'shipment', dockId: 'dock.north', orderId: 'old', cargo: 'cargo.food', cells: [8], path: [{ x: 3, y: 0 }], score: 100, chain: 1 } } });
  assert.deepEqual(getUiControls(state, current), []);
  const output = surface(); render(output.ctx, state, current);
  assert.doesNotMatch(output.words(), /继续加班|再来一局|完美收工/);
});

test('resumed daily gameplay labels its saved day instead of substituting the current menu day', () => {
  const state = { ...run(), mode: 'daily' as const, challengeDay: '2031-04-06', challengeId: 'daily.2031-04-06.v3' };
  for (const needsResume of [false, true]) {
    const output = surface(); render(output.ctx, state, view({ dailyLabel: '2031-04-07', needsResume }));
    assert.match(output.words(), /本地每日.*2031-04-06/);
    assert.doesNotMatch(output.words(), /2031-04-07/);
  }
});

test('overtime result leaves persistence claims to the actual Profile save status', () => {
  for (const endReason of ['retired', 'blocked'] as const) {
    const output = surface();
    render(output.ctx, result({ overtime: true, endReason, result: endReason === 'retired' ? 'won' : 'failed' }), view({ profileStatus: '长期记录保存失败，旧记录已保护' }));
    assert.match(output.words(), /长期记录保存失败，旧记录已保护/);
    assert.match(output.words(), /本地记录模式 · 无在线排行/);
    assert.doesNotMatch(output.words(), /当前成绩进入本地记录|最高分留在本机|成绩仅保存在本机/);
  }
});
test('result lists measured peak occupancy and key upgrades without inventing legacy history',()=>{
 const measured=surface();render(measured.ctx,result({maxOccupancy:35,upgrades:['upgrade.side_gate','upgrade.chain']}),view());assert.match(measured.words(),/最高占用.*71%/);assert.match(measured.words(),/关键升级/);assert.match(measured.words(),/侧门/);
 const old=surface();render(old.ctx,result(),view());assert.match(old.words(),/最高占用.*未记录/);assert.match(old.words(),/关键升级.*无/);
});
test('debug overlay presents paginated formal fields without extending below its controls',()=>{
 const first=surface();render(first.ctx,run(),view({debug:true,debugPage:0}));assert.match(first.words(),/rng_state/);assert.match(first.words(),/last_checksum/);assert.match(first.words(),/下一页/);assert.ok(first.labels.filter(label=>label.value.startsWith('rng_state')).every(label=>label.y<1610));
 const second=surface();render(second.ctx,run(),view({debug:true,debugPage:1}));assert.match(second.words(),/generation|weight|shape/);assert.match(second.words(),/上一页/);
});

test('three teaching steps explain the order requirement, matching icons and the blocked route', () => {
 let state=createRun(7,'tutorial',3);
 const expected=[/北门要3件食品/,/上下左右/,/北门被机械挡住/];
 for(let step=0;step<3;step++){
  const output=surface();render(output.ctx,state,view());assert.match(output.words(),expected[step]);
  state=applyCommand(state,{type:'place',pieceId:state.candidates[0].id,origin:[{x:1,y:1},{x:3,y:1},{x:3,y:4}][step]}).state;
 }
 const finished=surface();render(finished.ctx,state,view());assert.match(finished.words(),/每班6单.*5班/);assert.match(finished.words(),/候选全放不下.*失败/);
});

test('pause prioritizes basic rules and gives the correct standard daily overtime or tutorial goal', () => {
 for(const [patch,goal] of [[{},/目标：每班6单.*5班/],[{mode:'daily'},/今日目标：每班6单.*5班/],[{overtime:true},/加班目标：继续接单追分/],[{mode:'tutorial'},/练习目标：学会按订单凑货/]] as const){
  const state={...run(),...patch} as RunState,output=surface();render(output.ctx,state,view({paused:true}));
  assert.match(output.words(),goal);assert.match(output.words(),/匹配的货类/);assert.match(output.words(),/同图标上下左右/);assert.match(output.words(),/新单等下一次落子/);assert.match(output.words(),/无订单先备货/);assert.match(output.words(),/候选全放不下/);
  if(state.overtime)assert.doesNotMatch(output.words(),/目标：每班6单/);
  const basic=output.labels.find(label=>label.value.includes('同图标上下左右'))!,special=output.labels.find(label=>label.value.includes('托盘占1格'))!;
  assert.ok(basic.y<special.y);assert.ok(output.labels.filter(label=>label.value.includes('新单等')).every(label=>label.y<L.resume.y-24));
 }
});
