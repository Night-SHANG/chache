export type CargoId = 'cargo.food' | 'cargo.machine' | 'cargo.chem' | 'cargo.electronic' | 'cargo.cold';
export type Cell = CargoId | null;
export interface Point { x: number; y: number }
export interface Shape { id: string; cells: Point[]; minShift: number; weight: number }
export type TraitId = 'pallet' | 'rush' | 'hazard' | 'wildcard';
export interface CellTrait { kind: TraitId | 'waste'; remaining?: number; bornAtCommand?: number }
export interface Piece { id: string; shapeId: string; cargo: CargoId; cellCargos?: CargoId[]; trait?: TraitId; rushTurns?: number }
export type ColorTier = 'entry' | 'middle' | 'late';
export type OutboundDifficulty = 'easy' | 'normal' | 'hard' | 'expert';
export interface Order { id: string; dockId: string; cargo: CargoId; amount: number; baseScore: number }
export interface Dock { id: string; name: string; entry: Point; side: 'north' | 'east' | 'south' | 'west'; priority: number }
export type Command = { type: 'place'; pieceId: string; origin: Point } | { type: 'upgrade'; upgradeId: string } | {type:'continueOvertime'} | {type:'finishOvertime'} | {type:'finishEndless'};
export interface Upgrade { id: string; title: string; description: string; color: string; maxStack: number; effect: string; behavior?: boolean; minShift?: number; tags?: string[]; prerequisites?: string[]; conflicts?: string[]; params?: Record<string,number>; sourceRef?: string; provisional?: boolean }
export interface RunState {
  rulesetVersion: number; runConfigId: string; seed: number; mode: 'standard' | 'daily' | 'tutorial' | 'color_exit' | 'endless';
  colorTier?: ColorTier;
  boardSize?: 9;
  difficultyId?: OutboundDifficulty;
  rngState: number[]; board: Cell[]; candidates: Piece[]; orders: Order[];
  phase: 'input' | 'upgrade' | 'result'; shift: number; completedOrders: number; score: number;
  lastChain: number; maxChain: number; upgrades: string[]; upgradeChoices: string[];
  commandIndex: number; commands: Command[]; nextId: number; result: 'failed' | 'won' | null;
  cellTraits?: (CellTrait | null)[];
  generatedPieces?: number;
  tutorialStep?: number;
  overtime?: boolean;
  endReason?: 'blocked' | 'completed' | 'retired' | null;
  /** Application metadata; never changes gameplay randomness or checksum. */
  runSerial?: number;
  elapsedMs?: number;
  /** Peak occupied cells, including the placement before shipment; absent in older saves. */
  maxOccupancy?: number;
  challengeId?: string;
  challengeDay?: string;
}
export interface Shipment { type: 'shipment'; boardSize?: 9; dockId: string; orderId: string; cargo: CargoId; cells: number[]; path: Point[]; score: number; chain: number; units?: number; extraClearedCells?: number[]; usedPalletPass?: boolean; transport?: 'conveyor'; cargoPaths?: {cell:number;path:Point[]}[] }
export type DomainEvent = Shipment | { type: 'placed'; pieceId: string; cells: number[] } | { type: 'shift'; shift: number } | { type: 'upgrade' } | { type: 'result'; result: 'failed' | 'won' } | {type:'rushExpired';cells:number[]} | {type:'overtimeStarted'} | {type:'tutorialAdvanced';step:number};
export interface CommandResult { state: RunState; events: DomainEvent[]; error?: string }
export interface PlacementPreview { valid: boolean; cells: number[]; shipments: Shipment[]; reason?: string }
