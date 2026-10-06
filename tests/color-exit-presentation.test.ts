import test from 'node:test';
import assert from 'node:assert/strict';
import type { Point, Shipment } from '../src/domain/types.ts';
import { shipmentFrame, shipmentPose } from '../src/presentation/motion.ts';
import { colorExitCargoPose, colorExitVehiclePose } from '../src/presentation/color-exit-motion.ts';

type ConveyorShipment = Shipment & { transport: 'conveyor'; cargoPaths: { cell: number; path: Point[] }[] };
const northPoints = [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 2 }];
const at = (point: Point): Point => ({ x: 120 + (point.x + .5) * 120, y: 560 + (point.y + .5) * 120 });
function shipment(side: 'north' | 'east' | 'west' = 'north'): ConveyorShipment {
  const points = northPoints.map(p => side === 'east' ? { x: 6 - p.y, y: p.x } : side === 'west' ? { x: p.y, y: 6 - p.x } : { ...p });
  return { type: 'shipment', transport: 'conveyor', dockId: `dock.${side}`, orderId: `exit.${side === 'north' ? 'food' : side === 'east' ? 'chem' : 'machine'}`, cargo: side === 'north' ? 'cargo.food' : side === 'east' ? 'cargo.chem' : 'cargo.machine',
    cells: points.map(p => p.y * 7 + p.x), path: side === 'east' ? [{ x: 3, y: 6 }, { x: 3, y: 5 }] : [6, 5, 4, 3, 2].map(y => ({ x: 3, y })), score: 50, chain: 1,
    cargoPaths: points.map((p, i) => ({ cell: p.y * 7 + p.x, path: points.slice(0, i + 1).reverse() })) };
}
function onSegment(point: Point, a: Point, b: Point): boolean {
  return Math.abs((point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)) < .001
    && point.x >= Math.min(a.x, b.x) - .001 && point.x <= Math.max(a.x, b.x) + .001
    && point.y >= Math.min(a.y, b.y) - .001 && point.y <= Math.max(a.y, b.y) + .001;
}

// A collect-to-fork branch would pull these crates off their original group before the conveyor starts.
test('conveyor activation holds every box in its own grid cell until flow', () => {
  const event = shipment();
  for (const progress of [0, .2, .36, .43, .499]) for (const cargo of event.cargoPaths) {
    const pose = colorExitCargoPose(event, cargo.cell, shipmentFrame(progress, false)); assert.ok(pose);
    assert.deepEqual({ x: pose.x, y: pose.y }, at(cargo.path[0])); assert.equal(pose.alpha, 1);
  }
});

// Sampling every box on a bent route catches a direct interpolation to the gate or fork.
for (const side of ['north', 'east', 'west'] as const) test(`${side} cargo traverses only its own canonical four-neighbor path then exits its actual door`, () => {
  const event = shipment(side), before = JSON.stringify(event);
  for (const cargo of event.cargoPaths) {
    const route = cargo.path.map(at), end = route[route.length - 1];
    const outside = side === 'north' ? { x: end.x, y: 430 } : side === 'east' ? { x: 1090, y: end.y } : { x: -10, y: end.y };
    route.push(outside); let moved = false;
    for (let i = 0; i <= 100; i++) {
      const pose = colorExitCargoPose(event, cargo.cell, shipmentFrame(.5 + i / 200, false)); assert.ok(pose);
      assert.ok(route.slice(1).some((p, index) => onSegment(pose, route[index], p)), `${side} cell ${cargo.cell} left its cargo line at ${i}`);
      moved ||= Math.hypot(pose.x - route[0].x, pose.y - route[0].y) > 1;
    }
    assert.ok(moved);
    const final = colorExitCargoPose(event, cargo.cell, shipmentFrame(1, false)); assert.ok(final);
    assert.equal(final.alpha, 0);
    if (side === 'north') { assert.equal(final.x, 540); assert.ok(final.y < 528); }
    if (side === 'east') { assert.ok(final.x > 992); assert.equal(final.y, 980); }
    if (side === 'west') { assert.ok(final.x < 88); assert.equal(final.y, 980); }
  }
  assert.equal(JSON.stringify(event), before, 'render sampling must never mutate the event');
});

test('conveyor vehicle uses the supplied south empty route and is never loaded', () => {
  for (const side of ['north', 'east', 'west'] as const) {
    const event = shipment(side);
    for (const progress of [.15, .4, .5, .72, .9, 1]) {
      const frame = shipmentFrame(progress, false), expected = shipmentPose(event, frame), actual = colorExitVehiclePose(event, frame);
      assert.ok(actual); assert.ok(expected); assert.equal(actual.x, expected.x); assert.equal(actual.y, expected.y); assert.equal(actual.angle, expected.angle);
      assert.equal(actual.loaded, false);
    }
    const final = colorExitVehiclePose(event, shipmentFrame(1, false)); assert.ok(final); assert.equal(final.x, 540); assert.ok(final.y > 1400); assert.equal(final.alpha, 0);
  }
});

