import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { GameSession } from '../src/application/session.ts';
import { createRun } from '../src/domain/engine.ts';
import { saveRun } from '../src/application/save.ts';
import { sessionHost, startInbound } from './helpers/session-fixtures.ts';
import { getUiControls } from '../src/presentation/ui.ts';
import { render } from '../src/presentation/renderer.ts';
import { ACCOUNT_KEYS } from '../src/application/account-store.ts';
import { L, getTrayRects } from '../src/presentation/layout.ts';
import { findPlayableMoves, playableChecksum } from '../src/domain/playable.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
import type { UiAction } from '../src/presentation/ui-types.ts';

const kinds = ['inbound', 'outbound', 'daily'] as const;
function retiredEntry(h: ReturnType<typeof sessionHost>, kind: typeof kinds[number]) {
  h.session.action({ type: 'settings' });
  h.session.action({ type: 'openPracticeSelect' });
  assert.equal(h.session.view.screen, 'settings');
  h.session.action({ type: 'startPractice', kind });
  assert.equal(h.session.view.practice, undefined);
  assert.equal(h.session.view.confirmation, null);
}
function words(s: GameSession) {
  const ctx = createCanvas(1080, 1920).getContext('2d') as unknown as CanvasRenderingContext2D;
  const labels: string[] = [];
  ctx.fillText = word => { labels.push(word); };
  render(ctx, s.state, s.view);
  return labels.join(' ');
}
function mutateCount(h: ReturnType<typeof sessionHost>) {
  return h.storage.operations.filter(o => o.kind === 'set' || o.kind === 'remove').length;
}
function assertInert(h: ReturnType<typeof sessionHost>, action: UiAction) {
  const state = h.session.state, account = structuredClone(h.session.view.account), before = [...h.data];
  h.storage.resetFault();
  h.session.action(action);
  assert.equal(h.session.state, state);
  assert.deepEqual(h.session.view.account, account);
  assert.deepEqual([...h.data], before);
  assert.equal(mutateCount(h), 0);
  assert.equal(h.session.view.practice, undefined);
}

for (const kind of kinds) for (const persisted of [false, true]) test(`retired ${kind} practice entry and lifecycle leave ${persisted ? 'existing' : 'empty'} storage byte-identical`, () => {
  const h = sessionHost({ wallet: 777 }, persisted), account = structuredClone(h.session.view.account), state = h.session.state, before = [...h.data];
  h.storage.resetFault();
  retiredEntry(h, kind);
  assert.equal(h.session.view.guide ?? null, null);
  assert.doesNotMatch(words(h.session), /教学练习|练习完成|重播教学|教学开关/);
  h.session.hide(); h.session.show(); h.session.resume();
  retiredEntry(h, kind);
  h.session.action({ type: 'exitPractice' });
  assert.equal(h.session.state, state);
  assert.deepEqual([...h.data], before);
  assert.deepEqual(h.session.view.account, account);
  assert.equal(mutateCount(h), 0);
  const restored = new GameSession(h.platform, { seed: 3, mode: 'standard' });
  assert.equal(restored.view.practice, undefined);
  assert.equal(restored.view.guide ?? null, null);
  assert.deepEqual([...h.data], before);
});

test('retired tutorial and practice actions cannot bypass settings or allocate a hidden run', () => {
  const h = sessionHost({ wallet: 500, inventory: { rotate: 1, clear: 1, wildcard: 0 } });
  h.session.action({ type: 'settings' });
  const actions: UiAction[] = [{ type: 'toggleTutorials' }, { type: 'openPracticeSelect' }, ...kinds.map(kind => ({ type: 'startPractice' as const, kind })), { type: 'guidedStart', track: 'inbound' }, { type: 'guidedStart', track: 'outbound' }, { type: 'directStart' }, { type: 'skipTutorial' }, { type: 'introStart' }, { type: 'exitPractice' }];
  for (const action of actions) assertInert(h, action);
  assert.equal(h.session.view.screen, 'settings');
  assert.equal(h.session.view.account?.nextRunSerial, 1);
  assert.equal(h.session.view.account?.run, null);
  assert.equal(h.session.view.account?.wallet, 500);
});

