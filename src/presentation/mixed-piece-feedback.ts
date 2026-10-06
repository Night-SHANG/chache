import { CARGO, SHAPES } from '../domain/content.ts';
import { isMixedColorPiece, pieceCellCargo } from '../domain/pieces.ts';
import type { CargoId, Piece } from '../domain/types.ts';
import type {GameRun} from '../domain/playable.ts';
import type { ViewState } from './view-types.ts';

export interface PreviewCargoCell { cell: number; cargo: CargoId }
export interface MixedPiecePreview {
  placed: PreviewCargoCell[];
  shipped: PreviewCargoCell[];
  remaining: PreviewCargoCell[];
  remainingCounts: { cargo: CargoId; count: number }[];
}

export function pieceCaption(piece: Piece): string {
  const cargos = [...new Set(piece.cellCargos ?? [piece.cargo])];
  const names = cargos.map(id => CARGO.find(cargo => cargo.id === id)?.name ?? '货物').join('/');
  return `${isMixedColorPiece(piece) ? '双色·' : ''}${names}`;
}

/** Shipment counts include old inventory. This summary intersects them with only the new piece. */
export function mixedPiecePreview(state: GameRun, view: ViewState): MixedPiecePreview | null {
  if (view.animation || !view.preview?.valid) return null;
  const piece = state.candidates.find(candidate => candidate.id === view.selectedPieceId);
  if (!piece || !isMixedColorPiece(piece)) return null;
  const shape = SHAPES.find(item => item.id === piece.shapeId);
  if (!shape || view.preview.cells.length !== shape.cells.length || !view.preview.cells.length) return null;
  const placed = view.preview.cells.map((cell, index) => ({ cell, cargo: pieceCellCargo(piece, index) }));
  const shipped = placed.filter(item => view.preview!.shipments.some(event => event.cargo === item.cargo && event.cells.includes(item.cell)));
  const shippedCells = new Set(shipped.map(item => item.cell)), remaining = placed.filter(item => !shippedCells.has(item.cell));
  const counts = new Map<CargoId, number>();
  for (const item of remaining) counts.set(item.cargo, (counts.get(item.cargo) ?? 0) + 1);
  return { placed, shipped, remaining, remainingCounts: [...counts].map(([cargo, count]) => ({ cargo, count })) };
}

export function mixedRemainderCaption(preview: MixedPiecePreview): string {
  if (!preview.remaining.length) return `本件${preview.placed.length}格全部出货`;
  return `本件留下：${preview.remainingCounts.map(item => `${CARGO.find(cargo => cargo.id === item.cargo)?.name ?? '货物'}${item.count}件`).join('、')}`;
}
