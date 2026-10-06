import type { Cell, CellTrait, PlacementPreview, Point, Shipment } from '../domain/types.ts';
import type {Profile} from '../application/profile.ts';

/** Ephemeral presentation state. Nothing here participates in a saved run. */
export interface ViewState {
  selectedPieceId: string | null;
  hoverOrigin: Point | null;
  preview: PlacementPreview | null;
  dragPoint: Point | null;
  paused: boolean;
  message: string;
  saveStatus: string;
  elapsed: number;
  animation: { shipment: Shipment; progress: number; board: Cell[]; cellTraits?: (CellTrait | null)[] } | null;
  placementFx?: { cells: number[]; progress: number } | null;
  invalidFx?: { pieceId: string; progress: number } | null;
  noticeFx?: { kind: 'shift' | 'fail'; label: string; progress: number } | null;
  debug: boolean;
  debugPage?: number;
  needsResume: boolean;
  recoveryError?: string;
  screen?: 'game'|'menu'|'settings'|'colorIntro';
  variant?: 'orders'|'color_exit';
  modeSlots?: {orders:'empty'|'saved'|'result'|'corrupt'|'unavailable';color_exit:'empty'|'saved'|'result'|'corrupt'|'unavailable'};
  profile?: Profile;
  profileStatus?: string;
  profileNeedsRecovery?: boolean;
  dailyLabel?: string;
  canContinue?: boolean;
  confirmation?: {kind:'newRun'|'resetProfile'|'finishOvertime'|'switchMode';mode?:'standard'|'daily'|'color_exit';variant?:'orders'|'color_exit'}|null;
}
