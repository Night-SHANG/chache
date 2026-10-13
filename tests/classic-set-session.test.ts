import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/application/session.ts';
import { ACCOUNT_KEYS } from '../src/application/account-store.ts';
import { sessionHost } from './helpers/session-fixtures.ts';
import { playableChecksum } from '../src/domain/playable.ts';
import { getUiControls } from '../src/presentation/ui.ts';
import type { UiAction } from '../src/presentation/ui-types.ts';
const open = (s: GameSession) => { s.action({ type: 'shop' }); s.action({ type: 'selectShopTab', tab: 'cosmetics' }); };
const oldActions: UiAction[] = [
  { type: 'previewCosmeticSet', id: 'classic' },
  { type: 'selectClassicSetVariant', kind: 'theme', id: 'night' },
  { type: 'selectClassicSetVariant', kind: 'cargo', id: 'outline' },
  { type: 'selectClassicSetVariant', kind: 'forklift', id: 'white' },
  { type: 'equipClassicSet' },
];

test('removed classic preset actions stay inert across menu, shop, tools, confirmation and blocked states', () => {
  for (const context of ['menu', 'shop', 'tools', 'confirmation', 'blocked'] as const) {
    const host = sessionHost({ wallet: 600 }), session = host.session;
    if (context !== 'menu') open(session);
    if (context === 'tools') session.action({ type: 'selectShopTab', tab: 'tools' });
    if (context === 'confirmation') session.action({ type: 'purchaseCosmetic', kind: 'forklift', id: 'white' });
    if (context === 'blocked') session.view.accountBlocked = true;
    const before = structuredClone(session.view), roots = [...host.data], checksum = playableChecksum(session.state);
    for (const action of oldActions) session.action(action);
    assert.deepEqual(session.view, before, context);
    assert.deepEqual([...host.data], roots);
    assert.equal(playableChecksum(session.state), checksum);
    assert.equal(getUiControls(session.state, session.view).some(control => ['equipClassicSet', 'selectClassicSetVariant'].includes(control.action.type)), false);
  }
});

test('classic night, outline and white remain separate choices and purchasing white never equips other slots', () => {
  const host = sessionHost({ wallet: 600 }), session = host.session; open(session);
  session.action({ type: 'previewCosmetic', kind: 'forklift', id: 'white' });
  const appearance = structuredClone(session.view.account!.profile.cosmetics), roots = [...host.data];
  session.action({ type: 'purchaseCosmetic', kind: 'forklift', id: 'white' }); session.action({ type: 'cancel' });
  assert.deepEqual([...host.data], roots);
  session.action({ type: 'purchaseCosmetic', kind: 'forklift', id: 'white' }); session.action({ type: 'confirm' });
  assert.equal(session.view.account!.wallet, 0);
  assert.deepEqual(session.view.account!.profile.cosmetics, appearance);
  for (const [kind, id] of [['theme', 'night'], ['cargo', 'outline'], ['forklift', 'white']] as const) {
    session.action({ type: 'previewCosmetic', kind, id }); session.action({ type: 'equipCosmetic', kind, id });
  }
  assert.deepEqual(session.view.account!.profile.cosmetics, { theme: 'night', cargo: 'classic', forklift: 'white' });
  assert.equal(session.view.account!.profile.cargoOutline, true);
  assert.equal(session.view.account!.wallet, 0);
  const restored = new GameSession(host.platform, { seed: 99, mode: 'standard' });
  assert.deepEqual(restored.view.account, session.view.account);
  open(restored);
  assert.equal(restored.view.shopSection, 'theme');
  assert.equal(restored.view.classicSetSelection, undefined);
});

test('uncertain independent night equip remains private and retries without changing cargo, forklift or wallet', () => {
  const host = sessionHost(), session = host.session; open(session);
  session.action({ type: 'previewCosmetic', kind: 'theme', id: 'night' });
  const before = session.view.account, set = host.storage.set.bind(host.storage); let fail = true;
  host.storage.set = (key, value) => { if (fail && key === ACCOUNT_KEYS.a) throw Error('mirror'); set(key, value); };
  session.action({ type: 'equipCosmetic', kind: 'theme', id: 'night' });
  assert.equal(session.view.accountBlocked, true); assert.equal(session.view.account, before);
  for (const action of oldActions) session.action(action);
  assert.equal(session.view.account, before);
  fail = false; session.action({ type: 'retrySave' });
  assert.deepEqual(session.view.account!.profile.cosmetics, { ...before!.profile.cosmetics, theme: 'night' });
  assert.equal(session.view.account!.wallet, before!.wallet);
  assert.equal(session.view.account!.profile.cargoOutline, false);
  const stable = [...host.data]; session.action({ type: 'retrySave' });
  assert.deepEqual([...host.data], stable);
});

test('forged classic selections and old return metadata cannot restore a classic detail route', () => {
  const host = sessionHost({ wallet: 600 }), session = host.session; open(session);
  const before = [...host.data];
  for (const patch of [{ kind: 'theme', id: 'harbor' }, { kind: 'cargo', id: 'wood' }, { kind: 'forklift', id: 'electric' }, { kind: '__proto__', id: 'yellow' }]) session.action({ type: 'selectClassicSetVariant', ...patch } as UiAction);
  assert.equal(session.view.classicSetSelection, undefined);
  session.view.cosmeticReturnSet = 'classic'; session.view.cosmeticSetPreview = 'classic';
  session.action({ type: 'back' });
  assert.equal(session.view.screen, 'menu');
  open(session);
  assert.equal(session.view.cosmeticSetPreview, undefined);
  assert.equal(session.view.cosmeticReturnSet, undefined);
  assert.deepEqual([...host.data], before);
});