for (const mode of ['standard', 'daily', 'endless'] as const) test(`retired practice cannot close formal ${mode}; home still confirms and refunds once`, () => {
  const h = sessionHost({ wallet: 777, inventory: { rotate: 1, clear: 0, wildcard: 0 } });
  startInbound(h.session, mode, mode === 'daily' ? [] : ['rotate']);
  h.session.action({ type: 'settings' });
  assertInert(h, { type: 'openPracticeSelect' });
  assertInert(h, { type: 'startPractice', kind: 'daily' });
  assert.equal(h.session.view.confirmation, null);
  const state = h.session.state, before = [...h.data], account = structuredClone(h.session.view.account);
  h.session.action({ type: 'home' });
  assert.equal((h.session.view.confirmation as ViewState['confirmation'])?.kind, 'leaveRun');
  h.session.action({ type: 'cancel' });
  assert.equal(h.session.state, state);
  assert.deepEqual([...h.data], before);
  assert.deepEqual(h.session.view.account, account);
  assert.equal(mutateCount(h), 0);
  h.session.action({ type: 'home' }); h.session.action({ type: 'confirm' });
  assert.equal(h.session.view.account?.run, null);
  assert.equal(h.session.view.practice, undefined);
  assert.equal(h.session.view.account?.inventory.rotate, 1);
  assert.equal(h.session.view.account?.wallet, 777);
  const closed = [...h.data]; h.storage.resetFault();
  h.session.action({ type: 'confirm' }); h.session.action({ type: 'exitPractice' });
  assert.deepEqual([...h.data], closed);
  assert.equal(mutateCount(h), 0);
});

test('unmirrored formal home close blocks publication and retired practice cannot bypass same-operation repair', () => {
  const h = sessionHost({ inventory: { rotate: 1, clear: 0, wildcard: 0 } });
  startInbound(h.session, 'standard', ['rotate']);
  h.session.action({ type: 'home' });
  const set = h.storage.set.bind(h.storage); let block = true;
  h.storage.set = (key, value) => { if (block && key === ACCOUNT_KEYS.a) throw Error('mirror offline'); set(key, value); };
  h.session.action({ type: 'confirm' });
  assert.equal(h.session.view.practice, undefined);
  assert.equal(h.session.view.accountBlocked, true);
  assert.ok(h.session.view.account?.run);
  assert.equal(h.session.view.account?.inventory.rotate, 0);
  assertInert(h, { type: 'startPractice', kind: 'outbound' });
  block = false; h.session.action({ type: 'retrySave' });
  assert.equal(h.session.view.accountBlocked, false);
  assert.equal(h.session.view.practice, undefined);
  assert.equal(h.session.view.account?.run, null);
  assert.equal(h.session.view.account?.inventory.rotate, 1);
  const before = [...h.data], generation = h.session.view.account!.generation;
  h.session.action({ type: 'retrySave' });
  assert.deepEqual([...h.data], before);
  assert.equal(h.session.view.account!.generation, generation);
});

test('retired daily practice does not bypass or change the real paid-day lock', () => {
  const h = sessionHost({ formatVersion: 2, economyVersion: 2, dailyRewards: { '2026-10-06': { completedRunId: 'already.won', bonusPaid: 20 } } });
  assert.equal(h.session.view.dailyLocked, true);
  const before = [...h.data]; h.storage.resetFault();
  retiredEntry(h, 'daily'); h.session.action({ type: 'chooseCleanup', branch: 'orders' }); h.session.action({ type: 'exitPractice' });
  assert.equal(h.session.view.dailyLocked, true);
  h.session.action({ type: 'back' }); h.session.action({ type: 'newRun', mode: 'daily' });
  assert.equal(h.session.view.account?.run, null);
  assert.deepEqual([...h.data], before);
  assert.equal(mutateCount(h), 0);
});

test('retired practice preserves a legacy active run and home still uses its existing close protocol', () => {
  const h = sessionHost({}, false), state = { ...createRun(1, 'standard', 3), runSerial: 1 };
  assert.equal(saveRun(h.storage, state).ok, true);
  h.session = new GameSession(h.platform, { seed: 1, mode: 'standard' }); h.session.resume();
  const before = [...h.data], checksum = playableChecksum(h.session.state); h.storage.resetFault();
  retiredEntry(h, 'inbound');
  assert.equal(playableChecksum(h.session.state), checksum);
  assert.deepEqual([...h.data], before); assert.equal(mutateCount(h), 0);
  h.session.action({ type: 'home' }); assert.equal((h.session.view.confirmation as ViewState['confirmation'])?.kind, 'leaveRun'); h.session.action({ type: 'confirm' });
  const closed = [...h.data]; h.session.hide(); h.session.show(); h.session.resume(); h.session.action({ type: 'exitPractice' });
  assert.equal(h.session.view.practice, undefined); assert.deepEqual([...h.data], closed);
  const restored = new GameSession(h.platform, { seed: 1, mode: 'standard' }); assert.equal(restored.view.canContinue, false);
});

