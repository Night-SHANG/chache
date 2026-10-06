import type { Cell, CellTrait, ColorTier, PlacementPreview, Point, Shipment } from '../domain/types.ts';
import type { RunSlot } from '../application/run-slots.ts';
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
  screen?: 'game'|'menu'|'settings'|'colorIntro'|'colorTiers';
  variant?: RunSlot;
  modeSlots?: Partial<Record<RunSlot,'empty'|'saved'|'result'|'corrupt'|'unavailable'>>;
  comparisonSeed?: number;
  profile?: Profile;
  profileStatus?: string;
  profileNeedsRecovery?: boolean;
  dailyLabel?: string;
  canContinue?: boolean;
  confirmation?: {kind:'newRun'|'resetProfile'|'finishOvertime'|'switchMode';mode?:'standard'|'daily'|'color_exit';variant?:RunSlot;colorTier?:ColorTier;seed?:number}|null;
}
