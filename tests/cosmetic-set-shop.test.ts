import { prepareViewArt } from './helpers/static-art-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { getUiControls } from '../src/presentation/ui.ts';
import { render } from '../src/presentation/renderer.ts';
import { COSMETIC_PREVIEW_RECT } from '../src/presentation/economy-ui.ts';
import { createRunV14 } from '../src/domain/v14/engine.ts';
import { createProfile } from '../src/application/profile.ts';
import { COSMETIC_CATALOG, retainAccountCosmetics } from '../src/application/cosmetics.ts';
import { makeAccountFixture } from './helpers/account-fixtures.ts';
import { sessionHost } from './helpers/session-fixtures.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
import type { GameSession } from '../src/application/session.ts';
const state = createRunV14({ seed: 11, mode: 'standard' });
const view = (patch: Partial<ViewState> = {}): ViewState => ({ screen: 'shop', shopTab: 'cosmetics', selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile: createProfile(), account: makeAccountFixture({ wallet: 3000 }), ...patch });
const controls = (v: ViewState) => getUiControls(state, v);
const open = (s: GameSession) => { s.action({ type: 'shop' }); s.action({ type: 'selectShopTab', tab: 'cosmetics' }); };
const capture = async (v: ViewState) => { await prepareViewArt(v); const c = createCanvas(1080, 1920), ctx = c.getContext('2d'), labels: string[] = []; const fill = ctx.fillText.bind(ctx); ctx.fillText = (value, x, y) => { labels.push(value); fill(value, x, y); }; render(ctx as unknown as CanvasRenderingContext2D, state, v); return { c, labels }; };
const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
const oldControls = new Set(['previewCosmeticSet', 'selectCosmeticSetPage', 'equipCosmeticSet', 'purchaseCosmeticSet', 'previewCosmeticSetMember', 'selectClassicSetVariant', 'equipClassicSet']);

test('appearance opens the scene category with exactly three individual categories and no set entry', async () => {
  const host = sessionHost(), session = host.session; open(session);
  assert.equal(session.view.shopSection, 'theme');
  const all = controls(session.view);
  assert.deepEqual(all.filter(control => control.action.type === 'selectShopSection').map(control => [control.label, control.selected]), [['场景', true], ['货箱', false], ['叉车', false]]);
  assert.equal(all.filter(control => control.action.type === 'previewCosmetic').length, 4);
  assert.equal(all.some(control => oldControls.has(control.action.type)), false);
  assert.doesNotMatch((await capture(session.view)).labels.join('\n'), /套装|8折|9折|补齐/);
  session.action({ type: 'selectShopTab', tab: 'tools' });
  assert.equal(controls(session.view).filter(control => control.action.type === 'purchase').length, 3);
});