test('reduced conveyor frames keep cargo completely static and omit the moving vehicle', () => {
  const event = shipment();
  for (const progress of [0, .2, .6, 1]) for (const cargo of event.cargoPaths) {
    assert.deepEqual(colorExitCargoPose(event, cargo.cell, shipmentFrame(progress, true)), { ...at(cargo.path[0]), scale: 1, alpha: 1 });
    assert.equal(colorExitVehiclePose(event, shipmentFrame(progress, true)), null);
  }
});

test('invalid cargo metadata cannot invent a shortcut or an alternate exit', () => {
  const valid = shipment(), cell = valid.cells[4], frame = shipmentFrame(.7, false);
  const invalids = [
    { ...valid, transport: undefined }, { ...valid, cargoPaths: [] }, { ...valid, cargo: 'cargo.chem' },
    { ...valid, cargoPaths: [{ cell, path: [{ x: 5, y: 2 }, { x: 3, y: 0 }] }] },
    { ...valid, cargoPaths: [{ cell, path: [{ x: 5, y: 2 }, { x: 5, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 0 }] }] },
    { ...valid, cargoPaths: [{ cell, path: [{ x: 4, y: 2 }, { x: 4, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 0 }] }] },
    { ...valid, cargoPaths: [{ cell, path: valid.cargoPaths[4].path.slice(0, -1) }] },
  ];
  for (const event of invalids) assert.equal(colorExitCargoPose(event as Shipment, cell, frame), null);
  assert.equal(colorExitCargoPose(valid, 48, frame), null);
  assert.equal(colorExitVehiclePose({ ...valid, path: [{ x: 3, y: 0 }, { x: 2, y: 0 }] }, frame), null);
});

// The real raster context catches unsupported calls while wrappers inspect user-visible Canvas output.
import { createCanvas } from '@napi-rs/canvas';
import { createProfile } from '../src/application/profile.ts';
import type { RunState } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
import { drawColorExitGates, drawColorExitRoutes, drawColorExitShipment, drawColorExitHelpDiagram } from '../src/presentation/color-exit-renderer.ts';
const view = (patch: Partial<ViewState> = {}): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile: createProfile(), ...patch });
function state(): RunState {
  return { rulesetVersion: 4, runConfigId: 'run.color_exit_p0_v4', seed: 7, mode: 'color_exit' as RunState['mode'], rngState: [1, 2, 3, 4], board: Array(49).fill(null), candidates: [], orders: [],
    phase: 'input', shift: 1, completedOrders: 0, score: 0, lastChain: 0, maxChain: 0, upgrades: [], upgradeChoices: [], commandIndex: 0, commands: [], nextId: 1, result: null };
}
function surface() {
  const canvas = createCanvas(1080, 1920), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const labels: { value: string; x: number; y: number }[] = [], strokes: { style: unknown; dash: number[] }[] = [], rotations: number[] = [];
  const fillText = ctx.fillText.bind(ctx), stroke = ctx.stroke.bind(ctx), rotate = ctx.rotate.bind(ctx);
  ctx.fillText = (value, x, y) => { labels.push({ value, x, y }); fillText(value, x, y); };
  ctx.stroke = () => { strokes.push({ style: ctx.strokeStyle, dash: ctx.getLineDash() }); stroke(); };
  ctx.rotate = angle => { rotations.push(angle); rotate(angle); };
  return { ctx, labels, strokes, rotations, words: () => labels.map(label => label.value).join('\n'), pixels: () => canvas.toBuffer('image/png') };
}

test('fixed gate overlay identifies all cargo doors and reserves the southern entrance with text', () => {
  const canvas = surface(), run = state(), before = JSON.stringify(run);
  drawColorExitGates(canvas.ctx, run, view());
  assert.match(canvas.words(), /北.*食品/); assert.match(canvas.words(), /东.*化工/); assert.match(canvas.words(), /西.*机械/); assert.match(canvas.words(), /叉车入口/);
  const north = canvas.labels.find(label => /北.*食品/.test(label.value))!, west = canvas.labels.find(label => /西.*机械/.test(label.value))!, east = canvas.labels.find(label => /东.*化工/.test(label.value))!;
  assert.ok(north.y < 560); assert.ok(west.x < 120); assert.ok(east.x > 960);
  assert.equal(JSON.stringify(run), before);
  run.board[45] = 'cargo.machine'; const blocked = surface(); drawColorExitGates(blocked.ctx, run, view()); assert.match(blocked.words(), /入口堵塞/);
});

test('preview renders differently colored dashed forklift access and solid cargo lines', () => {
  const canvas = surface(), event = shipment();
  drawColorExitRoutes(canvas.ctx, view({ preview: { valid: true, cells: [], shipments: [event] } }));
  const dashed = canvas.strokes.filter(s => s.dash.length), solid = canvas.strokes.filter(s => !s.dash.length);
  assert.ok(dashed.length, 'forklift empty access is dashed'); assert.ok(solid.some(s => dashed.every(d => d.style !== s.style)), 'cargo lines have a different solid color');
  assert.doesNotMatch(canvas.words(), /虚线|实线/, 'route legends belong in optional help');
});

