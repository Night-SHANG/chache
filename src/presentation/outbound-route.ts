import type { Cell, Point } from '../domain/types.ts';

interface OutboundRouteInput {
  dimension: 7 | 9;
  board: readonly Cell[];
  group: readonly number[];
  parents: ReadonlyMap<number, number>;
  approach: readonly Point[];
  exit: Point;
  moveMs: number;
  turnQuarterMs: number;
}
export interface OutboundRoute {
  /** Cell moves after the unchanged approach, ending on the gate before its exterior exit. */
  walk: number[];
  strategy: 'tree' | 'frontier';
  moves: number;
  /** Includes the inherited approach heading and the final turn toward the exterior. */
  turnQuarters: number;
  baselineMoves: number;
  baselineTurnQuarters: number;
}
interface Edge { cell: number; direction: number }
interface Frontier { cell: number; from: number; rank: number[] }
const quarterTurns = (from: number, to: number): number => {
  const delta = Math.abs(from - to); return Math.min(delta, 4 - delta);
};
const compare = (a: readonly number[], b: readonly number[]): number => {
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
};
const heading = (from: Point, to: Point): number => to.y < from.y ? 0 : to.x > from.x ? 1 : to.y > from.y ? 2 : 3;
const pointAt = (cell: number, dimension: number): Point => ({ x: cell % dimension, y: Math.floor(cell / dimension) });

