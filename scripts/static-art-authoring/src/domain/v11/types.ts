import type { CargoId, Point, Order, Cell, TraitId, Dock } from '../types.ts';
export type { CargoId, Point } from '../types.ts';
export type UpgradeIdV11 = 'candidate_slots'|'warehouse_expand'|'side_gate'|'small_parcels'|'cargo_supply'|'light_orders'|'pallet_rate'|'order_bonus'|'overfill_bonus'|'chain_bonus';
export type ToolIdV11 = 'rotate'|'clear'|'wildcard';
export interface ToolChargesV11 { rotate:0|1; clear:0|1; wildcard:0|1 }
export type CleanupBranchV11 = 'orders'|'placements';
export interface CleanupV11 { branch:CleanupBranchV11; progress:number }
export interface CellTraitV11 {kind:TraitId|'waste';remaining?:number;bornAtPlacement?:number}
export interface PieceV11 { id:string; shapeId:string; cargo:CargoId; trait?:TraitId; rushTurns?:number; quarterTurns:0|1|2|3 }
export type ToolCommandV11 = {type:'rotate';pieceId:string;quarterTurns:1|2|3}|{type:'clear';cells:number[]}|{type:'wildcard';pieceId:string};
export type InboundCommandV11 = {type:'place';pieceId:string;origin:Point}|{type:'chooseCleanup';branch:CleanupBranchV11}|ToolCommandV11|{type:'continueOvertime'}|{type:'finish'};
export interface StartV11 { seed:number;mode:'standard'|'daily'|'endless';guided?:boolean;toolCharges?:ToolChargesV11 }
export interface InboundRunV11 {
  rulesetVersion:11;runConfigId:'run.inbound_v11';seed:number;mode:StartV11['mode'];guided:boolean;
  boardSize:7;board:Cell[];cellTraits:(CellTraitV11|null)[];rngState:number[];nextId:number;
  candidates:PieceV11[];orders:Order[];phase:'cleanup'|'input'|'rescue'|'result';
  shift:1|2|3|4|5;completedOrders:number;score:number;lastChain:number;maxChain:number;
  levels:Record<UpgradeIdV11,0>;upgradeChoices:[];pendingThresholds:[];claimedThresholds:[];
  supplyCargo:null;cleanup:CleanupV11|null;successfulPlacements:number;generatedPieces:number;
  toolCharges:ToolChargesV11;usedToolIds:ToolIdV11[];commandIndex:number;commandBaseIndex:number;commands:InboundCommandV11[];
  overtime:boolean;result:'failed'|'won'|null;endReason:'blocked'|'completed'|'retired'|null;
  /** Application metadata; excluded from gameplay checksum. */
  runSerial?:number;elapsedMs?:number;maxOccupancy?:number;
}
export interface CargoGroupV11 {cargo:CargoId;cells:number[];units:number}
export interface RouteV11 {path:Point[];entry:Point;gateId:string}
export interface ReachableGroupV11 extends RouteV11 {group:CargoGroupV11}
export interface ShipmentV11 {type:'shipment';boardSize:7;dockId:string;gateId:string;orderId:string;cargo:CargoId;cells:number[];path:Point[];score:number;chain:number;units:number;extraClearedCells:number[]}
export type InboundEventV11 = ShipmentV11
  | {type:'placed';pieceId:string;cells:number[]}
  | {type:'shift';shift:1|2|3|4|5}
  | {type:'cleanupChosen';branch:CleanupBranchV11}
  | {type:'cleanup';branch:CleanupBranchV11;cells:number[];triggers:number;progress:number}
  | {type:'rushTick';cells:{cell:number;remaining:number}[]}
  | {type:'rushExpired';cells:number[]}
  | {type:'toolUsed';toolId:ToolIdV11;cells?:number[];pieceId?:string}
  | {type:'rescue';plan:ToolCommandV11[]}
  | {type:'overtimeStarted'}
  | {type:'result';result:'failed'|'won';endReason:'blocked'|'completed'|'retired'};
export interface InboundStepResultV11 {state:InboundRunV11;events:InboundEventV11[];error?:string}
export interface PlacementPreviewV11 {valid:boolean;cells:number[];shipments:ShipmentV11[];events:InboundEventV11[];stateAfter?:InboundRunV11;reason?:string}
export interface GenerationDistributionV11 {traits:{normal:number;pallet:number;rush:number;hazard:number;wildcard:number};ordinaryShapes:{shapeId:string;probability:number}[];nonWildcardCargos:{cargo:CargoId;probability:number}[]}
export type DockV11 = Dock;
