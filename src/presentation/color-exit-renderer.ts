import { CARGO, DOCKS, COLOR_EXIT_DOCKS, COLOR_EXIT_ENTRY, COLOR_EXIT_TARGETS, RULES_V4_CONFIG } from '../domain/content.ts';
import { orderStatus } from '../domain/board.ts';
import { pieceCellCargo } from '../domain/pieces.ts';
import type { Order, Point, RunState, Shipment } from '../domain/types.ts';
import type { ViewState } from './view-types.ts';
import type { OrderFeedback } from './order-feedback.ts';
import { L, cellCenter } from './layout.ts';
import type { Rect } from './layout.ts';
import { CREAM, PALETTE, cargoBox, forklift, icon, panel, text } from './assets.ts';
import { dockPosition, shipmentFrame } from './motion.ts';
import { colorExitCargoPose, colorExitVehiclePose } from './color-exit-motion.ts';
import { mixedPiecePreview, mixedRemainderCaption } from './mixed-piece-feedback.ts';

type Context = CanvasRenderingContext2D;
const cargoName = (id: string): string => CARGO.find(cargo => cargo.id === id)?.name ?? '货物';
const EXITS = COLOR_EXIT_DOCKS.map(dock => ({ ...dock, label: `${dock.side === 'north' ? '北' : dock.side === 'east' ? '东' : '西'}·${cargoName(dock.cargo)}` }));
const ACCESS_COLOR = '#9edfff';

/** Explicit geometry avoids Canvas rotation, including in reduced-motion paths and diagrams. */
function arrowhead(ctx: Context, from: Point, to: Point, color: string, size = 11): void {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y), mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(mid.x + dx * size, mid.y + dy * size);
  ctx.lineTo(mid.x - dx * size - dy * size * .65, mid.y - dy * size + dx * size * .65);
  ctx.lineTo(mid.x - dx * size + dy * size * .65, mid.y - dy * size - dx * size * .65); ctx.closePath(); ctx.fill();
}
function line(ctx: Context, points: Point[], color: string, dashed: boolean, width: number): void {
  if (!points.length) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dashed ? [14, 11] : []);
  ctx.beginPath(); points.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke(); ctx.setLineDash([]);
  points.slice(1).forEach((p, i) => arrowhead(ctx, points[i], p, color));
}
function entryBlocked(state: RunState, view: ViewState): boolean {
  return !!(view.animation?.board ?? state.board)[45] || !view.animation && !!view.preview?.valid && view.preview.cells.includes(45);
}

/** Fixed cargo doors remain distinct from the single forklift entrance. */
export function drawColorExitGates(ctx: Context, state: RunState, view: ViewState): void {
  ctx.save();
  for (const exit of EXITS) {
    const dock = DOCKS.find(d => d.id === exit.id)!;
    const p = dockPosition(dock), side = dock.side !== 'north', color = PALETTE[exit.cargo];
    panel(ctx, { x: p.x - (side ? 16 : 41), y: p.y - (side ? 41 : 16), w: side ? 32 : 82, h: side ? 82 : 32 }, color.dark, color.light, 6);
    const center = cellCenter(dock.entry); arrowhead(ctx, center, { x: p.x * 2 - center.x, y: p.y * 2 - center.y }, '#fff7dd', 13);
    const label = dock.side === 'north' ? { x: 679, y: 541 } : { x: dock.side === 'west' ? 51 : 1029, y: 911 };
    icon(ctx, exit.cargo, dock.side === 'north' ? 612 : label.x, dock.side === 'north' ? label.y : 945, 29, color.light);
    text(ctx, exit.label, label.x, label.y, 21, color.light, 'center');
  }
  const south = dockPosition(COLOR_EXIT_ENTRY), blocked = entryBlocked(state, view);
  panel(ctx, { x: south.x - 42, y: south.y - 15, w: 84, h: 30 }, blocked ? '#65342f' : '#1c4962', blocked ? '#ffac83' : ACCESS_COLOR, 6);
  arrowhead(ctx, { x: south.x, y: south.y + 27 }, { x: south.x, y: south.y - 27 }, blocked ? '#ffb293' : ACCESS_COLOR, 12);
  text(ctx, blocked ? '南入口被堵 · 请留空' : '叉车入口·留空', 540, 1443, 21, blocked ? '#ffc0a3' : ACCESS_COLOR, 'center');
  ctx.restore();
}

