/** Regression evidence from the built WeChat game.js on an offline Canvas/wx host.
 * Authored fixtures are test inputs, not recovered player saves or balance evidence.
 * Run after npm run build. No browser, WeChat runtime, network, or device is used.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHost } from './host-runtime.mjs';
import { createRun, applyCommand, previewPlacement } from '../src/domain/engine.ts';
import { orderStatus } from '../src/domain/board.ts';
import { DOCKS } from '../src/domain/content.ts';
import { checksum } from '../src/domain/replay.ts';
import { encodeRun, decodeRun, SAVE_KEYS } from '../src/application/save.ts';
import { createProfile, encodeProfile, PROFILE_KEYS } from '../src/application/profile.ts';
import { L, cellCenter, getTrayRects } from '../src/presentation/layout.ts';
import { getUiControls } from '../src/presentation/ui.ts';

const OUT = 'artifacts/delivery-fix';
const START = 32;
const SCALE = .5;
const full = [50, 150, 270, 359, 360, 395, 430, 499, 500, 590, 700, 855, 860, 910, 960, 990, 1000];
const pictures = [];
const fixtureReports = [];
const same = (actual, expected, label, tolerance = .03) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const point = (x, y) => cellCenter({ x, y });
const words = trace => trace.labels.map(label => label.value).join('\n');
const shippedSounds = h => h.audioEvents.filter(event => event.type === 'play' && /\/(ship|chain[234])\.wav$/.test(event.src));
const stageAt = ms => ms < 100 ? 'route' : ms < 360 ? 'inbound' : ms < 500 ? 'load' : ms < 860 ? 'carry' : ms < 1000 ? 'exit' : 'done';
const round = n => Math.round(n * 1000) / 1000;
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Observe the actual package's native draw calls while preserving native rendering. */
function observe(h) {
  const ctx = h.canvas.getContext('2d');
  let trace = { labels: [], forklifts: [], cargo: [], clips: [] };
  let lastRect = null;
  const transform = () => {
    const m = ctx.getTransform();
    return { a: m.a / SCALE, b: m.b / SCALE, c: m.c / SCALE, d: m.d / SCALE, x: m.e / SCALE, y: m.f / SCALE };
  };
  const wrap = (name, record) => {
    const original = ctx[name].bind(ctx);
    ctx[name] = (...args) => { record(args); return original(...args); };
  };
  wrap('rect', args => { lastRect = args.slice(0, 4); });
  wrap('clip', () => { trace.clips.push(lastRect); });
  wrap('fillText', ([value, x, y]) => trace.labels.push({ value: String(value), x, y, alpha: ctx.globalAlpha }));
  wrap('strokeRect', args => {
    // The forklift's cabin rail, an existing unique shape in the real asset renderer.
    if (args.length >= 4 && args[0] === -13 && args[1] === -27 && args[2] === 35 && args[3] === 54) {
      const m = transform();
      trace.forklifts.push({ x: m.x, y: m.y, angle: Math.atan2(m.b, m.a), size: Math.hypot(m.a, m.b) * 110, alpha: ctx.globalAlpha });
    }
  });
  wrap('fillRect', args => {
    // The cargo-box barcode is drawn once per physical box, after its own transform.
    if (args[0] === 33 && args[1] === 98 && args[2] === 30 && args[3] === 3) {
      const m = transform();
      trace.cargo.push({ x: m.x + m.a * 55 + m.c * 55, y: m.y + m.b * 55 + m.d * 55,
        size: Math.hypot(m.a, m.b) * 110, alpha: ctx.globalAlpha, ink: ctx.fillStyle });
    }
  });
  return { frame(time) { trace = { labels: [], forklifts: [], cargo: [], clips: [] }; h.frame(time); return trace; } };
}

function authored(name, dock, cells, blockers = [], seed = 481) {
  const state = createRun(seed, 'standard', 3);
  Object.assign(state, { shift: 5, completedOrders: 24, nextId: 100, score: 1200, runSerial: 40, elapsedMs: 0,
    maxOccupancy: cells.length + blockers.length });
  state.board.fill(null); state.cellTraits.fill(null);
  for (const cell of cells) state.board[cell] = 'cargo.machine';
  for (const cell of blockers) state.board[cell] = 'cargo.chem';
  state.candidates.forEach(piece => { piece.shapeId = 'shape.single'; piece.cargo = 'cargo.food'; delete piece.trait; delete piece.rushTurns; });
  const other = ['cargo.food', 'cargo.chem', 'cargo.cold'];
  state.orders = DOCKS.map(door => ({ id: `order.authored.${door.side}`, dockId: door.id,
    cargo: door.side === dock ? 'cargo.machine' : other.shift(), amount: door.side === dock ? cells.length : 49, baseScore: 100 }));
  if (name.startsWith('side-gate')) state.upgrades = ['upgrade.side_gate'];
  const saved = decodeRun(encodeRun(state));
  assert.equal(checksum(saved), checksum(state), `${name}: complete save validation`);
  return { name, state: saved, origin: { x: 6, y: 6 } };
}

