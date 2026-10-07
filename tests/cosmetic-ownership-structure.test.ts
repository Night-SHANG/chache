import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountService } from '../src/application/account-service.ts';
import { assertAccountSnapshot } from '../src/application/account-profile.ts';
import { ACCOUNT_KEYS, encodeAccount, loadAccount, repairAccount } from '../src/application/account-store.ts';
import { accountDigest, canonicalStringify } from '../src/application/history-store.ts';
import { upgradeEconomy } from '../src/application/economy.ts';
import { GameSession } from '../src/application/session.ts';
import type { Platform } from '../src/platform/types.ts';
import type { AccountSnapshot } from '../src/application/account-types.ts';
import { FaultStorage, makeAccountFixture } from './helpers/account-fixtures.ts';

const held = () => ({ status: 'held' as const, release() {} });
function rootEnvelope(account: unknown): string {
  return canonicalStringify({ formatVersion: 1, generation: (account as AccountSnapshot).generation, account, digest: accountDigest(canonicalStringify(account)) });
}
function fundedPurchase(version:3|4) {
  const old = makeAccountFixture({ wallet: 1800, generation: 1, lastOperation: { operationId: 'older.receipt', expectedGeneration: 0, requestDigest: 'fixture', committedGeneration: 1 } });
  const storage = new FaultStorage(), oldRaw = encodeAccount(old);
  storage.values.set(ACCOUNT_KEYS.a, oldRaw); storage.values.set(ACCOUNT_KEYS.b, oldRaw);
  const service = createAccountService(storage, held(), () => 0);
  const purchased = service.transact({ operationId: 'purchase.wood', type: 'purchaseCosmetic', kind: 'cargo', id: 'wood' }, 1);
  assert.equal(purchased.status, 'acknowledged'); assert.equal(purchased.account?.wallet, 1500);
  assert.ok(purchased.account?.profile.ownedCosmetics?.includes('cargo.wood'));
  const newer=structuredClone(purchased.account!);
  if(version===3){newer.formatVersion=3;delete newer.guides.daily;}
  assertAccountSnapshot(newer);
  return { oldRaw, newer };
}

// A structural ownership error must not select the older funded wallet or overwrite paid rights.
for(const version of [3,4] as const) for (const malformed of ['extra equipped category', 'null profile'] as const) for (const side of ['a', 'b'] as const) {
  test(`format${version} ${malformed} in root ${side} survives load repair service retry and session retry byte-for-byte`, () => {
    const { oldRaw, newer } = fundedPurchase(version);
    const changed = malformed === 'null profile' ? { ...newer, profile: null }
      : { ...newer, profile: { ...newer.profile, cosmetics: { ...newer.profile.cosmetics, trim: 'gold' } } };
    const changedRaw = rootEnvelope(changed);
    const fresh = () => {
      const storage = new FaultStorage(); storage.values.set(ACCOUNT_KEYS.a, oldRaw); storage.values.set(ACCOUNT_KEYS.b, oldRaw);
      storage.values.set(ACCOUNT_KEYS[side], changedRaw); return storage;
    };
    const observations = [];
    for (const operation of ['load', 'repair', 'service retry', 'session retry'] as const) {
      const storage = fresh(), before = new Map(storage.values);
      let status: string, accountVisible: boolean; let blocked: boolean | null = null;
      if (operation === 'load') {
        const result = loadAccount(storage, assertAccountSnapshot); status = result.status; accountVisible = result.account !== null;
      } else if (operation === 'repair') {
        const result = repairAccount(storage, assertAccountSnapshot); status = result.status; accountVisible = result.account !== null;
      } else if (operation === 'service retry') {
        const service = createAccountService(storage, held(), () => 0);
        service.retryPending('older.receipt'); status = service.getStatus(); accountVisible = service.getSnapshot() !== null;
      } else {
        const platform = { storage, writerLease: held(), now: () => 0, wallTime: () => 0, playSound() {}, stopSounds() {} } as unknown as Platform;
        const session = new GameSession(platform, { seed: 71, mode: 'standard' });
        session.action({ type: 'retrySave' }); session.action({ type: 'retrySave' });
        status = session.view.accountStatus ?? 'missing'; accountVisible = session.view.account !== null;
        blocked = session.view.accountBlocked ?? false;
      }
      observations.push({ operation, status, accountVisible, blocked, unchanged: canonicalStringify([...storage.values]) === canonicalStringify([...before]), writes: storage.operations.filter(op => op.kind === 'set' || op.kind === 'remove').length });
    }
    assert.deepEqual(observations, ['load', 'repair', 'service retry', 'session retry'].map(operation => ({ operation, status: 'unknown', accountVisible: false, blocked: operation === 'session retry' ? true : null, unchanged: true, writes: 0 })));
  });
}

test('format1 and format2 still repair a genuinely broken opposite root from their validated bytes', () => {
  for (const version of [1, 2] as const) for (const side of ['a', 'b'] as const) {
    const account = version === 1 ? makeAccountFixture({ wallet: 1800 }) : upgradeEconomy(makeAccountFixture({ wallet: 1800 }));
    const raw = encodeAccount(account), storage = new FaultStorage();
    storage.values.set(ACCOUNT_KEYS.a, raw); storage.values.set(ACCOUNT_KEYS.b, raw); storage.values.set(ACCOUNT_KEYS[side], 'broken bytes');
    assert.equal(loadAccount(storage, assertAccountSnapshot).status, 'degraded');
    assert.equal(repairAccount(storage, assertAccountSnapshot).status, 'acknowledged');
    assert.deepEqual([...storage.values.values()], [raw, raw]);
  }
});
