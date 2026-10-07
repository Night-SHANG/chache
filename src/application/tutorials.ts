import type { GuideProgress, GuideStep, GuideTrack } from './account-types.ts';
import type { GameCommand, GameRun, GameStepResult } from '../domain/playable.ts';
import { isInboundRun, isInboundV9, isInboundV11, isInboundV14, isOutboundToolsRun } from '../domain/playable.ts';
import type { Cell, Command, Point } from '../domain/types.ts';
import { SHAPES } from '../domain/rulesets/v1/content.ts';
import { pieceCellCargo } from '../domain/pieces.ts';
import { collectGroupsV6 } from '../domain/v6/board.ts';
import { OUTBOUND_DOCKS, OUTBOUND_ENTRY } from '../domain/v6/content.ts';
import { docksV9, pieceCellsV9 } from '../domain/v9/board.ts';
import { INBOUND_GUIDE_V9 } from '../domain/v9/tutorial.ts';
import { INBOUND_GUIDE_V11 } from './inbound-guide-v11.ts';
import { INBOUND_GUIDE_V14 } from './inbound-guide-v14.ts';
import { OUTBOUND_GUIDE_V12 } from './outbound-guide-v12.ts';
import { pieceCellsV12 } from '../domain/v12/board.ts';
export { OUTBOUND_GUIDE_V12 } from './outbound-guide-v12.ts';

export interface GuideOverlay {
  step: GuideStep;
  text: string;
  allowedOrigins?: Point[];
  /** A restricted origin belongs to this real candidate, not to every tray piece. */
  selectedPieceId?: string;
  /** An authored next operation; absent when the player chooses an upgrade or cleanup branch. */
  expectedCommand?: GameCommand;
}

const REQUIRED: Record<GuideTrack, readonly GuideStep[]> = {
  inbound: ['place', 'order', 'route', 'upgrade', 'sweepChoice', 'rushTimer', 'expired'],
  outbound: ['place', 'colorGroup', 'colorExit', 'route', 'mixedRemainder'],
};
const TEXT: Record<GuideStep, string> = {
  place: '拖动下方货件，放到提示格。超出边界或重叠不算成功放置。',
  order: '上下左右相连的同图标货物凑够订单数量，才能出货。',
  route: '给叉车留一条连续空路，走到待出货组的邻格。',
  upgrade: '完成第4单后，选择一个真实升级。三种选择都能继续这局引导。',
  sweepChoice: '选择按单清扫或定期清扫。选定后开始计数，这局不能改选。',
  rushTimer: '加急货刚放下剩3次；之后每次成功放置先出货，再扣到2、1。',
  expired: '加急期限归零后变成废物，占格且挡路。清扫只处理之前已有的废物。',
  colorGroup: '同图标只算上下左右相连，斜角不连通；接到出口的一组至少4格。',
  colorExit: '食品接北出口，化工接东出口，机械接西出口。同图标才能连接。',
  mixedRemainder: '双色货按颜色分别出货。只清掉满足条件的同色部分，余色留在原格。',
};

function requiredSteps(track: GuideTrack, version: number): readonly GuideStep[] {
  return track === 'inbound' && (version === 11||version===14) ? REQUIRED.inbound.filter(step => step !== 'upgrade') : REQUIRED[track];
}

export function isGuideComplete(track: GuideTrack, progress: GuideProgress, version = 9): boolean {
  return requiredSteps(track, version).every(step => progress.learned.includes(step));
}

function validPath(path: Point[], board: Cell[], cells: number[], size: number, entry: Point): boolean {
  if (!path.length || path[0].x !== entry.x || path[0].y !== entry.y) return false;
  for (let index = 0; index < path.length; index++) {
    const point = path[index];
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 || point.x >= size || point.y >= size || board[point.y * size + point.x] !== null) return false;
    if (index && Math.abs(point.x - path[index - 1].x) + Math.abs(point.y - path[index - 1].y) !== 1) return false;
  }
  const last = path[path.length - 1];
  return cells.some(cell => Math.abs(cell % size - last.x) + Math.abs(Math.floor(cell / size) - last.y) === 1);
}

/** Only facts from an accepted reducer step can teach a lesson. AccountService commits this
 * value with that same board; it never persists an overlay or marks a skipped lesson learned. */
