import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, applyCommand } from '../src/domain/engine.ts';
import { createProfile } from '../src/application/profile.ts';
import { upgradeAccountGuides } from '../src/application/account-guides.ts';
import { retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { makeAccountFixture } from './helpers/account-fixtures.ts';
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

test('menu exposes two mode selectors regardless of saved state', () => {
  for(const status of ['empty','saved','result'] as const){
    const controls=getUiControls(run(),view({screen:'menu',modeSlots:{orders:status,color_exit:status}}));
    assert.deepEqual(controls.map(c=>c.action),[{type:'chooseInbound'},{type:'chooseColorTier'},{type:'helpMenu'},{type:'shop'},{type:'settings'}]);
    assert.match(controls[0].label,/入库模式/);assert.match(controls[1].label,/出库模式/);
  }
});

test('all screen controls are positive, nonoverlapping and inside the shared logical viewport', () => {
  const screens: ViewState[] = [view({ screen: 'menu' }), view({ screen: 'settings', profileStatus: '长期记录无法读取', profileNeedsRecovery: true }), view({ paused: true }), view(), ...(['newRun', 'resetProfile', 'finishOvertime'] as const).map(kind => view({ confirmation: { kind } }))];
  for (const current of screens) {
    const controls = getUiControls(current.paused ? { ...run(), overtime: true } : result({ overtime: true }), current);
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
  assert.equal(getUiControls(result(), view({ screen: 'menu', paused: true }))[0]?.action.type, 'chooseInbound');
  assert.equal(getUiControls(result(), view({ screen: 'settings', paused: true }))[0]?.action.type, 'toggleMusic');
  assert.deepEqual(getUiControls(result(), view({ paused: true })), getUiControls(result(), view()));
  const output=surface();render(output.ctx,result(),view({paused:true}));assert.match(output.words(),/完美收工/);assert.doesNotMatch(output.words(),/已暂停|玩法说明/);
});

test('settings show real Profile toggles and record recovery while appearance lives in the shop', () => {
  const profile = createProfile(); profile.settings.sound = false; profile.settings.reducedMotion = true;
  let controls = getUiControls(run(), view({ screen: 'settings', profile }));
  assert.equal(controls.find(c => c.action.type === 'toggleMusic')?.selected, true);
  assert.equal(controls.find(c => c.action.type === 'toggleSound')?.selected, false);
  assert.equal(controls.find(c => c.action.type === 'toggleMotion')?.selected, true);
  assert.deepEqual(controls.map(c => c.action.type), ['toggleMusic', 'toggleSound', 'toggleVibration', 'toggleMotion', 'resetProfile', 'back']);
  const output = surface(); render(output.ctx, run(), view({ screen: 'settings', profile }));
  assert.doesNotMatch(output.words(), /仓库主题|叉车涂装|货箱样式/);
  profile.achievements = ['first_shipment', 'five_shifts'];
  controls = getUiControls(run(), view({ screen: 'settings', profile, profileStatus: '主记录不可用，可恢复上一份长期记录备份', profileNeedsRecovery: true }));
  assert.deepEqual(controls.map(c => c.action.type), ['toggleMusic', 'toggleSound', 'toggleVibration', 'toggleMotion', 'recoverProfile', 'resetProfile', 'back']);
  assert.ok(controls.some(c => c.action.type === 'recoverProfile'));
  assert.ok(controls.some(c => c.action.type === 'resetProfile'));
  assert.equal(getUiControls(run(), view({ screen: 'settings', profileStatus: '长期记录已保存' })).some(c => c.action.type === 'recoverProfile'), false);
});

test('pause offers safe continue, restart, home, settings and optional help with separate overtime settlement', () => {
  assert.deepEqual(getUiControls(run(), view({ paused: true })).map(c => c.action.type), ['continue', 'newRun', 'home', 'settings', 'help']);
  assert.deepEqual(getUiControls({ ...run(), overtime: true }, view({ paused: true })).map(c => c.action.type), ['continue', 'newRun', 'home', 'settings', 'help', 'finishOvertime']);
});

test('only v3 five-shift standard victory offers overtime; every terminal mode offers home', () => {
  assert.ok(getUiControls(result(), view()).some(c => c.action.type === 'continueOvertime'));
  for (const patch of [{ mode: 'daily' as const }, { mode: 'tutorial' as const }, { overtime: true }, { result: 'failed' as const }, { rulesetVersion: 2 }, { shift: 4 }]) {
    const controls = getUiControls(result(patch), view());
    assert.equal(controls.some(c => c.action.type === 'continueOvertime'), false);
    assert.ok(controls.some(c => c.action.type === 'home'));
  }
  const daily = getUiControls(result({ mode: 'daily' }), view()).find(c => c.action.type === 'newRun');
  assert.deepEqual(daily?.action, { type: 'newRun', mode: 'rush' });
  assert.equal(getUiControls(result({ mode: 'tutorial' }), view()).find(c => c.action.type === 'newRun')?.label, '开始正式值班');
});

test('controls are pure geometry and their visible captions share hit-test centers', () => {
  const state = result(), current = view({ screen: 'menu', canContinue: true, dailyLabel: '2031-04-07' });
  const before = JSON.stringify({ state, current });
  const controls = getUiControls(state, current), output = surface(); assert.equal(controls.length, 5); render(output.ctx, state, current);
  assert.equal(JSON.stringify({ state, current }), before);
  for (const control of controls) for(const line of control.label.split('\n')) assert.ok(output.labels.some(label => label.value === line && label.x === control.rect.x + control.rect.w / 2 && label.y > control.rect.y && label.y < control.rect.y + control.rect.h));
});

test('home shows achievements and real save status while inbound submenu owns scores and undated rush entry', () => {
  const profile = createProfile(); profile.bestScores['standard.v3'] = { score: 7654, chain: 3 }; profile.bestScores['overtime.v3'] = { score: 19876, chain: 5 }; profile.achievements = ['first_shipment'];
  const account=upgradeAccountGuides(retainAccountCosmetics(upgradeEconomy(makeAccountFixture()))),bucket=(score:number)=>({runs:1,units:1,maxUnits:1,score,wins:0,retirements:0,maxChain:1,best:{score,units:1,chain:1}});
  account.profile.results={'inbound.standard.v18.hard.plain':bucket(1234),'inbound.standard.v18.hard.tools':bucket(2456),'inbound.endless.v18.hard.plain':bucket(3456),'inbound.endless.v18.hard.tools':bucket(4567),'inbound.standard.v16.normal.plain':bucket(9911),'inbound.endless.v16.plain':bucket(9922)};
  assertAccountSnapshot(account);
  const current=view({screen:'menu',profile,account,dailyLabel:'2031-04-07',profileStatus:'保存失败，尚未持久化'}),home=surface(),inbound=surface();
  render(home.ctx,run(),current);render(inbound.ctx,run(),{...current,screen:'inboundMenu',inboundDifficulty:'hard'});
  assert.match(home.words(), /首次出货/);assert.doesNotMatch(home.words(), /无在线排行|本地记录模式/);
  assert.match(inbound.words(), /困难 · 五班/);assert.match(inbound.words(), /最高分 1,234/);assert.match(inbound.words(), /使用道具最高分 2,456/);assert.match(inbound.words(), /最高分 3,456/);assert.match(inbound.words(), /使用道具最高分 4,567/);assert.doesNotMatch(inbound.words(), /7,654|19,876|9,911|9,922|加班最高分/);assert.doesNotMatch(inbound.words(), /2031-04-07/);
  const legacyOnly=surface();render(legacyOnly.ctx,run(),{...current,account:null,screen:'inboundMenu',inboundDifficulty:'hard'});assert.match(legacyOnly.words(),/困难 · 五班/);assert.match(legacyOnly.words(),/最高分 暂无/);assert.doesNotMatch(legacyOnly.words(),/7,654|19,876/);
  assert.match(inbound.words(), /加急模式/);assert.doesNotMatch(inbound.words(), /北京时间|本地每日/);
  for(const output of [home,inbound]){assert.match(output.words(), /保存失败，尚未持久化/);assert.doesNotMatch(output.words(), /云同步/);}
});

test('confirmation copy explains resets and retains two explicit cancel/confirm buttons', () => {
  const output = surface(); render(output.ctx, run(), view({ screen: 'settings', confirmation: { kind: 'resetProfile' } }));
  assert.match(output.words(), /清空成绩和成就记录/); assert.match(output.words(), /金币、道具库存、已领奖励、设置和已拥有外观会保留/);
  assert.match(output.words(), /取消/); assert.match(output.words(), /确认重置/);
});

test('saved v3 tutorial board retains its shared tray and cargo through the historical prefix without teaching copy', () => {
  let state = createRun(7, 'tutorial', 3);
  const expected = [/把食品拖进虚线框/, /再接上1件食品，凑够订单/, /补上机械，清路后继续出货/];
  for (let step = 0; step < 3; step++) {
    const output = surface(); render(output.ctx, state, view());
    assert.doesNotMatch(output.words(), expected[step]); assert.equal(state.candidates.length, 1);
    const r = getTrayRects(1)[0];
    assert.ok(output.labels.some(label => label.value === (step === 2 ? '机械' : '食品') && label.x === r.x + r.w / 2));
    if (step === 2) assert.equal(output.labels.some(label => label.value === '机械 ×1' && label.y > L.board.y + 4 * L.board.cell),false);
    state = applyCommand(state, { type: 'place', pieceId: state.candidates[0].id, origin: step === 0 ? { x: 1, y: 1 } : step === 1 ? { x: 3, y: 1 } : { x: 3, y: 4 } }).state;
  }
});

test('terminal copy distinguishes tutorial, daily, standard and voluntary overtime without claiming five shifts for tutorial', () => {
  for (const [patch, expected] of [[{ mode: 'tutorial' }, /教学完成/], [{ mode: 'daily' }, /每日挑战/], [{ mode: 'standard' }, /五个班次/], [{ overtime: true, endReason: 'retired' }, /加班结算/]] as const) {
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
    assert.match(output.words(), /每日挑战.*2031-04-06/);
    assert.doesNotMatch(output.words(), /2031-04-07/);
  }
});

test('overtime result leaves persistence claims to the actual Profile save status', () => {
  for (const endReason of ['retired', 'blocked'] as const) {
    const output = surface();
    render(output.ctx, result({ overtime: true, endReason, result: endReason === 'retired' ? 'won' : 'failed' }), view({ profileStatus: '长期记录保存失败，旧记录已保护' }));
    assert.match(output.words(), /长期记录保存失败，旧记录已保护/);
    assert.doesNotMatch(output.words(), /本地记录模式|无在线排行|当前成绩进入本地记录|最高分留在本机|成绩仅保存在本机/);
  }
});
test('result lists measured peak occupancy and key upgrades without inventing legacy history',()=>{
 const measured=surface();render(measured.ctx,result({maxOccupancy:35,upgrades:['upgrade.side_gate','upgrade.chain']}),view());assert.match(measured.words(),/最高占用.*35\/49格/);assert.match(measured.words(),/关键升级/);assert.match(measured.words(),/侧门/);
 const old=surface();render(old.ctx,result(),view());assert.match(old.words(),/最高占用.*未记录/);assert.match(old.words(),/关键升级.*无/);
});
test('debug overlay presents paginated formal fields without extending below its controls',()=>{
 const first=surface();render(first.ctx,run(),view({developerMode:true,debug:true,debugPage:0}));assert.match(first.words(),/rng_state/);assert.match(first.words(),/last_checksum/);assert.match(first.words(),/下一页/);assert.ok(first.labels.filter(label=>label.value.startsWith('rng_state')).every(label=>label.y<1610));
 const second=surface();render(second.ctx,run(),view({developerMode:true,debug:true,debugPage:1}));assert.match(second.words(),/generation|weight|shape/);assert.match(second.words(),/上一页/);
 const player=surface();render(player.ctx,run(),view({debug:true}));assert.doesNotMatch(player.words(),/rng_state|last_checksum|下一页/);
});

test('each saved tutorial step hides retired board instructions and skip controls', () => {
 let state=createRun(7,'tutorial',3);
 const expected=['把食品拖进虚线框。','再接上1件食品，凑够订单。','补上机械，清路后继续出货。'];
 for(let step=0;step<3;step++){
  const output=surface();render(output.ctx,state,view());
  assert.deepEqual(output.labels.filter(label=>expected.includes(label.value)).map(label=>label.value),[]);
  assert.equal(output.labels.some(label=>label.value===expected[step]&&label.y===L.boardHint.y+L.boardHint.h/2),false);
  assert.deepEqual(getUiControls(state,view()).map(control=>control.action),[]);
  assert.doesNotMatch(output.words(),/第[123]步|北门要3件食品|北门被机械挡住/);
  state=applyCommand(state,{type:'place',pieceId:state.candidates[0].id,origin:[{x:1,y:1},{x:3,y:1},{x:3,y:4}][step]}).state;
 }
 const finished=surface();render(finished.ctx,state,view());assert.match(finished.words(),/每班6单.*5班/);assert.doesNotMatch(finished.words(),/跳过教学/);
});

test('pause keeps the current goal concise and moves basic and special rules into optional help', () => {
 for(const [patch,goal] of [[{},/第1班.*本班0\/6单/],[{mode:'daily'},/第1班.*本班0\/6单/],[{overtime:true},/加班挑战.*得分/],[{mode:'tutorial'},/入库教学/]] as const){
  const state={...run(),...patch} as RunState,output=surface();render(output.ctx,state,view({paused:true}));
  assert.match(output.words(),goal);assert.match(output.words(),/玩法说明/);assert.doesNotMatch(output.words(),/同类货物上下左右|托盘：占1格|新单等下一次/);
  const help=surface();render(help.ctx,state,view({screen:'colorIntro'}));
  assert.match(help.words(),/按订单配货，同类货物上下左右相连/);assert.match(help.words(),/数量达标.*留出空路/);assert.match(help.words(),/货件不能旋转/);
  assert.doesNotMatch(help.words(),/托盘：占1格|加急：/);
  assert.deepEqual(getUiControls(state,view({screen:'colorIntro'})).map(control=>control.action.type),['helpDetails','toolsHelp','helpBack']);
  const details=surface();render(details.ctx,state,view({screen:'helpDetails'}));
  assert.match(details.words(),/托盘：占1格，计2件/);assert.match(details.words(),/加急：.*废弃箱/);assert.match(details.words(),/新单等下一次放置/);
  assert.deepEqual(getUiControls(state,view({screen:'helpDetails'})).map(control=>control.action.type),['help']);
 }
});
