import type { AccountSnapshot } from './account-types.ts';
import type { Profile } from './profile.ts';

export type CosmeticKind = 'theme' | 'cargo' | 'forklift';
export interface CosmeticDefinition {
  kind: CosmeticKind; id: string; key: string; name: string; description: string;
  /** Zero means free or achievement-gated. Only a positive price is purchasable. */
  price: number; achievementId?: 'first_shipment' | 'five_shifts'; overlay?: boolean;
}
export function cosmeticKey(kind: CosmeticKind, id: string): string { return `${kind}.${id}`; }
/** Historical identifiers remain valid save data even after shop retirement. */
export const HISTORICAL_COSMETIC_CATALOG: readonly CosmeticDefinition[] = Object.freeze([
  { kind: 'theme', id: 'day', key: 'theme.day', name: '日班仓库', description: '明亮的日班色调', price: 0 },
  { kind: 'theme', id: 'night', key: 'theme.night', name: '夜班仓库', description: '深色夜班色调', price: 0 },
  { kind: 'theme', id: 'harbor', key: 'theme.harbor', name: '海港仓库', description: '海港钢梁与低对比仓库结构', price: 900 },
  { kind: 'theme', id: 'cold_chain', key: 'theme.cold_chain', name: '冷链仓库', description: '保温板、密封库门与顶部冷风机', price: 900 },
  { kind: 'theme', id: 'rail_freight', key: 'theme.rail_freight', name: '铁路货站', description: '月台、边缘铁轨与静态货运门架', price: 900 },
  { kind: 'theme', id: 'express_sorting', key: 'theme.express_sorting', name: '快递分拣中心', description: '滚筒线、分拣门架与斜向支线', price: 900 },
  { kind: 'theme', id: 'toy_workshop', key: 'theme.toy_workshop', name: '积木工坊', description: '圆塑横梁、凸点孔板与拼接立柱', price: 900 },
  { kind: 'theme', id: 'paper_warehouse', key: 'theme.paper_warehouse', name: '折纸仓库', description: '层叠纸板立边、折叠屋梁与剪纸支架', price: 900 },
  { kind: 'theme', id: 'space_cargo', key: 'theme.space_cargo', name: '太空货舱', description: '切角舱梁、舱壁立框与外侧检修条带', price: 900 },
  { kind: 'theme', id: 'steam_foundry', key: 'theme.steam_foundry', name: '蒸汽工场', description: '黄铜管路、压力表与铆接金属棋盘', price: 900 },
  { kind: 'theme', id: 'neon_depot', key: 'theme.neon_depot', name: '霓虹货站', description: '静态电路舱壁与低亮度线路棋盘', price: 900 },
  { kind: 'theme', id: 'lava_forge', key: 'theme.lava_forge', name: '熔岩铸造厂', description: '玄武岩梁柱与暗纹熔岩石板棋盘', price: 900 },
  { kind: 'theme', id: 'ocean_vault', key: 'theme.ocean_vault', name: '深海货库', description: '舷窗、海草珊瑚与水纹金属棋盘', price: 900 },
  { kind: 'theme', id: 'royal_store', key: 'theme.royal_store', name: '鎏金宝库', description: '鎏金拱柱与细金边石材棋盘', price: 900 },
  { kind: 'theme', id: 'field_station', key: 'theme.field_station', name: '野外补给站', description: '帆布棚架、束带立柱与防滑补给棋盘', price: 900 },
  { kind: 'cargo', id: 'classic', key: 'cargo.classic', name: '经典货箱', description: '默认货箱外观', price: 0 },
  { kind: 'cargo', id: 'outline', key: 'cargo.outline', name: '醒目轮廓', description: '可叠加到任意货箱的清晰轮廓', price: 0, overlay: true },
  { kind: 'cargo', id: 'wood', key: 'cargo.wood', name: '原木藤箱', description: '五色木纹、圆木箱架与攀附藤叶', price: 300 },
  { kind: 'cargo', id: 'insulated', key: 'cargo.insulated', name: '保温周转箱', description: '厚密封箱沿、短锁扣与凹入货类面板', price: 300 },
  { kind: 'cargo', id: 'reinforced', key: 'cargo.reinforced', name: '铆接钢箱', description: '彩色压制钢板、厚实金属包角与铆钉', price: 300 },
  { kind: 'cargo', id: 'taped', key: 'cargo.taped', name: '封签纸箱', description: '折叠纸盖与绕开货类标记的封箱胶带', price: 300 },
  { kind: 'cargo', id: 'toy_brick', key: 'cargo.toy_brick', name: '积木收纳箱', description: '厚圆塑箱沿、四角凸点与侧面模具接缝', price: 300 },
  { kind: 'cargo', id: 'paper_fold', key: 'cargo.paper_fold', name: '层叠纸箱', description: '三层纸边、翻折箱角与侧面插舌', price: 300 },
  { kind: 'cargo', id: 'space_case', key: 'cargo.space_case', name: '太空运输箱', description: '切角金属外框、嵌入锁扣与静态状态点', price: 300 },
  { kind: 'cargo', id: 'ice_crystal', key: 'cargo.ice_crystal', name: '冰晶货箱', description: '五色冰面切纹、霜雪箱沿与晶簇', price: 300 },
  { kind: 'cargo', id: 'steam_brass', key: 'cargo.steam_brass', name: '蒸汽机匣', description: '黄铜包角、压力表与蒸汽管路', price: 300 },
  { kind: 'cargo', id: 'neon_circuit', key: 'cargo.neon_circuit', name: '霓虹机匣', description: '切角装甲、静态光带与电路面板', price: 300 },
  { kind: 'cargo', id: 'lava_core', key: 'cargo.lava_core', name: '熔岩石箱', description: '玄武岩箱壁与五色熔岩裂纹', price: 300 },
  { kind: 'cargo', id: 'ocean_relic', key: 'cargo.ocean_relic', name: '深海珊瑚箱', description: '铜质舷窗箱沿、海草珊瑚与贝壳', price: 300 },
  { kind: 'cargo', id: 'royal_gold', key: 'cargo.royal_gold', name: '鎏金宝匣', description: '鎏金箱框、宝石包角与典雅纹饰', price: 300 },
  { kind: 'cargo', id: 'field_supply', key: 'cargo.field_supply', name: '战术补给箱', description: '耐磨箱体、加固包角与双束带', price: 300 },
  { kind: 'forklift', id: 'yellow', key: 'forklift.yellow', name: '黄色叉车', description: '默认涂装', price: 0 },
  { kind: 'forklift', id: 'blue', key: 'forklift.blue', name: '蓝色叉车', description: '五班或加急首次出货后解锁', price: 0, achievementId: 'first_shipment' },
  { kind: 'forklift', id: 'red', key: 'forklift.red', name: '红色叉车', description: '通关入库五班后解锁', price: 0, achievementId: 'five_shifts' },
  { kind: 'forklift', id: 'white', key: 'forklift.white', name: '工程白', description: '白色工程涂装', price: 600 },
  { kind: 'forklift', id: 'electric', key: 'forklift.electric', name: '电驱叉车', description: '切角电池尾舱、封闭护顶框与分段格栅', price: 600 },
  { kind: 'forklift', id: 'heavy', key: 'forklift.heavy', name: '重载叉车', description: '宽配重、独立护轮翼板与双横梁驾驶框', price: 600 },
  { kind: 'forklift', id: 'compact', key: 'forklift.compact', name: '短轴叉车', description: '短后舱、收窄楔形车身与开放护顶框', price: 600 },
  { kind: 'forklift', id: 'toy', key: 'forklift.toy', name: '玩具叉车', description: '圆角车壳、厚轮眉、凹入车窗与尾舱凸点', price: 600 },
  { kind: 'forklift', id: 'paper', key: 'forklift.paper', name: '纸艺叉车', description: '瓦楞尾舱、折叠轮眉与层叠纸板护顶', price: 600 },
  { kind: 'forklift', id: 'space', key: 'forklift.space', name: '舱内叉车', description: '封闭切角驾驶舱、分段装甲与短尾舱格栅', price: 600 },
  { kind: 'forklift', id: 'steam', key: 'forklift.steam', name: '锅炉叉车', description: '黄铜车壳、铆接护顶与锅炉尾舱', price: 600 },
  { kind: 'forklift', id: 'neon', key: 'forklift.neon', name: '光轨叉车', description: '切角科技车壳与静态电路光带', price: 600 },
  { kind: 'forklift', id: 'lava', key: 'forklift.lava', name: '耐热叉车', description: '玄武岩装甲与熔纹护顶', price: 600 },
  { kind: 'forklift', id: 'diving', key: 'forklift.diving', name: '潜航叉车', description: '深海铜壳、圆舷窗与潜航尾舱', price: 600 },
  { kind: 'forklift', id: 'royal', key: 'forklift.royal', name: '礼装叉车', description: '鎏金车身、宝石饰角与皇家护顶', price: 600 },
  { kind: 'forklift', id: 'field', key: 'forklift.field', name: '越野叉车', description: '耐磨配重、束带尾舱与加固护顶', price: 600 },
  { kind: 'theme', id: 'forest_depot', key: 'theme.forest_depot', name: '林间货仓', description: '原木梁柱、藤叶与木质货仓棋盘', price: 900 },
  { kind: 'theme', id: 'ice_vault', key: 'theme.ice_vault', name: '冰晶货仓', description: '冰晶梁柱、霜雪边框与冰面棋盘', price: 900 },
  { kind: 'cargo', id: 'harbor_container', key: 'cargo.harbor_container', name: '海运集装箱', description: '压纹钢板、港运锁杆与加固箱角', price: 300 },
  { kind: 'forklift', id: 'timber', key: 'forklift.timber', name: '林务叉车', description: '木质护板、林务车身与原木配重', price: 600 },
  { kind: 'forklift', id: 'ice', key: 'forklift.ice', name: '冰晶叉车', description: '冰晶车壳、霜雪护顶与透明切面', price: 600 },
  { kind: 'forklift', id: 'harbor', key: 'forklift.harbor', name: '码头叉车', description: '海港钢壳、加固护顶与码头配重', price: 600 },
].map(item => Object.freeze(item)) as CosmeticDefinition[]);
const RETIRED_COSMETIC_KEYS: ReadonlySet<string> = new Set(['theme.express_sorting', 'cargo.taped', 'forklift.compact']);
export const COSMETIC_CATALOG: readonly CosmeticDefinition[] = Object.freeze(HISTORICAL_COSMETIC_CATALOG.filter(item => !RETIRED_COSMETIC_KEYS.has(item.key)));
export const FREE_COSMETICS: readonly string[] = Object.freeze(COSMETIC_CATALOG.filter(item => item.price === 0 && !item.achievementId).map(item => item.key).sort());
export function getCosmetic(kind: string, id: string): CosmeticDefinition | undefined {
  return COSMETIC_CATALOG.find(item => item.kind === kind && item.id === id);
}
export interface AccountCosmeticState {
  ownedCosmetics: string[]; cosmetics: Profile['cosmetics']; cargoOutline: boolean;
}
/** Retired slots use free defaults; every other slot and the independent outline stay intact. */
function activeCosmetics(cosmetics: Profile['cosmetics']): Profile['cosmetics'] {
  return {
    theme: cosmetics.theme === 'express_sorting' ? 'day' : cosmetics.theme,
    cargo: cosmetics.cargo === 'taped' || cosmetics.cargo === 'outline' ? 'classic' : cosmetics.cargo,
    forklift: cosmetics.forklift === 'compact' ? 'yellow' : cosmetics.forklift,
  };
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
    return { ownedCosmetics: [...owned].sort(), cosmetics: activeCosmetics(cosmetics), cargoOutline: cosmetics.cargo === 'outline' };
  }
  const profile = account.profile, legacy = profile.legacyResults;
  const owned = new Set([...FREE_COSMETICS, ...(profile.ownedCosmetics ?? [])]);
  // Old accounts can retain an equipped achievement cosmetic after a display reset.
  if (account.formatVersion < 3) for (const kind of ['theme', 'cargo', 'forklift'] as const) {
    const item = getCosmetic(kind, profile.cosmetics[kind]);
    if (item && item.price === 0) owned.add(item.key);
  }
  const formal = Object.entries(profile.results).filter(([key]) => /^inbound\.(?:(standard|daily)\.v(9|11|14|15)\.|daily\.v16\.|standard\.v16\.(normal|hard|expert)\.|(standard|daily)\.v18\.(hard|expert)\.|rush\.v19\.(hard|expert)\.|rush\.v20\.fixed\.)(plain|tools)$/.test(key));
  let blue = legacy.achievements.includes('first_shipment') || legacy.stats.orders > 0 || formal.some(([, bucket]) => bucket.units > 0);
  let red = legacy.achievements.includes('five_shifts') || formal.some(([key, bucket]) => key.startsWith('inbound.standard.') && bucket.wins > 0);
  const run = account.run;
  if (run && ['standard', 'daily', 'rush'].includes(run.identity.mode) && [9, 11, 14, 15, 16, 18, 19, 20, 21].includes(run.identity.rulesetVersion)
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
  return { ownedCosmetics: [...owned].sort(), cosmetics: activeCosmetics(profile.cosmetics), cargoOutline: profile.cargoOutline ?? profile.cosmetics.cargo === 'outline' };
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
  const valid = Array.isArray(owned) && owned.length <= HISTORICAL_COSMETIC_CATALOG.length
    && owned.every((key, index) => typeof key === 'string' && HISTORICAL_COSMETIC_CATALOG.some(item => item.key === key) && (index === 0 || owned[index - 1] < key))
    && FREE_COSMETICS.every(key => owned.includes(key)) && typeof profile.cargoOutline === 'boolean'
    && equipped !== null && typeof equipped === 'object' && !Array.isArray(equipped)
    && Object.keys(equipped).length === 3 && Object.keys(equipped).every(kind => ['theme', 'cargo', 'forklift'].includes(kind))
    && (['theme', 'cargo', 'forklift'] as const).every(kind => {
      const id = (equipped as Record<string, unknown>)[kind];
      if (typeof id !== 'string') return false;
      const item = HISTORICAL_COSMETIC_CATALOG.find(item => item.kind === kind && item.id === id);
      return item !== undefined && !item.overlay && owned.includes(item.key);
    });
  if (!valid) throw new InvalidCosmeticState('外观拥有或装备记录无效，原记录已保留');
}