export function advanceGuide(track: GuideTrack, progress: GuideProgress, before: GameRun, command: GameCommand, result: GameStepResult): GuideProgress {
  if (result.error || result.state.commandIndex !== before.commandIndex + 1 || result.state.rulesetVersion !== before.rulesetVersion || result.state.seed !== before.seed) return progress;
  const learned = new Set(progress.learned);
  const teach = (step: GuideStep): void => { learned.add(step); };
  if (track === 'inbound') {
    if (!isInboundRun(before) || !isInboundRun(result.state)) return progress;
    const after = result.state;
    if (isInboundV9(before) && isInboundV9(after) && command.type === 'upgrade' && before.phase === 'upgrade' && before.upgradeChoices.includes(command.upgradeId as keyof typeof before.levels)
      && result.events.some(event => event.type === 'upgradeChosen' && event.upgradeId === command.upgradeId && after.levels[event.upgradeId] === before.levels[event.upgradeId] + 1)) teach('upgrade');
    if (command.type === 'chooseCleanup' && before.phase === 'cleanup' && before.cleanup === null && after.cleanup?.branch === command.branch
      && result.events.some(event => event.type === 'cleanupChosen' && event.branch === command.branch)) teach('sweepChoice');
    if (command.type === 'place') {
      const piece = before.candidates.find(candidate => candidate.id === command.pieceId);
      const placed = result.events.find(event => event.type === 'placed' && event.pieceId === command.pieceId);
      if (!piece || !placed || placed.type !== 'placed') return progress;
      const cells = pieceCellsV9(piece).map(point => (command.origin.y + point.y) * before.boardSize + command.origin.x + point.x);
      if (cells.length !== placed.cells.length || !cells.every((cell, index) => cell === placed.cells[index])) return progress;
      teach('place');
      const observed = [...before.board];
      for (const cell of cells) observed[cell] = piece.cargo;
      for (const event of result.events) {
        if (event.type === 'shipment' && 'gateId' in event) {
          const order = before.orders.find(order => order.id === event.orderId && order.cargo === event.cargo);
          if (order && event.units >= order.amount && after.completedOrders > before.completedOrders) teach('order');
          const entry = event.gateId === 'dock.side' && before.levels.side_gate ? { x: 0, y: before.boardSize - 1 }
            : docksV9(before).find(dock => dock.id === event.gateId)?.entry;
          if (order && entry && validPath(event.path, observed, event.cells, before.boardSize, entry)) teach('route');
          for (const cell of [...event.cells, ...event.extraClearedCells]) observed[cell] = null;
        }
        if (event.type === 'rushTick' && event.cells.some(tick => {
          const old = before.cellTraits[tick.cell], current = after.cellTraits[tick.cell];
          return old?.kind === 'rush' && current?.kind === 'rush' && old.remaining === tick.remaining + 1 && current.remaining === tick.remaining && (tick.remaining === 2 || tick.remaining === 1);
        })) teach('rushTimer');
        if (event.type === 'rushExpired' && event.cells.some(cell => before.cellTraits[cell]?.kind === 'rush' && before.cellTraits[cell]?.remaining === 1 && after.cellTraits[cell]?.kind === 'waste' && after.board[cell] === before.board[cell])) teach('expired');
      }
    }
  } else {
    if (before.mode !== 'color_exit' || result.state.mode !== 'color_exit' || ![8, 10, 12, 13].includes(before.rulesetVersion) || command.type !== 'place') return progress;
    const piece = before.candidates.find(candidate => candidate.id === command.pieceId), shape = SHAPES.find(shape => shape.id === piece?.shapeId);
    const placed = result.events.find(event => event.type === 'placed' && event.pieceId === command.pieceId);
    if (!piece || !shape || !placed || placed.type !== 'placed') return progress;
    const offsets=isOutboundToolsRun(before)?pieceCellsV12(before.candidates.find(candidate=>candidate.id===command.pieceId)!):shape.cells;
    const cells = offsets.map(point => (command.origin.y + point.y) * 9 + command.origin.x + point.x);
    if (cells.length !== placed.cells.length || !cells.every((cell, index) => cell === placed.cells[index])) return progress;
    teach('place');
    const observed = [...before.board], cleared = new Set<number>();
    for (const [index, cell] of cells.entries()) observed[cell] = pieceCellCargo(piece, index);
    for (const event of result.events) {
      if (event.type !== 'shipment') continue;
      const dock = OUTBOUND_DOCKS.find(dock => dock.id === event.dockId && dock.cargo === event.cargo);
      const group = collectGroupsV6(observed).find(group => group.cargo === event.cargo && group.cells.includes(event.cells[0]));
      const realGroup = event.cells.length >= 4 && group?.cells.length === event.cells.length && group.cells.every((cell, index) => cell === event.cells[index]);
      if (realGroup) teach('colorGroup');
      if (realGroup && dock && event.cells.includes(dock.entry.y * 9 + dock.entry.x)) teach('colorExit');
      if (realGroup && validPath(event.path, observed, event.cells, 9, OUTBOUND_ENTRY.entry)) teach('route');
      for (const cell of event.cells) { observed[cell] = null; cleared.add(cell); }
    }
    if (piece.cellCargos) {
      const shipped = cells.filter(cell => cleared.has(cell)), remaining = cells.filter(cell => !cleared.has(cell));
      if (shipped.length && remaining.length && remaining.every(cell => result.state.board[cell] === pieceCellCargo(piece, cells.indexOf(cell)))
        && shipped.every(cell => remaining.every(other => pieceCellCargo(piece, cells.indexOf(cell)) !== pieceCellCargo(piece, cells.indexOf(other))))) teach('mixedRemainder');
    }
  }
  return learned.size === progress.learned.length ? progress : { ...progress, learned: [...learned] };
}

