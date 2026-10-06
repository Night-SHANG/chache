import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, applyCommand, findLegalMoves } from '../src/domain/engine.ts';
import { checksum, replay } from '../src/domain/replay.ts';
import type { Command } from '../src/domain/types.ts';
test('same seed and mode creates byte-identical runs; seed changes generation', () => {
  assert.deepEqual(createRun(234), createRun(234));
  assert.notDeepEqual(createRun(234), createRun(235));
});
test('a complete command stream deterministically replays including upgrades', () => {
  const seed = 5678; let state = createRun(seed); const commands: Command[] = [];
  for (let i = 0; i < 120 && state.phase !== 'result'; i++) {
    const legal = findLegalMoves(state);
    const command: Command = state.phase === 'upgrade' ? { type: 'upgrade', upgradeId: state.upgradeChoices[0] } : { type: 'place', ...legal[(i * 11) % legal.length] };
    const result = applyCommand(state, command); assert.equal(result.error, undefined); commands.push(command); state = result.state;
    assert.equal(checksum(replay(seed, commands)), checksum(state));
  }
  assert.ok(commands.length > 3);
  assert.deepEqual(replay(seed, commands), state);
});
test('checksum covers board, active orders, score, shift and RNG', () => {
  const state = createRun(1); const initial = checksum(state);
  assert.match(initial, /^[a-f0-9]{8}$/);
  for (const field of ['board', 'orders', 'score', 'shift', 'rngState'] as const) {
    const changed = JSON.parse(JSON.stringify(state));
    if (field === 'board') changed.board[0] = 'cargo.food';
    else if (field === 'orders') changed.orders[0].amount++;
    else if (field === 'rngState') changed.rngState[0] ^= 1;
    else changed[field]++;
    assert.notEqual(checksum(changed), initial, field);
  }
});
test('replay fails loudly on an illegal command instead of silently diverging', () => {
  assert.throws(() => replay(1, [{ type: 'place', pieceId: 'unknown', origin: { x: 0, y: 0 } }]), /command 0/i);
});
test('snapshot serialization preserves deterministic continuation', () => {
  const state = createRun(987); const command: Command = { type: 'place', ...findLegalMoves(state)[15] };
  assert.deepEqual(applyCommand(state, command), applyCommand(JSON.parse(JSON.stringify(state)), command));
});
test('golden tutorial replay fixes the per-command checksum, score, and command IDs', () => {
  const commands:Command[]=[{type:'place',pieceId:'piece.3',origin:{x:1,y:1}},{type:'place',pieceId:'piece.4',origin:{x:3,y:1}}];
  assert.equal(checksum(replay(123,[],'tutorial')),'4e6c8361');
  assert.equal(checksum(replay(123,commands.slice(0,1),'tutorial')),'c4a175ee');
  const state=replay(123,commands,'tutorial');
  assert.equal(checksum(state),'b13abf7f');assert.equal(state.score,100);assert.equal(state.completedOrders,1);
});
test('multiple seeds retain portable snapshots, unique orders, and finite 64-step resolution', () => {
  for(let seed=0;seed<30;seed++) {
    let state=createRun(seed);
    for(let index=0;index<70&&state.phase!=='result';index++) {
      const moves=findLegalMoves(state);
      const command:Command=state.phase==='upgrade'?{type:'upgrade',upgradeId:state.upgradeChoices[index%state.upgradeChoices.length]}:{type:'place',...moves[(index*17+seed)%moves.length]};
      const result=applyCommand(state,command);assert.equal(result.error,undefined);
      const restored=applyCommand(JSON.parse(JSON.stringify(state)),command);assert.deepEqual(restored,result);
      assert.ok(result.events.filter(e=>e.type==='shipment').length<=4);
      assert.equal(new Set(result.state.orders.map(o=>o.cargo)).size,result.state.orders.length);
      assert.ok(result.state.rngState.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647));
      state=result.state;
    }
    assert.equal(checksum(replay(seed,state.commands)),checksum(state));
  }
});