test('reduced shipment renders static group counts without a turning forklift or moving effects', () => {
  const canvas = surface(), event = shipment(), v = view(); v.profile!.settings.reducedMotion = true;
  drawColorExitShipment(canvas.ctx, event, .1, v); const first = canvas.pixels();
  const second = surface(); drawColorExitShipment(second.ctx, event, .9, v);
  assert.deepEqual(first, second.pixels()); assert.deepEqual(canvas.rotations, []); assert.match(canvas.words(), /5件/);
  assert.doesNotMatch(canvas.words(), /订单|旧单|升级|加班/);
});

test('help diagram explains linked cargo quantity, the matching exit, and the single empty access route', () => {
  const canvas = surface(); drawColorExitHelpDiagram(canvas.ctx, { x: 100, y: 400, w: 880, h: 450 });
  assert.match(canvas.words(), /食品4件出货/); assert.match(canvas.words(), /北.*食品/); assert.match(canvas.words(), /虚线.*叉车通路/); assert.match(canvas.words(), /实线.*出货路线/);
  assert.match(canvas.words(), /叉车入口/); assert.doesNotMatch(canvas.words(), /订单|旧单|升级|加班/);
});

import { createRun, previewPlacement } from '../src/domain/engine.ts';
import { colorExitFeedback, colorExitBoardHint, drawColorExitCards } from '../src/presentation/color-exit-renderer.ts';
function colorRun(): RunState {
  const run = createRun(7, 'color_exit', 4); run.board.fill(null);
  run.candidates = [{ id: 'piece.food', cargo: 'cargo.food', shapeId: 'shape.single' }]; return run;
}
function foodState(cells: number[]): RunState { const run = colorRun(); for (const cell of cells) run.board[cell] = 'cargo.food'; return run; }

test('fixed exit cards distinguish insufficient quantity from a large group disconnected from its exit', () => {
  const short = foodState([3, 10]), unconnected = foodState([8, 9, 15, 16]);
  const lack = colorExitFeedback(short, short.orders[0], view()), disconnected = colorExitFeedback(unconnected, unconnected.orders[0], view());
  assert.equal(lack.status.reason, 'insufficient'); assert.equal(lack.status.count, 2); assert.match(lack.label, /(?:差|需|连).*2.*件/);
  assert.equal(disconnected.status.reason, 'exit-unconnected'); assert.equal(disconnected.status.count, 0); assert.match(disconnected.label, /未连出口/);
});

test('fixed exit feedback distinguishes a blocked southern entrance from inaccessible stock', () => {
  const blocked = foodState([3, 10, 11, 18]), inaccessible = structuredClone(blocked);
  blocked.board[45] = 'cargo.machine'; for (const cell of [38, 44, 46]) inaccessible.board[cell] = 'cargo.machine';
  assert.equal(colorExitFeedback(blocked, blocked.orders[0], view()).status.reason, 'entry-blocked');
  assert.match(colorExitFeedback(blocked, blocked.orders[0], view()).label, /入口堵塞/);
  assert.equal(colorExitFeedback(inaccessible, inaccessible.orders[0], view()).status.reason, 'route-blocked');
  assert.match(colorExitFeedback(inaccessible, inaccessible.orders[0], view()).label, /(?:无|没有).*空路/);
});

test('only the engine preview marks a fixed exit as expected to ship after this placement', () => {
  const run = foodState([3, 10, 11]), preview = previewPlacement(run, 'piece.food', { x: 4, y: 2 });
  assert.equal(preview.shipments.length, 1);
  const v = view({ selectedPieceId: 'piece.food', preview }), feedback = colorExitFeedback(run, run.orders[0], v);
  assert.match(feedback.label, /可出货/); assert.equal(feedback.previewShipment, preview.shipments[0]);
  assert.equal(colorExitFeedback(run, run.orders[1], v).previewShipment, undefined);
  assert.match(colorExitBoardHint(run, v), /预计.*食品/);
  const ready = foodState([3, 10, 11, 18]); assert.match(colorExitFeedback(ready, ready.orders[0], view()).label, /已就绪.*等待放置/);
});

test('fixed cards and entrance-blocking preview explain the color-exit mode without old-order copy', () => {
  const run = foodState([3, 10]), canvas = surface(), before = JSON.stringify(run);
  drawColorExitCards(canvas.ctx, run, view());
  assert.match(canvas.words(), /出货口/); assert.match(canvas.words(), /已连接 2\/4件/);
  for (const cargo of ['食品', '化工', '机械']) assert.match(canvas.words(), new RegExp(cargo));
  assert.doesNotMatch(canvas.words(), /订单|旧单|升级|加班/); assert.equal(JSON.stringify(run), before);
  const preview = previewPlacement(run, 'piece.food', { x: 3, y: 6 }); assert.equal(preview.valid, true);
  assert.match(colorExitBoardHint(run, view({ selectedPieceId: 'piece.food', preview })), /入口堵塞/);
});
