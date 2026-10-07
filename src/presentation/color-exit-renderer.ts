import {buildOutboundTransport,sampleOutboundTransport} from './outbound-transport.ts';
import {outboundVehicleDisplay} from './outbound-transport-view.ts';
import { CARGO, COLOR_EXIT_TARGETS } from '../domain/content.ts';
import {playableOrderStatus} from './order-feedback.ts';
import {isInboundRun,isOutboundEndlessV10} from '../domain/playable.ts';
import type {GameRun} from '../domain/playable.ts';
import { pieceCellCargo } from '../domain/pieces.ts';
import type { Order, Point, Shipment } from '../domain/types.ts';
import type { ViewState } from './view-types.ts';
import type { OrderFeedback } from './order-feedback.ts';
import { cellCenter } from './layout.ts';
import { boardGeometry } from './board-geometry.ts';
import type { GeometrySource } from './board-geometry.ts';
import type { Rect } from './layout.ts';
import { CREAM, PALETTE, cargoBox, forklift, icon, panel, roundedPath, text } from './assets.ts';
import { dockPosition, shipmentFrame } from './motion.ts';
import { colorExitCargoPose } from './color-exit-motion.ts';
import { mixedPiecePreview, mixedRemainderCaption } from './mixed-piece-feedback.ts';

type Context = CanvasRenderingContext2D;
const cargoName = (id: string): string => CARGO.find(cargo => cargo.id === id)?.name ?? '货物';
const colorExits = (source?: GeometrySource) => boardGeometry(source).colorExits.map(dock => ({ ...dock, label: `${dock.side === 'north' ? '北' : dock.side === 'east' ? '东' : '西'}·${cargoName(dock.cargo)}` }));
const ACCESS_COLOR = '#9edfff';

/** Explicit geometry avoids Canvas rotation, including in reduced-motion paths and diagrams. */
function arrowhead(ctx: Context, from: Point, to: Point, color: string, size = 11): void {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y), mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(mid.x + dx * size, mid.y + dy * size);
  ctx.lineTo(mid.x - dx * size - dy * size * .65, mid.y - dy * size + dx * size * .65);
  ctx.lineTo(mid.x - dx * size + dy * size * .65, mid.y - dy * size - dx * size * .65); ctx.closePath(); ctx.fill();
}
function line(ctx: Context, points: Point[], color: string, dashed: boolean, width: number, scale = 1): void {
  if (!points.length) return;
  ctx.strokeStyle = color; ctx.lineWidth = width * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dashed ? [14 * scale, 11 * scale] : []);
  ctx.beginPath(); points.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke(); ctx.setLineDash([]);
  points.slice(1).forEach((p, i) => arrowhead(ctx, points[i], p, color, 11 * scale));
}
function entryBlocked(state: GameRun, view: ViewState): boolean {
  const geometry = boardGeometry(state), entry = geometry.entry.entry, index = entry.y * geometry.dimension + entry.x;
  return !!(view.animation?.board ?? state.board)[index] || !view.animation && !!view.preview?.valid && view.preview.cells.includes(index);
}

/** Fixed cargo doors remain distinct from the single forklift entrance. */
export function drawColorExitGates(ctx: Context, state: GameRun, view: ViewState): void {
  const geometry = boardGeometry(state), scale = geometry.scale;
  ctx.save();
  for (const exit of colorExits(geometry)) {
    const dock = exit;
    const p = dockPosition(dock, geometry), side = dock.side !== 'north', color = PALETTE[exit.cargo];
    panel(ctx, { x: p.x - (side ? 16 : 41) * scale, y: p.y - (side ? 41 : 16) * scale, w: (side ? 32 : 82) * scale, h: (side ? 82 : 32) * scale }, color.dark, color.light, 6);
    const center = cellCenter(dock.entry, geometry); arrowhead(ctx, center, { x: p.x * 2 - center.x, y: p.y * 2 - center.y }, '#fff7dd', 13 * scale);
    const label = dock.side === 'north' ? { x: 679, y: 541 } : { x: dock.side === 'west' ? 51 : 1029, y: 911 };
    icon(ctx, exit.cargo, dock.side === 'north' ? 612 : label.x, dock.side === 'north' ? label.y : 945, 29, color.light);
    text(ctx, exit.label, label.x, label.y, 21, color.light, 'center');
  }
  const south = dockPosition(geometry.entry, geometry), blocked = entryBlocked(state, view);
  panel(ctx, { x: south.x - 42 * scale, y: south.y - 15 * scale, w: 84 * scale, h: 30 * scale }, blocked ? '#65342f' : '#1c4962', blocked ? '#ffac83' : ACCESS_COLOR, 6);
  arrowhead(ctx, { x: south.x, y: south.y + 27 * scale }, { x: south.x, y: south.y - 27 * scale }, blocked ? '#ffb293' : ACCESS_COLOR, 12 * scale);
  text(ctx, blocked ? '入口堵塞' : '叉车入口', 540, 1443, 21, blocked ? '#ffc0a3' : ACCESS_COLOR, 'center');
  ctx.restore();
}