test('all 38 active cosmetics remain reachable through individual pages without writes or equipment changes', () => {
  const host = sessionHost(), session = host.session; open(session);
  const before = [...host.data], account = structuredClone(session.view.account), ids = new Set<string>(); host.storage.resetFault();
  for (const kind of ['theme', 'cargo', 'forklift'] as const) {
    session.action({ type: 'selectShopSection', section: kind });
    const options = COSMETIC_CATALOG.filter(item => item.kind === kind);
    for (let page = 0; page < Math.ceil(options.length / 4); page++) {
      session.action({ type: 'selectCosmeticPage', page });
      const all = controls(session.view), cards = all.filter(control => control.action.type === 'previewCosmetic');
      assert.equal(cards.length, Math.min(4, options.length - page * 4));
      assert.equal(all.some(control => oldControls.has(control.action.type)), false);
      for (const card of cards) {
        assert.equal(card.action.type, 'previewCosmetic');
        if (card.action.type !== 'previewCosmetic') throw Error('Expected individual cosmetic');
        ids.add(`${card.action.kind}.${card.action.id}`); session.action(card.action);
        assert.equal(session.view.cosmeticSetPreview, undefined);
      }
    }
  }
  assert.deepEqual([...ids].sort(), COSMETIC_CATALOG.map(item => item.key).sort());
  assert.equal(ids.size, 38); assert.deepEqual(session.view.account, account); assert.deepEqual([...host.data], before);
  session.action({ type: 'back' }); assert.equal(session.view.screen, 'menu');
  assert.equal(host.storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
});

test('stale set, classic and old-browse view metadata cannot render old controls or discount copy', async () => {
  for (const patch of [{ shopSection: 'sets' }, { cosmeticSetPreview: 'cold_chain' }, { cosmeticSetPreview: 'classic', classicSetSelection: { theme: 'night', cargo: 'outline', forklift: 'white' } }, { cosmeticBrowse: 'sets', cosmeticSetPage: 3 }] as Partial<ViewState>[]) {
    const current = view(patch), before = structuredClone(current);
    assert.equal(controls(current).some(control => oldControls.has(control.action.type)), false);
    assert.doesNotMatch((await capture(current)).labels.join('\n'), /套装|8折|9折|补齐/);
    assert.deepEqual(current, before);
  }
});

test('standalone outline preview keeps the classic body even when ice cargo is equipped', async () => {
  const account = retainAccountCosmetics(makeAccountFixture({ formatVersion: 2, economyVersion: 2, dailyRewards: {}, wallet: 900 }));
  account.profile.ownedCosmetics = [...account.profile.ownedCosmetics!, 'cargo.ice_crystal'].sort();
  const plain = await capture(view({ account, shopSection: 'cargo', cosmeticPreview: { cargo: 'outline' } }));
  account.profile.cosmetics.cargo = 'ice_crystal';
  const ice = await capture(view({ account, shopSection: 'cargo', cosmeticPreview: { cargo: 'outline' } })), r = COSMETIC_PREVIEW_RECT;
  assert.equal(digest(ice.c.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data), digest(plain.c.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data));
});

test('outline selection after ice is explicit and free and leaves classic cargo when disabled', () => {
  const account = retainAccountCosmetics(makeAccountFixture({ formatVersion: 2, economyVersion: 2, dailyRewards: {}, wallet: 900 }));
  account.profile.ownedCosmetics = [...account.profile.ownedCosmetics!, 'cargo.ice_crystal'].sort(); account.profile.cosmetics.cargo = 'ice_crystal';
  const host = sessionHost(account), session = host.session; open(session);
  session.action({ type: 'previewCosmetic', kind: 'cargo', id: 'outline' }); const before = [...host.data];
  assert.deepEqual([...host.data], before);
  session.action({ type: 'setCargoOutline', enabled: true });
  assert.equal(session.view.account!.profile.cosmetics.cargo, 'classic'); assert.equal(session.view.account!.profile.cargoOutline, true);
  session.action({ type: 'setCargoOutline', enabled: false });
  assert.equal(session.view.account!.profile.cosmetics.cargo, 'classic'); assert.equal(session.view.account!.profile.cargoOutline, false);
  assert.equal(session.view.account!.wallet, 900);
});

test('new-account rejected set actions never create an account or durable write', () => {
  const host = sessionHost({}, false), session = host.session; open(session); host.storage.resetFault(); const before = [...host.data];
  for (const id of ['cold_chain', 'classic', 'harbor', 'unknown']) {
    session.action({ type: 'previewCosmeticSet', id }); session.action({ type: 'purchaseCosmeticSet', id }); session.action({ type: 'equipCosmeticSet', id });
  }
  for (const page of [NaN, 0, 99]) session.action({ type: 'selectCosmeticSetPage', page });
  assert.equal(session.view.account, null); assert.equal(session.view.confirmation, null);
  assert.equal(session.view.shopSection, 'theme'); assert.deepEqual([...host.data], before);
  assert.equal(host.storage.operations.some(op => op.kind === 'set' || op.kind === 'remove'), false);
});

test('individual shop pages, purchase confirmations and save retry retain disjoint 44px targets at 320px', () => {
  const variants: Partial<ViewState>[] = [{ shopTab: 'tools' }, { confirmation: { kind: 'purchase', item: 'rotate' } }, { confirmation: { kind: 'purchaseCosmetic', cosmeticKind: 'cargo', cosmeticId: 'insulated' } }, { accountBlocked: true }, ...(['theme', 'cargo', 'forklift'] as const).map(shopSection => ({ shopSection }))];
  for (const patch of variants) {
    const all = controls(view(patch));
    for (const [index, a] of all.entries()) {
      assert.ok(a.rect.w * 320 / 1080 >= 44 && a.rect.h * 320 / 1080 >= 44, a.action.type); assert.ok(a.rect.y + a.rect.h <= 1856);
      for (const b of all.slice(index + 1)) assert.ok(a.rect.x + a.rect.w <= b.rect.x || b.rect.x + b.rect.w <= a.rect.x || a.rect.y + a.rect.h <= b.rect.y || b.rect.y + b.rect.h <= a.rect.y, `${a.action.type}/${b.action.type}`);
    }
  }
});
