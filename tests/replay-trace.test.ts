import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun, applyCommand, findLegalMoves} from '../src/domain/engine.ts';
import {checksum, replay, replayWithTrace, findReplayDivergence} from '../src/domain/replay.ts';
import type {Command} from '../src/domain/types.ts';

for (const version of [1, 2, 3]) {
  test(`v${version} replay trace records the checksum after every accepted command`, () => {
    const seed = 734;
    let state = createRun(seed, 'standard', version);
    const commands: Command[] = [], expected: {commandIndex: number; checksum: string}[] = [];
    for (let i = 0; i < 20 && state.phase !== 'result'; i++) {
      const moves = findLegalMoves(state);
      const command: Command = state.phase === 'upgrade'
        ? {type: 'upgrade', upgradeId: state.upgradeChoices[0]}
        : {type: 'place', ...moves[(i * 11) % moves.length]};
      commands.push(command);
      const applied = applyCommand(state, command);
      assert.equal(applied.error, undefined);
      state = applied.state;
      expected.push({commandIndex: state.commandIndex, checksum: checksum(state)});
    }
    const before = structuredClone(commands), result = replayWithTrace(seed, commands, 'standard', version);
    assert.deepEqual(result.trace, expected);
    assert.deepEqual(result.state, state);
    assert.deepEqual(result.state, replay(seed, commands, 'standard', version));
    assert.deepEqual(commands, before, 'tracing does not alter the supplied command stream');
  });
}

test('trace preserves the v1 default and both frozen tutorial goldens', () => {
  const commands: Command[] = [
    {type: 'place', pieceId: 'piece.3', origin: {x: 1, y: 1}},
    {type: 'place', pieceId: 'piece.4', origin: {x: 3, y: 1}},
  ];
  assert.deepEqual(replayWithTrace(123, commands, 'tutorial').trace, [
    {commandIndex: 1, checksum: 'c4a175ee'}, {commandIndex: 2, checksum: 'b13abf7f'},
  ]);
  assert.equal(replayWithTrace(123, commands, 'tutorial', 2).trace[1].checksum, 'b656e05c');
  assert.deepEqual(replayWithTrace(123, []), {state: createRun(123), trace: []});
});

test('traced replay refuses illegal commands with the existing zero-based error location', () => {
  const state = createRun(12), commands: Command[] = [
    {type: 'place', ...findLegalMoves(state)[0]},
    {type: 'place', pieceId: 'unknown', origin: {x: 0, y: 0}},
  ];
  assert.throws(() => replayWithTrace(12, commands), /Replay command 1:/);
  assert.throws(() => replayWithTrace(12, [], 'standard', 99), /版本|version/i);
});

test('first replay divergence identifies the earliest mismatching command checksum', () => {
  const expected = [{commandIndex: 1, checksum: 'first'}, {commandIndex: 2, checksum: 'second'}, {commandIndex: 3, checksum: 'third'}];
  const actual = [{commandIndex: 1, checksum: 'first'}, {commandIndex: 2, checksum: 'changed'}, {commandIndex: 3, checksum: 'also changed'}];
  const before = structuredClone({expected, actual});
  assert.deepEqual(findReplayDivergence(expected, actual), {commandIndex: 2, expected: expected[1], actual: actual[1]});
  assert.deepEqual({expected, actual}, before);
  assert.equal(findReplayDivergence(expected, structuredClone(expected)), null);
  assert.equal(findReplayDivergence([], []), null);
});

test('trace comparison catches missing, extra and misnumbered commands', () => {
  const trace = [{commandIndex: 1, checksum: 'first'}, {commandIndex: 2, checksum: 'second'}];
  assert.deepEqual(findReplayDivergence(trace, trace.slice(0, 1)), {commandIndex: 2, expected: trace[1], actual: null});
  assert.deepEqual(findReplayDivergence(trace.slice(0, 1), trace), {commandIndex: 2, expected: null, actual: trace[1]});
  const changed = [{commandIndex: 7, checksum: 'first'}];
  assert.deepEqual(findReplayDivergence(trace, changed), {commandIndex: 1, expected: trace[0], actual: changed[0]});
});
