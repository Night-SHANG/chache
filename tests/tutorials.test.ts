import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { advanceGuide, guideOverlay, isGuideComplete, OUTBOUND_GUIDE_V8 } from '../src/application/tutorials.ts';
import type { GuideProgress } from '../src/application/account-types.ts';
import { createPlayableRun, applyPlayableCommand, playableChecksum } from '../src/domain/playable.ts';
import { INBOUND_GUIDE_V9 } from '../src/domain/v9/tutorial.ts';
import { createRunV9, applyCommandV9 } from '../src/domain/v9/engine.ts';
import { UPGRADES_V9 } from '../src/domain/v9/content.ts';
import { checksumV9, replayV9 } from '../src/domain/v9/replay.ts';
import { createRun, applyCommand } from '../src/domain/engine.ts';
import { checksum, replay } from '../src/domain/replay.ts';
import { SHAPES } from '../src/domain/rulesets/v1/content.ts';
import { pieceCellCargo } from '../src/domain/pieces.ts';
import { collectGroupsV6, neighborsV6, orderStatusV6 } from '../src/domain/v6/board.ts';
import { OUTBOUND_DOCKS } from '../src/domain/v6/content.ts';
import type { InboundCommandV9, InboundEventV9 } from '../src/domain/v9/types.ts';
import type { Command, DomainEvent, RunState } from '../src/domain/types.ts';

interface InboundFixture { seed: number; firstChoices: string[]; prefix: InboundCommandV9[]; branches: Record<string, { commands: InboundCommandV9[]; rushCell: number; trace: { commandIndex: number; checksum: string; events: InboundEventV9[] }[] }> }
interface OutboundFixture { seed: number; commands: Command[]; trace: { commandIndex: number; checksum: string; events: DomainEvent[] }[]; checkpoints: Record<string, number> }
const inboundFixture = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-tutorial.json', import.meta.url), 'utf8')) as InboundFixture;
const outboundFixture = JSON.parse(readFileSync(new URL('./fixtures/outbound-v8-tutorial.json', import.meta.url), 'utf8')) as OutboundFixture;

const progress = (): GuideProgress => ({ learned: [], skipped: false, authoredStartConsumed: false });
const inbound = () => createPlayableRun({ family: 'inbound', mode: 'standard', rulesetVersion: 9, seed: 1, guided: true, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } });

test('skipping stays distinct from learning and leaves both tracks independent', () => {
  const skipped = { ...progress(), skipped: true, authoredStartConsumed: true };
  assert.equal(isGuideComplete('inbound', skipped), false);
  assert.equal(isGuideComplete('outbound', skipped), false);
  assert.equal(guideOverlay('inbound', skipped, inbound()), null);
  assert.deepEqual(skipped.learned, []);
});

test('rejected real placements do not advance learned or mutate progress', () => {
  const before = inbound(), initial = progress(), snapshot = JSON.stringify(initial);
  const command = { type: 'place' as const, pieceId: before.candidates[0].id, origin: { x: -1, y: 0 } };
  const rejected = applyPlayableCommand(before, command);
  assert.ok(rejected.error);
  assert.deepEqual(advanceGuide('inbound', initial, before, command, rejected), initial);
  assert.equal(JSON.stringify(initial), snapshot);
  assert.equal(playableChecksum(rejected.state), playableChecksum(before));
});

test('a genuine accepted placement teaches inbound dragging without outbound steps', () => {
  const before = inbound(), initial = progress();
  const command = { type: 'place' as const, pieceId: before.candidates[0].id, origin: { x: 0, y: 0 } };
  const result = applyPlayableCommand(before, command);
  assert.equal(result.error, undefined);
  const learned = advanceGuide('inbound', initial, before, command, result);
  assert.equal(learned.learned.includes('place'), true);
  assert.equal(learned.learned.includes('colorExit'), false);
  assert.deepEqual(initial.learned, []);
  assert.equal(learned.authoredStartConsumed, false);
});

