import type { CargoId, Point, Order, Cell, TraitId, Dock } from '../types.ts';
export type { CargoId, Point } from '../types.ts';
export type UpgradeIdV9 = 'candidate_slots'|'warehouse_expand'|'side_gate'|'small_parcels'|'cargo_supply'|'light_orders'|'pallet_rate'|'order_bonus'|'overfill_bonus'|'chain_bonus';
export type ToolIdV9 = 'rotate'|'clear'|'wildcard';
export interface ToolChargesV9 { rotate:0|1; clear:0|1; wildcard:0|1 }
export type CleanupBranchV9 = 'orders'|'placements';
export interface CleanupV9 { branch:CleanupBranchV9; progress:number }
export interface CellTraitV9 {kind:TraitId|'waste';remaining?:number;bornAtPlacement?:number}
export interface PieceV9 { id:string; shapeId:string; cargo:CargoId; trait?:TraitId; rushTurns?:number; quarterTurns:0|1|2|3 }
export type ToolCommandV9 = {type:'rotate';pieceId:string;quarterTurns:1|2|3}|{type:'clear';cells:number[]}|{type:'wildcard';pieceId:string};
export type InboundCommandV9 = {type:'place';pieceId:string;origin:Point}|{type:'chooseCleanup';branch:CleanupBranchV9}|{type:'upgrade';upgradeId:UpgradeIdV9;cargo?:CargoId}|ToolCommandV9|{type:'continueOvertime'}|{type:'finish'};
export interface StartV9 { seed:number;mode:'standard'|'daily'|'endless';guided?:boolean;toolCharges?:ToolChargesV9 }
export interface InboundRunV9 {
  rulesetVersion:9;runConfigId:'run.inbound_v9';seed:number;mode:StartV9['mode'];guided:boolean;
  boardSize:7|8;board:Cell[];cellTraits:(CellTraitV9|null)[];rngState:number[];nextId:number;
  candidates:PieceV9[];orders:Order[];phase:'cleanup'|'input'|'upgrade'|'rescue'|'result';
  shift:1|2|3|4|5;completedOrders:number;score:number;lastChain:number;maxChain:number;
  levels:Record<UpgradeIdV9,number>;upgradeChoices:UpgradeIdV9[];pendingThresholds:number[];claimedThresholds:number[];
  supplyCargo:CargoId|null;cleanup:CleanupV9|null;successfulPlacements:number;generatedPieces:number;
  toolCharges:ToolChargesV9;usedToolIds:ToolIdV9[];commandIndex:number;commandBaseIndex:number;commands:InboundCommandV9[];
  overtime:boolean;result:'failed'|'won'|null;endReason:'blocked'|'completed'|'retired'|null;
  /** Application metadata; excluded from gameplay checksum. */
  runSerial?:number;elapsedMs?:number;maxOccupancy?:number;
}
export interface UpgradeV9 { readonly id:UpgradeIdV9;readonly title:string;readonly description:string;readonly maxStack:number;readonly unlockOrders:number;readonly functional:boolean }
export interface CargoGroupV9 {cargo:CargoId;cells:number[];units:number}
export interface RouteV9 {path:Point[];entry:Point;gateId:string}
export interface ReachableGroupV9 extends RouteV9 {group:CargoGroupV9}
export interface ShipmentV9 {type:'shipment';boardSize:7|8;dockId:string;gateId:string;orderId:string;cargo:CargoId;cells:number[];path:Point[];score:number;chain:number;units:number;extraClearedCells:number[]}
export type InboundEventV9 = ShipmentV9
  | {type:'placed';pieceId:string;cells:number[]}
  | {type:'shift';shift:1|2|3|4|5}
  | {type:'cleanupChosen';branch:CleanupBranchV9}
  | {type:'cleanup';branch:CleanupBranchV9;cells:number[];triggers:number;progress:number}
  | {type:'rushTick';cells:{cell:number;remaining:number}[]}
  | {type:'rushExpired';cells:number[]}
  | {type:'upgrade';threshold:number;choices:UpgradeIdV9[]}
  | {type:'upgradeChosen';upgradeId:UpgradeIdV9;level:number;cargo?:CargoId}
  | {type:'toolUsed';toolId:ToolIdV9;cells?:number[];pieceId?:string}
  | {type:'rescue';plan:ToolCommandV9[]}
  | {type:'overtimeStarted'}
  | {type:'result';result:'failed'|'won';endReason:'blocked'|'completed'|'retired'};
export interface InboundStepResultV9 {state:InboundRunV9;events:InboundEventV9[];error?:string}
export interface PlacementPreviewV9 {valid:boolean;cells:number[];shipments:ShipmentV9[];events:InboundEventV9[];stateAfter?:InboundRunV9;reason?:string}
export interface GenerationDistributionV9 {traits:{normal:number;pallet:number;rush:number;hazard:number;wildcard:number};ordinaryShapes:{shapeId:string;probability:number}[];nonWildcardCargos:{cargo:CargoId;probability:number}[]}
export type DockV9 = Dock;