/** Show event-owned access and freight polylines above cargo, with both line-style and color cues. */
export function drawColorExitRoutes(ctx: Context, view: ViewState): void {
  const shipments = (view.animation ? [view.animation.shipment] : view.preview?.valid ? view.preview.shipments : []);
  if (!shipments.length) return;
  ctx.save();
  for (const event of shipments) {
    if (!('transport' in event)||event.transport !== 'conveyor') continue;
    const geometry = boardGeometry(event), scale = geometry.scale;
    line(ctx, event.path.map(point => cellCenter(point, geometry)), ACCESS_COLOR, true, 6, scale);
    const color = PALETTE[event.cargo].light, drawn = new Set<string>();
    const activePlan=view.animation?.transportPlan;
    if(activePlan&&!view.profile?.settings.reducedMotion){
      for(const step of activePlan.steps){
        if(step.kind!=='move'||step.loadedCount===0)continue;
        const from=step.from,to=step.to,key=`${from.x},${from.y}:${to.x},${to.y}`;
        if(drawn.has(key))continue;drawn.add(key);line(ctx,[cellCenter(from,geometry),cellCenter(to,geometry)],color,false,5,scale);
      }
    }else for (const cargo of event.cargoPaths ?? []) {
      if (!colorExitCargoPose(event, cargo.cell, shipmentFrame(0, false))) continue;
      for (let i = 1; i < cargo.path.length; i++) {
        const from = cargo.path[i - 1], to = cargo.path[i], key = `${from.x},${from.y}:${to.x},${to.y}`;
        if (drawn.has(key)) continue; drawn.add(key); line(ctx, [cellCenter(from, geometry), cellCenter(to, geometry)], color, false, 5, scale);
      }
    }
    const dock = geometry.colorExits.find(d => d.id === event.dockId);
    if (dock) line(ctx, [cellCenter(dock.entry, geometry), dockPosition(dock, geometry)], color, false, 5, scale);
    if (!view.animation || view.profile?.settings.reducedMotion) {
      ctx.strokeStyle = color; ctx.lineWidth = 4 * scale;
      for (const cell of event.cells) ctx.strokeRect(geometry.x + cell % geometry.dimension * geometry.cell + 5 * scale, geometry.y + Math.floor(cell / geometry.dimension) * geometry.cell + 5 * scale, geometry.boxSize, geometry.boxSize);
    }
  }
  ctx.restore();
}

/** Small per-cell borders preserve the colors and icons of the half that stays on the board. */
export function drawMixedRemainder(ctx: Context, state: GameRun, view: ViewState): void {
  const preview = mixedPiecePreview(state, view); if (!preview?.remaining.length) return;
  const geometry = boardGeometry(state), scale = geometry.scale;
  ctx.save(); ctx.setLineDash([8 * scale, 6 * scale]); ctx.lineWidth = 3 * scale;
  for (const item of preview.remaining) {
    ctx.strokeStyle = PALETTE[item.cargo].light;
    ctx.strokeRect(geometry.x + item.cell % geometry.dimension * geometry.cell + 7 * scale, geometry.y + Math.floor(item.cell / geometry.dimension) * geometry.cell + 7 * scale, 106 * scale, 106 * scale);
  }
  ctx.restore();
}