test('all three real first upgrades and both cleanup branches replay rush 3→2→1→waste before 30 orders', () => {
  assert.equal(INBOUND_GUIDE_V9.seed, inboundFixture.seed);
  let first = createRunV9({ seed: inboundFixture.seed, mode: 'standard', guided: true });
  assert.equal(first.boardSize, 7);
  assert.equal(first.candidates.length, 3);
  assert.equal(first.board.every(cell => cell === null), true);
  for (const command of inboundFixture.prefix) first = applyCommandV9(first, command).state;
  assert.equal(first.completedOrders, 4);
  assert.equal(first.phase, 'upgrade');
  assert.deepEqual(first.upgradeChoices, inboundFixture.firstChoices);
  assert.equal(new Set(first.upgradeChoices).size, 3);
  assert.ok(first.upgradeChoices.filter(id => UPGRADES_V9.find(upgrade => upgrade.id === id)?.functional).length >= 2);
  assert.equal(Object.keys(inboundFixture.branches).length, 6);
  for (const [key, branch] of Object.entries(inboundFixture.branches)) {
    assert.deepEqual(INBOUND_GUIDE_V9.branches[key], branch.commands);
    let guided = createRunV9({ seed: inboundFixture.seed, mode: 'standard', guided: true });
    let inboundProgress = { ...progress(), authoredStartConsumed: true };
    const timers: (number | 'waste')[] = [];
    let cleanupChosen = false, wasteCleared = false;
    for (const [index, command] of branch.commands.entries()) {
      const before = guided, result = applyCommandV9(before, command);
      assert.equal(result.error, undefined, `${key} command ${index + 1}`);
      guided = result.state;
      inboundProgress = advanceGuide('inbound', inboundProgress, before, command, result);
      assert.equal(checksumV9(guided), branch.trace[index].checksum);
      assert.deepEqual(result.events, branch.trace[index].events);
      if (result.events.some(event => event.type === 'cleanupChosen')) {
        assert.equal(before.shift, 2);
        assert.equal(before.cleanup, null);
        assert.equal(guided.cleanup?.progress, 0);
        cleanupChosen = true;
      }
      const oldTrait = before.cellTraits[branch.rushCell], trait = guided.cellTraits[branch.rushCell];
      if (trait?.kind === 'rush' && oldTrait?.kind !== 'rush') {
        assert.equal(guided.shift, 2, `${key} introduces rush in stage 2`);
        assert.equal(trait.remaining, 3);
      }
      const timer = trait?.kind === 'rush' ? trait.remaining : trait?.kind === 'waste' ? 'waste' : undefined;
      if (timer !== undefined && timers[timers.length - 1] !== timer) timers.push(timer);
      if (result.events.some(event => event.type === 'cleanup' && event.cells.includes(branch.rushCell))) {
        assert.equal(oldTrait?.kind, 'waste');
        assert.equal(guided.board[branch.rushCell], null);
        wasteCleared = true;
      }
    }
    assert.deepEqual(timers, [3, 2, 1, 'waste'], key);
    assert.equal(cleanupChosen, true);
    assert.equal(wasteCleared, true);
    assert.equal(isGuideComplete('inbound', inboundProgress), true);
    assert.ok(guided.completedOrders < 30);
    assert.equal(inboundProgress.learned.includes('colorExit'), false);
    const replayed = replayV9({ seed: inboundFixture.seed, mode: 'standard', guided: true }, branch.commands).state;
    assert.equal(checksumV9(guided), checksumV9(replayed));
    assert.deepEqual(replayed.commands, branch.commands);
  }
});

