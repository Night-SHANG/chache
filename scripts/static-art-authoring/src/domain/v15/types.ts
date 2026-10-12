import type { CargoId, Point, Order, Cell, TraitId, Dock } from '../types.ts';
export type { CargoId, Point } from '../types.ts';
export type UpgradeIdV15 = 'candidate_slots'|'warehouse_expand'|'side_gate'|'small_parcels'|'cargo_supply'|'light_orders'|'pallet_rate'|'order_bonus'|'overfill_bonus'|'chain_bonus';
export type ToolIdV15 = 'rotate'|'clear'|'wildcard';
export interface ToolChargesV15 { rotate:0|1; clear:0|1; wildcard:0|1 }
export type CleanupBranchV15 = 'orders'|'placements';
export interface CleanupV15 { branch:CleanupBranchV15; progress:number }
export interface CellTraitV15 {kind:TraitId|'waste';remaining?:number;bornAtPlacement?:number}
export interface PieceV15 { id:string; shapeId:string; cargo:CargoId; trait?:TraitId; rushTurns?:number; quarterTurns:0|1|2|3 }
export type ToolCommandV15 = {type:'rotate';pieceId:string;quarterTurns:1|2|3}|{type:'clear';cells:number[]}|{type:'wildcard';pieceId:string};
export type InboundCommandV15 = {type:'place';pieceId:string;origin:Point}|{type:'chooseCleanup';branch:CleanupBranchV15}|ToolCommandV15|{type:'continueOvertime'}|{type:'finish'};
export interface StartV15 { seed:number;mode:'standard'|'daily'|'endless';guided?:boolean;toolCharges?:ToolChargesV15 }
export interface InboundRunV15 {
  rulesetVersion:15;runConfigId:'run.inbound_v15';seed:number;mode:StartV15['mode'];guided:boolean;
  boardSize:7;board:Cell[];cellTraits:(CellTraitV15|null)[];rngState:number[];nextId:number;
  candidates:PieceV15[];orders:Order[];phase:'cleanup'|'input'|'rescue'|'result';
  shift:1|2|3|4|5;completedOrders:number;score:number;lastChain:number;maxChain:number;
  levels:Record<UpgradeIdV15,0>;upgradeChoices:[];pendingThresholds:[];claimedThresholds:[];
  supplyCargo:null;cleanup:CleanupV15|null;successfulPlacements:number;generatedPieces:number;
  toolCharges:ToolChargesV15;usedToolIds:ToolIdV15[];commandIndex:number;commandBaseIndex:number;commands:InboundCommandV15[];
  overtime:boolean;result:'failed'|'won'|null;endReason:'blocked'|'completed'|'retired'|null;
  /** Application metadata; excluded from gameplay checksum. */
  runSerial?:number;elapsedMs?:number;maxOccupancy?:number;
}
export interface CargoGroupV15 {cargo:CargoId;cells:number[];units:number}
export interface RouteV15 {path:Point[];entry:Point;gateId:string}
export interface ReachableGroupV15 extends RouteV15 {group:CargoGroupV15}
export interface ShipmentV15 {type:'shipment';boardSize:7;dockId:string;gateId:string;orderId:string;cargo:CargoId;cells:number[];path:Point[];score:number;chain:number;units:number;extraClearedCells:number[]}
export type InboundEventV15 = ShipmentV15
  | {type:'placed';pieceId:string;cells:number[]}
  | {type:'shift';shift:1|2|3|4|5}
  | {type:'cleanupChosen';branch:CleanupBranchV15}
  | {type:'cleanup';branch:CleanupBranchV15;cells:number[];triggers:number;progress:number}
  | {type:'rushTick';cells:{cell:number;remaining:number}[]}
  | {type:'rushExpired';cells:number[]}
  | {type:'toolUsed';toolId:ToolIdV15;cells?:number[];pieceId?:string}
  | {type:'rescue';plan:ToolCommandV15[]}
  | {type:'overtimeStarted'}
  | {type:'result';result:'failed'|'won';endReason:'blocked'|'completed'|'retired'};
export interface InboundStepResultV15 {state:InboundRunV15;events:InboundEventV15[];error?:string}
export interface PlacementPreviewV15 {valid:boolean;cells:number[];shipments:ShipmentV15[];events:InboundEventV15[];stateAfter?:InboundRunV15;reason?:string}
export interface GenerationDistributionV15 {traits:{normal:number;pallet:number;rush:number;hazard:number;wildcard:number};ordinaryShapes:{shapeId:string;probability:number}[];nonWildcardCargos:{cargo:CargoId;probability:number}[]}
export type DockV15 = Dock;