/** Show event-owned access and freight polylines above cargo, with both line-style and color cues. */
export function drawColorExitRoutes(ctx: Context, view: ViewState): void {
  const shipments = (view.animation ? [view.animation.shipment] : view.preview?.valid ? view.preview.shipments : []);
  if (!shipments.length) return;
  ctx.save();
  for (const event of shipments) {
    if (event.transport !== 'conveyor') continue;
    line(ctx, event.path.map(cellCenter), ACCESS_COLOR, true, 6);
    const color = PALETTE[event.cargo].light, drawn = new Set<string>();
    for (const cargo of event.cargoPaths ?? []) {
      if (!colorExitCargoPose(event, cargo.cell, shipmentFrame(0, false))) continue;
      for (let i = 1; i < cargo.path.length; i++) {
        const from = cargo.path[i - 1], to = cargo.path[i], key = `${from.x},${from.y}:${to.x},${to.y}`;
        if (drawn.has(key)) continue; drawn.add(key); line(ctx, [cellCenter(from), cellCenter(to)], color, false, 5);
      }
    }
    const dock = DOCKS.find(d => d.id === event.dockId);
    if (dock) line(ctx, [cellCenter(dock.entry), dockPosition(dock)], color, false, 5);
    if (!view.animation || view.profile?.settings.reducedMotion) {
      ctx.strokeStyle = color; ctx.lineWidth = 4;
      for (const cell of event.cells) ctx.strokeRect(L.board.x + cell % 7 * 120 + 5, L.board.y + Math.floor(cell / 7) * 120 + 5, 110, 110);
    }
  }
  text(ctx, '蓝色虚线：叉车空路', 150, 484, 16, ACCESS_COLOR);
  text(ctx, '彩色实线：货箱沿线出货', 620, 484, 16, CREAM);
  ctx.restore();
}

/** Small per-cell borders preserve the colors and icons of the half that stays on the board. */
export function drawMixedRemainder(ctx: Context, state: RunState, view: ViewState): void {
  const preview = mixedPiecePreview(state, view); if (!preview?.remaining.length) return;
  ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 3;
  for (const item of preview.remaining) {
    ctx.strokeStyle = PALETTE[item.cargo].light;
    ctx.strokeRect(L.board.x + item.cell % 7 * 120 + 7, L.board.y + Math.floor(item.cell / 7) * 120 + 7, 106, 106);
  }
  ctx.restore();
}

/** The forklift carries no pack; all cargo rendering stays attached to each event cargoPath. */
export function drawColorExitShipment(ctx: Context, shipment: Shipment, progress: number, view: ViewState): void {
  const reduced = !!view.profile?.settings.reducedMotion, frame = shipmentFrame(progress, reduced), pose = colorExitVehiclePose(shipment, frame);
  if (pose && frame.stage !== 'route') {
    ctx.save(); ctx.beginPath(); ctx.rect(L.board.x - 30, L.board.y - 30, L.board.size + 60, L.board.size + 60); ctx.clip();
    ctx.globalAlpha *= pose.alpha; forklift(ctx, pose.x, pose.y, 99, pose.angle, view.profile?.cosmetics.forklift); ctx.restore();
  }
  if (!reduced && frame.stage !== 'carry' && frame.stage !== 'exit') return;
  const dock = DOCKS.find(d => d.id === shipment.dockId); if (!dock) return;
  const x = dock.side === 'north' ? 874 : dock.side === 'west' ? 51 : 1029, y = dock.side === 'north' ? 538 : 1061;
  text(ctx, `${shipment.cells.length}件`, x, y, 24, PALETTE[shipment.cargo].light, 'center');
  text(ctx, `+${shipment.score}`, x, y + 28, 22, '#ffe48a', 'center');
}

