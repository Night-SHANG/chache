import type { CargoId, Point, Order, Cell, TraitId, Dock } from '../types.ts';
export type { CargoId, Point } from '../types.ts';
export type UpgradeIdV14 = 'candidate_slots'|'warehouse_expand'|'side_gate'|'small_parcels'|'cargo_supply'|'light_orders'|'pallet_rate'|'order_bonus'|'overfill_bonus'|'chain_bonus';
export type ToolIdV14 = 'rotate'|'clear'|'wildcard';
export interface ToolChargesV14 { rotate:0|1; clear:0|1; wildcard:0|1 }
export type CleanupBranchV14 = 'orders'|'placements';
export interface CleanupV14 { branch:CleanupBranchV14; progress:number }
export interface CellTraitV14 {kind:TraitId|'waste';remaining?:number;bornAtPlacement?:number}
export interface PieceV14 { id:string; shapeId:string; cargo:CargoId; trait?:TraitId; rushTurns?:number; quarterTurns:0|1|2|3 }
export type ToolCommandV14 = {type:'rotate';pieceId:string;quarterTurns:1|2|3}|{type:'clear';cells:number[]}|{type:'wildcard';pieceId:string};
export type InboundCommandV14 = {type:'place';pieceId:string;origin:Point}|{type:'chooseCleanup';branch:CleanupBranchV14}|ToolCommandV14|{type:'continueOvertime'}|{type:'finish'};
export interface StartV14 { seed:number;mode:'standard'|'daily'|'endless';guided?:boolean;toolCharges?:ToolChargesV14 }
export interface InboundRunV14 {
  rulesetVersion:14;runConfigId:'run.inbound_v14';seed:number;mode:StartV14['mode'];guided:boolean;
  boardSize:7;board:Cell[];cellTraits:(CellTraitV14|null)[];rngState:number[];nextId:number;
  candidates:PieceV14[];orders:Order[];phase:'cleanup'|'input'|'rescue'|'result';
  shift:1|2|3|4|5;completedOrders:number;score:number;lastChain:number;maxChain:number;
  levels:Record<UpgradeIdV14,0>;upgradeChoices:[];pendingThresholds:[];claimedThresholds:[];
  supplyCargo:null;cleanup:CleanupV14|null;successfulPlacements:number;generatedPieces:number;
  toolCharges:ToolChargesV14;usedToolIds:ToolIdV14[];commandIndex:number;commandBaseIndex:number;commands:InboundCommandV14[];
  overtime:boolean;result:'failed'|'won'|null;endReason:'blocked'|'completed'|'retired'|null;
  /** Application metadata; excluded from gameplay checksum. */
  runSerial?:number;elapsedMs?:number;maxOccupancy?:number;
}
export interface CargoGroupV14 {cargo:CargoId;cells:number[];units:number}
export interface RouteV14 {path:Point[];entry:Point;gateId:string}
export interface ReachableGroupV14 extends RouteV14 {group:CargoGroupV14}
export interface ShipmentV14 {type:'shipment';boardSize:7;dockId:string;gateId:string;orderId:string;cargo:CargoId;cells:number[];path:Point[];score:number;chain:number;units:number;extraClearedCells:number[]}
export type InboundEventV14 = ShipmentV14
  | {type:'placed';pieceId:string;cells:number[]}
  | {type:'shift';shift:1|2|3|4|5}
  | {type:'cleanupChosen';branch:CleanupBranchV14}
  | {type:'cleanup';branch:CleanupBranchV14;cells:number[];triggers:number;progress:number}
  | {type:'rushTick';cells:{cell:number;remaining:number}[]}
  | {type:'rushExpired';cells:number[]}
  | {type:'toolUsed';toolId:ToolIdV14;cells?:number[];pieceId?:string}
  | {type:'rescue';plan:ToolCommandV14[]}
  | {type:'overtimeStarted'}
  | {type:'result';result:'failed'|'won';endReason:'blocked'|'completed'|'retired'};
export interface InboundStepResultV14 {state:InboundRunV14;events:InboundEventV14[];error?:string}
export interface PlacementPreviewV14 {valid:boolean;cells:number[];shipments:ShipmentV14[];events:InboundEventV14[];stateAfter?:InboundRunV14;reason?:string}
export interface GenerationDistributionV14 {traits:{normal:number;pallet:number;rush:number;hazard:number;wildcard:number};ordinaryShapes:{shapeId:string;probability:number}[];nonWildcardCargos:{cargo:CargoId;probability:number}[]}
export type DockV14 = Dock;
