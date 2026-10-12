import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as motion from '../src/presentation/motion.ts';
import { createRun } from '../src/domain/engine.ts';
import { createProfile } from '../src/application/profile.ts';
import { DOCKS } from '../src/domain/content.ts';
import { render } from '../src/presentation/renderer.ts';
import { getUiControls } from '../src/presentation/ui.ts';
import { L, cellCenter } from '../src/presentation/layout.ts';
import type { RunState, Shipment } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';

const view = (patch: Partial<ViewState> = {}): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile: createProfile(), ...patch });
const run = (): RunState => ({ ...createRun(7, 'standard', 3), board: Array(49).fill(null), candidates: [{ id: 'piece.feedback', cargo: 'cargo.food', shapeId: 'shape.single' }] });
const shipment = (patch: Partial<Shipment> = {}): Shipment => ({ type: 'shipment', dockId: 'dock.north', orderId: 'order.old', cargo: 'cargo.food', cells: [24], path: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], score: 450, chain: 1, ...patch });

/** Records actual Canvas2D output, and rejects APIs absent from the host baseline. */
function surface() {
  const labels: { value: string; x: number; y: number; size: number }[] = [];
  const draws: { kind: string; values: unknown[]; fill: unknown; stroke: unknown; alpha: unknown }[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const stack: Record<string, unknown>[] = [];
  const allowed = new Set(['drawImage', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'arc', 'ellipse', 'stroke', 'fill', 'clip', 'translate', 'scale', 'rotate', 'setLineDash', 'strokeText']);
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => { const old = stack.pop(); assert.ok(old); Object.keys(state).forEach(k => delete state[k]); Object.assign(state, old); };
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return (value: string) => ({ width: value.length * Number(String(state.font).match(/([\d.]+)px/)?.[1] ?? 24) * .65 });
      if (key === 'fillText') return (value: string, x: number, y: number) => labels.push({ value, x, y, size: Number(String(state.font).match(/([\d.]+)px/)?.[1] ?? 0) });
      if (allowed.has(String(key))) return (...values: unknown[]) => draws.push({ kind: String(key), values, fill: typeof state.fillStyle === 'object' ? 'gradient' : state.fillStyle, stroke: state.strokeStyle, alpha: state.globalAlpha });
      if (key in state) return state[String(key)];
      throw Error(`Unsupported Canvas API ${String(key)}`);
    },
    set(_target, key, value) {
      assert.ok(!['filter', 'shadowBlur', 'shadowColor'].includes(String(key)), `unsupported Canvas property ${String(key)}`);
      if (key === 'globalCompositeOperation') assert.equal(value, 'source-over');
      state[String(key)] = value; return true;
    },
  }) as CanvasRenderingContext2D;
  return { ctx, labels, draws, words: () => labels.map(label => label.value).join('\n'), stack };
}

test('motion contracts use independent 100ms placement and explicit inbound load carry exit stages', () => {
  assert.deepEqual(motion.MOTION, { placeMs: 100, invalidMs: 140, noticeMs: 650, failMs: 180, reduced: { placeMs: 0, invalidMs: 0, noticeMs: 240, failMs: 0 } });
  assert.deepEqual(motion.shipmentTiming(false), { routeMs: 100, moveMs: 260, collectMs: 140, carryMs: 360, exitMs: 140, totalMs: 1000 });
  assert.deepEqual(motion.shipmentTiming(true), { routeMs: 0, moveMs: 0, collectMs: 80, carryMs: 0, exitMs: 0, totalMs: 80 });
});

test('linear shipment clock lights the path, loads, carries, and exits in order', () => {
  assert.equal(motion.shipmentFrame(.05, false).route, .5);
  assert.equal(motion.shipmentFrame(.099, false).move, 0);
  assert.equal(motion.shipmentFrame(.1, false).stage, 'move');
  const halfway=motion.shipmentFrame(.23,false);assert.equal(halfway.move,.5);assert.equal(halfway.collect,0);
  assert.equal(motion.shipmentFrame(.359,false).stage,'move');
  assert.equal(motion.shipmentFrame(.36,false).stage,'collect');
  assert.equal(motion.shipmentFrame(.43,false).collect,.5);
  assert.equal(motion.shipmentFrame(.5,false).stage,'carry');
  assert.equal(motion.shipmentFrame(.86,false).stage,'exit');
  assert.equal(motion.shipmentFrame(1,false).exit,1);
  assert.equal(motion.shipmentFrame(-1,false).route,0);
  assert.equal(motion.shipmentFrame(2,false).exit,1);
});

