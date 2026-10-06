import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/application/session.ts';
import { createRun, applyCommand } from '../src/domain/engine.ts';
import { checksum } from '../src/domain/replay.ts';
import { encodeRun, saveKeysFor } from '../src/application/save.ts';
import { createProfile, encodeProfile, PROFILE_KEYS } from '../src/application/profile.ts';
import { sampleOutboundTransport } from '../src/presentation/outbound-transport.ts';
import type { Platform } from '../src/platform/types.ts';
import type { RunState } from '../src/domain/types.ts';

function harness(state: RunState) {
  let now = 0;
  const data = new Map<string, string>(), sounds: string[] = [], profile = createProfile();
  profile.tutorialComplete = true;
  profile.nextRunSerial = 100;
  const slot = state.rulesetVersion === 8 ? 'outbound8_normal' : 'color_exit';
  state.runSerial = 10;
  data.set(PROFILE_KEYS.main, encodeProfile(profile));
  data.set(saveKeysFor(slot).main, encodeRun(state));
  data.set('warehouse.active-mode.v1', slot);
  const platform = {
    storage: {
      get: (k: string) => data.get(k) ?? null,
      set: (k: string, v: string) => { data.set(k, v); },
      remove: (k: string) => data.delete(k),
    },
    now: () => now,
    wallTime: () => 0,
    playSound: (name: string) => sounds.push(name),
    stopSounds: () => {},
  } as unknown as Platform;
  const session = new GameSession(platform, { seed: 1, mode: 'standard' });
  session.resume();
  return { session, data, sounds, at: (n: number) => { now = n; session.tick(n); } };
}

function fixture(version = 8) {
  const s = createRun(9, 'color_exit', version, version === 8 ? 'normal' : undefined);
  const n = version === 8 ? 9 : 7, x = Math.floor(n / 2);
  for (const i of [x, x + 1, x + n]) s.board[i] = 'cargo.food';
  s.candidates[0] = { id: 'piece.1', shapeId: 'shape.single', cargo: 'cargo.food' };
  return { s, command: { type: 'place' as const, pieceId: 'piece.1', origin: { x: x + 1, y: 1 } } };
}

function chainFixture() {
  const { s } = fixture();
  s.board.fill(null);
  s.board[4] = 'cargo.food';
  s.board[5] = 'cargo.food';
  for (const cell of [...Array.from({ length: 9 }, (_, i) => 18 + i), 35, 44]) {
    if (![22, 23].includes(cell)) s.board[cell] = 'cargo.chem';
  }
  s.candidates[0] = {
    id: 'piece.1', shapeId: 'shape.square', cargo: 'cargo.food',
    cellCargos: ['cargo.food', 'cargo.food', 'cargo.chem', 'cargo.chem'],
  };
  return { s, command: { type: 'place' as const, pieceId: 'piece.1', origin: { x: 4, y: 1 } } };
}

function sample(h: ReturnType<typeof harness>) {
  const animation = h.session.view.animation;
  assert.ok(animation?.transportPlan);
  return sampleOutboundTransport(animation.transportPlan, animation.progress);
}

const deliveries = (sounds: string[]) => sounds.filter(name => ['ship', 'chain2', 'chain3', 'chain4'].includes(name));

test('outbound queues a snapshot-owned one-second plan while reducer score and checksum stay authoritative', () => {
  for (const version of [4, 8]) {
    const f = fixture(version), h = harness(f.s), expected = applyCommand(h.session.state, f.command);
    h.session.dispatch(f.command);
    const animation = h.session.view.animation;
    assert.ok(animation?.transportPlan, 'new outbound transport timeline');
    assert.equal(animation.transportPlan.durationMs, 1000, 'each outbound shipment owns one fixed second');
    assert.deepEqual(new Set(animation.transportPlan.cargoCells), new Set(animation.shipment.cells));
    assert.deepEqual(animation.shipment, expected.events.find(event => event.type === 'shipment'));
    assert.equal(checksum(h.session.state), checksum(expected.state));
    const digest = checksum(h.session.state);
    h.at(999);
    assert.ok(h.session.view.animation);
    h.at(1000);
    assert.equal(h.session.view.animation, null);
    assert.equal(checksum(h.session.state), digest);
    assert.deepEqual(deliveries(h.sounds), ['ship']);
    h.at(100000);
    assert.deepEqual(deliveries(h.sounds), ['ship']);
  }
});