/** One brief whole-group gather loads the compact counted pallet before driving to the colored exit. */
export function drawColorExitShipment(ctx: Context, shipment: Shipment, progress: number, view: ViewState): void {
  const geometry = boardGeometry(shipment), scale = geometry.scale;
  const reduced = !!view.profile?.settings.reducedMotion;
  const plan=!reduced?(view.animation?.transportPlan??(view.animation?buildOutboundTransport(shipment,view.animation.board):null)):null;
  const frame=plan?sampleOutboundTransport(plan,progress):null;
  if(frame&&frame.stage!=='route'){
    const pose=outboundVehicleDisplay(shipment,frame);
    ctx.save();ctx.beginPath();ctx.rect(geometry.x-30*scale,geometry.y-30*scale,geometry.size+60*scale,geometry.size+60*scale);ctx.clip();ctx.globalAlpha*=pose.alpha;
    forklift(ctx,pose.x,pose.y,pose.vehicleSize,pose.angle,view.profile?.cosmetics.forklift);
    if(pose.loadedCount>0){
      const size=pose.cargoSize,stack=Math.min(3,pose.loadedCount),x=pose.cargo.x,y=pose.cargo.y;
      panel(ctx,{x:x-size*.55,y:y+size*.2,w:size*1.1,h:size*.3},'#b48c55','#59442c',3*scale);
      for(let level=0;level<stack;level++)cargoBox(ctx,shipment.cargo,x-size/2-level*2*scale,y-size/2-level*3*scale,size,1,undefined,view.profile?.cosmetics.cargo);
      ctx.fillStyle='#18382e';ctx.strokeStyle='#b9dda9';ctx.lineWidth=2*scale;
      roundedPath(ctx,x-24*scale,y+6*scale,48*scale,20*scale,4*scale);ctx.fill();ctx.stroke();
      text(ctx,`${pose.loadedCount}件`,x,y+16*scale,17*scale,'#f4ffe5','center');
    }
    ctx.restore();
  }
  if(!reduced&&(!frame||progress*(plan?.durationMs??0)<(plan?.deliveryAtMs??Infinity)))return;
  const dock=geometry.colorExits.find(d=>d.id===shipment.dockId);if(!dock)return;
  const x=dock.side==='north'?874:dock.side==='west'?51:1029,y=dock.side==='north'?538:1061;
  text(ctx,`${shipment.cells.length}件`,x,y,24,PALETTE[shipment.cargo].light,'center');text(ctx,`+${shipment.score}`,x,y+28,22,'#ffe48a','center');
}

/** A static, state-free explanation which can be reused on the first-entry or pause card. */
export function drawColorExitHelpDiagram(ctx: Context, rect: Rect, mixed = false, source?: GeometrySource): void {
  if (mixed) { drawMixedHelpDiagram(ctx, rect, source); return; }
  const dimension = boardGeometry(source).dimension, middle = Math.floor(dimension / 2);
  const scale = Math.min(rect.w / 800, rect.h / 430);
  ctx.save(); ctx.translate(rect.x + (rect.w - 800 * scale) / 2, rect.y + (rect.h - 430 * scale) / 2); ctx.scale(scale, scale);
  const origin = { x: 82, y: 80 }, cell = 224 / dimension, center = (x: number, y: number): Point => ({ x: origin.x + (x + .5) * cell, y: origin.y + (y + .5) * cell });
  panel(ctx, { x: 0, y: 0, w: 800, h: 430 }, '#20394b', '#587586', 14);
  for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
    ctx.fillStyle = '#56636a'; ctx.fillRect(origin.x + x * cell + 1, origin.y + y * cell + 1, cell - 2, cell - 2);
  }
  for (const [x, y] of [[middle, 0], [middle, 1], [middle + 1, 1], [middle + 1, 2]]) cargoBox(ctx, 'cargo.food', origin.x + x * cell + 2, origin.y + y * cell + 2, cell - 4);
  line(ctx, [center(middle + 1, 2), center(middle + 1, 1), center(middle, 1), center(middle, 0), { x: center(middle, 0).x, y: 58 }], PALETTE['cargo.food'].light, false, 4);
  line(ctx, Array.from({ length: dimension - 2 }, (_, index) => center(middle, dimension - 1 - index)), ACCESS_COLOR, true, 4);
  icon(ctx, 'cargo.food', 194, 42, 27, PALETTE['cargo.food'].light); text(ctx, '北·食品', 244, 42, 17, CREAM, 'center');
  icon(ctx, 'cargo.machine', 45, 166, 28, PALETTE['cargo.machine'].light); text(ctx, '机械', 44, 196, 16, CREAM, 'center');
  icon(ctx, 'cargo.chem', 343, 166, 28, PALETTE['cargo.chem'].light); text(ctx, '化工', 343, 196, 16, CREAM, 'center');
  text(ctx, '叉车入口', 194, 335, 21, ACCESS_COLOR, 'center');
  text(ctx,'食品4件出货',395,146,25,PALETTE['cargo.food'].light);
  text(ctx,'虚线：叉车通路',395,222,23,ACCESS_COLOR);
  text(ctx,'实线：出货路线',395,298,23,CREAM);
  ctx.restore();
}