test('forklift pose follows canonical segments with eased motion and stable endpoint headings', () => {
  const path = [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }];
  assert.deepEqual(motion.routePose(path, 0), { ...cellCenter(path[0]), angle: Math.PI / 2 });
  assert.deepEqual(motion.routePose(path, .5), { ...cellCenter(path[1]), angle: 0 });
  assert.deepEqual(motion.routePose(path, 1), { ...cellCenter(path[2]), angle: 0 });
  assert.deepEqual(motion.routePose([path[0]], .5), { ...cellCenter(path[0]), angle: 0 });
  assert.equal(motion.routePose([], .5), null);
  const quarter = motion.shipmentFrame((100 + 260 / 4) / 1000, false);
  assert.ok(quarter.move > 0 && quarter.move < .25, 'mature tween easing applies inside move stage only');
});

test('collection lifts first, then packs at the forklift load anchor without disappearing', () => {
  const source = cellCenter({ x: 3, y: 2 });
  for (const dock of DOCKS) {
    const target = motion.dockPosition(dock);
    const lifted = motion.collectPose(source, target, .15, false);
    assert.equal(lifted.x, source.x); assert.ok(lifted.y < source.y); assert.equal(lifted.scale, 1);
    const settled = motion.collectPose(source, target, 1, false);
    assert.equal(settled.x, target.x); assert.equal(settled.y, target.y); assert.equal(settled.scale, 64 / 110);
    const halfway = motion.collectPose(source, target, .6, false);
    assert.ok(Math.abs(halfway.x - target.x) <= Math.abs(source.x - target.x));
  }
});

test('chain feedback increases to level four and has fixed particle, flash and size caps', () => {
  const one = motion.chainFeedback(1), two = motion.chainFeedback(2), three = motion.chainFeedback(3), four = motion.chainFeedback(4);
  assert.ok(one.particles < two.particles && two.particles < three.particles && three.particles < four.particles);
  assert.ok(two.flash < three.flash && three.flash <= four.flash);
  assert.ok(two.fontSize < three.fontSize && three.fontSize <= four.fontSize);
  assert.deepEqual(motion.chainFeedback(40), four);
  assert.equal(four.particles, 12); assert.ok(four.flash <= .3); assert.ok(four.fontSize <= 48);
  const origin = { x: 540, y: 550 };
  const first = motion.feedbackParticles(origin, 4, .5, 'collect');
  assert.deepEqual(first, motion.feedbackParticles(origin, 40, .5, 'collect'));
  assert.ok(first.length <= 12);
  for (const phase of ['move', 'collect'] as const) for (const progress of [0, .1, .5, .9, 1]) {
    const particles = motion.feedbackParticles(origin, 400, progress, phase);
    assert.ok(particles.length <= 12);
    assert.ok(particles.every(p => p.radius <= 5 && p.alpha <= .5 && Math.hypot(p.x - origin.x, p.y - origin.y) <= 70));
  }
});

test('reduced motion keeps static poses, static route cues and no particles or flash', () => {
  const start = { x: 300, y: 820 }, dock = { x: 540, y: 550 };
  for (const progress of [0, .2, .5, 1]) {
    const frame = motion.shipmentFrame(progress, true);
    assert.equal(frame.route, 1); assert.equal(frame.move, 0); assert.equal(frame.stage, 'collect');
    assert.deepEqual(motion.collectPose(start, dock, progress, true), { ...start, scale: 1 });
    assert.deepEqual(motion.feedbackParticles(dock, 4, progress, 'collect', true), []);
    assert.deepEqual(motion.placementPose(progress, true), { x: 1, y: 1 });
    assert.equal(motion.reboundOffset(progress, true), 0);
  }
});

test('placement has one bounded squash and invalid candidate has one small rebound', () => {
  assert.deepEqual(motion.placementPose(0, false), { x: 1, y: 1 });
  assert.deepEqual(motion.placementPose(1, false), { x: 1, y: 1 });
  const pose = motion.placementPose(.5, false); assert.ok(pose.x > 1 && pose.x <= 1.045); assert.ok(pose.y < 1 && pose.y >= .92);
  assert.equal(motion.reboundOffset(0, false), 0); assert.equal(motion.reboundOffset(1, false), 0);
  assert.ok(motion.reboundOffset(.5, false) < 0 && motion.reboundOffset(.5, false) >= -9);
});

