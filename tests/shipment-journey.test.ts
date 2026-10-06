import test from 'node:test';
import assert from 'node:assert/strict';
import * as motion from '../src/presentation/motion.ts';
import type { Shipment } from '../src/domain/types.ts';
import { DOCKS } from '../src/domain/content.ts';
import { cellCenter, L } from '../src/presentation/layout.ts';

test('shipment clock budgets approach, loading, return and exit within one second', () => {
  assert.deepEqual(motion.shipmentTiming(false), { routeMs: 100, moveMs: 260, collectMs: 140, carryMs: 360, exitMs: 140, totalMs: 1000 });
  assert.deepEqual(motion.shipmentTiming(true), { routeMs: 0, moveMs: 0, collectMs: 80, carryMs: 0, exitMs: 0, totalMs: 80 });
});

test('shipment stage transitions keep each independent progress bounded', () => {
  for (const [time, stage] of [[0, 'route'], [99, 'route'], [100, 'move'], [359, 'move'], [360, 'collect'], [499, 'collect'], [500, 'carry'], [859, 'carry'], [860, 'exit'], [1000, 'exit']] as const) {
    assert.equal(motion.shipmentFrame(time / 1000, false).stage, stage, `stage at ${time} ms`);
  }
  assert.equal(motion.shipmentFrame(.05, false).route, .5);
  assert.equal(motion.shipmentFrame(.23, false).move, .5);
  assert.equal(motion.shipmentFrame(.43, false).collect, .5);
  assert.equal(motion.shipmentFrame(.68, false).carry, .5);
  assert.equal(motion.shipmentFrame(.93, false).exit, .5);
  for (const progress of [-5, 0, .1, .36, .5, .86, 1, 5, Number.NaN, Infinity]) {
    const frame = motion.shipmentFrame(progress, false);
    for (const key of ['route', 'move', 'collect', 'carry', 'exit'] as const) assert.ok(frame[key] >= 0 && frame[key] <= 1, `${key} is a bounded unit value`);
  }
});

test('reduced shipment clock keeps only an 80 ms static loading presentation', () => {
  for (const progress of [0, .5, 1]) {
    assert.deepEqual(motion.shipmentFrame(progress, true), { stage: 'collect', route: 1, move: 0, collect: progress, carry: 0, exit: 0 });
  }
});

// These fixtures are real canonical paths: cargo is adjacent to, never on, the last path cell.
const shipment = (patch: Partial<Shipment> = {}): Shipment => ({ type: 'shipment', dockId: 'dock.north', orderId: 'order.journey', cargo: 'cargo.food', cells: [8, 9, 10], path: [{ x: 3, y: 0 }], score: 300, chain: 1, ...patch });
const frameAt = (stage: motion.ShipmentFrame['stage'], progress: number): motion.ShipmentFrame => ({
  stage, route: 1, move: stage === 'route' ? 0 : 1, collect: ['carry', 'exit'].includes(stage) ? 1 : 0, carry: stage === 'exit' ? 1 : 0, exit: 0, [stage]: progress,
});
const poseAt = (event: Shipment, stage: motion.ShipmentFrame['stage'], progress: number) => {
  assert.equal(typeof motion.shipmentPose, 'function', 'shipmentPose implements the complete visible cargo journey');
  const pose = motion.shipmentPose(event, frameAt(stage, progress));
  assert.ok(pose, 'a valid shipment has a pose');
  return pose;
};
const near = (actual: number, expected: number, message = '') => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
const angleNear = (actual: number, expected: number) => near(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)), 0, 'heading');
const at = (pose: { x: number; y: number }, point: { x: number; y: number }) => { near(pose.x, point.x); near(pose.y, point.y); };


test('tutorial single-cell route arrives facing the southern cargo group', () => {
  const event = shipment(), target = cellCenter({ x: 3, y: 0 });
  const start = poseAt(event, 'move', 0), end = poseAt(event, 'move', 1);
  assert.ok(start.y < L.board.y, 'entry begins outside the north gate even with one path cell');
  near(start.x, target.x); angleNear(start.angle, Math.PI / 2);
  at(end, target); angleNear(end.angle, Math.PI / 2);
  assert.equal(start.loaded, false); assert.equal(end.loaded, false);
  assert.deepEqual(poseAt(event, 'route', .1), poseAt(event, 'route', .9));
});

test('turning approach faces cargo rather than keeping the final travel heading', () => {
  const event = shipment({ cells: [11, 18, 25], path: [{ x: 3, y: 0 }, { x: 4, y: 0 }] });
  const end = poseAt(event, 'move', 1), loading = poseAt(event, 'collect', .5);
  at(end, cellCenter({ x: 4, y: 0 })); angleNear(end.angle, Math.PI / 2);
  at(loading, end); angleNear(loading.angle, Math.PI / 2);
  assert.equal(loading.loaded, false);
  assert.equal(poseAt(event, 'collect', 1).loaded, true);
  at(loading.cargo, { x: loading.x, y: loading.y + .48 * L.board.cell });
});

