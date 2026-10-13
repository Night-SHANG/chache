import assert from 'node:assert/strict';
import test from 'node:test';
import { COSMETIC_SETS } from '../src/application/cosmetic-sets.ts';
import { getCosmetic, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { makeAccountFixture } from './helpers/account-fixtures.ts';
import { sessionHost } from './helpers/session-fixtures.ts';
import { getUiControls } from '../src/presentation/ui.ts';
const kinds = ['theme', 'cargo', 'forklift'] as const;

for (const set of COSMETIC_SETS) for (let mask = 0; mask < 8; mask++) test(`retired bundle discount ${set.id}/${mask}: every unowned member retains its independent price`, () => {
  const owned = kinds.map(kind => `${kind}.${set[kind]}`).filter((_, index) => mask & (1 << index));
  for (const kind of kinds) {
    const item = getCosmetic(kind, set[kind])!;
    const account = retainAccountCosmetics(makeAccountFixture({ formatVersion: 2, economyVersion: 2, dailyRewards: {}, wallet: 3000 }));
    account.profile.ownedCosmetics = [...new Set([...account.profile.ownedCosmetics!, ...owned])].sort();
    const host = sessionHost(account), session = host.session;
    session.action({ type: 'shop' }); session.action({ type: 'selectShopTab', tab: 'cosmetics' });
    session.action({ type: 'previewCosmetic', kind, id: item.id });
    const before = [...host.data], appearance = structuredClone(session.view.account!.profile.cosmetics);
    const controls = getUiControls(session.state, session.view);
    assert.equal(controls.some(control => ['purchaseCosmeticSet', 'equipCosmeticSet', 'previewCosmeticSet'].includes(control.action.type)), false);
    assert.equal(controls.some(control => /8折|9折|购买套装|领取套装/.test(control.label)), false);
    const buy = controls.find(control => control.action.type === 'purchaseCosmetic');
    if (owned.includes(item.key)) { assert.equal(buy, undefined); continue; }
    assert.equal(buy?.label, `${item.price}金币 · 购买`);
    assert.equal(buy?.disabled, false);
    session.action(buy!.action);
    assert.equal(session.view.confirmation?.kind, 'purchaseCosmetic');
    assert.equal(session.view.confirmation?.cosmeticSetQuote, undefined);
    session.action({ type: 'cancel' });
    assert.deepEqual([...host.data], before);
    session.action(buy!.action); session.action({ type: 'confirm' }); session.action({ type: 'confirm' });
    assert.equal(session.view.account!.wallet, 3000 - item.price);
    assert.deepEqual(session.view.account!.profile.cosmetics, appearance);
    assert.deepEqual(session.view.account!.profile.ownedCosmetics, [...new Set([...account.profile.ownedCosmetics!, item.key])].sort());
  }
});