test('renderer uses baseline Canvas2D deterministically and never mutates domain or view', () => {
  const state = run(); state.board[24] = 'cargo.food';
  for (const reducedMotion of [false, true]) for (const progress of [.05, .4, .82, 1]) {
    const current = view({ animation: { shipment: shipment({ chain: 40 }), progress, board: state.board.slice() } });
    current.profile!.settings.reducedMotion = reducedMotion;
    const before = JSON.stringify({ state, current }), first = surface(), second = surface();
    const random = Math.random; Math.random = () => { throw Error('visual feedback must not sample gameplay randomness'); };
    try { render(first.ctx, state, current); render(second.ctx, state, current); } finally { Math.random = random; }
    assert.deepEqual(first.draws, second.draws); assert.deepEqual(first.labels, second.labels);
    assert.equal(first.stack.length, 0); assert.equal(JSON.stringify({ state, current }), before);
  }
  for (const file of ['renderer.ts', 'motion.ts']) assert.doesNotMatch(readFileSync(new URL(`../src/presentation/${file}`, import.meta.url), 'utf8'), /Math\.random|['"]lighter['"]|getContext\(['"]webgl/);
});

test('shipment score appears only at exit and remains outside the board for every Dock', () => {
  const state = run(); state.board[24] = 'cargo.food';
  for (const dock of DOCKS) {
    const current = view({ animation: { shipment: shipment({ dockId: dock.id, chain: 4 }), progress: .45, board: state.board } });
    const before = surface(); render(before.ctx, state, current); assert.equal(before.labels.some(label => label.value === '+450'), false);
    current.animation!.progress = .87;
    const active = surface(); render(active.ctx, state, current);
    const label = active.labels.find(label => label.value === '+450'); assert.ok(label);
    assert.ok(label.x < L.board.x || label.x > L.board.x + L.board.size || label.y < L.board.y || label.y > L.board.y + L.board.size);
    assert.ok(label.size <= 48);
  }
});

test('reduced rendering retains score and path while eliminating dynamic drawing across progress', () => {
  const state = run(); state.board[24] = 'cargo.food';
  const current = view({ animation: { shipment: shipment({ chain: 4 }), progress: .1, board: state.board } });
  current.profile!.settings.reducedMotion = true;
  const first = surface(); render(first.ctx, state, current);
  current.animation!.progress = .9;
  const last = surface(); render(last.ctx, state, current);
  assert.deepEqual(first.draws, last.draws); assert.deepEqual(first.labels, last.labels);
  assert.ok(first.labels.some(label => label.value === '+450'));
  assert.ok(first.draws.some(draw => draw.kind === 'stroke' && draw.stroke === '#fff1a2'));
});

test('placement, invalid and shift notices produce visible bounded feedback outside board text', () => {
  const state = run(); state.board[8] = 'cargo.food';
  const baseline = surface(); render(baseline.ctx, state, view());
  const placed = surface(); render(placed.ctx, state, view({ placementFx: { cells: [8], progress: .5 } }));
  assert.notDeepEqual(placed.draws, baseline.draws);
  assert.ok(placed.draws.some(draw => draw.kind === 'strokeRect' && draw.stroke === '#fff2ae'));
  const invalid = surface(); render(invalid.ctx, state, view({ invalidFx: { pieceId: 'piece.feedback', progress: .5 } }));
  assert.notDeepEqual(invalid.draws, baseline.draws);
  const shifted = surface(); render(shifted.ctx, state, view({ noticeFx: { kind: 'shift', label: '第 2 班 · 准备入库', progress: .5 } }));
  const label = shifted.labels.find(label => label.value === '第 2 班 · 准备入库'); assert.ok(label);
  assert.ok(label.y < L.board.y || label.y > L.board.y + L.board.size);
});

test('failure notice hides result captions and locks result hit regions until it is removed', () => {
  const state: RunState = { ...run(), phase: 'result', result: 'failed' };
  for (const progress of [0, .5, .999]) {
    const current = view({ noticeFx: { kind: 'fail', label: '仓库满了，整理本班记录', progress } });
    assert.deepEqual(getUiControls(state, current), []);
    const output = surface(); render(output.ctx, state, current);
    assert.match(output.words(), /整理本班记录/); assert.doesNotMatch(output.words(), /再来一局|返回主页|爆仓了！/);
  }
  assert.ok(getUiControls(state, view()).some(control => control.action.type === 'newRun'));
  const done = surface(); render(done.ctx, state, view()); assert.match(done.words(), /再来一局/);
});

