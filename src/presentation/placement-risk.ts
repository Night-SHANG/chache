import {applyPlayableCommand,isInboundRun} from '../domain/playable.ts';
import type {GameRun} from '../domain/playable.ts';
import {inboundDocks} from './inbound-helpers.ts';
import { DOCKS, RULES_V2_CONFIG, upgradeStackV2 } from '../domain/v2/content.ts';
import type { Cell, Point } from '../domain/types.ts';

export interface PlacementRisk {
  level: 'warning';
  kind: 'entry-blocked' | 'route-cut';
  message: string;
  cells: number[];
  dockIds: string[];
}
interface Entrance { cell: number; name: string }
interface Access { dockId: string; entrances: Entrance[] }

function adjacent(cell: number, size: number): number[] {
  const x = cell % size, y = Math.floor(cell / size), cells: number[] = [];
  if (y > 0) cells.push(cell - size);
  if (x < size - 1) cells.push(cell + 1);
  if (y < size - 1) cells.push(cell + size);
  if (x > 0) cells.push(cell - 1);
  return cells;
}

function reachable(board: Cell[], entrances: Entrance[], size: number): Set<number> {
  const queue = entrances.map(entrance => entrance.cell).filter(cell => board[cell] === null), seen = new Set(queue);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const cell of adjacent(queue[cursor], size)) if (board[cell] === null && !seen.has(cell)) {
      seen.add(cell); queue.push(cell);
    }
  }
  return seen;
}

function activeAccess(state: GameRun, size: number): Access[] {
  if (state.mode === 'color_exit') return [{ dockId: 'dock.south', entrances: [{ cell: (size - 1) * size + Math.floor(size / 2), name: '南入口' }] }];
  if(isInboundRun(state))return inboundDocks(state).filter(d=>state.orders.some(o=>o.dockId===d.id)).map(d=>({dockId:d.id,entrances:[{cell:d.entry.y*size+d.entry.x,name:d.name},...(state.levels.side_gate?[{cell:(size-1)*size,name:'西南侧门'}]:[])]}));
  const side = state.rulesetVersion >= 2 && upgradeStackV2(state as import('../domain/types.ts').RunState, 'side_gate') > 0;
  return DOCKS.filter(dock => state.orders.some(order => order.dockId === dock.id)).map(dock => ({
    dockId: dock.id,
    entrances: [{ cell: dock.entry.y * size + dock.entry.x, name: dock.name }, ...(side ? [{
      cell: RULES_V2_CONFIG.sideEntry.y * size + RULES_V2_CONFIG.sideEntry.x, name: '西南侧门',
    }] : [])],
  }));
}

/** Advisory only: the actual reducer owns placement validity and every settlement side effect.
 * Its cloned result is discarded, including generated candidates, RNG and command history.
 */
export function placementRisk(state: GameRun, pieceId: string, origin: Point): PlacementRisk | null {
  const result = applyPlayableCommand(state, { type: 'place', pieceId, origin });
  if (result.error) return null;
  const placed = result.events.find(event => event.type === 'placed');
  if (!placed || placed.type !== 'placed') return null;
  const settled = result.state;
  if (settled.phase === 'result' && settled.result === 'won') return null;
  const size = Math.sqrt(state.board.length), access = activeAccess(settled, size);
  const occupied = access.filter(item => item.entrances.every(entrance => settled.board[entrance.cell] !== null));
  const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  const names = (items: Access[]) => [...new Set(items.flatMap(item => item.entrances.map(entrance => entrance.name)))].join('、');
  if (occupied.length) return {
    level: 'warning', kind: 'entry-blocked', message: `落子后入口被占：${names(occupied)}`,
    cells: unique(occupied.flatMap(item => item.entrances.map(entrance => entrance.cell))),
    dockIds: occupied.map(item => item.dockId),
  };

  const affected: Access[] = [], blockers: number[] = [];
  for (const item of access) {
    const before = reachable(state.board, item.entrances, size), after = reachable(settled.board, item.entrances, size);
    // Occupying a previously reachable tile is ordinary placement, not a severed route.
    const lost = new Set([...before].filter(cell => settled.board[cell] === null && !after.has(cell)));
    if (!lost.size) continue;
    affected.push(item);
    const remaining = new Set(placed.cells.filter(cell => settled.board[cell] !== null));
    const barrier = [...remaining].filter(cell => adjacent(cell, size).some(next => lost.has(next))), seen = new Set(barrier);
    // A thick mixed piece can border lost space with one color and block the fork with another.
    for (let cursor = 0; cursor < barrier.length; cursor++) for (const next of adjacent(barrier[cursor], size)) {
      if (remaining.has(next) && !seen.has(next)) { seen.add(next); barrier.push(next); }
    }
    blockers.push(...barrier.filter(cell => adjacent(cell, size).some(next => after.has(next))));
  }
  if (!affected.length) return null;
  return {
    level: 'warning', kind: 'route-cut', message: `落子后通路被截断：${names(affected)}，部分空位叉车无法到达`,
    cells: unique([...blockers, ...affected.flatMap(item => item.entrances.map(entrance => entrance.cell))]),
    dockIds: affected.map(item => item.dockId),
  };
}