/** A static, state-free explanation which can be reused on the first-entry or pause card. */
export function drawColorExitHelpDiagram(ctx: Context, rect: Rect, mixed = false): void {
  if (mixed) { drawMixedHelpDiagram(ctx, rect); return; }
  const scale = Math.min(rect.w / 800, rect.h / 430);
  ctx.save(); ctx.translate(rect.x + (rect.w - 800 * scale) / 2, rect.y + (rect.h - 430 * scale) / 2); ctx.scale(scale, scale);
  const origin = { x: 82, y: 80 }, cell = 32, center = (x: number, y: number): Point => ({ x: origin.x + (x + .5) * cell, y: origin.y + (y + .5) * cell });
  panel(ctx, { x: 0, y: 0, w: 800, h: 430 }, '#20394b', '#587586', 14);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    ctx.fillStyle = '#56636a'; ctx.fillRect(origin.x + x * cell + 1, origin.y + y * cell + 1, cell - 2, cell - 2);
  }
  for (const [x, y] of [[3, 0], [3, 1], [4, 1], [4, 2]]) cargoBox(ctx, 'cargo.food', origin.x + x * cell + 2, origin.y + y * cell + 2, cell - 4);
  line(ctx, [center(4, 2), center(4, 1), center(3, 1), center(3, 0), { x: center(3, 0).x, y: 58 }], PALETTE['cargo.food'].light, false, 4);
  line(ctx, [center(3, 6), center(3, 5), center(3, 4), center(3, 3), center(3, 2)], ACCESS_COLOR, true, 4);
  icon(ctx, 'cargo.food', 194, 42, 27, PALETTE['cargo.food'].light); text(ctx, '北·食品', 244, 42, 17, CREAM, 'center');
  icon(ctx, 'cargo.machine', 45, 166, 28, PALETTE['cargo.machine'].light); text(ctx, '机械', 44, 196, 16, CREAM, 'center');
  icon(ctx, 'cargo.chem', 343, 166, 28, PALETTE['cargo.chem'].light); text(ctx, '化工', 343, 196, 16, CREAM, 'center');
  text(ctx, '叉车入口·留空', 194, 335, 21, ACCESS_COLOR, 'center');
  const lessons = [`① 同类相连，至少${RULES_V4_CONFIG.minBatch}件`, '② 货组连到同色出口', '③ 南入口到货旁，留叉车空路'];
  lessons.forEach((lesson, i) => text(ctx, lesson, 395, 116 + i * 76, 23, CREAM));
  text(ctx, '货箱沿彩线出货，叉车空载原路返回', 400, 385, 22, '#c7d8df', 'center', 500);
  ctx.restore();
}

/** Both small boards use the same coordinates, so the surviving half visibly stays put. */
function drawMixedHelpDiagram(ctx: Context, rect: Rect): void {
  const scale = Math.min(rect.w / 800, rect.h / 430), cell = 32;
  ctx.save(); ctx.translate(rect.x + (rect.w - 800 * scale) / 2, rect.y + (rect.h - 430 * scale) / 2); ctx.scale(scale, scale);
  panel(ctx, { x: 0, y: 0, w: 800, h: 430 }, '#20394b', '#587586', 14);
  text(ctx, '双色示例：食品2件 + 机械2件', 400, 29, 25, CREAM, 'center');
  const foodCells = [[3, 0], [4, 0], [3, 1], [4, 1]], machineCells = [[3, 2], [4, 2]];
  for (const [stage, x] of [38, 332].entries()) {
    const origin = { x, y: 105 }, center = (cx: number, cy: number): Point => ({ x: origin.x + (cx + .5) * cell, y: origin.y + (cy + .5) * cell });
    text(ctx, stage === 0 ? '旧食品2件 + 新食品2件' : '食品4件出货', x + 112, 64, 20, stage === 0 ? CREAM : PALETTE['cargo.food'].light, 'center');
    for (let row = 0; row < 7; row++) for (let column = 0; column < 7; column++) {
      ctx.fillStyle = '#56636a'; ctx.fillRect(x + column * cell + 1, origin.y + row * cell + 1, cell - 2, cell - 2);
    }
    if (stage === 0) {
      for (const [cx, cy] of foodCells) cargoBox(ctx, 'cargo.food', x + cx * cell + 2, origin.y + cy * cell + 2, cell - 4);
      line(ctx, [center(4, 1), center(3, 1), center(3, 0), { x: center(3, 0).x, y: 90 }], PALETTE['cargo.food'].light, false, 3);
      ctx.strokeStyle = CREAM; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(x + 3 * cell - 1, origin.y + cell - 1, 2 * cell + 2, 2 * cell + 2); ctx.setLineDash([]);
    }
    for (const [cx, cy] of machineCells) {
      cargoBox(ctx, 'cargo.machine', x + cx * cell + 2, origin.y + cy * cell + 2, cell - 4);
      if (stage === 1) { ctx.strokeStyle = PALETTE['cargo.machine'].light; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x + cx * cell + 1, origin.y + cy * cell + 1, cell - 2, cell - 2); ctx.setLineDash([]); }
    }
    line(ctx, [center(3, 6), center(3, 3), center(2, 3), center(2, 1)], ACCESS_COLOR, true, 3);
    text(ctx, '北·食品口', center(3, 0).x, 90, 15, PALETTE['cargo.food'].light, 'center');
    text(ctx, '南入口 · 留空路', x + 112, 351, 18, ACCESS_COLOR, 'center');
  }
  line(ctx, [{ x: 275, y: 207 }, { x: 314, y: 207 }], CREAM, false, 3);
  for (const [index, lesson] of ['每色仍需至少4件', '食品接北口后出货', '机械2件留原格', '仍会占格、影响空路'].entries()) {
    text(ctx, lesson, 582, 125 + index * 54, index === 3 ? 18 : 21, index > 1 ? PALETTE['cargo.machine'].light : CREAM);
  }
  text(ctx, '2 + 2 不等于同色4件；两色各自检查出口和空路', 400, 399, 23, CREAM, 'center');
  ctx.restore();
}