test('pickup heading chooses the lowest-index four-neighbor in every orientation', () => {
  const path = [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }];
  for (const [cells, heading] of [[[10, 18, 24, 16], -Math.PI / 2], [[18], 0], [[24], Math.PI / 2], [[16], Math.PI]] as [number[], number][]) {
    const pose = poseAt(shipment({ path, cells }), 'collect', .5);
    angleNear(pose.angle, heading);
    at(pose, cellCenter(path[path.length - 1]));
  }
});

test('carry keeps the package on the forks while reversing the same canonical path', () => {
  const event = shipment({ cells: [19], path: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 2 }] });
  const original = JSON.stringify(event), centers = [motion.shipmentGate(event)!, ...event.path.map(cellCenter)], samples = Array.from({ length: 1001 }, (_, index) => poseAt(event, 'carry', index / 1000));
  at(samples[0], centers[centers.length - 1]); angleNear(samples[0].angle, 0);
  at(samples[samples.length - 1], centers[0]); angleNear(samples[samples.length - 1].angle, Math.PI / 2);
  for (const pose of samples) {
    assert.equal(pose.loaded, true); assert.equal(pose.alpha, 1);
    at(pose.cargo, { x: pose.x + Math.cos(pose.angle) * .48 * L.board.cell, y: pose.y + Math.sin(pose.angle) * .48 * L.board.cell });
    const onCanonical = centers.slice(1).some((to, index) => {
      const from = centers[index];
      return Math.abs(Math.hypot(pose.x - from.x, pose.y - from.y) + Math.hypot(to.x - pose.x, to.y - pose.y) - Math.hypot(to.x - from.x, to.y - from.y)) < 1e-7;
    });
    assert.ok(onCanonical, 'return positions stay on the provided path');
  }
  for (let index = 1; index < samples.length; index++) {
    const before = samples[index - 1], current = samples[index], dx = current.x - before.x, dy = current.y - before.y;
    if (Math.hypot(dx, dy) > 1e-6) assert.ok(dx * Math.cos(current.angle) + dy * Math.sin(current.angle) < 0, 'moving cargo truck travels backward');
    assert.ok(Math.hypot(dx, dy) < 4, 'position does not jump at segment boundaries');
    assert.ok(Math.abs(Math.atan2(Math.sin(current.angle - before.angle), Math.cos(current.angle - before.angle))) < .12, 'turns do not snap at corners');
  }
  assert.equal(JSON.stringify(event), original, 'geometry does not mutate the domain event');
});

test('approach uses actual gate entry and visits canonical path cell centers', () => {
  const event = shipment({ cells: [19], path: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 2 }] });
  const samples = Array.from({ length: 2001 }, (_, index) => poseAt(event, 'move', index / 2000));
  for (const cell of event.path) {
    const center = cellCenter(cell);
    assert.ok(samples.some(pose => Math.hypot(pose.x - center.x, pose.y - center.y) < 1), 'canonical waypoints are not skipped or rounded away');
  }
  const endpoint = samples[samples.length - 1];
  at(endpoint, cellCenter(event.path[event.path.length - 1])); angleNear(endpoint.angle, 0);
});

test('single-cell return exits each actual gate before fading out', () => {
  for (const dock of DOCKS) {
    const entry = dock.entry, cargo = { x: entry.x + (dock.side === 'west' ? 1 : dock.side === 'east' ? -1 : 0), y: entry.y + (dock.side === 'north' ? 1 : dock.side === 'south' ? -1 : 0) };
    const event = shipment({ dockId: 'dock.north', path: [entry], cells: [cargo.y * 7 + cargo.x] });
    const start = poseAt(event, 'move', 0), loading = poseAt(event, 'collect', 1), back = poseAt(event, 'carry', 1), exit = poseAt(event, 'exit', 0), end = poseAt(event, 'exit', 1);
    at(back, motion.shipmentGate(event)!); at(exit, back); angleNear(exit.angle, back.angle);
    assert.ok(Math.hypot(start.x - loading.x, start.y - loading.y) > L.board.cell / 2);
    at(end, start); assert.equal(end.alpha, 0); assert.equal(end.loaded, true);
    for (const progress of [.1, .25, .5, .75, .9]) {
      const pose = poseAt(event, 'exit', progress);
      if (dock.side === 'north' || dock.side === 'south') near(pose.x, loading.x); else near(pose.y, loading.y);
      if (pose.alpha < 1) {
        const outside = dock.side === 'north' ? pose.cargo.y + 32 < L.board.y : dock.side === 'south' ? pose.cargo.y - 32 > L.board.y + L.board.size : dock.side === 'west' ? pose.cargo.x + 32 < L.board.x : pose.cargo.x - 32 > L.board.x + L.board.size;
        assert.ok(outside, 'the carried box clears the board before fade begins');
      }
    }
  }
});

test('southwestern side entry returns west even when fulfilling an eastern Dock order', () => {
  const event = shipment({ dockId: 'dock.east', path: [{ x: 0, y: 6 }, { x: 1, y: 6 }], cells: [36] });
  const start = poseAt(event, 'move', 0), end = poseAt(event, 'exit', 1);
  assert.ok(start.x < L.board.x); near(start.y, cellCenter(event.path[0]).y); angleNear(start.angle, 0);
  at(end, start); assert.ok(end.x < L.board.x); assert.equal(end.alpha, 0);
  const carryEnd = poseAt(event, 'carry', 1); at(carryEnd, motion.shipmentGate(event)!); angleNear(carryEnd.angle, 0);
});