function commandKey(command: GameCommand): string {
  if (command.type === 'place') return `place:${command.pieceId}:${command.origin.x}:${command.origin.y}`;
  if (command.type === 'upgrade') return `upgrade:${command.upgradeId}:${'cargo' in command ? command.cargo ?? '' : ''}`;
  if (command.type === 'chooseCleanup') return `cleanup:${command.branch}`;
  return JSON.stringify(command);
}

function authoredNext(track: GuideTrack, state: GameRun): GameCommand | undefined {
  let paths: readonly (readonly GameCommand[])[];
  if (track === 'inbound') {
    if (!isInboundRun(state) || !state.guided || state.commandBaseIndex !== 0) return undefined;
    const authored = isInboundV14(state)?INBOUND_GUIDE_V14:isInboundV11(state) ? INBOUND_GUIDE_V11 : INBOUND_GUIDE_V9;
    if (state.seed !== authored.seed) return undefined;
    paths = Object.values(authored.branches);
  } else {
    if (![8,12].includes(state.rulesetVersion) || state.mode !== 'color_exit' || state.difficultyId !== 'easy') return undefined;
    const authored=state.rulesetVersion===12?OUTBOUND_GUIDE_V12:OUTBOUND_GUIDE_V8;
    if(state.seed!==authored.seed)return undefined;
    paths = [authored.commands];
  }
  const matching = paths.filter(path => state.commands.length < path.length && state.commands.every((command, index) => commandKey(command) === commandKey(path[index])));
  if (!matching.length) return undefined;
  const next = matching[0][state.commands.length];
  return matching.every(path => commandKey(path[state.commands.length]) === commandKey(next)) ? next : undefined;
}

export function guideOverlay(track: GuideTrack, progress: GuideProgress, state: GameRun): GuideOverlay | null {
  if (progress.skipped || isGuideComplete(track, progress, state.rulesetVersion) || state.phase === 'result') return null;
  if (track === 'inbound' ? !isInboundRun(state) : state.mode !== 'color_exit' || ![8, 10, 12, 13].includes(state.rulesetVersion)) return null;
  let step = requiredSteps(track, state.rulesetVersion).find(step => !progress.learned.includes(step))!;
  if (isInboundRun(state) && state.phase === 'cleanup') step = 'sweepChoice';
  else if (isInboundV9(state) && state.phase === 'upgrade') step = 'upgrade';
  else if (isInboundRun(state) && state.cellTraits.some(trait => trait?.kind === 'rush') && !progress.learned.includes('expired')) step = 'rushTimer';
  const expected = authoredNext(track, state);
  if (expected?.type === 'place') {
    if (track === 'outbound') step = (['place', 'colorExit', 'colorGroup', 'route', 'mixedRemainder'] as const)[state.commands.length] ?? step;
    if (isInboundRun(state) && state.candidates.find(piece => piece.id === expected.pieceId)?.trait === 'rush') step = 'rushTimer';
    return { step, text: TEXT[step], selectedPieceId: expected.pieceId, allowedOrigins: [{ ...expected.origin }], expectedCommand: { ...expected, origin: { ...expected.origin } } };
  }
  return { step, text: TEXT[step], ...(expected ? { expectedCommand: { ...expected } } : {}) };
}

/** Real normal/easy v8 start. This content never changes an explicitly chosen mode or difficulty. */
export const OUTBOUND_GUIDE_V8: { readonly seed: number; readonly commands: readonly Command[] } = {
  "seed": 12,
  "commands": [
    {
      "type": "place",
      "pieceId": "piece.2",
      "origin": {
        "x": 0,
        "y": 4
      }
    },
    {
      "type": "place",
      "pieceId": "piece.1",
      "origin": {
        "x": 4,
        "y": 0
      }
    },
    {
      "type": "place",
      "pieceId": "piece.4",
      "origin": {
        "x": 2,
        "y": 2
      }
    },
    {
      "type": "place",
      "pieceId": "piece.6",
      "origin": {
        "x": 7,
        "y": 3
      }
    },
    {
      "type": "place",
      "pieceId": "piece.3",
      "origin": {
        "x": 5,
        "y": 5
      }
    }
  ]
};
