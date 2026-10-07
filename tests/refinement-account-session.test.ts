import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/application/session.ts';
import { sessionHost } from './helpers/session-fixtures.ts';
import { findPlayableMoves, playableChecksum } from '../src/domain/playable.ts';
import { ACCOUNT_KEYS } from '../src/application/account-store.ts';
import { createRunV11, applyCommandV11, findLegalMovesV11 } from '../src/domain/v11/engine.ts';
import { makeAccountRun } from './helpers/account-fixtures.ts';
import { baseCoins } from '../src/application/economy.ts';

function pending(h: ReturnType<typeof sessionHost>, mode: 'standard'|'endless'|'daily' = 'endless') {
  const s = h.session;
  s.action({ type: 'newRun', mode });
  if (s.view.screen === 'guideOffer') s.action({ type: 'directStart' });
  if (s.view.screen === 'prepareTools') { s.action({ type: 'toggleItem', item: 'rotate' }); s.action({ type: 'prepareNext' }); }
  assert.equal(s.view.screen, 'game');
  assert.equal(s.state.rulesetVersion, 11);
  assert.equal(s.state.phase, 'cleanup');
  return s;
}

test('new standard daily and endless sessions show the actual saved pending board and freeze its initial clock', () => {
  for (const mode of ['standard', 'daily', 'endless'] as const) {
    const h = sessionHost(), s = pending(h, mode);
    h.time(60000); s.tick(60000);
    assert.equal(s.view.elapsed, 0);
    assert.equal(s.state.commandIndex, 0);
    assert.deepEqual(s.state.candidates, []);
    s.action({ type: 'chooseCleanup', branch: 'orders' });
    assert.equal(s.state.commandIndex, 1);
    h.time(60500); s.tick(60500);
    assert.equal(s.view.elapsed, 500);
  }
});

test('hide and restart preserve pending cleanup; cancel home is byte stable and confirm refunds reservations', () => {
  const h = sessionHost({ inventory: { rotate: 1, clear: 0, wildcard: 0 } }), s = pending(h);
  const before = [...h.data], checksum = playableChecksum(s.state);
  s.hide(); h.time(90000); s.show(); s.tick(90000);
  assert.equal(s.view.elapsed, 0);
  assert.deepEqual([...h.data], before);
  const resumed = new GameSession(h.platform, { seed: 99, mode: 'standard' });
  assert.equal(resumed.state.phase, 'cleanup');
  assert.equal(playableChecksum(resumed.state), checksum);
  resumed.resume(); resumed.action({ type: 'home' }); resumed.action({ type: 'cancel' });
  assert.deepEqual([...h.data], before);
  resumed.action({ type: 'home' }); resumed.action({ type: 'confirm' });
  assert.equal(resumed.view.account?.run, null);
  assert.equal(resumed.view.account?.inventory.rotate, 1);
  assert.equal(resumed.view.account?.lastClosedResult?.commandIndex, 0);
});

test('toolbox is ephemeral, blocks placement and closes for tool targeting, pause, hide and confirmation', () => {
  const h = sessionHost({ inventory: { rotate: 1, clear: 0, wildcard: 0 } }), s = pending(h);
  s.action({ type: 'chooseCleanup', branch: 'orders' });
  const before = [...h.data], checksum = playableChecksum(s.state), move = findPlayableMoves(s.state)[0];
  s.action({ type: 'toggleToolbox' });
  assert.equal(s.view.toolboxOpen, true);
  s.dispatch({ type: 'place', ...move });
  assert.equal(playableChecksum(s.state), checksum);
  s.action({ type: 'tool', item: 'clear' });
  assert.equal(s.view.toolboxOpen, true);
  assert.equal(s.view.toolSelection ?? null, null);
  s.action({ type: 'tool', item: 'rotate' });
  assert.equal(s.view.toolboxOpen, false);
  assert.equal(s.view.toolSelection?.item, 'rotate');
  s.action({ type: 'toolCancel' });
  s.action({ type: 'toggleToolbox' }); s.togglePause();
  assert.equal(s.view.toolboxOpen, false);
  s.resume(); s.action({ type: 'toggleToolbox' }); s.hide();
  assert.equal(s.view.toolboxOpen, false);
  s.resume(); s.action({ type: 'toggleToolbox' }); s.action({ type: 'home' });
  assert.equal(s.view.toolboxOpen, false);
  assert.deepEqual([...h.data], before);
});

