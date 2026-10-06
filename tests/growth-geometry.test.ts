import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_EXIT_DOCKS, COLOR_EXIT_ENTRY, DOCKS } from '../src/domain/content.ts';
import type { GameRun, GameShipment } from '../src/domain/playable.ts';
import type { Point } from '../src/domain/types.ts';
import type { ShipmentV9 } from '../src/domain/v9/types.ts';
import { boardGeometry } from '../src/presentation/board-geometry.ts';
import { cellCenter, pointToCell } from '../src/presentation/layout.ts';
import { dockPosition, routePose, shipmentFrame, shipmentGate, shipmentPose, shipmentTiming } from '../src/presentation/motion.ts';

const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const pixels = (point: Point, size: number): Point => ({ x: 120 + (point.x + .5) * 840 / size, y: 560 + (point.y + .5) * 840 / size });
const onSegment = (point: Point, from: Point, to: Point): boolean => Math.abs((point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x)) < 1e-5
  && point.x >= Math.min(from.x, to.x) - 1e-8 && point.x <= Math.max(from.x, to.x) + 1e-8
  && point.y >= Math.min(from.y, to.y) - 1e-8 && point.y <= Math.max(from.y, to.y) + 1e-8;
const onRoute = (point: Point, route: Point[]): boolean => route.slice(1).some((to, index) => onSegment(point, route[index], to));

test('expanded growth geometry keeps original dock lanes and uses 105 pixel cells', () => {
  const source: Pick<GameRun, 'boardSize'> = { boardSize: 8 };
  const geometry = boardGeometry(source);
  assert.equal(geometry.boardSize, 8);
  assert.equal(geometry.dimension, 8);
  assert.equal(geometry.cell, 105);
  assert.equal(geometry.scale, .875);
  assert.equal(geometry.boxSize, 96.25);
  assert.deepEqual(geometry.docks.map(dock => [dock.id, dock.entry]), [
    ['dock.north', { x: 3, y: 0 }], ['dock.east', { x: 7, y: 3 }],
    ['dock.south', { x: 3, y: 7 }], ['dock.west', { x: 0, y: 3 }],
  ]);
  assert.deepEqual(dockPosition(geometry.docks[1], source), { x: 981, y: 927.5 });
  assert.deepEqual(dockPosition(geometry.docks[2], source), { x: 487.5, y: 1413.125 });
});

test('all growth cell centers round trip after seven to eight expansion and reject outer edges', () => {
  for (const boardSize of [7, 8] as const) {
    const source: Pick<GameRun, 'boardSize'> = { boardSize };
    for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) {
      const point = { x, y };
      assert.deepEqual(cellCenter(point, source), pixels(point, boardSize));
      assert.deepEqual(pointToCell(pixels(point, boardSize), source), point);
    }
    for (const point of [{ x: 120, y: 560 }, { x: 959.999, y: 560 }, { x: 120, y: 1399.999 }, { x: 959.999, y: 1399.999 }]) {
      assert.deepEqual(pointToCell(point, source), { x: point.x === 120 ? 0 : boardSize - 1, y: point.y === 560 ? 0 : boardSize - 1 });
    }
    for (const point of [{ x: 960, y: 560 }, { x: 120, y: 1400 }, { x: 119.999, y: 560 }, { x: 120, y: 559.999 }, { x: NaN, y: 600 }]) assert.equal(pointToCell(point, source), null);
  }
  assert.deepEqual([{ x: 0, y: 0 }, { x: 6, y: 6 }].map(cellCenter), [{ x: 180, y: 620 }, { x: 900, y: 1340 }]);
});

test('legacy seven and outbound nine geometry retain every existing field and dock coordinate', () => {
  for (const dimension of [7, 9] as const) {
    const geometry = boardGeometry(dimension === 7 ? undefined : { boardSize: 9 });
    const middle = Math.floor(dimension / 2);
    const adapt = <T extends typeof DOCKS[number]>(dock: T): T => dimension === 7 ? dock : { ...dock, entry: {
      x: dock.side === 'west' ? 0 : dock.side === 'east' ? 8 : middle,
      y: dock.side === 'north' ? 0 : dock.side === 'south' ? 8 : middle,
    } };
    assert.deepEqual(geometry, { boardSize: dimension, dimension, x: 120, y: 560, size: 840, cell: 840 / dimension,
      boxSize: 110 * (7 / dimension), scale: 7 / dimension, docks: DOCKS.map(adapt), colorExits: COLOR_EXIT_DOCKS.map(adapt), entry: adapt(COLOR_EXIT_ENTRY) });
    for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) assert.deepEqual(pointToCell(cellCenter({ x, y }, geometry), geometry), { x, y });
  }
});