/** Both small boards use the same coordinates, so the surviving half visibly stays put. */
function drawMixedHelpDiagram(ctx: Context, rect: Rect, source?: GeometrySource): void {
  const dimension = boardGeometry(source).dimension, middle = Math.floor(dimension / 2);
  const scale = Math.min(rect.w / 800, rect.h / 430), cell = 224 / dimension;
  ctx.save(); ctx.translate(rect.x + (rect.w - 800 * scale) / 2, rect.y + (rect.h - 430 * scale) / 2); ctx.scale(scale, scale);
  panel(ctx, { x: 0, y: 0, w: 800, h: 430 }, '#20394b', '#587586', 14);

  const foodCells = [[middle, 0], [middle + 1, 0], [middle, 1], [middle + 1, 1]], machineCells = [[middle, 2], [middle + 1, 2]];
  for (const [stage, x] of [38, 332].entries()) {
    const origin = { x, y: 105 }, center = (cx: number, cy: number): Point => ({ x: origin.x + (cx + .5) * cell, y: origin.y + (cy + .5) * cell });
    text(ctx, stage === 0 ? '放置后' : '出货后', x + 112, 64, 20, stage === 0 ? CREAM : PALETTE['cargo.food'].light, 'center');
    for (let row = 0; row < dimension; row++) for (let column = 0; column < dimension; column++) {
      ctx.fillStyle = '#56636a'; ctx.fillRect(x + column * cell + 1, origin.y + row * cell + 1, cell - 2, cell - 2);
    }
    if (stage === 0) {
      for (const [cx, cy] of foodCells) cargoBox(ctx, 'cargo.food', x + cx * cell + 2, origin.y + cy * cell + 2, cell - 4);
      line(ctx, [center(middle + 1, 1), center(middle, 1), center(middle, 0), { x: center(middle, 0).x, y: 90 }], PALETTE['cargo.food'].light, false, 3);
      ctx.strokeStyle = CREAM; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(x + middle * cell - 1, origin.y + cell - 1, 2 * cell + 2, 2 * cell + 2); ctx.setLineDash([]);
    }
    for (const [cx, cy] of machineCells) {
      cargoBox(ctx, 'cargo.machine', x + cx * cell + 2, origin.y + cy * cell + 2, cell - 4);
      if (stage === 1) { ctx.strokeStyle = PALETTE['cargo.machine'].light; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x + cx * cell + 1, origin.y + cy * cell + 1, cell - 2, cell - 2); ctx.setLineDash([]); }
    }
    line(ctx, [center(middle, dimension - 1), center(middle, 3), center(middle - 1, 3), center(middle - 1, 1)], ACCESS_COLOR, true, 3);
    text(ctx, '北·食品口', center(middle, 0).x, 90, 15, PALETTE['cargo.food'].light, 'center');
    text(ctx, '叉车入口', x + 112, 351, 18, ACCESS_COLOR, 'center');
  }
  line(ctx, [{ x: 275, y: 207 }, { x: 314, y: 207 }], CREAM, false, 3);
  text(ctx,'食品4件出货',582,156,22,PALETTE['cargo.food'].light);
  text(ctx,'机械2件留下',582,220,22,PALETTE['cargo.machine'].light);
  text(ctx,'虚线：叉车通路',214,399,22,ACCESS_COLOR,'center');
  text(ctx,'实线：出货路线',585,399,22,CREAM,'center');
  ctx.restore();
}

