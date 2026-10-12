export type CargoId = 'cargo.food' | 'cargo.machine' | 'cargo.chem' | 'cargo.electronic' | 'cargo.cold';
export type Cell = CargoId | null;
export interface Point { x: number; y: number }
export interface Shape { id: string; cells: Point[]; minShift: number; weight: number }
export type TraitId = 'pallet' | 'rush' | 'hazard' | 'wildcard';
export interface CellTrait { kind: TraitId | 'waste'; remaining?: number; bornAtCommand?: number }
export interface Piece { id: string; shapeId: string; cargo: CargoId; trait?: TraitId; rushTurns?: number }
export interface Order { id: string; dockId: string; cargo: CargoId; amount: number; baseScore: number }
export interface Dock { id: string; name: string; entry: Point; side: 'north' | 'east' | 'south' | 'west'; priority: number }
export type Command = { type: 'place'; pieceId: string; origin: Point } | { type: 'upgrade'; upgradeId: string };
export interface Upgrade { id: string; title: string; description: string; color: string; maxStack: number; effect: string; behavior?: boolean; minShift?: number; tags?: string[]; prerequisites?: string[]; conflicts?: string[]; params?: Record<string,number>; sourceRef?: string; provisional?: boolean }
export interface RunState {
  rulesetVersion: number; runConfigId: string; seed: number; mode: 'standard' | 'daily' | 'tutorial';
  rngState: number[]; board: Cell[]; candidates: Piece[]; orders: Order[];
  phase: 'input' | 'upgrade' | 'result'; shift: number; completedOrders: number; score: number;
  lastChain: number; maxChain: number; upgrades: string[]; upgradeChoices: string[];
  commandIndex: number; commands: Command[]; nextId: number; result: 'failed' | 'won' | null;
  cellTraits?: (CellTrait | null)[];
  generatedPieces?: number;
}
export interface Shipment { type: 'shipment'; dockId: string; orderId: string; cargo: CargoId; cells: number[]; path: Point[]; score: number; chain: number; units?: number; extraClearedCells?: number[]; usedPalletPass?: boolean }
export type DomainEvent = Shipment | { type: 'placed'; pieceId: string; cells: number[] } | { type: 'shift'; shift: number } | { type: 'upgrade' } | { type: 'result'; result: 'failed' | 'won' } | {type:'rushExpired';cells:number[]};
export interface CommandResult { state: RunState; events: DomainEvent[]; error?: string }
export interface PlacementPreview { valid: boolean; cells: number[]; shipments: Shipment[]; reason?: string }