test('reduced motion pose is identical throughout its loading duration', () => {
  const event = shipment({ cells: [11, 18, 25], path: [{ x: 3, y: 0 }, { x: 4, y: 0 }] });
  assert.equal(typeof motion.shipmentPose, 'function');
  const first = motion.shipmentPose(event, motion.shipmentFrame(0, true));
  assert.ok(first); at(first, cellCenter({ x: 4, y: 0 })); angleNear(first.angle, Math.PI / 2);
  for (const progress of [.1, .5, .9, 1]) assert.deepEqual(motion.shipmentPose(event, motion.shipmentFrame(progress, true)), first);
});

test('shipment geometry rejects malformed routes without producing NaN', () => {
  assert.equal(typeof motion.shipmentPose, 'function');
  const invalid = [shipment({ path: [] }), shipment({ cells: [] }), shipment({ path: [{ x: NaN, y: 0 }] }), shipment({ path: [{ x: 3, y: Infinity }] }), shipment({ path: [{ x: 3, y: 0 }, { x: 6, y: 6 }] }), shipment({ path: [{ x: 3, y: 0 }, { x: 3, y: 0 }] }), shipment({ cells: [NaN, -1, 49] }), shipment({ path: [{ x: 2, y: 2 }] }), { ...shipment(), path: null } as unknown as Shipment];
  for (const event of invalid) for (const stage of ['route', 'move', 'collect', 'carry', 'exit'] as const) assert.equal(motion.shipmentPose(event, frameAt(stage, .5)), null);
  for (const stage of ['route', 'move', 'collect', 'carry', 'exit'] as const) for (const progress of [-2, 2, NaN, Infinity]) {
    const pose = poseAt(shipment(), stage, progress);
    for (const value of [pose.x, pose.y, pose.angle, pose.cargo.x, pose.cargo.y, pose.alpha]) assert.ok(Number.isFinite(value));
  }
});

test('collected crate remains pallet-sized at the forklift loading anchor', () => {
  const anchor = { x: 660, y: 680 }, source = cellCenter({ x: 4, y: 2 });
  const loaded = motion.collectPose(source, anchor, 1, false);
  at(loaded, anchor); near(loaded.scale, 64 / 110);
});

test('physical gate follows the actual path entrance instead of the order Dock', () => {
  assert.equal(typeof motion.shipmentGate, 'function');
  for (const dock of DOCKS) assert.deepEqual(motion.shipmentGate(shipment({ dockId: 'dock.east', path: [dock.entry] })), motion.dockPosition(dock));
  assert.deepEqual(motion.shipmentGate(shipment({ dockId: 'dock.east', path: [{ x: 0, y: 6 }] })), { x: L.board.x - 24, y: cellCenter({ x: 0, y: 6 }).y });
  for (const path of [[], [{ x: 2, y: 2 }], [{ x: NaN, y: 0 }]]) assert.equal(motion.shipmentGate(shipment({ path })), null);
});

test('the entire loaded pallet and count badge clear the gate before fading', () => {
  for (const dock of DOCKS) {
    const entry = dock.entry, cargo = { x: entry.x + (dock.side === 'west' ? 1 : dock.side === 'east' ? -1 : 0), y: entry.y + (dock.side === 'north' ? 1 : dock.side === 'south' ? -1 : 0) };
    const pose = poseAt(shipment({ path: [entry], cells: [cargo.y * 7 + cargo.x] }), 'exit', .8);
    assert.ok(pose.alpha < 1);
    const outside = dock.side === 'north' ? pose.cargo.y + 52 < L.board.y : dock.side === 'south' ? pose.cargo.y - 34 > L.board.y + L.board.size : dock.side === 'west' ? pose.cargo.x + 35 < L.board.x : pose.cargo.x - 35 > L.board.x + L.board.size;
    assert.ok(outside, `${dock.side} pallet and badge clear the board`);
  }
});

test('sparse malformed paths are rejected without dereferencing an absent waypoint', () => {
  const path = [{ x: 3, y: 0 }, , { x: 3, y: 2 }] as Shipment['path'];
  assert.doesNotThrow(() => assert.equal(motion.shipmentPose(shipment({ path, cells: [24] }), frameAt('move', .5)), null));
});


test('a one-cell pickup visibly reverses to the gate within the carry stage', () => {
  const event = shipment(), pickup = poseAt(event, 'carry', 0), carrying = poseAt(event, 'carry', .5), atGate = poseAt(event, 'carry', 1);
  assert.ok(Math.hypot(carrying.x - pickup.x, carrying.y - pickup.y) > 10, 'a single-cell route still has real carry movement');
  at(atGate, motion.shipmentGate(event)!);
  const exit = poseAt(event, 'exit', 0); at(exit, atGate); angleNear(exit.angle, atGate.angle); at(exit.cargo, atGate.cargo);
});