function eventFor(boardSize: 7 | 8, side: 'north' | 'east' | 'south' | 'west' | 'side'): ShipmentV9 {
  const entry = side === 'side' ? { x: 0, y: boardSize - 1 } : {
    x: side === 'west' ? 0 : side === 'east' ? boardSize - 1 : 3,
    y: side === 'north' ? 0 : side === 'south' ? boardSize - 1 : 3,
  };
  const inward = { x: side === 'west' || side === 'side' ? 1 : side === 'east' ? -1 : 0, y: side === 'north' ? 1 : side === 'south' ? -1 : 0 };
  const tangent = inward.x ? { x: 0, y: side === 'side' ? -1 : 1 } : { x: 1, y: 0 };
  const path = [entry, { x: entry.x + inward.x, y: entry.y + inward.y },
    { x: entry.x + inward.x * 2, y: entry.y + inward.y * 2 },
    { x: entry.x + inward.x * 2 + tangent.x, y: entry.y + inward.y * 2 + tangent.y }];
  const end = path[path.length - 1], cargo = { x: end.x + inward.x, y: end.y + inward.y };
  return { type: 'shipment', boardSize, gateId: `dock.${side}`, dockId: side === 'side' ? 'dock.east' : `dock.${side}`,
    orderId: 'order.geometry', cargo: 'cargo.food', cells: [cargo.y * boardSize + cargo.x], path, score: 450, chain: 1, units: 1, extraClearedCells: [] };
}

for (const boardSize of [7, 8] as const) for (const side of ['north', 'east', 'south', 'west', 'side'] as const) test(`growth ${boardSize} ${side} samples a complete canonical load and same-gate return`, () => {
  const event: GameShipment = eventFor(boardSize, side), before = JSON.stringify(event);
  const geometry = boardGeometry(event), centers = event.path.map(point => pixels(point, boardSize));
  const entry = centers[0], horizontal = side === 'east' || side === 'west' || side === 'side';
  const inward = { x: side === 'east' ? -1 : horizontal ? 1 : 0, y: side === 'north' ? 1 : side === 'south' ? -1 : 0 };
  const angle = Math.atan2(inward.y, inward.x);
  const outside = { x: entry.x - inward.x * geometry.cell * 1.6, y: entry.y - inward.y * geometry.cell * 1.6 };
  const gate = shipmentGate(event);
  assert.ok(gate);
  assert.deepEqual(gate, { x: horizontal ? side === 'east' ? 960 + 24 * geometry.scale : 120 - 24 * geometry.scale : entry.x,
    y: side === 'north' ? 560 - 10 * geometry.scale : side === 'south' ? 1400 + 15 * geometry.scale : entry.y });
  assert.deepEqual(routePose(event.path, 0, event), { ...centers[0], angle });
  const approach = [outside, ...centers], returning = [...centers].reverse().concat(gate);
  for (let index = 0; index <= 500; index++) {
    const frame = shipmentFrame(index / 500, false), pose = shipmentPose(event, frame);
    assert.ok(pose, `valid pose at ${index}`);
    assert.ok([pose.x, pose.y, pose.angle, pose.cargo.x, pose.cargo.y, pose.alpha].every(Number.isFinite));
    if (frame.stage === 'move') assert.ok(onRoute(pose, approach), 'approach cannot shortcut canonical corners');
    if (frame.stage === 'carry') assert.ok(onRoute(pose, returning), 'loaded return uses the entrance route in reverse');
    if (frame.stage === 'collect') assert.deepEqual({ x: pose.x, y: pose.y }, centers[centers.length - 1]);
    if (frame.stage === 'exit') assert.ok(onSegment(pose, gate, outside), 'exit leaves through the actual gate');
    near(pose.cargo.x - pose.x, Math.cos(pose.angle) * geometry.cell * .48);
    near(pose.cargo.y - pose.y, Math.sin(pose.angle) * geometry.cell * .48);
    assert.equal(pose.loaded, frame.stage === 'carry' || frame.stage === 'exit' || frame.stage === 'collect' && frame.collect === 1);
  }
  const finish = shipmentPose(event, shipmentFrame(1, false));
  assert.ok(finish); near(finish.x, outside.x); near(finish.y, outside.y); near(finish.angle, angle); assert.equal(finish.alpha, 0);
  const reduced = shipmentPose(event, shipmentFrame(0, true));
  assert.ok(reduced); assert.equal(reduced.loaded, false);
  for (const progress of [.1, .5, .9, 1]) assert.deepEqual(shipmentPose(event, shipmentFrame(progress, true)), reduced);
  assert.equal(JSON.stringify(event), before);
  assert.equal(shipmentTiming(false).totalMs, 1000);
  assert.equal(shipmentTiming(true).totalMs, 80);
});

test('growth shipment metadata rejects wrong physical gate and preserves forged legacy dimension refusal', () => {
  const event = eventFor(8, 'side'), frame = shipmentFrame(.7, false);
  for (const patch of [{ gateId: 'dock.west' }, { gateId: undefined }, { gateId: 'gate.side' }, { boardSize: 9 }, { boardSize: undefined }]) {
    assert.equal(shipmentPose({ ...event, ...patch } as unknown as GameShipment, frame), null);
    assert.equal(shipmentGate({ ...event, ...patch } as unknown as GameShipment), null);
  }
  const legacy = { ...eventFor(7, 'north') };
  delete (legacy as Partial<ShipmentV9>).gateId;
  for (const boardSize of [0, 7, 8, 10, NaN, '9']) assert.equal(shipmentPose({ ...legacy, boardSize } as unknown as GameShipment, frame), null);
});