test('outbound easy tutorial proves minimum four, correct exits, orthogonal groups and empty forklift routes', () => {
  assert.equal(outboundFixture.commands.length, 5, 'All five teaching observations precede guide completion');
  assert.equal(OUTBOUND_GUIDE_V8.seed, outboundFixture.seed);
  assert.deepEqual(OUTBOUND_GUIDE_V8.commands, outboundFixture.commands);
  let guided = createRun(outboundFixture.seed, 'color_exit', 8, 'easy');
  let outboundProgress = { ...progress(), authoredStartConsumed: true };
  assert.equal(guided.board.every(cell => cell === null), true);
  let mixedObserved = false, diagonalObserved = false, smallGroupObserved = false;
  for (const [index, command] of outboundFixture.commands.entries()) {
    assert.equal(command.type, 'place');
    if (command.type !== 'place') throw Error('Fixture must use real placements');
    const before = guided, piece = before.candidates.find(candidate => candidate.id === command.pieceId)!;
    const shape = SHAPES.find(shape => shape.id === piece.shapeId)!;
    const placedCells = shape.cells.map(offset => (command.origin.y + offset.y) * 9 + command.origin.x + offset.x);
    const observed = [...before.board];
    for (const [cellIndex, cell] of placedCells.entries()) observed[cell] = pieceCellCargo(piece, cellIndex);
    const result = applyCommand(before, command);
    assert.equal(result.error, undefined);
    guided = result.state;
    assert.equal(guided.board[76], null, 'Leaving the entry open must not fake an entry-blocked loss');
    assert.equal(guided.result, null);
    assert.equal(checksum(guided), outboundFixture.trace[index].checksum);
    assert.deepEqual(result.events, outboundFixture.trace[index].events);
    const shipments = result.events.filter(event => event.type === 'shipment');
    for (const shipment of shipments) {
      const dock = OUTBOUND_DOCKS.find(dock => dock.id === shipment.dockId)!;
      assert.equal(shipment.cargo, dock.cargo);
      assert.ok(shipment.cells.includes(dock.entry.y * 9 + dock.entry.x));
      assert.ok(shipment.cells.length >= 4);
      assert.equal(shipment.cells.every(cell => observed[cell] === shipment.cargo), true);
      const groups = collectGroupsV6(observed);
      assert.deepEqual(groups.find(group => group.cells.includes(shipment.cells[0]))?.cells, shipment.cells);
      assert.deepEqual(shipment.path[0], { x: 4, y: 8 });
      assert.equal(shipment.path.every(point => observed[point.y * 9 + point.x] === null), true);
      assert.equal(shipment.path.slice(1).every((point, index) => Math.abs(point.x - shipment.path[index].x) + Math.abs(point.y - shipment.path[index].y) === 1), true);
      const last = shipment.path[shipment.path.length - 1];
      assert.ok(shipment.cells.some(cell => neighborsV6(cell).includes(last.y * 9 + last.x)));
      for (const cell of shipment.cells) observed[cell] = null;
    }
    if (index + 1 === outboundFixture.checkpoints.insufficient) {
      const north = guided.orders.find(order => order.dockId === 'dock.north')!;
      const status = orderStatusV6(guided, north);
      assert.equal(status.count, 3);
      assert.equal(status.exitConnected, true);
      assert.equal(status.status, 'need');
      assert.equal(guided.completedOrders, 0);
      smallGroupObserved = true;
    }
    if (index + 1 === outboundFixture.checkpoints.diagonalSeparation) {
      const groups = collectGroupsV6(guided.board), upper = groups.find(group => group.cells.includes(21))!, gate = groups.find(group => group.cells.includes(4))!;
      assert.equal(upper.cargo, gate.cargo);
      assert.equal(upper.cells.length, 3);
      assert.equal(gate.cells.length, 3);
      assert.ok(upper.cells.length + gate.cells.length >= 4);
      assert.ok(Math.abs(21 % 9 - 13 % 9) === 1 && Math.abs(Math.floor(21 / 9) - Math.floor(13 / 9)) === 1);
      assert.notEqual(upper, gate);
      assert.equal(shipments.length, 0, 'A diagonal touch cannot join cargo to its exit');
      diagonalObserved = true;
    }
    if (index + 1 === outboundFixture.checkpoints.mixedRemainder) {
      assert.ok(piece.cellCargos);
      assert.equal(shipments.length, 1);
      const cleared = new Set(shipments.flatMap(shipment => shipment.cells));
      const clearedOwn = placedCells.filter(cell => cleared.has(cell)), remaining = placedCells.filter(cell => !cleared.has(cell));
      assert.ok(clearedOwn.length > 0 && remaining.length > 0);
      for (const cell of remaining) {
        assert.equal(guided.board[cell], pieceCellCargo(piece, placedCells.indexOf(cell)));
        assert.notEqual(guided.board[cell], shipments[0].cargo);
      }
      assert.deepEqual(remaining, [50, 51]);
      mixedObserved = true;
    }
    outboundProgress = advanceGuide('outbound', outboundProgress, before, command, result);
  }
  assert.equal(smallGroupObserved && diagonalObserved && mixedObserved, true);
  assert.equal(isGuideComplete('outbound', outboundProgress), true);
  assert.equal(outboundProgress.learned.includes('mixedRemainder'), true);
  assert.equal(outboundProgress.learned.includes('upgrade'), false);
  assert.ok(guided.completedOrders < 30);
  const replayed = replay(outboundFixture.seed, outboundFixture.commands, 'color_exit', 8, 'easy');
  assert.equal(checksum(guided), checksum(replayed));
  assert.equal(replayed.rulesetVersion, 8);
  assert.equal(replayed.difficultyId, 'easy');
});

