import type { Point, Shipment } from '../domain/types.ts';
import { COLOR_EXIT_DOCKS, COLOR_EXIT_ENTRY } from '../domain/content.ts';
import { L, cellCenter } from './layout.ts';
import { shipmentPose } from './motion.ts';
import type { ShipmentFrame, ShipmentPose } from './motion.ts';

export interface ColorExitCargoPose extends Point { scale: number; alpha: number }
const unit = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const isReduced = (frame: ShipmentFrame): boolean => frame.stage === 'collect' && frame.move === 0;
const matches = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** Only event-owned four-neighbor cargo lines are consumed. Never derive a new route from the live board. */
export function colorExitCargoPose(shipment: Shipment, cell: number, frame: ShipmentFrame): ColorExitCargoPose | null {
  const event = shipment;
  const dock = COLOR_EXIT_DOCKS.find(item => item.id === event.dockId);
  if (event.transport !== 'conveyor' || !dock || event.cargo !== dock.cargo
    || !Array.isArray(event.cells) || !event.cells.includes(cell) || !Array.isArray(event.cargoPaths)) return null;
  const line = event.cargoPaths.find(item => item.cell === cell)?.path;
  if (!line?.length || !matches(line[0], { x: cell % 7, y: Math.floor(cell / 7) }) || !matches(line[line.length - 1], dock.entry)
    || line.some((point, i) => !Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.x > 6 || point.y < 0 || point.y > 6
      || !event.cells.includes(point.y * 7 + point.x) || i > 0 && Math.abs(point.x - line[i - 1].x) + Math.abs(point.y - line[i - 1].y) !== 1)) return null;
  const source = cellCenter(line[0]);
  if (isReduced(frame)) return { ...source, scale: 1, alpha: 1 };
  if (frame.stage !== 'carry' && frame.stage !== 'exit') return { ...source, scale: 1 - unit(frame.collect) * .42, alpha: 1 };

  // Flow and the empty reverse journey share the 360 ms carry + 140 ms exit budget.
  // Nearer crates lead, with stable cell-index ties. Each crate follows its own polyline.
  const ordered = [...event.cargoPaths].sort((a, b) => a.path.length - b.path.length || a.cell - b.cell);
  const rank = ordered.findIndex(item => item.cell === cell) / Math.max(1, ordered.length - 1);
  const flow = unit(frame.carry) * .72 + unit(frame.exit) * .28, start = rank * .14, finish = .72 + rank * .28;
  const progress = unit((flow - start) / (finish - start));
  const points = line.map(cellCenter), target = points[points.length - 1];
  points.push({ x: dock.side === 'west' ? L.board.x - 96 : dock.side === 'east' ? L.board.x + L.board.size + 96 : target.x,
    y: dock.side === 'north' ? L.board.y - 96 : target.y });
  const distances = points.slice(1).map((p, index) => Math.hypot(p.x - points[index].x, p.y - points[index].y));
  let remaining = progress * distances.reduce((sum, n) => sum + n, 0), pose = points[points.length - 1];
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i]) {
      const amount = unit(remaining / distances[i]);
      pose = { x: points[i].x + (points[i + 1].x - points[i].x) * amount, y: points[i].y + (points[i + 1].y - points[i].y) * amount }; break;
    }
    remaining -= distances[i];
  }
  const outside = dock.side === 'north' ? L.board.y - pose.y : dock.side === 'east' ? pose.x - L.board.x - L.board.size : L.board.x - pose.x;
  return { ...pose, scale: .58, alpha: 1 - unit((outside - 36) / 60) };
}

/** Existing turn-aware forklift motion is retained, always empty, always returning south. */
export function colorExitVehiclePose(shipment: Shipment, frame: ShipmentFrame): ShipmentPose | null {
  const event = shipment;
  if (event.transport !== 'conveyor' || isReduced(frame) || !event.path?.length || !matches(event.path[0], COLOR_EXIT_ENTRY.entry)) return null;
  const pose = shipmentPose(shipment, frame);
  return pose ? { ...pose, loaded: false } : null;
}
