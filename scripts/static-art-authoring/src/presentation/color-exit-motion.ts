import type { Point, Shipment } from '../domain/types.ts';
import { cellCenter } from './layout.ts';
import { boardGeometry } from './board-geometry.ts';
import { shipmentPose } from './motion.ts';
import type { ShipmentFrame, ShipmentPose } from './motion.ts';

export interface ColorExitCargoPose extends Point { scale: number; alpha: number }
const unit = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const isReduced = (frame: ShipmentFrame): boolean => frame.stage === 'collect' && frame.move === 0;
const matches = (a: Point, b: Point): boolean => !!a && !!b && a.x === b.x && a.y === b.y;

/** Only event-owned four-neighbor cargo lines are consumed. Never derive a new route from the live board. */
export function colorExitCargoPose(shipment: Shipment, cell: number, frame: ShipmentFrame): ColorExitCargoPose | null {
  if (shipment?.boardSize !== undefined && shipment.boardSize !== 9) return null;
  const event = shipment, geometry = boardGeometry(shipment), dimension = geometry.dimension;
  const dock = geometry.colorExits.find(item => item.id === event.dockId);
  if (!Number.isInteger(cell) || cell < 0 || cell >= dimension ** 2 || event.transport !== 'conveyor' || !dock || event.cargo !== dock.cargo
    || !Array.isArray(event.cells) || !event.cells.includes(cell) || Array.from(event.cells).some(index => !Number.isInteger(index) || index < 0 || index >= dimension ** 2)
    || !Array.isArray(event.cargoPaths) || Array.from(event.cargoPaths).some(item => !item || !Array.isArray(item.path) || !item.path.length)) return null;
  const line = event.cargoPaths.find(item => item.cell === cell)?.path;
  if (!line?.length || !matches(line[0], { x: cell % dimension, y: Math.floor(cell / dimension) }) || !matches(line[line.length - 1], dock.entry)
    || Array.from(line).some((point, i) => !point || !Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.x >= dimension || point.y < 0 || point.y >= dimension
      || !event.cells.includes(point.y * dimension + point.x) || i > 0 && Math.abs(point.x - line[i - 1].x) + Math.abs(point.y - line[i - 1].y) !== 1)) return null;
  const source = cellCenter(line[0], geometry);
  if (isReduced(frame)) return { ...source, scale: 1, alpha: 1 };
  if (frame.stage !== 'carry' && frame.stage !== 'exit') return { ...source, scale: 1 - unit(frame.collect) * .42, alpha: 1 };

  // Flow and the empty reverse journey share the 360 ms carry + 140 ms exit budget.
  // Nearer crates lead, with stable cell-index ties. Each crate follows its own polyline.
  const ordered = [...event.cargoPaths].sort((a, b) => a.path.length - b.path.length || a.cell - b.cell);
  const rank = ordered.findIndex(item => item.cell === cell) / Math.max(1, ordered.length - 1);
  const flow = unit(frame.carry) * .72 + unit(frame.exit) * .28, start = rank * .14, finish = .72 + rank * .28;
  const progress = unit((flow - start) / (finish - start));
  const points = line.map(point => cellCenter(point, geometry)), target = points[points.length - 1];
  points.push({ x: dock.side === 'west' ? geometry.x - 96 * geometry.scale : dock.side === 'east' ? geometry.x + geometry.size + 96 * geometry.scale : target.x,
    y: dock.side === 'north' ? geometry.y - 96 * geometry.scale : target.y });
  const distances = points.slice(1).map((p, index) => Math.hypot(p.x - points[index].x, p.y - points[index].y));
  let remaining = progress * distances.reduce((sum, n) => sum + n, 0), pose = points[points.length - 1];
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i]) {
      const amount = unit(remaining / distances[i]);
      pose = { x: points[i].x + (points[i + 1].x - points[i].x) * amount, y: points[i].y + (points[i + 1].y - points[i].y) * amount }; break;
    }
    remaining -= distances[i];
  }
  const outside = dock.side === 'north' ? geometry.y - pose.y : dock.side === 'east' ? pose.x - geometry.x - geometry.size : geometry.x - pose.x;
  return { ...pose, scale: .58, alpha: progress === 1 ? 0 : 1 - unit((outside - 36 * geometry.scale) / (60 * geometry.scale)) };
}

/** Existing turn-aware forklift motion is retained, always empty, always returning south. */
export function colorExitVehiclePose(shipment: Shipment, frame: ShipmentFrame): ShipmentPose | null {
  const event = shipment;
  if (event.transport !== 'conveyor' || isReduced(frame) || !event.path?.length || !matches(event.path[0], boardGeometry(event).entry.entry)) return null;
  const pose = shipmentPose(shipment, frame);
  return pose ? { ...pose, loaded: false } : null;
}
