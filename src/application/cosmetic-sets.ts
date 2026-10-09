import type { Profile } from './profile.ts';
import { getCosmetic, type AccountCosmeticState } from './cosmetics.ts';
import { shopPrice } from '../shared/build-policy.ts';

/** Sets are a read-only view over the original, independently owned cosmetic slots. */
export interface CosmeticSetDefinition {
  readonly id: string;
  readonly name: string;
  readonly theme: Profile['cosmetics']['theme'];
  readonly cargo: Profile['cosmetics']['cargo'];
  readonly forklift: Profile['cosmetics']['forklift'];
}

export const COSMETIC_SETS: readonly CosmeticSetDefinition[] = Object.freeze([
  { id: 'cold_chain', name: '冷链仓库', theme: 'cold_chain', cargo: 'insulated', forklift: 'electric' },
  { id: 'rail_freight', name: '铁路货站', theme: 'rail_freight', cargo: 'reinforced', forklift: 'heavy' },
  { id: 'express_sorting', name: '快递分拣中心', theme: 'express_sorting', cargo: 'taped', forklift: 'compact' },
  { id: 'toy_workshop', name: '积木工坊', theme: 'toy_workshop', cargo: 'toy_brick', forklift: 'toy' },
  { id: 'paper_warehouse', name: '折纸仓库', theme: 'paper_warehouse', cargo: 'paper_fold', forklift: 'paper' },
  { id: 'space_cargo', name: '太空货舱', theme: 'space_cargo', cargo: 'space_case', forklift: 'space' },
  { id: 'steam_foundry', name: '蒸汽工场', theme: 'steam_foundry', cargo: 'steam_brass', forklift: 'steam' },
  { id: 'neon_depot', name: '霓虹货站', theme: 'neon_depot', cargo: 'neon_circuit', forklift: 'neon' },
  { id: 'lava_forge', name: '熔岩铸造厂', theme: 'lava_forge', cargo: 'lava_core', forklift: 'lava' },
  { id: 'ocean_vault', name: '深海货库', theme: 'ocean_vault', cargo: 'ocean_relic', forklift: 'diving' },
  { id: 'royal_store', name: '鎏金宝库', theme: 'royal_store', cargo: 'royal_gold', forklift: 'royal' },
  { id: 'field_station', name: '野外补给站', theme: 'field_station', cargo: 'field_supply', forklift: 'field' },
  { id: 'forest_depot', name: '林间货仓', theme: 'forest_depot', cargo: 'wood', forklift: 'timber' },
  { id: 'ice_vault', name: '冰晶货仓', theme: 'ice_vault', cargo: 'ice_crystal', forklift: 'ice' },
  { id: 'harbor', name: '海港仓库', theme: 'harbor', cargo: 'harbor_container', forklift: 'harbor' },
].map(set => Object.freeze(set)) as CosmeticSetDefinition[]);

/** Classic is a configurable preset of existing items, never a purchasable bundle. */
export interface ClassicSetSelection {
  theme:'day'|'night';
  cargo:'classic'|'outline';
  forklift:'yellow'|'blue'|'red'|'white';
}
export const DEFAULT_CLASSIC_SET_SELECTION:Readonly<ClassicSetSelection>=Object.freeze({theme:'day',cargo:'classic',forklift:'yellow'});
export const CLASSIC_COSMETIC_SET:Readonly<CosmeticSetDefinition>=Object.freeze({id:'classic',name:'经典套装',theme:'day',cargo:'classic',forklift:'yellow'});
export const SHOP_COSMETIC_SETS:readonly CosmeticSetDefinition[]=Object.freeze([CLASSIC_COSMETIC_SET,...COSMETIC_SETS]);
export function isClassicSetSelection(value:unknown):value is ClassicSetSelection {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const choice=value as Record<string,unknown>;
  return Object.keys(choice).length===3&&Object.keys(choice).every(key=>['theme','cargo','forklift'].includes(key))
    &&['day','night'].includes(choice.theme as string)&&['classic','outline'].includes(choice.cargo as string)&&['yellow','blue','red','white'].includes(choice.forklift as string);
}
export function classicSetDefinition(selection:ClassicSetSelection):CosmeticSetDefinition {
  return {...CLASSIC_COSMETIC_SET,theme:selection.theme,cargo:'classic',forklift:selection.forklift};
}
export function classicSetStatus(selection:ClassicSetSelection,state:AccountCosmeticState):CosmeticSetStatus {
  const ownedCount=(['theme','cargo','forklift'] as const).filter(kind=>state.ownedCosmetics.includes(`${kind}.${selection[kind]}`)).length;
  const complete=ownedCount===3&&state.ownedCosmetics.includes('cargo.classic');
  return {ownedCount,complete,equipped:complete&&state.cosmetics.theme===selection.theme&&state.cosmetics.cargo==='classic'&&state.cosmetics.forklift===selection.forklift&&state.cargoOutline===(selection.cargo==='outline')};
}

export function getCosmeticSet(id: string): CosmeticSetDefinition | undefined {
  return id==='classic'?CLASSIC_COSMETIC_SET:COSMETIC_SETS.find(set => set.id === id);
}

/** Only missing members are discounted; previous purchases are never charged or refunded. */
export function quoteCosmeticSetPurchase(id: string, state: Pick<AccountCosmeticState, 'ownedCosmetics'>): { missingKeys: string[]; originalPrice: number; price: number } | null {
  const set = COSMETIC_SETS.find(set => set.id === id);
  if (!set) return null;
  const missing = (['theme', 'cargo', 'forklift'] as const)
    .map(kind => getCosmetic(kind, set[kind])!)
    .filter(item => !state.ownedCosmetics.includes(item.key));
  const originalPrice = missing.reduce((sum, item) => sum + item.price, 0);
  return { missingKeys: missing.map(item => item.key), originalPrice, price: shopPrice(Math.ceil(originalPrice * 4 / 5)) };
}

export interface CosmeticSetStatus { ownedCount: number; complete: boolean; equipped: boolean }

/** Ownership is always projected from members, never purchased or stored for the set itself. */
export function cosmeticSetStatus(set: CosmeticSetDefinition, state: Pick<AccountCosmeticState, 'ownedCosmetics' | 'cosmetics'>): CosmeticSetStatus {
  const kinds = ['theme', 'cargo', 'forklift'] as const;
  const ownedCount = kinds.filter(kind => state.ownedCosmetics.includes(`${kind}.${set[kind]}`)).length;
  const complete = ownedCount === kinds.length;
  return { ownedCount, complete, equipped: complete && kinds.every(kind => state.cosmetics[kind] === set[kind]) };
}