test('session clock loads the whole group at 500 ms and delivers after the exterior leg', () => {
  for (const version of [4, 8]) {
    const f = fixture(version), h = harness(f.s);
    h.session.dispatch(f.command);
    const animation = h.session.view.animation!, plan = animation.transportPlan!;
    const collect = plan.steps.filter(step => step.kind === 'collect');
    assert.equal(collect.length, 1);
    assert.equal(collect[0].startMs, 360);
    assert.equal(collect[0].endMs, 500);
    assert.equal(collect[0].endMs - collect[0].startMs, 140);
    h.at(99);
    assert.equal(sample(h).stage, 'route');
    h.at(360);
    assert.equal(sample(h).stage, 'collect');
    assert.equal(sample(h).loadedCount, 0);
    h.at(499.999);
    assert.equal(sample(h).stage, 'collect');
    assert.deepEqual(sample(h).pickedCells, []);
    h.at(500);
    assert.deepEqual(new Set(sample(h).pickedCells), new Set(animation.shipment.cells));
    assert.equal(sample(h).loadedCount, animation.shipment.cells.length);
    h.at(860);
    assert.equal(sample(h).stage, 'exit');
    h.at(960.799);
    assert.deepEqual(deliveries(h.sounds), []);
    h.at(960.8);
    assert.deepEqual(deliveries(h.sounds), ['ship']);
    h.at(999);
    assert.ok(sample(h).alpha < 1);
    assert.deepEqual(deliveries(h.sounds), ['ship']);
    h.at(1000);
    assert.equal(h.session.view.animation, null);
  }
});

test('confirmation freezes the load boundary and cancelling resumes both full shipment clocks once', () => {
  const f = chainFixture(), h = harness(f.s);
  h.session.dispatch(f.command);
  const digest = checksum(h.session.state);
  h.at(450);
  const progress = h.session.view.animation!.progress;
  assert.equal(sample(h).stage, 'collect');
  h.session.action({ type: 'home' });
  assert.equal(h.session.view.confirmation?.kind, 'leaveRun');
  h.session.dispatch(f.command);
  h.at(5000);
  assert.equal(h.session.view.animation!.progress, progress);
  assert.deepEqual(sample(h).pickedCells, []);
  assert.deepEqual(deliveries(h.sounds), []);
  h.session.action({ type: 'cancel' });
  assert.equal(h.session.view.confirmation, null);
  h.at(5049.999);
  assert.equal(sample(h).loadedCount, 0);
  h.at(5050);
  assert.equal(sample(h).loadedCount, 11);
  h.at(5549);
  assert.equal(h.session.view.animation!.shipment.chain, 1);
  h.at(5550);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  assert.equal(h.session.view.animation!.progress, 0);
  h.at(6549);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  h.at(6550);
  assert.equal(h.session.view.animation, null);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  h.at(100000);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  assert.equal(checksum(h.session.state), digest);
});

for (const interrupt of ['pause', 'background', 'exit'] as const) {
  test(`${interrupt} clears the current shipment and queued chain without residual or duplicate delivery`, () => {
    for (const elapsed of [499, 700, 980, 1500]) {
      const f = chainFixture(), h = harness(f.s);
      h.session.dispatch(f.command);
      if (elapsed >= 1000) h.at(1000);
      h.at(elapsed);
      assert.ok(h.session.view.animation?.transportPlan);
      const digest = checksum(h.session.state), score = h.session.state.score;
      const heard = deliveries(h.sounds);
      if (interrupt === 'pause') h.session.togglePause();
      else if (interrupt === 'background') h.session.hide();
      else {
        h.session.action({ type: 'home' });
        assert.equal(h.session.view.confirmation?.kind, 'leaveRun');
        h.session.action({ type: 'confirm' });
        assert.equal(h.session.view.screen, 'menu');
        assert.equal(h.session.view.confirmation, null);
      }
      assert.equal(h.session.view.animation, null);
      if (interrupt !== 'exit') {
        h.session.show();
        h.session.resume();
      }
      h.at(100000);
      assert.equal(h.session.view.animation, null);
      assert.deepEqual(deliveries(h.sounds), heard);
      assert.equal(h.session.state.score, score);
      assert.equal(checksum(h.session.state), digest);
    }
  });
}