for (const mode of ['hard', 'expert', 'outbound'] as const) test(`${mode} identity survives retired practice and remains until acknowledged home close`, () => {
  const h = sessionHost({ inventory: { rotate: 1, clear: 0, wildcard: 0 } });
  h.session.action(mode === 'outbound' ? { type: 'newRun', mode: 'color_exit', difficultyId: 'hard' } : { type: 'newRun', mode: 'standard', inboundDifficulty: mode });
  assert.equal(h.session.view.screen, 'prepareTools'); h.session.action({ type: 'toggleItem', item: 'rotate' }); h.session.action({ type: 'prepareNext' });
  const id = structuredClone(h.session.view.account!.run!.identity), before = [...h.data]; h.storage.resetFault();
  retiredEntry(h, 'inbound'); assert.deepEqual(h.session.view.account!.run!.identity, id); assert.deepEqual([...h.data], before); assert.equal(mutateCount(h), 0);
  h.session.action({ type: 'home' }); h.session.action({ type: 'cancel' }); assert.deepEqual(h.session.view.account!.run!.identity, id);
  h.session.action({ type: 'home' }); h.session.action({ type: 'confirm' });
  assert.equal(h.session.view.practice, undefined); assert.equal(h.session.view.account!.run, null); assert.equal(h.session.view.account!.inventory.rotate, 1); assert.equal(h.session.view.account!.lastClosedResult!.identity.runId, id.runId);
});

test('unknown root close outcome cannot be bypassed by practice and retry acknowledges the original identity', () => {
  const h = sessionHost(); startInbound(h.session); h.session.action({ type: 'home' });
  const id = h.session.view.account!.run!.identity.runId, get = h.storage.get.bind(h.storage), set = h.storage.set.bind(h.storage); let changed = false, block = true;
  h.storage.set = (key, value) => { set(key, value); if (key === ACCOUNT_KEYS.b) changed = true; };
  h.storage.get = key => { if (block && changed && (key === ACCOUNT_KEYS.a || key === ACCOUNT_KEYS.b)) throw Error('read outcome unknown'); return get(key); };
  h.session.action({ type: 'confirm' }); assert.equal(h.session.view.accountBlocked, true); assert.equal(h.session.view.practice, undefined); assert.equal(h.session.view.account!.run!.identity.runId, id);
  assertInert(h, { type: 'startPractice', kind: 'daily' });
  block = false; h.session.action({ type: 'retrySave' });
  assert.equal(h.session.view.accountBlocked, false); assert.equal(h.session.view.practice, undefined); assert.equal(h.session.view.account!.lastClosedResult!.identity.runId, id); assert.equal(h.session.view.account?.run, null);
});

test('settings and static help replace practice controls and fit three sizes without overlapping actions', () => {
  const h = sessionHost();
  const check = () => {
    const controls = getUiControls(h.session.state, h.session.view);
    assert.equal(controls.some(c => ['toggleTutorials', 'openPracticeSelect', 'startPractice', 'exitPractice', 'skipTutorial'].includes(c.action.type)), false);
    for (const scale of [360 / 1080, 540 / 1080, 900 / 1920]) for (const c of controls) { assert.ok(c.rect.w * scale >= 44, c.label); assert.ok(c.rect.h * scale >= 44, c.label); }
    for (const [i, a] of controls.entries()) for (const b of controls.slice(i + 1)) assert.ok(a.rect.x + a.rect.w <= b.rect.x || b.rect.x + b.rect.w <= a.rect.x || a.rect.y + a.rect.h <= b.rect.y || b.rect.y + b.rect.h <= a.rect.y, `${a.label}/${b.label}`);
  };
  h.session.action({ type: 'settings' }); check(); h.session.action({ type: 'back' }); check(); h.session.action({ type: 'helpMenu' }); check();
  for (const topic of ['inbound', 'outbound'] as const) { h.session.action({ type: 'selectHelp', topic }); check(); assert.match(words(h.session), topic==='inbound'?/入库玩法/:/出库玩法/); assert.doesNotMatch(words(h.session), /教学练习|练习完成/); h.session.action({ type: 'helpBack' }); }
});

test('a legal random drag is accepted freely without retired tutorial exit or skip copy', () => {
  const h = sessionHost(); startInbound(h.session);
  const state = h.session.state, before = playableChecksum(state), move = findPlayableMoves(state).find(move => move.origin.x !== 1 || move.origin.y !== 1); assert.ok(move);
  const tray = getTrayRects(state.candidates.length)[state.candidates.findIndex(piece => piece.id === move.pieceId)], start = { x: tray.x + tray.w / 2, y: tray.y + tray.h / 2 }, target = { x: L.board.x + L.board.cell * (move.origin.x + .5), y: L.board.y + L.board.cell * (move.origin.y + .5) };
  h.session.input.down(start); h.session.input.move(target); assert.equal(h.session.view.preview?.valid, true); h.session.input.up(target);
  assert.notEqual(playableChecksum(h.session.state), before); assert.equal(h.session.state.commandIndex, 1); assert.equal(h.session.view.guide ?? null, null); assert.equal(h.session.view.practice, undefined); assert.doesNotMatch(h.session.view.message, /提示格|退出练习|跳过引导/);
});