/** A prospective count is explanatory only; the Domain preview alone authorizes a shipping label. */
export function colorExitFeedback(state: GameRun, order: Order, view: ViewState): OrderFeedback {
  let visible:GameRun = view.animation ? isInboundRun(state)?{...state,board:view.animation.board,cellTraits:view.animation.cellTraits??Array(state.board.length).fill(null)}:isOutboundEndlessV10(state)?{...state,board:view.animation.board}:{...state,board:view.animation.board,cellTraits:view.animation.cellTraits} : state;
  const selected = state.candidates.find(piece => piece.id === view.selectedPieceId);
  if (!view.animation && view.preview?.valid && selected) {
    const board = [...state.board]; view.preview.cells.forEach((cell, index) => { board[cell] = pieceCellCargo(selected, index); });
    visible = { ...state, board };
  }
  const status = playableOrderStatus(visible, order);
  const shipping = view.animation?.shipment.dockId === order.dockId ? view.animation.shipment : undefined;
  if (shipping) return { status, label: `出货中 · ${shipping.cells.length}件`, shipping };
  const previewShipment = !view.animation && view.preview?.valid
    ? view.preview.shipments.find(event => event.orderId === order.id && event.dockId === order.dockId) : undefined;
  if (previewShipment) return { status, label: '可出货', previewShipment };
  const label = status.reason === 'entry-blocked' ? '入口堵塞'
    : status.reason === 'route-blocked' ? '无空路'
    : status.reason === 'exit-unconnected' ? '未连出口'
    : status.status === 'ready' ? view.preview ? view.preview.valid ? '暂不出货' : '这里放不下' : '已就绪 · 等待放置'
    : `还差${Math.max(0, order.amount - status.count)}件`;
  return { status, label };
}

export function colorExitBoardHint(state: GameRun, view: ViewState): string {
  if (view.animation) return `${cargoName(view.animation.shipment.cargo)}出货中`;
  if (view.preview && !view.preview.valid) return '这里放不下，换个位置';
  const mixed = mixedPiecePreview(state, view);
  if (mixed) {
    const shipment = view.preview!.shipments.length
      ? `预计出货：${view.preview!.shipments.map(event => `${cargoName(event.cargo)}${event.cells.length}件`).join('、')}`
      : entryBlocked(state, view) ? '入口堵塞，暂不出货' : '暂不出货';
    return mixed.remaining.length ? `${shipment}；${mixedRemainderCaption(mixed).replace('本件留下：','留下')}` : shipment;
  }
  if (entryBlocked(state, view)) return '入口堵塞，暂不能出货';
  if (view.preview?.valid && view.preview.shipments.length) {
    return `预计出货：${view.preview.shipments.map(event => `${cargoName(event.cargo)}${event.cells.length}件`).join('、')}`;
  }
  if (state.orders.some(order => playableOrderStatus(state, order).status === 'ready')) return '已就绪 · 等待放置';
  return '';
}

export function drawColorExitCards(ctx: Context, state: GameRun, view: ViewState): void {
  text(ctx, '出货口', 56, 330, 26, CREAM);
  COLOR_EXIT_TARGETS.forEach((target, index) => {
    const order = state.orders.find(item => item.id === target.id) ?? target, feedback = colorExitFeedback(state, order, view);
    const exit = colorExits(state).find(item => item.id === order.dockId)!, color = PALETTE[order.cargo], x = 54 + index * (988 / 3), y = 357, w = 940 / 3;
    const active = !!feedback.shipping || !!feedback.previewShipment;
    panel(ctx, { x, y, w, h: 111 }, active ? '#345244' : '#26394e', active ? '#cff8b8' : color.mid, 12);
    icon(ctx, order.cargo, x + 37, y + 31, 41, color.light);
    text(ctx, exit.label, x + 74, y + 29, 27, color.light);
    text(ctx, `已连接 ${feedback.status.count}/${order.amount}件`, x + 20, y + 64, 23, CREAM);
    text(ctx, feedback.label, x + 20, y + 93, 19, active ? '#d9ffc1' : feedback.status.status === 'blocked' ? '#ffc3a3' : '#c0d0d6', 'left', 600);
  });
}
