import type { CargoId, Point, Order, Cell, TraitId, Dock } from '../types.ts';
export type { CargoId, Point } from '../types.ts';
export type UpgradeIdV16 = 'candidate_slots'|'warehouse_expand'|'side_gate'|'small_parcels'|'cargo_supply'|'light_orders'|'pallet_rate'|'order_bonus'|'overfill_bonus'|'chain_bonus';
export type ToolIdV16 = 'rotate'|'clear'|'wildcard';
export interface ToolChargesV16 { rotate:0|1; clear:0|1; wildcard:0|1 }
export type CleanupBranchV16 = 'orders'|'placements';
export interface CleanupV16 { branch:CleanupBranchV16; progress:number }
export interface CellTraitV16 {kind:TraitId|'waste';remaining?:number;bornAtPlacement?:number}
export interface PieceV16 { id:string; shapeId:string; cargo:CargoId; trait?:TraitId; rushTurns?:number; quarterTurns:0|1|2|3 }
export type ToolCommandV16 = {type:'rotate';pieceId:string;quarterTurns:1|2|3}|{type:'clear';cells:number[]}|{type:'wildcard';pieceId:string};
export type InboundCommandV16 = {type:'place';pieceId:string;origin:Point}|{type:'chooseCleanup';branch:CleanupBranchV16}|ToolCommandV16|{type:'continueOvertime'}|{type:'finish'};
export interface StartV16 { seed:number;mode:'standard'|'daily'|'endless';guided?:boolean;toolCharges?:ToolChargesV16 }
export interface InboundRunV16 {
  rulesetVersion:16;runConfigId:'run.inbound_v16';seed:number;mode:StartV16['mode'];guided:boolean;
  boardSize:7;board:Cell[];cellTraits:(CellTraitV16|null)[];rngState:number[];nextId:number;
  candidates:PieceV16[];orders:Order[];phase:'cleanup'|'input'|'rescue'|'result';
  shift:1|2|3|4|5;completedOrders:number;score:number;lastChain:number;maxChain:number;
  levels:Record<UpgradeIdV16,0>;upgradeChoices:[];pendingThresholds:[];claimedThresholds:[];
  supplyCargo:null;cleanup:CleanupV16|null;successfulPlacements:number;generatedPieces:number;
  toolCharges:ToolChargesV16;usedToolIds:ToolIdV16[];commandIndex:number;commandBaseIndex:number;commands:InboundCommandV16[];
  overtime:boolean;result:'failed'|'won'|null;endReason:'blocked'|'completed'|'retired'|null;
  /** Application metadata; excluded from gameplay checksum. */
  runSerial?:number;elapsedMs?:number;maxOccupancy?:number;
}
export interface CargoGroupV16 {cargo:CargoId;cells:number[];units:number}
export interface RouteV16 {path:Point[];entry:Point;gateId:string}
export interface ReachableGroupV16 extends RouteV16 {group:CargoGroupV16}
export interface ShipmentV16 {type:'shipment';boardSize:7;dockId:string;gateId:string;orderId:string;cargo:CargoId;cells:number[];path:Point[];score:number;chain:number;units:number;extraClearedCells:number[]}
export type InboundEventV16 = ShipmentV16
  | {type:'placed';pieceId:string;cells:number[]}
  | {type:'shift';shift:1|2|3|4|5}
  | {type:'cleanupChosen';branch:CleanupBranchV16}
  | {type:'cleanup';branch:CleanupBranchV16;cells:number[];triggers:number;progress:number}
  | {type:'rushTick';cells:{cell:number;remaining:number}[]}
  | {type:'rushExpired';cells:number[]}
  | {type:'toolUsed';toolId:ToolIdV16;cells?:number[];pieceId?:string}
  | {type:'rescue';plan:ToolCommandV16[]}
  | {type:'overtimeStarted'}
  | {type:'result';result:'failed'|'won';endReason:'blocked'|'completed'|'retired'};
export interface InboundStepResultV16 {state:InboundRunV16;events:InboundEventV16[];error?:string}
export interface PlacementPreviewV16 {valid:boolean;cells:number[];shipments:ShipmentV16[];events:InboundEventV16[];stateAfter?:InboundRunV16;reason?:string}
export interface GenerationDistributionV16 {traits:{normal:number;pallet:number;rush:number;hazard:number;wildcard:number};ordinaryShapes:{shapeId:string;probability:number}[];nonWildcardCargos:{cargo:CargoId;probability:number}[]}
export type DockV16 = Dock;