function open(state, reduced = false, storage) {
  const profile = createProfile(); profile.tutorialComplete = true; profile.settings.reducedMotion = reduced;
  const h = createHost(540, 960, storage ?? new Map([[SAVE_KEYS.main, encodeRun(state)], [PROFILE_KEYS.main, encodeProfile(profile)]]));
  const observer = observe(h);
  observer.frame(16);
  h.tap(center(L.resume).x, center(L.resume).y);
  observer.frame(START);
  assert.equal(checksum(h.snapshot()), checksum(state), 'restored authored state unchanged');
  return { h, observer };
}

function drag(h, origin, candidateIndex = 0, release = true) {
  const from = center(getTrayRects(h.snapshot().candidates.length)[candidateIndex]);
  const to = point(origin.x, origin.y);
  h.pointer('down', from.x, from.y); h.pointer('move', to.x, to.y);
  if (release) h.pointer('up', to.x, to.y);
}

function begin(fixture, reduced = false) {
  const { h, observer } = open(fixture.state, reduced);
  const before = h.snapshot();
  const command = { type: 'place', pieceId: before.candidates[0].id, origin: fixture.origin };
  const prediction = previewPlacement(before, command.pieceId, command.origin);
  assert.equal(prediction.valid, true);
  const resolved = applyCommand(before, command);
  assert.equal(resolved.error, undefined);
  const shipments = resolved.events.filter(event => event.type === 'shipment');
  assert.equal(shipments.length, 1, `${fixture.name}: one real Domain shipment`);
  assert.deepEqual(prediction.shipments, shipments, 'preview and reducer choose the same real route');
  drag(h, fixture.origin);
  assert.equal(checksum(h.snapshot()), checksum(resolved.state), `${fixture.name}: actual package commits the reducer result at drop`);
  assert.equal(h.snapshot().score, before.score + shipments[0].score, 'score commits exactly once before visual work');
  const snapshotBoard = before.board.slice();
  for (const event of resolved.events) if (event.type === 'placed') for (const cell of event.cells) snapshotBoard[cell] = before.candidates[0].cargo;
  return { ...fixture, h, observer, before, resolved, shipment: shipments[0], snapshotBoard, stable: checksum(h.snapshot()), frames: [] };
}

function verifySaved(run, label) {
  const saved = run.h.snapshot();
  assert.equal(checksum(saved), run.stable, `${run.name}: ${label} does not change gameplay`);
  assert.equal(saved.score, run.resolved.state.score, `${run.name}: ${label} never repeats score`);
  assert.equal(saved.completedOrders, run.resolved.state.completedOrders, `${run.name}: ${label} never repeats order credit`);
  assert.equal(saved.commandIndex, run.resolved.state.commandIndex, `${run.name}: ${label} does not accept another placement`);
}

function forklift(trace, name) {
  const vehicles = trace.forklifts.filter(item => Math.abs(item.size - 99) < .1);
  assert.equal(vehicles.length, 1, `${name}: exactly one actual 99px shipment forklift`);
  return vehicles[0];
}

function actualEntrance(shipment) {
  const entry = shipment.path[0];
  const dock = DOCKS.find(item => item.entry.x === entry.x && item.entry.y === entry.y);
  assert.ok(dock || entry.x === 0 && entry.y === 6, 'route begins at a supported real entry');
  return dock ?? { side: 'west', entry };
}

function pickupAngle(shipment) {
  const last = shipment.path.at(-1);
  const adjacent = shipment.cells.filter(index => Math.abs(index % 7 - last.x) + Math.abs(Math.floor(index / 7) - last.y) === 1);
  assert.ok(adjacent.length, 'canonical path ends adjacent to the shipped group');
  const cell = Math.min(...adjacent);
  return Math.atan2(Math.floor(cell / 7) - last.y, cell % 7 - last.x);
}

