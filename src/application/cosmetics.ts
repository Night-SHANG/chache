import type { AccountSnapshot } from './account-types.ts';
import type { Profile } from './profile.ts';

export type CosmeticKind = 'theme' | 'cargo' | 'forklift';
export interface CosmeticDefinition {
  kind: CosmeticKind; id: string; key: string; name: string; description: string;
  /** Zero means free or achievement-gated. Only a positive price is purchasable. */
  price: number; achievementId?: 'first_shipment' | 'five_shifts'; overlay?: boolean;
}
export function cosmeticKey(kind: CosmeticKind, id: string): string { return `${kind}.${id}`; }
export const COSMETIC_CATALOG: readonly CosmeticDefinition[] = Object.freeze([
  { kind: 'theme', id: 'day', key: 'theme.day', name: '日班仓库', description: '明亮的日班色调', price: 0 },
  { kind: 'theme', id: 'night', key: 'theme.night', name: '夜班仓库', description: '深色夜班色调', price: 0 },
  { kind: 'theme', id: 'harbor', key: 'theme.harbor', name: '海港仓库', description: '海港钢梁与低对比仓库结构', price: 900 },
  { kind: 'cargo', id: 'classic', key: 'cargo.classic', name: '经典货箱', description: '默认货箱外观', price: 0 },
  { kind: 'cargo', id: 'outline', key: 'cargo.outline', name: '醒目轮廓', description: '可叠加到任意货箱的清晰轮廓', price: 0, overlay: true },
  { kind: 'cargo', id: 'wood', key: 'cargo.wood', name: '复古木条', description: '保留货类颜色与标记的木条货箱', price: 300 },
  { kind: 'forklift', id: 'yellow', key: 'forklift.yellow', name: '黄色叉车', description: '默认涂装', price: 0 },
  { kind: 'forklift', id: 'blue', key: 'forklift.blue', name: '蓝色叉车', description: '完成首次正式出货解锁', price: 0, achievementId: 'first_shipment' },
  { kind: 'forklift', id: 'red', key: 'forklift.red', name: '红色叉车', description: '完成标准五班胜利解锁', price: 0, achievementId: 'five_shifts' },
  { kind: 'forklift', id: 'white', key: 'forklift.white', name: '工程白', description: '白色工程涂装', price: 600 },
].map(item => Object.freeze(item)) as CosmeticDefinition[]);
export const FREE_COSMETICS: readonly string[] = Object.freeze(COSMETIC_CATALOG.filter(item => item.price === 0 && !item.achievementId).map(item => item.key).sort());
export function getCosmetic(kind: string, id: string): CosmeticDefinition | undefined {
  return COSMETIC_CATALOG.find(item => item.kind === kind && item.id === id);
}
export interface AccountCosmeticState {
  ownedCosmetics: string[]; cosmetics: Profile['cosmetics']; cargoOutline: boolean;
}
/** A pure projection: previews never migrate an account or write storage. */
export function accountCosmeticState(account: Readonly<AccountSnapshot> | null, legacyProfile?: Profile): AccountCosmeticState {
  if (!account) {
    const cosmetics = legacyProfile?.cosmetics ?? { theme: 'day', forklift: 'yellow', cargo: 'classic' };
    const owned = new Set(FREE_COSMETICS);
    for (const kind of ['theme', 'cargo', 'forklift'] as const) {
      const item = getCosmetic(kind, cosmetics[kind]);
      if (item && item.price === 0) owned.add(item.key);
    }
    if (legacyProfile && (legacyProfile.stats.orders > 0 || legacyProfile.achievements.includes('first_shipment'))) owned.add('forklift.blue');
    if (legacyProfile?.achievements.includes('five_shifts')) owned.add('forklift.red');
    return { ownedCosmetics: [...owned].sort(), cosmetics: { ...cosmetics, cargo: cosmetics.cargo === 'outline' ? 'classic' : cosmetics.cargo }, cargoOutline: cosmetics.cargo === 'outline' };
  }
  const profile = account.profile, legacy = profile.legacyResults;
  const owned = new Set([...FREE_COSMETICS, ...(profile.ownedCosmetics ?? [])]);
  // Old accounts can retain an equipped achievement cosmetic after a display reset.
  if (account.formatVersion < 3) for (const kind of ['theme', 'cargo', 'forklift'] as const) {
    const item = getCosmetic(kind, profile.cosmetics[kind]);
    if (item && item.price === 0) owned.add(item.key);
  }
  const formal = Object.entries(profile.results).filter(([key]) => /^inbound\.(?:(standard|daily)\.v(9|11|14|15)\.|daily\.v16\.|standard\.v16\.(normal|hard|expert)\.|(standard|daily)\.v18\.(hard|expert)\.|rush\.v19\.(hard|expert)\.)(plain|tools)$/.test(key));
  let blue = legacy.achievements.includes('first_shipment') || legacy.stats.orders > 0 || formal.some(([, bucket]) => bucket.units > 0);
  let red = legacy.achievements.includes('five_shifts') || formal.some(([key, bucket]) => key.startsWith('inbound.standard.') && bucket.wins > 0);
  const run = account.run;
  if (run && ['standard', 'daily', 'rush'].includes(run.identity.mode) && [9, 11, 14, 15, 16, 18, 19].includes(run.identity.rulesetVersion)
    && !(run.state.rulesetVersion===18&&run.state.overtime)) {
    const cursor = run.resultCursor;
    const fresh = run.identity.serial > account.resetCursor.serial || run.identity.serial === account.resetCursor.serial && run.state.commandIndex > account.resetCursor.commandIndex && cursor !== null;
    if (fresh) {
      blue ||= run.state.completedOrders > (cursor?.units ?? 0);
      red ||= run.identity.mode === 'standard' && !cursor?.baseline.countedWin && (run.state.endReason === 'completed' || 'overtime' in run.state && run.state.overtime === true);
    }
  }
  if (blue) owned.add('forklift.blue');
  if (red) owned.add('forklift.red');
  return { ownedCosmetics: [...owned].sort(), cosmetics: { ...profile.cosmetics, cargo: profile.cosmetics.cargo === 'outline' ? 'classic' : profile.cosmetics.cargo }, cargoOutline: profile.cargoOutline ?? profile.cosmetics.cargo === 'outline' };
}
/** The caller prepares this and the requested mutation inside the same A/B transaction. */
export function retainAccountCosmetics(account: AccountSnapshot): AccountSnapshot {
  return { ...account, formatVersion: account.formatVersion===4?4:3, profile: { ...account.profile, ...accountCosmeticState(account) } };
}
/** Digest-valid unsupported ownership must never be replaced by an older readable root. */
export class InvalidCosmeticState extends Error {}
export function assertAccountCosmetics(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InvalidCosmeticState('外观拥有或装备记录结构无效，原记录已保留');
  const profile = value as Record<string, unknown>;
  const profileKeys = ['settings', 'cosmetics', 'legacyResults', 'results', 'ownedCosmetics', 'cargoOutline'];
  if (Object.keys(profile).length !== profileKeys.length || Object.keys(profile).some(key => !profileKeys.includes(key))) throw new InvalidCosmeticState('外观拥有或装备记录结构无效，原记录已保留');
  const owned = profile.ownedCosmetics, equipped = profile.cosmetics;
  const valid = Array.isArray(owned) && owned.length <= COSMETIC_CATALOG.length
    && owned.every((key, index) => typeof key === 'string' && COSMETIC_CATALOG.some(item => item.key === key) && (index === 0 || owned[index - 1] < key))
    && FREE_COSMETICS.every(key => owned.includes(key)) && typeof profile.cargoOutline === 'boolean'
    && equipped !== null && typeof equipped === 'object' && !Array.isArray(equipped)
    && Object.keys(equipped).length === 3 && Object.keys(equipped).every(kind => ['theme', 'cargo', 'forklift'].includes(kind))
    && (['theme', 'cargo', 'forklift'] as const).every(kind => {
      const id = (equipped as Record<string, unknown>)[kind];
      if (typeof id !== 'string') return false;
      const item = getCosmetic(kind, id);
      return item !== undefined && !item.overlay && owned.includes(item.key);
    });
  if (!valid) throw new InvalidCosmeticState('外观拥有或装备记录无效，原记录已保留');
}