test('reduced outbound keeps each chained shipment at 80 ms with no driving cue', () => {
  const f = chainFixture(), h = harness(f.s);
  h.session.action({ type: 'toggleMotion' });
  h.session.dispatch(f.command);
  const digest = checksum(h.session.state);
  h.at(79);
  assert.equal(h.session.view.animation!.shipment.chain, 1);
  h.at(80);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  assert.equal(h.session.view.animation!.progress, 0);
  h.at(159);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  h.at(160);
  assert.equal(h.session.view.animation, null);
  assert.equal(h.sounds.includes('forklift'), false);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  h.at(100000);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  assert.equal(checksum(h.session.state), digest);
});

test('two-color chain spends a second on each pre-clear snapshot and preserves its safe exit route', () => {
  const f = chainFixture(), h = harness(f.s), expected = applyCommand(h.session.state, f.command);
  const events = expected.events.filter(event => event.type === 'shipment');
  assert.equal(events.length, 2);
  const firstBoard = f.s.board.slice();
  firstBoard[13] = firstBoard[14] = 'cargo.food';
  firstBoard[22] = firstBoard[23] = 'cargo.chem';
  const secondBoard = firstBoard.slice();
  for (const cell of events[0].cells) secondBoard[cell] = null;
  h.session.dispatch(f.command);
  const first = h.session.view.animation!;
  assert.deepEqual(first.shipment, events[0]);
  assert.deepEqual(first.board, firstBoard);
  assert.equal(first.transportPlan!.durationMs, 1000);
  assert.deepEqual(first.transportPlan!.route, { moves: 5, turnQuarters: 3 });
  assert.deepEqual(first.transportPlan!.steps.filter(step => step.kind === 'move' && step.loadedCount > 0).map(step => step.to), [
    { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 7, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 4 },
  ]);
  const digest = checksum(h.session.state);
  h.session.dispatch(f.command);
  assert.equal(checksum(h.session.state), digest);
  h.at(999);
  assert.equal(h.session.view.animation!.shipment.chain, 1);
  h.at(1000);
  const second = h.session.view.animation!;
  assert.deepEqual(second.shipment, events[1]);
  assert.deepEqual(second.board, secondBoard);
  assert.deepEqual(first.board, firstBoard, 'advancing the queue must not mutate the earlier event snapshot');
  assert.equal(second.progress, 0);
  assert.equal(second.transportPlan!.durationMs, 1000);
  assert.deepEqual(second.transportPlan!.route, { moves: 2, turnQuarters: 0 });
  assert.deepEqual(second.transportPlan!.steps.filter(step => step.kind === 'move' && step.loadedCount > 0).map(step => step.to), [
    { x: 4, y: 1 }, { x: 4, y: 0 },
  ]);
  h.at(1999);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  h.at(2000);
  assert.equal(h.session.view.animation, null);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  assert.equal(checksum(h.session.state), checksum(expected.state));
});

test('skipping entire frames starts the next full second and credits each chained delivery once', () => {
  const f = chainFixture(), h = harness(f.s), expected = applyCommand(h.session.state, f.command);
  h.session.dispatch(f.command);
  h.at(100000);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  assert.equal(h.session.view.animation!.progress, 0);
  assert.deepEqual(deliveries(h.sounds), ['ship']);
  h.at(100999);
  assert.equal(h.session.view.animation!.shipment.chain, 2);
  h.at(101000);
  assert.equal(h.session.view.animation, null);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  assert.equal(h.sounds.includes('forklift'), false);
  h.at(200000);
  assert.deepEqual(deliveries(h.sounds), ['ship', 'chain2']);
  assert.equal(checksum(h.session.state), checksum(expected.state));
});
