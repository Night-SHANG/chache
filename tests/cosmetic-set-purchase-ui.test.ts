import './helpers/static-art-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createCanvas } from '@napi-rs/canvas';
import { sessionHost, startInbound } from './helpers/session-fixtures.ts';
import { getUiControls } from '../src/presentation/ui.ts';
import { render } from '../src/presentation/renderer.ts';
import { ACCOUNT_KEYS } from '../src/application/account-store.ts';
import { playableChecksum } from '../src/domain/playable.ts';
import type { GameSession } from '../src/application/session.ts';
const open = (s: GameSession) => { s.action({ type: 'shop' }); s.action({ type: 'selectShopTab', tab: 'cosmetics' }); s.action({ type: 'previewCosmetic', kind: 'cargo', id: 'insulated' }); };
const controls = (s: GameSession) => getUiControls(s.state, s.view);
function words(s: GameSession) { const ctx = createCanvas(1080, 1920).getContext('2d') as unknown as CanvasRenderingContext2D, out: string[] = []; ctx.fillText = value => out.push(value); render(ctx, s.state, s.view); return out.join('\n'); }
function rejectBundle(s: GameSession) { s.action({ type: 'previewCosmeticSet', id: 'cold_chain' }); s.action({ type: 'purchaseCosmeticSet', id: 'cold_chain' }); s.action({ type: 'equipCosmeticSet', id: 'cold_chain' }); }

test('individual purchase keeps the original full price with no bundle button, discount or member links', () => {
  const host = sessionHost({ wallet: 3000 }), session = host.session; open(session);
  const all = controls(session), buy = all.find(control => control.action.type === 'purchaseCosmetic');
  assert.equal(buy?.label, '300金币 · 购买'); assert.equal(buy?.disabled, false);
  assert.equal(all.some(control => ['purchaseCosmeticSet', 'equipCosmeticSet', 'previewCosmeticSetMember'].includes(control.action.type)), false);
  assert.doesNotMatch(words(session), /8折|9折|购买套装|领取套装|装备整套|补齐/);
  const before = [...host.data]; rejectBundle(session);
  assert.equal(session.view.confirmation, null); assert.deepEqual([...host.data], before);
});