test('reduced shipment keeps the exact cargo-group boundary and no dynamic Dock particles', () => {
  const state = run(); state.board[24] = 'cargo.food';
  const current = view({ animation: { shipment: shipment({ chain: 40 }), progress: .85, board: state.board } });
  current.profile!.settings.reducedMotion = true;
  const output = surface(); render(output.ctx, state, current);
  assert.ok(output.draws.some(draw => draw.kind === 'strokeRect' && draw.stroke === '#cbffde' && draw.values[0] === L.board.x + 3 * 120 + 4 && draw.values[1] === L.board.y + 3 * 120 + 4));
  assert.equal(output.draws.filter(draw => draw.kind === 'arc' && ['#c9baa0', '#ffe29b'].includes(String(draw.fill))).length, 0);
  assert.equal(output.draws.some(draw => draw.kind === 'stroke' && draw.stroke === '#ffe8a0'), false);
});

test('rendered particle counts and single edge pulse remain capped at chain four', () => {
  const state = run(); state.board[24] = 'cargo.food';
  for (const chain of [2, 3, 4, 40]) for (const [progress, limit] of [[.23, 6], [.93, 12]]) {
    const current = view({ animation: { shipment: shipment({ chain }), progress, board: state.board } });
    const output = surface(); render(output.ctx, state, current);
    const particles = output.draws.filter(draw => draw.kind === 'arc' && ['#c9baa0', '#ffe29b'].includes(String(draw.fill)));
    assert.ok(particles.length > 0 && particles.length <= limit);
    const edge = output.draws.filter(draw => draw.kind === 'strokeRect' && draw.stroke === '#ffe8a0');
    assert.equal(edge.length, chain >= 4 && progress >= .86 ? 1 : 0);
    assert.ok(edge.every(draw => Number(draw.alpha) <= .18 && draw.values[0] === L.board.x - 22));
  }
});

test('single south Dock score does not overlap the bottom instruction line', () => {
  const state = run(), current = view({ message:'订单完成！', animation: { shipment: shipment({ dockId: 'dock.south' }), progress: .9, board: state.board } });
  const output = surface(); render(output.ctx, state, current);
  const score = output.labels.find(label => label.value === '+450');
  const hint = output.labels.find(label => label.y === 1467);
  assert.ok(score && hint);
  assert.ok(score.y + score.size / 2 < hint.y - hint.size / 2, 'the score and instruction glyph boxes must be separate');
});

test('a consolidated load with its quantity stays attached during carry and exit', () => {
 const state=run(); state.board[24]='cargo.food';
 for(const progress of [.65,.92]){
  const current=view({animation:{shipment:shipment({units:3}),progress,board:state.board}});
  const output=surface();render(output.ctx,state,current);
  assert.ok(output.labels.some(label=>label.value==='3件'),'shipping goods remain visible as a quantified load');
 }
});

test('delivery score waits for the loaded return to reach the actual exit', () => {
 const state=run();state.board[24]='cargo.food';
 const loading=surface();render(loading.ctx,state,view({animation:{shipment:shipment(),progress:.45,board:state.board}}));
 const returning=surface();render(returning.ctx,state,view({animation:{shipment:shipment(),progress:.80,board:state.board}}));
 assert.equal(loading.labels.some(label=>label.value==='+450'),false);
 assert.equal(returning.labels.some(label=>label.value==='+450'),false);
 const exiting=surface();render(exiting.ctx,state,view({animation:{shipment:shipment(),progress:.93,board:state.board}}));
 assert.equal(exiting.labels.some(label=>label.value==='+450'),true);
});

test('shipping gate keeps the dispatched cargo color until delivery instead of showing the refreshed order', () => {
 const state=run();state.board[24]='cargo.food';state.orders=[{id:'order.new',dockId:'dock.north',cargo:'cargo.machine',amount:4,baseScore:100}];
 const active=surface();render(active.ctx,state,view({animation:{shipment:shipment(),progress:.65,board:state.board}}));
 const gates=active.draws.filter(draw=>draw.kind==='moveTo'&&draw.values[0]===-16&&draw.values[1]===-31);
 assert.equal(gates.length,1);assert.equal(gates[0].fill,'#e9584b');
 const idle=surface();render(idle.ctx,state,view());
 assert.equal(idle.draws.find(draw=>draw.kind==='moveTo'&&draw.values[0]===-16&&draw.values[1]===-31)?.fill,'#76a74d');
});

test('transport is clipped to the warehouse lane and north delivery never overlaps its hint', () => {
 const state=run();state.board[24]='cargo.food';
 for(const progress of [.05,.65,.93]){
  const output=surface();render(output.ctx,state,view({animation:{shipment:shipment(),progress,board:state.board}}));
  assert.ok(output.draws.some(draw=>draw.kind==='rect'&&draw.values.join(',')==='90,530,900,900'));
  if(progress===.93){assert.ok(output.labels.some(label=>label.value==='+450'));assert.equal(output.labels.some(label=>label.y===L.boardHint.y+L.boardHint.h/2),false);}
 }
});