/** A prospective count is explanatory only; the Domain preview alone authorizes a shipping label. */
export function colorExitFeedback(state: RunState, order: Order, view: ViewState): OrderFeedback {
  let visible = view.animation ? { ...state, board: view.animation.board, cellTraits: view.animation.cellTraits } : state;
  const selected = state.candidates.find(piece => piece.id === view.selectedPieceId);
  if (!view.animation && view.preview?.valid && selected) {
    const board = [...state.board]; view.preview.cells.forEach((cell, index) => { board[cell] = pieceCellCargo(selected, index); });
    visible = { ...state, board };
  }
  const status = orderStatus(visible, order);
  const shipping = view.animation?.shipment.dockId === order.dockId ? view.animation.shipment : undefined;
  if (shipping) return { status, label: `逐箱出货中 · ${shipping.cells.length}件`, shipping };
  const previewShipment = !view.animation && view.preview?.valid
    ? view.preview.shipments.find(event => event.orderId === order.id && event.dockId === order.dockId) : undefined;
  if (previewShipment) return { status, label: '此落点预计出货', previewShipment };
  const label = status.reason === 'entry-blocked' ? '南入口被堵 · 请留空'
    : status.reason === 'route-blocked' ? '叉车无空路'
    : status.reason === 'exit-unconnected' ? `${status.largestGroupCount ?? 0}件未接同色口`
    : status.status === 'ready' ? view.preview ? view.preview.valid ? '此落点暂不出货' : '落点无效 · 未结算' : '已满足 · 落子后检查'
    : `还差${Math.max(0, order.amount - status.count)}件${status.exitConnected ? '' : ' · 需接同色口'}`;
  return { status, label };
}

export function colorExitBoardHint(state: RunState, view: ViewState): string {
  if (view.animation) return `${cargoName(view.animation.shipment.cargo)}逐箱出货 · 叉车空载返回南口`;
  if (view.preview && !view.preview.valid) return '落点无效，请换一个空位置';
  const mixed = mixedPiecePreview(state, view);
  if (mixed) {
    const shipment = view.preview!.shipments.length
      ? `预计出货：${view.preview!.shipments.map(event => `${cargoName(event.cargo)}${event.cells.length}件`).join('、')}`
      : entryBlocked(state, view) ? '南入口被堵，暂不出货' : '暂不出货';
    return `${shipment}；${mixedRemainderCaption(mixed)}`;
  }
  if (entryBlocked(state, view)) return '南入口被堵 · 叉车入口格必须留空才能出货';
  if (view.preview?.valid && view.preview.shipments.length) {
    return `预计出货：${view.preview.shipments.map(event => `${cargoName(event.cargo)}${event.cells.length}件`).join('、')}`;
  }
  if (state.orders.some(order => orderStatus(state, order).status === 'ready')) return '同色口已接通 · 合法落子后检查出货';
  return '货连同色出口，给叉车留空路';
}

export function drawColorExitCards(ctx: Context, state: RunState, view: ViewState): void {
  text(ctx, '固定出口', 56, 330, 26, CREAM);
  text(ctx, `每批至少${RULES_V4_CONFIG.minBatch}件 · 留叉车空路`, 1027, 330, 21, '#b4c4ca', 'right', 500);
  COLOR_EXIT_TARGETS.forEach((target, index) => {
    const order = state.orders.find(item => item.id === target.id) ?? target, feedback = colorExitFeedback(state, order, view);
    const exit = EXITS.find(item => item.id === order.dockId)!, color = PALETTE[order.cargo], x = 54 + index * (988 / 3), y = 357, w = 940 / 3;
    const active = !!feedback.shipping || !!feedback.previewShipment;
    panel(ctx, { x, y, w, h: 111 }, active ? '#345244' : '#26394e', active ? '#cff8b8' : color.mid, 12);
    icon(ctx, order.cargo, x + 37, y + 31, 41, color.light);
    text(ctx, exit.label, x + 74, y + 29, 27, color.light);
    text(ctx, `连口 ${feedback.status.count}/${order.amount}件`, x + 20, y + 64, 23, CREAM);
    text(ctx, feedback.label, x + 20, y + 93, 19, active ? '#d9ffc1' : feedback.status.status === 'blocked' ? '#ffc3a3' : '#c0d0d6', 'left', 600);
  });
}