test('individual confirmation cancel and double confirm charge once and never equip or acquire sibling members', () => {
  const host = sessionHost({ wallet: 300 }), session = host.session; open(session);
  const before = [...host.data], appearance = structuredClone(session.view.account!.profile.cosmetics), checksum = playableChecksum(session.state);
  session.action({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated' });
  assert.equal(session.view.confirmation?.kind, 'purchaseCosmetic'); assert.equal(session.view.confirmation?.cosmeticSetQuote, undefined);
  rejectBundle(session); assert.equal(session.view.confirmation?.kind, 'purchaseCosmetic');
  assert.doesNotMatch(words(session), /8折|9折|套装|补齐/);
  session.action({ type: 'cancel' }); assert.deepEqual([...host.data], before);
  session.action({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated' }); session.action({ type: 'confirm' }); session.action({ type: 'confirm' });
  assert.equal(session.view.account!.wallet, 0); assert.deepEqual(session.view.account!.profile.cosmetics, appearance);
  assert.ok(session.view.account!.profile.ownedCosmetics!.includes('cargo.insulated'));
  assert.equal(session.view.account!.profile.ownedCosmetics!.includes('theme.cold_chain'), false);
  assert.equal(session.view.account!.profile.ownedCosmetics!.includes('forklift.electric'), false);
  assert.equal(playableChecksum(session.state), checksum);
  session.action({ type: 'equipCosmetic', kind: 'cargo', id: 'insulated' });
  assert.deepEqual(session.view.account!.profile.cosmetics, { ...appearance, cargo: 'insulated' });
});

test('insufficient full-price balance rejects individual and retired bundle purchases without writes', () => {
  const host = sessionHost({ wallet: 299 }), session = host.session; open(session);
  const before = [...host.data], buy = controls(session).find(control => control.action.type === 'purchaseCosmetic');
  assert.equal(buy?.label, '300金币 · 购买'); assert.equal(buy?.disabled, true);
  rejectBundle(session); session.action({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated' }); session.action({ type: 'confirm' });
  assert.equal(session.view.confirmation, null); assert.deepEqual([...host.data], before);
});

test('active run guards individual shop and retired set actions without changing gameplay or roots', () => {
  const host = sessionHost({ wallet: 3000 }), session = host.session; startInbound(session, 'rush');
  const before = [...host.data], checksum = playableChecksum(session.state); open(session); rejectBundle(session); session.action({ type: 'confirm' });
  assert.equal(session.view.screen, 'game'); assert.equal(session.view.confirmation, null);
  assert.deepEqual([...host.data], before); assert.equal(playableChecksum(session.state), checksum);
});

test('interrupted individual purchase exposes no partial right and save retry charges only that item once', () => {
  const host = sessionHost({ wallet: 3000 }), session = host.session; open(session);
  const before = session.view.account, set = host.storage.set.bind(host.storage); let failed = true;
  host.storage.set = (key, value) => { if (failed && key === ACCOUNT_KEYS.a) throw Error('mirror'); set(key, value); };
  session.action({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated' }); session.action({ type: 'confirm' });
  assert.equal(session.view.account, before); assert.equal(session.view.accountBlocked, true);
  rejectBundle(session); assert.equal(session.view.account, before);
  failed = false; session.action({ type: 'retrySave' });
  assert.equal(session.view.account!.wallet, 2700);
  assert.deepEqual(session.view.account!.profile.ownedCosmetics, [...(before!.profile.ownedCosmetics ?? ['cargo.classic', 'cargo.outline', 'forklift.yellow', 'theme.day', 'theme.night']), 'cargo.insulated'].sort());
  assert.deepEqual(session.view.account!.profile.cosmetics, before!.profile.cosmetics);
  const stable = [...host.data]; session.action({ type: 'retrySave' }); session.action({ type: 'confirm' }); rejectBundle(session);
  assert.deepEqual([...host.data], stable);
});

test('a stale bundle confirmation is dismissed without executing its quote or touching account data', () => {
  const host = sessionHost({ wallet: 3000 }), session = host.session; open(session);
  const before = [...host.data], account = structuredClone(session.view.account);
  session.view.confirmation = { kind: 'purchaseCosmeticSet', cosmeticSetId: 'cold_chain', cosmeticSetQuote: { missingKeys: ['theme.cold_chain', 'cargo.insulated', 'forklift.electric'], originalPrice: 1800, price: 1440 } };
  session.action({ type: 'confirm' }); session.action({ type: 'confirm' });
  assert.equal(session.view.confirmation, null); assert.deepEqual(session.view.account, account); assert.deepEqual([...host.data], before);
});

test('individual list, confirmation and retry keep disjoint 44px controls at 320px', () => {
  const host = sessionHost({ wallet: 3000 }), session = host.session; open(session);
  const check = () => { const all = controls(session); for (const [index, a] of all.entries()) { assert.ok(a.rect.w * 320 / 1080 >= 44 && a.rect.h * 320 / 1080 >= 44, a.action.type); assert.ok(a.rect.y + a.rect.h <= 1856); for (const b of all.slice(index + 1)) assert.ok(a.rect.x + a.rect.w <= b.rect.x || b.rect.x + b.rect.w <= a.rect.x || a.rect.y + a.rect.h <= b.rect.y || b.rect.y + b.rect.h <= a.rect.y, `${a.action.type}/${b.action.type}`); } };
  check(); session.action({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated' }); check(); session.view.accountBlocked = true; check();
});

test('compiled free playtest can claim one item but never restore the removed bundle path', async () => {
  const built = await build({ stdin: { contents: "export * from './tests/helpers/session-fixtures.ts'; export * from './src/presentation/ui.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { __PLAYTEST_FREE_SHOP__: 'true' } });
  const api = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`) as typeof import('./helpers/session-fixtures.ts') & typeof import('../src/presentation/ui.ts');
  const host = api.sessionHost({ wallet: 0 }), session = host.session; open(session); const before = [...host.data];
  rejectBundle(session); assert.equal(session.view.confirmation, null); assert.deepEqual([...host.data], before);
  assert.equal(api.getUiControls(session.state, session.view).some(control => control.action.type === 'purchaseCosmeticSet'), false);
  session.action({ type: 'purchaseCosmetic', kind: 'cargo', id: 'insulated' }); assert.equal(api.getUiControls(session.state, session.view).find(control => control.action.type === 'confirm')?.label, '确认领取'); session.action({ type: 'confirm' });
  assert.equal(session.view.account!.wallet, 0); assert.ok(session.view.account!.profile.ownedCosmetics!.includes('cargo.insulated'));
  assert.equal(session.view.account!.profile.ownedCosmetics!.includes('theme.cold_chain'), false);
  assert.equal(session.view.account!.profile.ownedCosmetics!.includes('forklift.electric'), false);
});
