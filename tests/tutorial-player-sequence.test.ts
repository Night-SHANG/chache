import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { GuideProgress, GuideTrack } from '../src/application/account-types.ts';
import { advanceGuide, guideOverlay, isGuideComplete } from '../src/application/tutorials.ts';
import { applyPlayableCommand, createPlayableRun, findPlayableMoves, playableChecksum } from '../src/domain/playable.ts';
import type { GameCommand, GameRun, RunSpec } from '../src/domain/playable.ts';

interface Sequence { commands: GameCommand[]; trace: { checksum: string }[] }
const inbound = JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-tutorial.json', import.meta.url), 'utf8')) as { seed: number; branches: Record<string, Sequence> };
const outbound = JSON.parse(readFileSync(new URL('./fixtures/outbound-v8-tutorial.json', import.meta.url), 'utf8')) as { seed: number } & Sequence;
const inboundSpec: RunSpec = { family: 'inbound', mode: 'standard', rulesetVersion: 9, seed: inbound.seed, guided: true, toolCharges: { rotate: 0, clear: 0, wildcard: 0 } };
const outboundSpec: RunSpec = { family: 'outbound', variant: 'normal', rulesetVersion: 8, seed: outbound.seed, difficultyId: 'easy' };
const initialProgress = (): GuideProgress => ({ learned: [], skipped: false, authoredStartConsumed: true });

/** Pure reducer/guide sequence evidence. Actual account commits and Session publication are E4. */
function snapshots(spec: RunSpec, track: GuideTrack, sequence: Sequence): { state: GameRun; progress: GuideProgress }[] {
  let state = createPlayableRun(spec), progress = initialProgress();
  const states = [{ state, progress }];
  for (const [index, command] of sequence.commands.entries()) {
    const frozenBefore = JSON.stringify({ state, progress });
    const result = applyPlayableCommand(state, command);
    assert.equal(result.error, undefined);
    const learned = advanceGuide(track, progress, state, command, result);
    assert.equal(JSON.stringify({ state, progress }), frozenBefore, 'Advancement must not mutate the previously confirmed state');
    state = result.state;
    progress = learned;
    assert.equal(playableChecksum(state), sequence.trace[index].checksum);
    states.push({ state, progress });
  }
  return states;
}

test('each genuine tutorial checkpoint continues identically after JSON round-trip of board and learned together', () => {
  const cases: { spec: RunSpec; track: GuideTrack; sequence: Sequence }[] = [
    ...Object.values(inbound.branches).map(sequence => ({ spec: inboundSpec, track: 'inbound' as const, sequence })),
    { spec: outboundSpec, track: 'outbound', sequence: outbound },
  ];
  for (const { spec, track, sequence } of cases) {
    const states = snapshots(spec, track, sequence), final = states[states.length - 1];
    for (const [cut, snapshot] of states.entries()) {
      let recovered = JSON.parse(JSON.stringify(snapshot)) as { state: GameRun; progress: GuideProgress };
      assert.equal(playableChecksum(recovered.state), playableChecksum(snapshot.state));
      assert.deepEqual(recovered.progress, snapshot.progress);
      for (const [offset, command] of sequence.commands.slice(cut).entries()) {
        const result = applyPlayableCommand(recovered.state, command);
        assert.equal(result.error, undefined);
        recovered = { state: result.state, progress: advanceGuide(track, recovered.progress, recovered.state, command, result) };
        assert.equal(playableChecksum(recovered.state), sequence.trace[cut + offset].checksum);
      }
      assert.equal(playableChecksum(recovered.state), playableChecksum(final.state));
      assert.deepEqual(recovered.progress, final.progress);
      assert.equal(isGuideComplete(track, recovered.progress), true);
    }
  }
});

test('skipped prompts at placement, reward and stage-two cleanup checkpoints leave all gameplay facts untouched', () => {
  const sequence = Object.values(inbound.branches)[0], states = snapshots(inboundSpec, 'inbound', sequence);
  const checkpoints = states.filter(({ state }) => state.commandIndex === 1 || state.phase === 'upgrade' || state.phase === 'cleanup' || ('cleanup' in state && state.cleanup?.progress === 0 && state.shift === 2));
  assert.ok(checkpoints.some(({ state }) => state.phase === 'upgrade'));
  assert.ok(checkpoints.some(({ state }) => state.phase === 'cleanup'));
  for (const snapshot of checkpoints) {
    const stateBytes = JSON.stringify(snapshot.state), previous = JSON.stringify(snapshot.progress);
    const skipped: GuideProgress = { ...snapshot.progress, learned: [...snapshot.progress.learned], skipped: true };
    assert.equal(guideOverlay('inbound', skipped, snapshot.state), null);
    assert.equal(JSON.stringify(snapshot.state), stateBytes);
    assert.equal(JSON.stringify(snapshot.progress), previous);
    assert.deepEqual(skipped.learned, snapshot.progress.learned);
    assert.equal(skipped.authoredStartConsumed, true);
    let continued = snapshot.state, learned = skipped;
    for (const command of sequence.commands.slice(continued.commandIndex)) {
      const result = applyPlayableCommand(continued, command);
      assert.equal(result.error, undefined);
      learned = advanceGuide('inbound', learned, continued, command, result);
      continued = result.state;
    }
    assert.equal(playableChecksum(continued), sequence.trace[sequence.trace.length - 1].checksum);
    assert.equal(learned.skipped, true);
    assert.equal(learned.authoredStartConsumed, true);
  }
});

test('leaving the authored prefix permits ordinary legal play without inventing a new guided board', () => {
  const state = createPlayableRun(inboundSpec), initial = initialProgress();
  const expected = guideOverlay('inbound', initial, state)?.expectedCommand;
  assert.ok(expected?.type === 'place');
  const alternate = findPlayableMoves(state).find(move => move.pieceId !== expected.pieceId || move.origin.x !== expected.origin.x || move.origin.y !== expected.origin.y)!;
  const command = { type: 'place' as const, ...alternate }, result = applyPlayableCommand(state, command);
  assert.equal(result.error, undefined);
  const learned = advanceGuide('inbound', initial, state, command, result);
  const overlay = guideOverlay('inbound', learned, result.state);
  assert.equal(overlay?.expectedCommand, undefined);
  assert.equal(overlay?.selectedPieceId, undefined);
  assert.equal(overlay?.allowedOrigins, undefined);
  assert.equal(result.state.seed, state.seed);
  assert.equal(result.state.rulesetVersion, 9);
  assert.equal(result.state.commandIndex, 1);
  assert.equal('guided' in result.state && result.state.guided, true);
});
