import type {Cell, CellTrait, Order, OutboundDifficulty, Piece, Point} from '../types.ts';

/** A separate rules identity; old RunState and its commands remain frozen. */
export type OutboundEndlessCommandV10 =
  | {type:'place';pieceId:string;origin:Point}
  | {type:'finishOutboundEndless'};

export interface OutboundEndlessRunV10 {
  rulesetVersion:10;
  runConfigId:string;
  seed:number;
  mode:'color_exit';
  boardSize:9;
  difficultyId:OutboundDifficulty;
  rngState:number[];
  board:Cell[];
  cellTraits:(CellTrait|null)[];
  candidates:Piece[];
  orders:Order[];
  phase:'input'|'result';
  shift:number;
  completedOrders:number;
  score:number;
  lastChain:number;
  maxChain:number;
  upgrades:string[];
  upgradeChoices:string[];
  /** Absolute count of accepted commands, including voluntary retirement. */
  commandIndex:number;
  /** Number of commands preceding the tail explicitly sealed by the application. */
  commandBaseIndex:number;
  commands:OutboundEndlessCommandV10[];
  nextId:number;
  generatedPieces:number;
  result:'failed'|'won'|null;
  endReason:'blocked'|'retired'|null;
  overtime:false;
  /** Application metadata, excluded from gameplay checksum. */
  runSerial?:number;
  elapsedMs?:number;
  maxOccupancy?:number;
}

export interface OutboundShipmentV10 {
  type:'shipment';
  boardSize:9;
  dockId:string;
  orderId:string;
  cargo:NonNullable<Cell>;
  cells:number[];
  path:Point[];
  score:number;
  chain:number;
  units:number;
  transport:'conveyor';
  cargoPaths:{cell:number;path:Point[]}[];
}

export type OutboundEventV10 =
  | OutboundShipmentV10
  | {type:'placed';pieceId:string;cells:number[]}
  | {type:'shift';shift:number}
  | {type:'result';result:'failed'|'won';endReason?:'blocked'|'retired'};

export interface OutboundStepResultV10 {
  state:OutboundEndlessRunV10;
  events:OutboundEventV10[];
  error?:string;
}

export interface OutboundPreviewV10 {
  valid:boolean;
  cells:number[];
  shipments:OutboundShipmentV10[];
  reason?:string;
}