test('authored overlay identifies the actual candidate and legal drag origin; branches stay real choices', () => {
  const branch = inboundFixture.branches[`${inboundFixture.firstChoices[0]}.orders`];
  let state = createRunV9({ seed: inboundFixture.seed, mode: 'standard', guided: true });
  const initial = { ...progress(), authoredStartConsumed: true };
  for (const command of branch.commands.slice(0, inboundFixture.prefix.length)) {
    const overlay = guideOverlay('inbound', initial, state);
    assert.ok(overlay);
    assert.deepEqual(overlay.expectedCommand, command);
    assert.equal(overlay.selectedPieceId, command.type === 'place' ? command.pieceId : undefined);
    if (command.type === 'place') assert.deepEqual(overlay.allowedOrigins, [command.origin]);
    state = applyCommandV9(state, command).state;
  }
  const choice = guideOverlay('inbound', initial, state);
  assert.equal(choice?.step, 'upgrade');
  assert.equal(choice?.expectedCommand, undefined);
  assert.equal(choice?.allowedOrigins, undefined);
  const before = JSON.stringify(state);
  assert.equal(guideOverlay('inbound', { ...initial, skipped: true }, state), null);
  assert.equal(JSON.stringify(state), before);
});

test('unlearned tracks do not substitute infinite expert identity or restrict it to the authored easy fixture', () => {
  const state = createPlayableRun({ family: 'outbound', variant: 'endless', rulesetVersion: 10, difficultyId: 'expert', seed: 12 });
  assert.equal(state.rulesetVersion, 10);
  assert.equal('difficultyId' in state ? state.difficultyId : undefined, 'expert');
  const overlay = guideOverlay('outbound', progress(), state);
  assert.equal(overlay?.selectedPieceId, undefined);
  assert.equal(overlay?.expectedCommand, undefined);
  assert.equal(overlay?.allowedOrigins, undefined);
  assert.deepEqual(progress().learned, []);
});

test('outbound authored hints cover exit, diagonal grouping, route and mixed remainder before completion', () => {
  let state = createRun(outboundFixture.seed, 'color_exit', 8, 'easy');
  let learned = { ...progress(), authoredStartConsumed: true };
  const steps = ['place', 'colorExit', 'colorGroup', 'route', 'mixedRemainder'];
  for (const [index, command] of outboundFixture.commands.entries()) {
    const overlay = guideOverlay('outbound', learned, state);
    assert.equal(overlay?.step, steps[index]);
    assert.deepEqual(overlay?.expectedCommand, command);
    const result = applyCommand(state, command);
    learned = advanceGuide('outbound', learned, state, command, result);
    state = result.state;
    assert.equal(isGuideComplete('outbound', learned), index === outboundFixture.commands.length - 1);
  }
  assert.equal(guideOverlay('outbound', learned, state), null);
});

test('completed guides have no overlay and learning rejects unrelated rule families', () => {
  const complete: GuideProgress = { ...progress(), learned: ['place', 'order', 'route', 'upgrade', 'rushTimer', 'expired', 'sweepChoice'] };
  assert.equal(isGuideComplete('inbound', complete), true);
  assert.equal(isGuideComplete('outbound', complete), false);
  assert.equal(guideOverlay('inbound', complete, inbound()), null);
  const state: RunState = createRun(outboundFixture.seed, 'color_exit', 8, 'easy');
  const command = outboundFixture.commands[0], result = applyCommand(state, command);
  assert.deepEqual(advanceGuide('inbound', progress(), state, command, result), progress());
});