test('unconfirmed cleanup choice freezes the published pending board through hide and retries once', () => {
  const h = sessionHost(), s = pending(h), checksum = playableChecksum(s.state), set = h.storage.set.bind(h.storage);
  let broken = true;
  h.storage.set = (key, value) => { if (key === ACCOUNT_KEYS.a && broken) throw Error('mirror'); set(key, value); };
  s.action({ type: 'chooseCleanup', branch: 'placements' });
  assert.equal(s.view.accountBlocked, true);
  assert.equal(playableChecksum(s.state), checksum);
  s.hide(); h.time(90000); s.tick(90000);
  assert.equal(s.view.elapsed, 0);
  broken = false; s.action({ type: 'retrySave' });
  assert.equal(s.state.phase, 'input');
  assert.equal(s.state.commandIndex, 1);
  const generation = s.view.account!.generation;
  s.action({ type: 'retrySave' });
  assert.equal(s.view.account?.generation, generation);
});

test('a v11 drawer tool uses the existing target preview and consumes only after confirmation', () => {
  const h = sessionHost({ inventory: { rotate: 1, clear: 0, wildcard: 0 } }), s = pending(h);
  s.action({ type: 'chooseCleanup', branch: 'orders' });
  const piece = s.state.candidates.find(piece => piece.shapeId !== 'shape.single')!, before = [...h.data];
  assert.ok(piece);
  s.action({ type: 'toggleToolbox' }); s.action({ type: 'tool', item: 'rotate' });
  s.action({ type: 'toolPiece', pieceId: piece.id }); s.action({ type: 'toolRotate' });
  assert.ok(s.view.toolSelection?.preview);
  assert.deepEqual([...h.data], before);
  assert.deepEqual(s.view.account?.run?.reserved, ['rotate']);
  s.action({ type: 'toolConfirm' });
  assert.equal(s.view.toolboxOpen, false);
  assert.equal(s.state.commandIndex, 2);
  assert.deepEqual(s.view.account?.run?.reserved, []);
  assert.equal(s.view.account?.inventory.rotate, 0);
  assert.deepEqual(s.view.account?.run?.history.tail[1], { type: 'rotate', pieceId: piece.id, quarterTurns: 1 });
});

test('pause cancels a pending tool target without spending or writing inventory', () => {
  const h = sessionHost({ inventory: { rotate: 1, clear: 0, wildcard: 0 } }), s = pending(h);
  s.action({ type: 'chooseCleanup', branch: 'orders' });
  s.action({ type: 'toggleToolbox' }); s.action({ type: 'tool', item: 'rotate' });
  const before = [...h.data];
  s.togglePause();
  assert.equal(s.view.paused, true);
  assert.equal(s.view.toolSelection, null);
  assert.equal(s.view.toolboxOpen, false);
  assert.deepEqual([...h.data], before);
  assert.deepEqual(s.view.account?.run?.reserved, ['rotate']);
});

test('a genuinely rescued v11 save opens the drawer on resume and preserves explicit retirement', () => {
  let state = createRunV11({ seed: 1, mode: 'standard', toolCharges: { rotate: 0, clear: 1, wildcard: 0 } });
  state = applyCommandV11(state, { type: 'chooseCleanup', branch: 'orders' }).state;
  for (let n = 0; n < 80 && state.phase === 'input'; n++) state = applyCommandV11(state, { type: 'place', ...findLegalMovesV11(state)[0] }).state;
  assert.equal(state.phase, 'rescue');
  const coins = baseCoins('inbound', state.completedOrders, state.score);
  const run = makeAccountRun({ state: { ...state, runSerial: 1, elapsedMs: 0 }, identity: { runId: 'test.rescue', serial: 1, rulesetVersion: 11, runConfigId: state.runConfigId, mode: 'standard', economyVersion: 1 }, history: { seed: state.seed, runConfigId: state.runConfigId, head: null, totalCommands: state.commandIndex, tail: [...state.commands] }, reserved: ['clear'], creditedBase: coins, earnedCoins: coins });
  const h = sessionHost({ nextRunSerial: 2, wallet: coins, run }), s = h.session;
  s.resume();
  assert.equal(s.view.toolboxOpen, true);
  const before = [...h.data];
  s.action({ type: 'toggleToolbox' }); s.action({ type: 'toggleToolbox' });
  assert.deepEqual([...h.data], before);
  s.action({ type: 'finishOvertime' });
  assert.equal(s.view.toolboxOpen, false);
  assert.equal(s.view.confirmation?.kind, 'finishOvertime');
  s.action({ type: 'confirm' });
  assert.equal(s.view.account?.run, null);
  assert.equal(s.view.account?.lastClosedResult?.reason, 'retired');
  assert.equal(s.view.account?.inventory.clear, 1);
});
