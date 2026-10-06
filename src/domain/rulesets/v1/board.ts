import type { Cell, CargoId, Dock, Point, RunState, Order } from './types.ts';
import { DOCKS, P0_CONFIG } from './content.ts';
export const BOARD_SIZE = P0_CONFIG.boardSize;
export const toIndex = (point: Point): number => point.y * BOARD_SIZE + point.x;
export const toPoint = (index: number): Point => ({ x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) });
export interface CargoGroup { cargo: CargoId; cells: number[] }
export interface ReachableGroup { group: CargoGroup; path: Point[] }
/** Fixed north/east/south/west order defines canonical BFS tie breaking. */
export function neighbors(index: number): number[] {
  const x = index % BOARD_SIZE, y = Math.floor(index / BOARD_SIZE), out: number[] = [];
  if (y > 0) out.push(index - BOARD_SIZE);
  if (x < BOARD_SIZE - 1) out.push(index + 1);
  if (y < BOARD_SIZE - 1) out.push(index + BOARD_SIZE);
  if (x > 0) out.push(index - 1);
  return out;
}
export function collectGroups(board: Cell[]): CargoGroup[] {
  const visited = new Set<number>(), groups: CargoGroup[] = [];
  for (let i = 0; i < board.length; i++) {
    const cargo = board[i]; if (cargo === null || visited.has(i)) continue;
    const cells = [i]; visited.add(i);
    for (let cursor = 0; cursor < cells.length; cursor++) for (const next of neighbors(cells[cursor])) {
      if (board[next] === cargo && !visited.has(next)) { visited.add(next); cells.push(next); }
    }
    cells.sort((a,b) => a-b); groups.push({ cargo, cells });
  }
  return groups;
}
export function findRoute(board: Cell[], dock: Dock, cells: number[]): Point[] | null {
  const start = toIndex(dock.entry); if (board[start] !== null) return null;
  const targets = new Set(cells.flatMap(neighbors).filter(index => board[index] === null));
  const queue = [start], parent = new Map<number,number>(); parent.set(start, -1);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (targets.has(current)) {
      const route: Point[] = []; let step = current;
      while (step !== -1) { route.push(toPoint(step)); step = parent.get(step)!; }
      return route.reverse();
    }
    for (const next of neighbors(current)) if (board[next] === null && !parent.has(next)) { parent.set(next,current); queue.push(next); }
  }
  return null;
}
export function selectOrderGroup(board: Cell[], order: Order): ReachableGroup | null {
  const dock = DOCKS.find(d => d.id === order.dockId); if (!dock) return null;
  const eligible: ReachableGroup[] = [];
  for (const group of collectGroups(board)) {
    if (group.cargo !== order.cargo || group.cells.length < order.amount) continue;
    const path = findRoute(board, dock, group.cells); if (path) eligible.push({ group, path });
  }
  eligible.sort((a,b) => a.path.length - b.path.length || b.group.cells.length - a.group.cells.length || a.group.cells[0] - b.group.cells[0]);
  return eligible[0] ?? null;
}
export function orderStatus(state: RunState, order: Order): {count:number;status:'ready'|'blocked'|'need';path:Point[]} {
  const count = Math.max(0,...collectGroups(state.board).filter(g => g.cargo === order.cargo).map(g => g.cells.length));
  if (count < order.amount) return { count, status:'need', path:[] };
  const selected = selectOrderGroup(state.board,order);
  return { count, status:selected ? 'ready' : 'blocked', path:selected?.path ?? [] };
}