/** Presentation only. The caller validates metadata and completes each first pickup before entering its cell. */
export function selectOutboundRoute(input: OutboundRouteInput): OutboundRoute {
  const { dimension, board, group, parents, approach, exit, moveMs, turnQuarterMs } = input;
  const root = group.find(cell => !parents.has(cell))!, members = new Set(group);
  const endpoint = approach[approach.length - 1], startCell = endpoint.y * dimension + endpoint.x;
  const before = approach.length > 1 ? approach[approach.length - 2] : { x: Math.floor(dimension / 2), y: dimension };
  const initialHeading = heading(before, endpoint);
  const adjacency: Edge[][] = Array.from({ length: dimension ** 2 }, (_, cell) => {
    const { x, y } = pointAt(cell, dimension), edges: Edge[] = [];
    if (y > 0) edges.push({ cell: cell - dimension, direction: 0 });
    if (x + 1 < dimension) edges.push({ cell: cell + 1, direction: 1 });
    if (y + 1 < dimension) edges.push({ cell: cell + dimension, direction: 2 });
    if (x > 0) edges.push({ cell: cell - 1, direction: 3 });
    return edges;
  });
  const measure = (walk: number[]): { moves: number; turnQuarters: number } => {
    let position = endpoint, direction = initialHeading, turns = 0;
    for (const cell of walk) {
      const target = pointAt(cell, dimension), next = heading(position, target);
      turns += quarterTurns(direction, next); position = target; direction = next;
    }
    turns += quarterTurns(direction, heading(position, exit));
    return { moves: walk.length, turnQuarters: turns };
  };

  // Preserve the original tree tour as a deterministic upper bound on presentation cost.
  const children = new Map<number, number[]>();
  for (const [cell, parent] of parents) {
    const siblings = children.get(parent) ?? []; siblings.push(cell); children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a - b);
  const depths = new Map([[root, 0]]), queue = [root];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const child of children.get(queue[cursor]) ?? []) {
    depths.set(child, depths.get(queue[cursor])! + 1); queue.push(child);
  }
  const first = adjacency[startCell].map(edge => edge.cell).filter(cell => members.has(cell))
    .sort((a, b) => depths.get(b)! - depths.get(a)! || a - b)[0];
  const treeWalk = [first], picked = new Set(treeWalk);
  const branch = (cell: number, returnTo: number): void => {
    treeWalk.push(cell); picked.add(cell);
    for (const child of children.get(cell) ?? []) branch(child, cell);
    treeWalk.push(returnTo);
  };
  for (let current = first; ;) {
    for (const child of children.get(current) ?? []) if (!picked.has(child)) branch(child, current);
    if (current === root) break;
    current = parents.get(current)!; treeWalk.push(current); picked.add(current);
  }
  const baseline = measure(treeWalk);
  let best: OutboundRoute = { walk: treeWalk, strategy: 'tree', ...baseline,
    baselineMoves: baseline.moves, baselineTurnQuarters: baseline.turnQuarters };
  const costRank = (route: { moves: number; turnQuarters: number }): number[] =>
    [route.moves * moveMs + route.turnQuarters * turnQuarterMs, route.moves, route.turnQuarters];

  // Four fixed direction rotations, one BFS per pickup: at most 80 rounds of 81 cells per sweep.
  // Unpicked group cells are candidates at the frontier, never intermediate BFS nodes.
  for (let rotation = 0; rotation < 4; rotation++) {
    const ordered = adjacency.map(edges => [...edges].sort((a, b) =>
      (a.direction - rotation + 4) % 4 - (b.direction - rotation + 4) % 4));
    const collected = new Set<number>(), walk: number[] = [];
    let position = startCell, direction = initialHeading;
    const appendPath = (target: number, previous: readonly number[]): void => {
      const path: number[] = [];
      for (let cell = target; cell !== position; cell = previous[cell]) path.push(cell);
      for (const cell of path.reverse()) {
        direction = heading(pointAt(position, dimension), pointAt(cell, dimension)); walk.push(cell); position = cell;
      }
    };
    while (collected.size < group.length) {
      const previous = Array<number>(board.length).fill(-1), distances = Array<number>(board.length).fill(0);
      const directions = Array<number>(board.length).fill(direction), turns = Array<number>(board.length).fill(0);
      const access = [position]; previous[position] = position;
      let frontier: Frontier | undefined;
      for (let cursor = 0; cursor < access.length; cursor++) {
        const current = access[cursor];
        // Distance leads the rank, so farther BFS layers cannot improve this pickup.
        if (frontier && distances[current] + 1 > frontier.rank[0]) break;
        for (const edge of ordered[current]) {
          const next = edge.cell, length = distances[current] + 1;
          const pathTurns = turns[current] + quarterTurns(directions[current], edge.direction);
          if (members.has(next) && !collected.has(next)) {
            const remainingNeighbors = adjacency[next].filter(neighbor => members.has(neighbor.cell) && !collected.has(neighbor.cell)).length;
            const rank = [length, next === root && collected.size + 1 < group.length ? 1 : 0,
              remainingNeighbors, pathTurns, (edge.direction - rotation + 4) % 4, next];
            if (!frontier || compare(rank, frontier.rank) < 0) frontier = { cell: next, from: current, rank };
          } else if (previous[next] === -1 && (board[next] === null || collected.has(next))) {
            previous[next] = current; distances[next] = length; directions[next] = edge.direction;
            turns[next] = pathTurns; access.push(next);
          }
        }
      }
      // Validated connected metadata guarantees a reachable frontier and progress by one box.
      if (!frontier) break;
      previous[frontier.cell] = frontier.from; appendPath(frontier.cell, previous); collected.add(frontier.cell);
    }
    if (collected.size !== group.length) continue;
    const previous = Array<number>(board.length).fill(-1), access = [position]; previous[position] = position;
    for (let cursor = 0; cursor < access.length && previous[root] === -1; cursor++) {
      const current = access[cursor];
      for (const edge of ordered[current]) if (previous[edge.cell] === -1 && (board[edge.cell] === null || collected.has(edge.cell))) {
        previous[edge.cell] = current; access.push(edge.cell);
      }
    }
    if (previous[root] === -1) continue;
    appendPath(root, previous);
    const measured = measure(walk);
    if (compare(costRank(measured), costRank(best)) < 0) best = { ...best, walk, strategy: 'frontier', ...measured };
  }
  return best;
}
