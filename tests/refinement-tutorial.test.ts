import test from 'node:test';
import assert from 'node:assert/strict';
import { isGuideComplete, advanceGuide, guideOverlay } from '../src/application/tutorials.ts';
import type { GuideProgress } from '../src/application/account-types.ts';
import { INBOUND_GUIDE_V11 } from '../src/application/inbound-guide-v11.ts';
import { INBOUND_GUIDE_V14 } from '../src/application/inbound-guide-v14.ts';
import { createRunV11, applyCommandV11 } from '../src/domain/v11/engine.ts';
import { checksumV11 } from '../src/domain/v11/replay.ts';
import { GameSession } from '../src/application/session.ts';
import { sessionHost } from './helpers/session-fixtures.ts';

const fresh = (): GuideProgress => ({ learned: [], skipped: false, authoredStartConsumed: true });

test('v11 guide completion requires real ordinary lessons without inventing an old upgrade fact', () => {
  const progress: GuideProgress = { learned: ['place', 'order', 'route', 'sweepChoice', 'rushTimer', 'expired'], skipped: false, authoredStartConsumed: true };
  assert.equal(isGuideComplete('inbound', progress, 11), true);
  assert.equal(isGuideComplete('inbound', progress, 9), false);
  assert.equal(progress.learned.includes('upgrade'), false);
  assert.equal(isGuideComplete('inbound', { ...progress, learned: progress.learned.filter(step => step !== 'expired') }, 11), false);
  assert.equal(isGuideComplete('inbound', { ...progress, learned: progress.learned.filter(step => step !== 'sweepChoice') }, 11), false);
});

test('both real v11 authored branches teach place order path and phase-two cleanup with rush 3 2 1 waste then sweep', () => {
  for (const [branch, commands] of Object.entries(INBOUND_GUIDE_V11.branches)) {
    let state = createRunV11({ seed: INBOUND_GUIDE_V11.seed, mode: 'standard', guided: true }), progress = fresh();
    let rushCell: number | undefined, swept = false;
    const timers: (number|'waste')[] = [];
    assert.equal(state.board.every(cell => cell === null), true);
    for (const command of commands) {
      const overlay = guideOverlay('inbound', progress, state);
      assert.notEqual(overlay?.step, 'upgrade');
      if (overlay && command.type === 'place') assert.deepEqual(overlay.expectedCommand, command);
      const before = state, result = applyCommandV11(state, command);
      assert.equal(result.error, undefined);
      state = result.state;
      progress = advanceGuide('inbound', progress, before, command, result);
      assert.equal(result.events.some(event => String(event.type).includes('upgrade')), false);
      if (command.type === 'chooseCleanup') {
        assert.equal(before.shift, 2);
        assert.equal(before.phase, 'cleanup');
        assert.equal(state.cleanup?.branch, branch);
      }
      const placed = result.events.find(event => event.type === 'placed');
      if (placed && rushCell === undefined && placed.cells.some(cell => state.cellTraits[cell]?.kind === 'rush')) {
        rushCell = placed.cells.find(cell => state.cellTraits[cell]?.kind === 'rush');
        assert.equal(state.shift, 2);
      }
      if (rushCell !== undefined) {
        const trait = state.cellTraits[rushCell], timer = trait?.kind === 'rush' ? trait.remaining : trait?.kind === 'waste' ? 'waste' : undefined;
        if (timer !== undefined && timers[timers.length - 1] !== timer) timers.push(timer);
        if (result.events.some(event => event.type === 'cleanup' && event.cells.includes(rushCell!))) {
          assert.equal(before.cellTraits[rushCell]?.kind, 'waste');
          swept = true;
        }
      }
    }
    assert.deepEqual(timers, [3, 2, 1, 'waste']);
    assert.equal(swept, true);
    assert.equal(isGuideComplete('inbound', progress, 11), true);
    assert.equal(progress.learned.includes('upgrade'), false);
    assert.equal(progress.learned.includes('colorExit'), false);
    assert.equal(guideOverlay('inbound', progress, state), null);
    let replay = createRunV11({ seed: INBOUND_GUIDE_V11.seed, mode: 'standard', guided: true });
    for (const command of commands) replay = applyCommandV11(replay, command).state;
    assert.equal(checksumV11(replay), checksumV11(state));
  }
});

test('new guide sessions use the real v14 script and carry learned and skipped track flags through reload', () => {
  for (const path of Object.values(INBOUND_GUIDE_V14.branches)) {
    const h = sessionHost(), s = h.session;
    s.action({ type: 'newRun', mode: 'standard' });
    s.action({ type: 'guidedStart', track: 'inbound' });
    assert.equal(s.state.rulesetVersion, 14);
    assert.equal(s.state.seed, INBOUND_GUIDE_V14.seed);
    for (const command of path) {
      if (command.type === 'chooseCleanup') s.action({ type: 'chooseCleanup', branch: command.branch });
      else s.dispatch(command);
      for (let frame = 0; s.view.animation && frame < 70; frame++) { h.time(s.state.commandIndex * 10000 + frame * 1000); s.tick(h.platform.now()); }
    }
    assert.equal(isGuideComplete('inbound', s.view.account!.guides.inbound, 14), true);
    assert.equal(s.view.account?.guides.inbound.learned.includes('upgrade'), false);
    const restored = new GameSession(h.platform, { seed: 99, mode: 'standard' });
    assert.deepEqual(restored.view.account?.guides, s.view.account?.guides);
    assert.equal(restored.view.guide, null);
    assert.equal(restored.view.account?.guides.outbound.learned.length, 0);
  }
});