function onCanonicalPath(vehicle, shipment) {
  const entrance = actualEntrance(shipment), entry = cellCenter(entrance.entry);
  const gate = { x: entrance.side === 'west' ? L.board.x - 24 : entrance.side === 'east' ? L.board.x + L.board.size + 24 : entry.x,
    y: entrance.side === 'north' ? L.board.y - 10 : entrance.side === 'south' ? L.board.y + L.board.size + 15 : entry.y };
  const centers = shipment.path.map(cellCenter).reverse().concat(gate);
  return centers.slice(1).some((end, index) => {
    const start = centers[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    return Math.abs(Math.hypot(vehicle.x - start.x, vehicle.y - start.y) + Math.hypot(vehicle.x - end.x, vehicle.y - end.y) - length) < .1;
  });
}

function verifyDraw(run, trace, ms) {
  const stage = stageAt(ms), shipment = run.shipment;
  if (stage === 'done') {
    assert.equal(trace.forklifts.filter(item => Math.abs(item.size - 99) < .1).length, 0, 'vehicle leaves after the full 1000ms');
    assert.doesNotMatch(words(trace), /正在出库|出库中/);
    return { elapsedMs: ms, stage, checksum: run.stable, forklift: null };
  }
  assert.ok(trace.clips.some(rect => rect && rect[0] === 90 && rect[1] === 530 && rect[2] === 900 && rect[3] === 900), 'actual package clips the transportation layer to the warehouse apron');
  if (stage === 'exit') assert.doesNotMatch(words(trace), /机械正在出库/, 'exit suppresses the repeated hint beside the score');
  const vehicle = forklift(trace, run.name), end = cellCenter(shipment.path.at(-1));
  if (stage === 'load') {
    same(vehicle.x, end.x, 'loading remains at canonical pickup x'); same(vehicle.y, end.y, 'loading remains at canonical pickup y');
    same(angleDifference(vehicle.angle, pickupAngle(shipment)), 0, 'forks face the actual selected adjacent cargo');
    const boxes = trace.cargo.filter(box => box.ink === '#284425' && box.size >= 63.9 && box.size <= 110.1
      && box.x >= L.board.x && box.x <= L.board.x + L.board.size && box.y >= L.board.y && box.y <= L.board.y + L.board.size);
    assert.ok(boxes.length >= shipment.cells.length, 'real package draws the cleared group from its pre-shipment snapshot during loading');
    assert.ok(shipment.cells.every(cell => run.h.snapshot().board[cell] === null && run.snapshotBoard[cell] === shipment.cargo));
    if (ms === 360) for (const cell of shipment.cells) {
      const source = { x: L.board.x + cell % 7 * 120 + 60, y: L.board.y + Math.floor(cell / 7) * 120 + 59 };
      assert.ok(boxes.some(box => Math.hypot(box.x - source.x, box.y - source.y) < .1 && Math.abs(box.size - 110) < .1), 'load begins with an intact actual snapshot box');
    }
  }
  if (stage === 'carry' || stage === 'exit') {
    const cargoX = vehicle.x + Math.cos(vehicle.angle) * 57.6;
    const cargoY = vehicle.y + Math.sin(vehicle.angle) * 57.6;
    assert.ok(trace.cargo.some(box => box.ink === '#284425' && Math.abs(box.size - 64) < .1
      && Math.hypot(box.x - cargoX, box.y - (cargoY - 2)) < .15), '64px physical load follows the rendered forks');
    assert.ok(trace.labels.some(label => label.value === `${shipment.units ?? shipment.cells.length}件`), 'actual load has a quantity badge');
    if (stage === 'carry') assert.ok(onCanonicalPath(vehicle, shipment), 'loaded forklift returns on the reversed Domain path and its straight physical-gate extension');
    if (stage === 'exit') {
      const entrance = actualEntrance(shipment), entry = cellCenter(entrance.entry);
      if (entrance.side === 'west' || entrance.side === 'east') same(vehicle.y, entry.y, 'exit stays aligned with the actual side doorway');
      else same(vehicle.x, entry.x, 'exit stays aligned with the actual doorway');
      if (run.name.startsWith('side-gate')) {
        assert.ok(vehicle.x <= entry.x + .03); same(vehicle.y, cellCenter({ x: 0, y: 6 }).y, 'side gate exits west at row 6');
        assert.ok(Math.abs(vehicle.y - cellCenter(DOCKS[0].entry).y) > 500, 'side-gate vehicle never teleports to the order north Dock');
      }
      if (ms >= 960) {
        const anchor = { x: cargoX, y: cargoY };
        assert.ok(entrance.side === 'west' ? anchor.x + 32 < L.board.x : entrance.side === 'east' ? anchor.x - 32 > L.board.x + L.board.size
          : entrance.side === 'north' ? anchor.y + 32 < L.board.y : anchor.y - 32 > L.board.y + L.board.size,
        'the carried cargo clears the board before final fade');
      }
    }
  }
  const score = `+${String(shipment.score).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  assert.equal(trace.labels.some(label => label.value === score), stage === 'exit', 'floating delivery score appears at exit only');
  return { elapsedMs: ms, stage, checksum: run.stable, forklift: Object.fromEntries(Object.entries(vehicle).map(([key, value]) => [key, round(value)])),
    loadBadges: trace.labels.filter(label => /^\d+件$/.test(label.value)).map(label => label.value) };
}

async function picture(h, name, label) {
  const path = `${OUT}/${name}.png`;
  await writeFile(path, await h.canvas.encode('png'));
  assert.ok((await stat(path)).size > 5000, `${name}: nonempty native Canvas PNG`);
  const item = { path, label }; pictures.push(item); return item;
}

async function sheet(name, frames, columns = 3, cropBoard = true) {
  const width = 480, imageHeight = cropBoard ? 476 : 853, heading = 58;
  const canvas = createCanvas(columns * width, Math.ceil(frames.length / columns) * (imageHeight + heading));
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#122232'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '18px "Warehouse CJK", sans-serif'; ctx.textBaseline = 'top';
  for (const [index, item] of frames.entries()) {
    const x = index % columns * width, y = Math.floor(index / columns) * (imageHeight + heading);
    ctx.fillStyle = '#eee8d5'; ctx.fillText(item.label, x + 12, y + 10, width - 24);
    ctx.fillStyle = '#a6c2d1'; ctx.fillText('Authored fixture · actual game.js offline Canvas', x + 12, y + 34, width - 24);
    const source = await loadImage(item.path);
    if (cropBoard) ctx.drawImage(source, 20, 242, 500, 496, x, y + heading, width, imageHeight);
    else ctx.drawImage(source, x, y + heading, width, imageHeight);
  }
  const path = `${OUT}/${name}.png`;
  await writeFile(path, await canvas.encode('png')); return path;
}

/** Independent viewport observer: actual measured glyph bounds, native transform and safe area. */
function observeText(h, viewport) {
  const ctx = h.canvas.getContext('2d'), { width, height, safeTop, dpr } = viewport;
  const scale = Math.min(width / L.width, (height - safeTop) / L.height);
  const ox = (width - L.width * scale) / 2, oy = safeTop + (height - safeTop - L.height * scale) / 2;
  const pixelScale = scale * dpr;
  let labels = [];
  const original = ctx.fillText.bind(ctx);
  ctx.fillText = (value, x, y, ...remaining) => {
    const metrics = ctx.measureText(value), matrix = ctx.getTransform();
    const local = { left: x - metrics.actualBoundingBoxLeft, right: x + metrics.actualBoundingBoxRight,
      top: y - metrics.actualBoundingBoxAscent, bottom: y + metrics.actualBoundingBoxDescent };
    const corners = [[local.left, local.top], [local.right, local.top], [local.left, local.bottom], [local.right, local.bottom]]
      .map(([px, py]) => ({ x: matrix.a * px + matrix.c * py + matrix.e, y: matrix.b * px + matrix.d * py + matrix.f }));
    const pixels = { left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
      top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) };
    const logical = { left: (pixels.left - ox * dpr) / pixelScale, right: (pixels.right - ox * dpr) / pixelScale,
      top: (pixels.top - oy * dpr) / pixelScale, bottom: (pixels.bottom - oy * dpr) / pixelScale };
    labels.push({ value: String(value), logical, pixels, font: ctx.font });
    return original(value, x, y, ...remaining);
  };
  return { frame(time) { labels = []; h.frame(time); return labels; },
    compositionCrop: { x: ox * dpr, y: oy * dpr, w: L.width * pixelScale, h: L.height * pixelScale }, viewport };
}

function disjoint(a, b, gap = 0) {
  return a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top;
}
function rectBounds(rect) { return { left: rect.x, top: rect.y, right: rect.x + rect.w, bottom: rect.y + rect.h }; }

function verifyTextBounds(labels, expected, viewport, controls = [], container = { left: 24, top: 0, right: 1056, bottom: 1920 }) {
  const selected = expected.map(value => {
    const matches = labels.filter(label => label.value === value);
    assert.equal(matches.length, 1, `actual package renders help text exactly once: ${value}`);
    return matches[0];
  });
  for (const label of selected) {
    const b = label.logical, px = label.pixels;
    assert.ok(b.right > b.left && b.bottom > b.top, `native text measurement exists: ${label.value}`);
    assert.ok(b.left >= container.left && b.right <= container.right && b.top >= container.top && b.bottom <= container.bottom,
      `complete help glyphs fit their intended panel: ${label.value} ${JSON.stringify(b)}`);
    assert.ok(px.left >= 0 && px.right <= viewport.width * viewport.dpr && px.top >= viewport.safeTop * viewport.dpr
      && px.bottom <= viewport.height * viewport.dpr, `complete help glyphs fit physical safe-area Canvas: ${label.value}`);
    for (const control of controls) assert.ok(disjoint(b, rectBounds(control.rect), 4), `help text avoids ${control.label}: ${label.value}`);
  }
  for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
    assert.ok(disjoint(selected[i].logical, selected[j].logical, 3), `help lines do not collide: ${selected[i].value} / ${selected[j].value}`);
  }
  return selected.map(label => ({ value: label.value, logicalBounds: Object.fromEntries(Object.entries(label.logical).map(([key, value]) => [key, round(value)])),
    physicalBounds: Object.fromEntries(Object.entries(label.pixels).map(([key, value]) => [key, round(value)])), font: label.font }));
}

async function teachingSheet(name, items) {
  const columns = 4, width = 360, height = 640, header = 56;
  const canvas = createCanvas(columns * width, Math.ceil(items.length / columns) * (height + header)), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#122232'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '17px "Warehouse CJK", sans-serif'; ctx.textBaseline = 'top';
  for (const [index, item] of items.entries()) {
    const x = index % columns * width, y = Math.floor(index / columns) * (height + header);
    ctx.fillStyle = '#eee8d5'; ctx.fillText(item.label, x + 10, y + 9, width - 20);
    ctx.fillStyle = '#a6c2d1'; ctx.fillText('Actual pack · composition crop', x + 10, y + 32, width - 20);
    const source = await loadImage(item.path), crop = item.crop;
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, x, y + header, width, height);
  }
  const path = `${OUT}/${name}.png`; await writeFile(path, await canvas.encode('png')); return path;
}

async function verifyTeachingLayouts() {
  const viewports = [
    { name: 'narrow-safe-dpr2', width: 360, height: 800, safeTop: 24, dpr: 2 },
    { name: 'portrait', width: 540, height: 960, safeTop: 0, dpr: 1 },
    { name: 'wide-letterbox', width: 1200, height: 900, safeTop: 0, dpr: 1 },
  ];
  const basics = ['看上方订单：只运匹配的货类，数量至少达标', '同图标上下左右连成组；门口到货旁要有空路',
    '有效落子后查全部旧单；新单等下一次落子', '无订单先备货；候选全放不下就爆仓'];
  const special = ['托盘占1格计2件；万能可连接当前订单货类', '加急：后续有效放置倒数归零，变废弃物',
    '废物占格不出库；危险品出货时清相邻废物', '穿托盘不搬走托盘；额外清理不计分'];
  const goals = { standard: '目标：每班6单，共5班，完成订单就能过关', daily: '今日目标：每班6单，共5班，同日固定种子',
    tutorial: '练习目标：学会按订单凑货、给叉车留路', overtime: '加班目标：继续接单追分，可主动结束' };
  const lessonHints = ['看上方订单：北门要3件食品，先放2件', '食品还差1件；上下左右连起来，再留空路', '食品够3件，但北门被机械挡住：先清机械'];
  const dragHints = ['第1步：把食品横2拖进虚线框', '第2步：把食品接在右侧，凑成3件出货', '第3步：补上机械，先清路，再连锁出货'];
  const resultHints = ['正式目标：每班6单，共5班；候选全放不下就失败', '本次练习不计入正式成绩'];
  const reports = [], sheets = [];
  for (const viewport of viewports) {
    const images = [];
    const photograph = async (h, observer, suffix, label) => {
      const image = await picture(h, `help-${viewport.name}-${suffix}`, label);
      images.push({ ...image, crop: observer.compositionCrop }); return image.path;
    };
    const pauseCheck = async (h, observer, mode, time) => {
      const before = checksum(h.snapshot()); h.tap(center(L.pause).x, center(L.pause).y);
      const labels = observer.frame(time), state = h.snapshot();
      assert.equal(checksum(state), before, 'opening help does not mutate gameplay');
      const controls = getUiControls(state, { paused: true, needsResume: false, screen: 'game' });
      const bounds = verifyTextBounds(labels, [goals[mode], ...basics, ...special], viewport, controls,
        { left: 201, top: 626, right: 879, bottom: 1058 });
      assert.ok(bounds.slice(1, 5).every(label => label.logicalBounds.bottom < bounds[5].logicalBounds.top), 'basic explanation appears before special-rule details');
      assert.ok(labels.some(label => label.value === '继续工作'));
      const path = await photograph(h, observer, `pause-${mode}`, `${mode} pause · ${viewport.width}×${viewport.height}`);
      reports.push({ viewport, kind: `pause-${mode}`, checksum: before, path, bounds });
    };
    // Real first-run teaching state and real drag/drop progression, not patched tutorial steps.
    const tutorial = createHost(viewport.width, viewport.height, new Map(), viewport.safeTop, viewport.dpr);
    const observer = observeText(tutorial, viewport);
    let labels = observer.frame(16), state = tutorial.snapshot();
    assert.equal(state.mode, 'tutorial'); assert.equal(state.tutorialStep, 0);
    const captureLesson = async (step, labels) => {
      const bounds = verifyTextBounds(labels, [lessonHints[step], dragHints[step]], viewport, [],
        { left: 54, top: 493, right: 1026, bottom: 1506 });
      const path = await photograph(tutorial, observer, `lesson-${step + 1}`, `Teaching step ${step + 1} · ${viewport.width}×${viewport.height}`);
      reports.push({ viewport, kind: `tutorial-step-${step + 1}`, checksum: checksum(tutorial.snapshot()), path, bounds });
    };
    await captureLesson(0, labels);
    await pauseCheck(tutorial, observer, 'tutorial', 32);
    tutorial.tap(center(L.resume).x, center(L.resume).y); observer.frame(48);
    for (const [index, origin] of [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 4 }].entries()) {
      state = tutorial.snapshot();
      const expected = applyCommand(state, { type: 'place', pieceId: state.candidates[0].id, origin });
      assert.equal(expected.error, undefined); drag(tutorial, origin);
      assert.equal(checksum(tutorial.snapshot()), checksum(expected.state), 'actual tutorial touch command equals Domain');
      if (index === 0) { labels = observer.frame(148); await captureLesson(1, labels); }
      else if (index === 1) { labels = observer.frame(1148); await captureLesson(2, labels); }
      else { observer.frame(2148); labels = observer.frame(3148); }
    }
    state = tutorial.snapshot(); assert.equal(state.result, 'won'); assert.equal(state.tutorialStep, 3);
    const controls = getUiControls(state, { paused: false, needsResume: false, screen: 'game' });
    const resultBounds = verifyTextBounds(labels, resultHints, viewport, controls, { left: 174, top: 1080, right: 906, bottom: 1208 });
    assert.ok(labels.some(label => label.value === '开始正式值班'));
    const resultPath = await photograph(tutorial, observer, 'tutorial-complete', `Teaching complete · ${viewport.width}×${viewport.height}`);
    reports.push({ viewport, kind: 'tutorial-complete', checksum: checksum(state), path: resultPath, bounds: resultBounds });
    for (const mode of ['standard', 'daily', 'overtime']) {
      const state = createRun(481, mode === 'daily' ? 'daily' : 'standard', 3);
      if (mode === 'overtime') Object.assign(state, { overtime: true, shift: 5, completedOrders: 30 });
      if (mode === 'daily') Object.assign(state, { challengeId: 'daily.authored.2026-10-06.v3', challengeDay: '2026-10-06' });
      const profile = createProfile(); profile.tutorialComplete = true;
      const h = createHost(viewport.width, viewport.height, new Map([[SAVE_KEYS.main, encodeRun(state)], [PROFILE_KEYS.main, encodeProfile(profile)]]), viewport.safeTop, viewport.dpr);
      const monitor = observeText(h, viewport); monitor.frame(16);
      h.tap(center(L.resume).x, center(L.resume).y); monitor.frame(32);
      await pauseCheck(h, monitor, mode, 48);
    }
    sheets.push(await teachingSheet(`contact-sheet-help-${viewport.name}`, images));
    console.log(`PASS help layout ${viewport.width}×${viewport.height}, safeTop ${viewport.safeTop}, DPR ${viewport.dpr}: all four mode goals, basics/specials, three real tutorial steps and completion; measured glyph bounds avoid controls.`);
  }
  return { reports, sheets };
}

await mkdir(OUT, { recursive: true });
console.log('Delivery regression: actual built game.js, offline Canvas/wx host; authored inputs, no browser or device claims.');
const fixtures = [
  authored('north-single', 'north', [10]), authored('east-single', 'east', [26]),
  authored('south-single', 'south', [38]), authored('west-single', 'west', [22]),
  authored('north-long-corner', 'north', [33, 40, 41], [8, 9, 10, 11, 12, 13]),
  authored('east-corner', 'east', [8, 9, 15]), authored('side-gate-corner', 'north', [31, 32, 39], [3]),
];
const directionPictures = [], longPictures = [], sidePictures = [];
for (const fixture of fixtures) {
  const run = begin(fixture);
  if (fixture.name.endsWith('single')) assert.equal(run.shipment.path.length, 1, 'one-cell Domain path regression');
  if (fixture.name.includes('corner')) {
    const headings = run.shipment.path.slice(1).map((p, index) => Math.atan2(p.y - run.shipment.path[index].y, p.x - run.shipment.path[index].x));
    assert.ok(new Set(headings).size > 1, 'real canonical route contains a corner');
  }
  const times = fixture.name === 'north-long-corner' ? full : fixture.name === 'side-gate-corner' ? [150, 360, 430, 500, 680, 855, 910, 960, 1000] : [150, 360, 430, 500, 680, 855, 910, 960, 1000];
  for (const ms of times) {
    const trace = run.observer.frame(START + ms);
    verifySaved(run, `${ms}ms`);
    run.frames.push(verifyDraw(run, trace, ms));
    if (ms < 1000) {
      drag(run.h, { x: 0, y: 6 }); verifySaved(run, 'input lock during shipment');
    }
    const saveImage = fixture.name === 'north-long-corner' || fixture.name === 'side-gate-corner' || [360, 680, 960].includes(ms);
    if (saveImage) {
      const image = await picture(run.h, `${fixture.name}-${String(ms).padStart(4, '0')}`, `${fixture.name} · ${stageAt(ms)} ${ms}ms`);
      if (fixture.name === 'north-long-corner') longPictures.push(image);
      else if (fixture.name === 'side-gate-corner') sidePictures.push(image);
      else directionPictures.push(image);
    }
  }
  assert.equal(shippedSounds(run.h).length, 1, 'one delivery sound for one scored shipment');
  const report = { name: run.name, authored: true, savedFixtureChecksum: checksum(run.before), placedCommand: run.resolved.state.commands.at(-1),
    shipment: run.shipment, settledChecksum: run.stable, settledScore: run.resolved.state.score, frames: run.frames };
  fixtureReports.push(report);
  console.log(`PASS ${run.name}: ${run.shipment.path.length} path cells; ${run.frames.length} stable-score frames; actual load/heading/exit checks.`);
}

// Hide during loaded return, show/resume, then cold-restore the same committed save.
const lifecycle = begin(fixtures[4]);
lifecycle.observer.frame(START + 680); verifySaved(lifecycle, 'before hide');
lifecycle.h.callbacks.hide();
const afterHideSounds = lifecycle.h.audioEvents.filter(event => event.type === 'play').length;
let trace = lifecycle.observer.frame(START + 700); verifySaved(lifecycle, 'hide');
assert.match(words(trace), /休息一下/);
const lifecyclePictures = [await picture(lifecycle.h, 'lifecycle-hidden-carry', 'hide mid-carry · already committed score')];
lifecycle.h.callbacks.show();
lifecycle.observer.frame(START + 2000); verifySaved(lifecycle, 'show');
lifecycle.h.tap(center(L.resume).x, center(L.resume).y);
trace = lifecycle.observer.frame(START + 2016); verifySaved(lifecycle, 'resume');
assert.doesNotMatch(words(trace), /正在出库|出库中|休息一下/);
assert.equal(lifecycle.h.audioEvents.filter(event => event.type === 'play').length, afterHideSounds, 'no old visual/audio queue restarts after show');
const reload = open(lifecycle.h.snapshot(), false, new Map(lifecycle.h.storage));
assert.equal(checksum(reload.h.snapshot()), lifecycle.stable);
trace = reload.observer.frame(1600);
assert.doesNotMatch(words(trace), /正在出库|出库中/);
assert.equal(shippedSounds(reload.h).length, 0, 'cold restore cannot deliver again');
reload.h.tap(center(L.pause).x, center(L.pause).y);
trace = reload.observer.frame(1616); assert.match(words(trace), /休息一下/);
reload.h.tap(center(L.resume).x, center(L.resume).y);
trace = reload.observer.frame(1632); assert.doesNotMatch(words(trace), /休息一下/);
assert.equal(checksum(reload.h.snapshot()), lifecycle.stable, 'explicit pause/resume never resettles');
lifecyclePictures.push(await picture(reload.h, 'lifecycle-cold-restored', 'cold restore + pause/resume · same score'));
console.log('PASS lifecycle: hide during carry, show/resume, cold restore, explicit pause; no repeated settlement or delivery audio.');

// Reduced mode remains a static 80ms signal with the actual pre-clear group visible.
const reduced = begin(fixtures[4], true);
const reducedImages = [];
for (const ms of [0, 40, 79, 80]) {
  trace = reduced.observer.frame(START + ms); verifySaved(reduced, `reduced ${ms}ms`);
  if (ms < 80) {
    assert.ok(trace.cargo.filter(box => box.ink === '#284425' && Math.abs(box.size - 110) < .1
      && box.x >= L.board.x && box.x <= L.board.x + L.board.size).length >= reduced.shipment.cells.length, 'reduced actual snapshot boxes remain visible');
    assert.match(words(trace), /装载中 · \+/);
  } else assert.doesNotMatch(words(trace), /正在出库|出库中/);
  if (ms === 40 || ms === 80) reducedImages.push(await picture(reduced.h, `reduced-${ms}`, `reduced · ${ms}ms`));
}
assert.equal(reduced.h.audioEvents.filter(event => event.type === 'play' && event.src === 'assets/forklift.wav').length, 0);
assert.equal(shippedSounds(reduced.h).length, 1);
console.log('PASS reduced: static pre-clear cargo through 79ms, settled at 80ms, one delivery cue, no forklift cue.');

// Find a reproducible seed whose real order refresh yields a ready mechanical order.
// Only the initial stock/orders are authored; the replacement order is generated by Domain.
let refreshed;
for (let seed = 1; seed <= 100 && !refreshed; seed++) {
  const state = authored('authored-new-order-ready', 'north', [28, 29, 30, 31, 35, 36, 37, 38], [], seed).state;
  for (const cell of [8, 9, 10]) state.board[cell] = 'cargo.food';
  state.orders = DOCKS.map((dock, index) => ({ id: `order.authored.refresh.${dock.side}`, dockId: dock.id,
    cargo: ['cargo.food', 'cargo.chem', 'cargo.electronic', 'cargo.cold'][index], amount: index ? 49 : 3, baseScore: 100 }));
  state.maxOccupancy = 11;
  decodeRun(encodeRun(state));
  const first = applyCommand(state, { type: 'place', pieceId: state.candidates[0].id, origin: { x: 6, y: 6 } });
  const replacement = first.state.orders.find(order => order.dockId === 'dock.north');
  if (replacement?.cargo === 'cargo.machine' && orderStatus(first.state, replacement).status === 'ready') refreshed = { state, first, replacement };
}
assert.ok(refreshed, 'bounded deterministic fixture search finds a genuinely generated ready mechanical order');
const newOrder = open(refreshed.state), firstCommand = refreshed.first.state.commands.at(-1);
drag(newOrder.h, firstCommand.origin);
assert.equal(checksum(newOrder.h.snapshot()), checksum(refreshed.first.state));
trace = newOrder.observer.frame(START + 1000);
const readyState = newOrder.h.snapshot(), readyChecksum = checksum(readyState);
assert.equal(readyState.completedOrders, refreshed.state.completedOrders + 1, 'new ready order does not resolve in the old-order frozen batch');
assert.match(words(trace), /已满足 · 落子后检查/);
assert.match(words(trace), /订单已满足，有效落子后检查全部订单/);
const uiPictures = [await picture(newOrder.h, 'ui-generated-ready-mechanical', 'Domain-generated new mechanical order · ready')];
const redIndex = readyState.candidates.findIndex(piece => piece.cargo === 'cargo.food' && piece.shapeId === 'shape.single' && !piece.trait);
assert.ok(redIndex >= 0, 'an actual red food candidate remains for cross-cargo preview');
const origin = { x: 6, y: 5 }, red = readyState.candidates[redIndex];
const predicted = previewPlacement(readyState, red.id, origin);
assert.equal(predicted.valid, true); assert.equal(predicted.shipments.length, 1);
assert.equal(predicted.shipments[0].cargo, 'cargo.machine');
assert.equal(predicted.shipments[0].orderId, refreshed.replacement.id);
drag(newOrder.h, origin, redIndex, false);
trace = newOrder.observer.frame(START + 1032);
assert.equal(checksum(newOrder.h.snapshot()), readyChecksum, 'preview never commits');
assert.match(words(trace), /松手后预计出库/);
assert.match(words(trace), /松手后预计出库：机械/);
uiPictures.push(await picture(newOrder.h, 'ui-red-preview-mechanical', 'Red food drag · real mechanical shipment preview'));
newOrder.h.pointer('up', point(origin.x, origin.y).x, point(origin.x, origin.y).y);
const secondExpected = applyCommand(readyState, { type: 'place', pieceId: red.id, origin });
assert.equal(checksum(newOrder.h.snapshot()), checksum(secondExpected.state));
assert.equal(newOrder.h.snapshot().completedOrders, readyState.completedOrders + 1);
assert.equal(newOrder.h.snapshot().score, readyState.score + predicted.shipments[0].score);
const secondStable = checksum(newOrder.h.snapshot());
for (const ms of [500, 860, 1000, 1200]) {
  newOrder.observer.frame(START + 1032 + ms);
  assert.equal(checksum(newOrder.h.snapshot()), secondStable, 'new order scores once, never again during frames');
}

const stockState = authored('authored-unordered-mechanical-stock', 'north', [8, 9, 10]).state;
stockState.orders = DOCKS.map((dock, index) => ({ id: `order.authored.stock.${dock.side}`, dockId: dock.id,
  cargo: ['cargo.food', 'cargo.chem', 'cargo.electronic', 'cargo.cold'][index], amount: 49, baseScore: 100 }));
stockState.candidates[0].cargo = 'cargo.machine';
const stockHost = open(decodeRun(encodeRun(stockState)));
trace = stockHost.observer.frame(48); assert.match(words(trace), /机械暂无订单，可先备货/);
stockHost.h.tap(center(getTrayRects(3)[0]).x, center(getTrayRects(3)[0]).y);
trace = stockHost.observer.frame(64); assert.match(words(trace), /机械暂无订单，可先备货/);
uiPictures.push(await picture(stockHost.h, 'ui-unordered-mechanical-stock', 'No mechanical order · temporary stock hint'));
console.log(`PASS UI: authored seed ${refreshed.state.seed} produces a real new ready order; actual red drag predicts mechanical shipment; unmatched stock hint is rendered.`);

const teachingLayouts = await verifyTeachingLayouts();
const contactSheets = [
  ...teachingLayouts.sheets,
  await sheet('contact-sheet-directions', directionPictures, 3),
  await sheet('contact-sheet-full-journey', longPictures, 3),
  await sheet('contact-sheet-side-gate', sidePictures, 3),
  await sheet('contact-sheet-order-explanations', uiPictures, 3, false),
  await sheet('contact-sheet-lifecycle-reduced', [...lifecyclePictures, ...reducedImages], 2, false),
];
const report = {
  status: 'PASS', evidenceKind: 'Actual build/wechat/game.js under offline native Canvas/wx host simulation',
  exclusions: ['No browser execution', 'No WeChat developer tools or physical device execution', 'No human audio listening', 'No claim of a recovered user save or natural balance'],
  builtGameSha256: createHash('sha256').update(await readFile('build/wechat/game.js')).digest('hex'),
  rulesetVersion: 3, timingsMs: { route: 100, inbound: 260, load: 140, carry: 360, exit: 140, total: 1000, reduced: 80 },
  authoredFixtureCount: fixtures.length, fixtures: fixtureReports,
  lifecycle: { hideDuringCarry: true, showResume: true, coldRestore: true, explicitPauseResume: true, stableChecksum: lifecycle.stable },
  reduced: { staticFramesThroughMs: 79, doneAtMs: 80, stableChecksum: reduced.stable },
  ui: { authoredInitialState: true, seed: refreshed.state.seed, genuinelyGeneratedReplacementOrder: refreshed.replacement,
    readyChecksum, redCandidate: red, realPreviewShipment: predicted.shipments[0], secondSettledChecksum: secondStable,
    renderedLabels: ['已满足 · 落子后检查', '订单已满足，有效落子后检查全部订单', '松手后预计出库：机械', '机械暂无订单，可先备货'] },
  teachingLayouts: { measurement: 'Actual native Canvas fillText glyph bounds, mapped through current viewport transform',
    screenshots: teachingLayouts.reports, count: teachingLayouts.reports.length },
  individualPngCount: pictures.length, contactSheets,
};
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await writeFile(`${OUT}/README.txt`, [
  'Delivery fix regression evidence',
  'PASS: actual built WeChat game.js rendered in an offline native Canvas/wx host.',
  'The initial fixture states are authored test inputs, validated by the real save encoder and decoder.',
  'Every shipment/path and the new-order replacement are generated by the real Domain reducer.',
  'No user save, browser, WeChat developer tools, physical device or human listening result is represented.',
  '',
  'contact-sheet-full-journey.png: one long, turning route across 17 frames, including loading, loaded return and exit.',
  'contact-sheet-directions.png: north/east/south/west one-cell routes and a multi-cell east corner route.',
  'contact-sheet-side-gate.png: real path begins at (0,6), with loaded departure westward at row 6.',
  'contact-sheet-order-explanations.png: a genuinely generated ready order, red food drag predicting mechanical shipment, and no-order stock copy.',
  'contact-sheet-lifecycle-reduced.png: hide/restore/pause and static 80ms reduced feedback.',
  'contact-sheet-help-*.png: real tutorial progression and all four pause-mode goals at 360x800 safeTop24 DPR2, 540x960 and 1200x900.',
  'Help contact sheets crop the composed game area for comparison; their individual PNGs retain full safe areas and wide letterboxing.',
  'Help report records native glyph bounding boxes and verifies panel/safe-area fit, line separation and no overlap with action buttons.',
  '',
  'report.json includes the built game SHA-256, actual Domain shipment paths, per-frame observed forklift poses and invariant gameplay checksums.',
  'Native Canvas calls are observed without replacing their implementations. PNGs are captured from that same actual package rendering.',
  `Individual screenshots: ${pictures.length}; contact sheets: ${contactSheets.length}.`,
].join('\n') + '\n');
console.log(`PASS delivery fix: ${fixtures.length} authored route fixtures, ${fixtureReports.reduce((sum, item) => sum + item.frames.length, 0)} invariant frames, ${pictures.length} PNGs and ${contactSheets.length} contact sheets. See ${OUT}/report.json.`);
