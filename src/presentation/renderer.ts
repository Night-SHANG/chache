import { ACHIEVEMENTS, FORKLIFTS } from '../application/profile.ts';
import type { CargoStyleId, ForkliftId } from '../application/profile.ts';
import {debugPages,DEBUG_PREVIOUS,DEBUG_NEXT} from './debug-layout.ts';
import { getUiControls } from './ui.ts';
import type { UiControl } from './ui.ts';
import { CARGO, DOCKS, SHAPES, UPGRADES } from '../domain/content.ts';
import { orderStatus } from '../domain/board.ts';
import type { CargoId, Cell, CellTrait, Dock, Piece, Point, RunState, Shipment, Upgrade } from '../domain/types.ts';
import { L, cellCenter, getTrayRects } from './layout.ts';
import { chainFeedback, collectPose, dockPosition, feedbackParticles, placementPose, reboundOffset, routePose, shipmentFrame } from './motion.ts';
import type { Rect } from './layout.ts';
import type { ViewState } from './view-types.ts';
import { CREAM, MUTED, PALETTE, arrow, button, cargoBox, forklift, gradient, hazard, icon, outlinedText, panel, rivet, roundedPath, text } from './assets.ts';

type Context = CanvasRenderingContext2D;
const cargoName = (id: CargoId): string => CARGO.find(c => c.id === id)?.name ?? '货物';
const number = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const traitName = { pallet: '托盘', rush: '加急', hazard: '危险', wildcard: '万能' } as const;
const pieceTrait = (piece: Piece): CellTrait | undefined => piece.trait ? { kind: piece.trait, remaining: piece.rushTurns } : undefined;

/** Stateless shared renderer: platform scales this 1080 × 1920 composition. */
export function render(ctx: Context, state: RunState, view: ViewState): void {
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, L.width, L.height);
  drawWarehouse(ctx, view);
  if (view.confirmation) { drawConfirmation(ctx, state, view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'menu') { drawMenu(ctx, state, view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'settings') { drawSettings(ctx, state, view); ctx.restore(); return; }
  drawHeader(ctx, state, view);
  const board = view.animation?.board ?? state.board;
  // Never mix an intermediate board with already-expired or cleared final traits.
  const cellTraits = view.animation ? view.animation.cellTraits : state.cellTraits;
  drawOrders(ctx, { ...state, board, cellTraits }, view.animation?.shipment);
  drawBoard(ctx, state, view, board, cellTraits);
  drawTrays(ctx, state, view);
  drawFooter(ctx, state, view);
  if (view.debug) drawDebug(ctx, state, view);
  if (view.needsResume) drawPause(ctx, true, state.rulesetVersion, view.recoveryError, state.mode === 'daily' ? state.challengeDay : undefined);
  else if (view.paused) drawActivePause(ctx, state, view);
  else if (state.phase === 'upgrade' && !view.animation) drawUpgrades(ctx, state);
  else if (state.phase === 'result' && !view.animation && view.noticeFx?.kind !== 'fail') drawResult(ctx, state, view);
  if (!view.paused && !view.needsResume && view.noticeFx) drawNotice(ctx, view);
  ctx.restore();
}

function drawWarehouse(ctx: Context, view: ViewState): void {
  const night = view.profile?.cosmetics.theme === 'night';
  ctx.fillStyle = gradient(ctx, 0, 0, 1920, night ? '#111c35' : '#243345', night ? '#080d1b' : '#111b25'); ctx.fillRect(0, 0, 1080, 1920);
  // Fixed, muted rack silhouettes frame the playable floor rather than competing with it.
  ctx.save(); ctx.globalAlpha = .68;
  for (const sx of [-56, 963]) {
    for (let row = 0; row < 8; row++) {
      const y = 62 + row * 230;
      ctx.fillStyle = '#101b27'; ctx.fillRect(sx, y, 185, 185);
      const cargo = (['cargo.machine', 'cargo.chem', 'cargo.cold', 'cargo.food'] as CargoId[])[row % 4];
      cargoBox(ctx, cargo, sx + 12, y + 38, 74, .75); cargoBox(ctx, 'cargo.chem', sx + 80, y + 63, 64, .52);
      ctx.fillStyle = '#3f4f5a'; ctx.fillRect(sx - 1, y + 180, 184, 14);
      ctx.fillStyle = '#a77233'; ctx.fillRect(sx - 1, y + 180, 184, 5);
      for (const xx of [sx + 4, sx + 157]) {
        ctx.fillStyle = '#273a4d'; ctx.fillRect(xx, y, 16, 217); ctx.fillStyle = '#647184'; ctx.fillRect(xx, y, 3, 217);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = '#111d28'; ctx.fillRect(xx + 7, y + k * 33 + 16, 4, 7); }
      }
    }
  }
  ctx.restore();
  // Upper warehouse joists, electrical conduits and a restrained warm light.
  for (const y of [18, 234, 310, 1470, 1824]) {
    ctx.fillStyle = 'rgba(8,17,25,.7)'; ctx.fillRect(0, y, 1080, 10);
    ctx.fillStyle = 'rgba(138,153,160,.18)'; ctx.fillRect(0, y + 11, 1080, 3);
  }
  ctx.fillStyle = 'rgba(221,158,71,.07)'; ctx.beginPath(); ctx.moveTo(440, 0); ctx.lineTo(180, 520); ctx.lineTo(900, 520); ctx.lineTo(640, 0); ctx.fill();
}

function drawHeader(ctx: Context, state: RunState, view: ViewState): void {
  text(ctx, 'WAREHOUSE  /  LAST SLOT', 58, 35, 16, '#b6aa90', 'left', 600);
  outlinedText(ctx, '爆仓', 49, 112, 115);
  outlinedText(ctx, '最后一格', 63, 206, 57);
  hazard(ctx, { x: 55, y: 249, w: 425, h: 15 });
  forklift(ctx, 427, 177, 88, -.12, view.profile?.cosmetics.forklift);
  panel(ctx, { x: 548, y: 54, w: 363, h: 151 });
  text(ctx, '当前分数', 577, 89, 25, MUTED);
  text(ctx, number(state.score), 878, 151, 56, '#ffe087', 'right', 900);
  panel(ctx, L.pause, '#40536b');
  ctx.fillStyle = CREAM; roundedPath(ctx, 966, 80, 12, 47, 4); ctx.fill(); roundedPath(ctx, 989, 80, 12, 47, 4); ctx.fill();
  text(ctx, '连锁', L.chain.x, L.chain.y + 21, 20, MUTED);
  text(ctx, `×${state.lastChain}`, L.chain.x + L.chain.w, L.chain.y + 21, 28, '#f7cc67', 'right');
  panel(ctx, { x: 548, y: 226, w: 486, h: 70 }, '#25394c', '#53687a', 13);
  text(ctx, state.overtime ? '加班挑战' : `第 ${state.shift} 班`, 573, 261, 28, '#e4f1f1');
  const progress = Math.min(6, state.completedOrders - (state.shift - 1) * 6);
  for (let i = 0; i < 5; i++) {
    const x = 735 + i * 57;
    if (i < 4) { ctx.fillStyle = i < state.shift - 1 ? '#d3aa4f' : '#465563'; ctx.fillRect(x, 257, 55, 5); }
    ctx.fillStyle = i < state.shift ? '#ffc958' : '#243240'; ctx.strokeStyle = '#7f90a1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, 260, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    text(ctx, String(i + 1), x, 260, 15, i < state.shift ? '#48321d' : '#8d9ba7', 'center');
  }
  text(ctx, '本班订单', 57, 291, 22, MUTED);
  for (let i = 0; i < 6; i++) { roundedPath(ctx, 180 + i * 43, 281, 35, 16, 4); ctx.fillStyle = i < progress ? '#ffc74d' : '#111c27'; ctx.fill(); }
  text(ctx, `${Math.max(0, progress)} / 6`, 474, 289, 23, CREAM, 'right');
}

function drawOrders(ctx: Context, state: RunState, shipment?: Shipment): void {
  text(ctx, '出库订单', 56, 330, 26, CREAM);
  text(ctx, '数量达标 · 通路畅通', 1027, 330, 22, MUTED, 'right', 500);
  const w = (972 - (state.orders.length - 1) * 16) / Math.max(1, state.orders.length);
  state.orders.forEach((order, i) => {
    const x = 54 + i * (w + 16), y = 357;
    const status = orderStatus(state, order);
    const shipping = shipment?.dockId === order.dockId ? shipment : undefined;
    const cargo = shipping?.cargo ?? order.cargo;
    const p = PALETTE[cargo], ready = !!shipping || status.status === 'ready';
    const statusColor = ready ? '#abd982' : status.status === 'blocked' ? '#ff976d' : '#aac4d6';
    panel(ctx, { x, y, w, h: 135 }, ready ? '#2a4c3c' : '#293d51', ready ? '#8bb875' : '#697f90', 13);
    ctx.fillStyle = p.mid; roundedPath(ctx, x + 13, y + 14, 46, 46, 8); ctx.fill(); icon(ctx, cargo, x + 36, y + 37, 31, '#fff5df', p.ink);
    text(ctx, DOCKS.find(d => d.id === order.dockId)?.name ?? '出货口', x + 73, y + 25, 20, MUTED);
    text(ctx, cargoName(cargo), x + 73, y + 55, 29, CREAM);
    const units = shipping?.units;
    const amount = shipping ? units === undefined ? `${shipping.cells.length}格` : `${units}件·${shipping.cells.length}格` : `${status.count}/${order.amount}`;
    text(ctx, amount, x + w - 16, y + (units === undefined ? 38 : 25), units === undefined ? state.orders.length > 3 ? 27 : 37 : state.orders.length > 3 ? 18 : 24, '#fff0c7', 'right', 900);
    ctx.fillStyle = '#10212c'; roundedPath(ctx, x + 15, y + 78, w - 30, 8, 4); ctx.fill();
    roundedPath(ctx, x + 15, y + 78, Math.max(1, (w - 30) * Math.min(1, shipping ? 1 : status.count / order.amount)), 8, 4); ctx.fillStyle = p.mid; ctx.fill();
    ctx.fillStyle = statusColor; ctx.beginPath(); ctx.arc(x + 22, y + 108, 5, 0, Math.PI * 2); ctx.fill();
    const reason = 'reason' in status ? status.reason : undefined;
    const blocked = reason === 'entry-blocked' ? '入口被堵 · 请留空' : reason === 'route-blocked' ? '数量已够 · 无空路' : '数量已够 · 通路被堵';
    const label = shipping ? `出库中 · +${shipping.score}` : ready ? '通路畅通 · 可出库' : status.status === 'blocked' ? blocked : `再连 ${Math.max(0, order.amount - status.count)} ${state.rulesetVersion >= 2 ? '件' : '格'}`;
    text(ctx, label, x + 35, y + 108, state.orders.length > 3 ? 17 : 21, statusColor, 'left', 600);
  });
}

function drawBoard(ctx: Context, state: RunState, view: ViewState, board: Cell[], cellTraits?: (CellTrait | null)[]): void {
  const { x, y, size, cell } = L.board;
  if (!view.animation) text(ctx, tutorialStep(state) === 2 ? '数量够，路却堵住了：南门清墙 → 北门出货' : '同类相邻成组，给叉车留条路', 540, L.boardHint.y + L.boardHint.h / 2, 22, '#d9d0b7', 'center', 600);
  panel(ctx, { x: x - 26, y: y - 24, w: size + 52, h: size + 54 }, '#56616a', '#829098', 12);
  hazard(ctx, { x: x - 13, y: y - 13, w: size + 26, h: 14 });
  hazard(ctx, { x: x - 13, y: y + size - 1, w: size + 26, h: 14 });
  hazard(ctx, { x: x - 13, y, w: 14, h: size }, true); hazard(ctx, { x: x + size - 1, y, w: 14, h: size }, true);
  ctx.fillStyle = '#453e34'; ctx.fillRect(x, y, size, size);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
    const px = x + col * cell, py = y + row * cell, tone = (row * 3 + col * 5) % 6;
    const night = view.profile?.cosmetics.theme === 'night';
    const floor = (night ? ['#536071', '#5b6776', '#4d5b6c', '#606c79', '#526272', '#586676'] : ['#958d7b', '#a19884', '#928976', '#a69c86', '#9b927d', '#a09680'])[tone];
    const bottom = (night ? ['#3c485b', '#445264', '#39465a', '#485769', '#3e4d5e', '#425064'] : ['#817969', '#8c826f', '#807767', '#908571', '#867e6b', '#8b806c'])[tone];
    ctx.fillStyle = gradient(ctx, px, py, cell, floor, bottom);
    ctx.fillRect(px + 2, py + 2, cell - 4, cell - 4);
    ctx.fillStyle = 'rgba(248,232,196,.21)'; ctx.fillRect(px + 3, py + 2, cell - 6, 2);
    ctx.fillStyle = 'rgba(35,33,29,.15)'; ctx.fillRect(px + cell - 4, py + 4, 2, cell - 7); ctx.fillRect(px + 3, py + cell - 4, cell - 6, 2);
    if ((row + col * 2) % 4 === 0) {
      ctx.strokeStyle = 'rgba(49,43,36,.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 17, py + 83); ctx.lineTo(px + 37, py + 72); ctx.lineTo(px + 49, py + 75); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,242,213,.13)'; ctx.fillRect(px + 27 + tone * 5, py + 32 + tone * 3, 2, 2);
  }
  ctx.fillStyle = gradient(ctx, x, y, 24, 'rgba(32,30,26,.35)', 'rgba(32,30,26,0)'); ctx.fillRect(x, y, size, 24);
  ctx.fillStyle = gradient(ctx, x, y + size - 18, 18, 'rgba(32,30,26,0)', 'rgba(32,30,26,.25)'); ctx.fillRect(x, y + size - 18, size, 18);
  drawTutorialTarget(ctx, state, view);
  for (const r of [0, 1]) for (const c of [0, 1]) rivet(ctx, x - 21 + c * (size + 42), y - 19 + r * (size + 40), 5);
  state.orders.forEach(order => { const dock = DOCKS.find(d => d.id === order.dockId); if (dock) drawGate(ctx, dock, order.cargo); });
  if (state.upgrades.includes('upgrade.side_gate')) drawSideGate(ctx);
  if (view.preview?.valid) view.preview.shipments.forEach(s => drawRoute(ctx, s.path, false));
  const shipment = view.animation?.shipment, reduced = !!view.profile?.settings.reducedMotion;
  const frame = view.animation ? shipmentFrame(view.animation.progress, reduced) : null;
  if (shipment && frame) drawRoute(ctx, shipment.path, true, reduced ? 1 : .25 + frame.route * .75);
  const dock = shipment ? DOCKS.find(d => d.id === shipment.dockId) : undefined;
  const collecting = shipment && frame?.stage === 'collect' && !reduced;
  const drawCargo = (cargo: CargoId, index: number): void => {
    const source = { x: x + index % 7 * cell + 60, y: y + Math.floor(index / 7) * cell + 59 };
    const isShipment = shipment?.cells.includes(index), extra = shipment?.extraClearedCells?.includes(index);
    const pose = collecting && isShipment && dock ? collectPose(source, dockPosition(dock), frame!.collect, false) : { ...source, scale: 1 };
    const placed = view.placementFx?.cells.includes(index) ? placementPose(view.placementFx.progress, reduced) : { x: 1, y: 1 };
    const failure = view.noticeFx?.kind === 'fail' ? placementPose(view.noticeFx.progress, reduced) : { x: 1, y: 1 };
    // Extra clears are unscored cleanup, so they disappear in place instead of flying to a Dock.
    const cleanupScale = collecting && extra ? 1 - frame!.collect * .9 : 1;
    ctx.save(); ctx.translate(pose.x, pose.y);
    ctx.scale(pose.scale * cleanupScale * placed.x * failure.x, pose.scale * cleanupScale * placed.y * failure.y);
    cargoBox(ctx, cargo, -55, -55, 110, collecting && extra ? 1 - frame!.collect : 1, cellTraits?.[index], view.profile?.cosmetics.cargo);
    ctx.restore();
  };
  board.forEach((cargo, index) => { if (cargo && !(collecting && shipment?.cells.includes(index))) drawCargo(cargo, index); });
  // Collected boxes stay above stationary boxes during their short flight.
  if (collecting) shipment?.cells.forEach(index => { const cargo = board[index]; if (cargo) drawCargo(cargo, index); });
  drawChosenGroups(ctx, view);
  drawExtraClears(ctx, view);
  drawPlacementFeedback(ctx, view);
  drawPlacement(ctx, state, view);
  if (view.animation) drawShipment(ctx, view.animation.shipment, view.animation.progress, view);
}

/** Optional teaching overlay only; no commands or occupancy are changed. */
function tutorialStep(state: RunState): 0 | 1 | 2 | null {
  if (state.rulesetVersion === 3 && state.mode === 'tutorial' && state.phase === 'input') return state.tutorialStep === 0 || state.tutorialStep === 1 || state.tutorialStep === 2 ? state.tutorialStep : null;
  if (state.mode !== 'tutorial' || state.phase !== 'input' || state.completedOrders > 0) return null;
  if (state.commandIndex === 0) return 0;
  if (state.commandIndex === 1 && state.board[8] === 'cargo.food' && state.board[9] === 'cargo.food' && state.board[10] === null
    && state.candidates[1]?.cargo === 'cargo.food' && state.candidates[1]?.shapeId === 'shape.single') return 1;
  return null;
}

function drawTutorialTarget(ctx: Context, state: RunState, view: ViewState): void {
  const step = tutorialStep(state); if (step === null || view.animation || view.dragPoint) return;
  const x = L.board.x + (step === 0 ? 1 : 3) * L.board.cell + 10, y = L.board.y + (step === 2 ? 4 : 1) * L.board.cell + 10;
  const w = (step === 0 ? 2 : 1) * L.board.cell - 20;
  ctx.save(); roundedPath(ctx, x, y, w, 100, 10); ctx.fillStyle = 'rgba(255,225,126,.10)'; ctx.fill();
  ctx.strokeStyle = '#ffe58d'; ctx.lineWidth = 4; ctx.setLineDash([11, 9]); ctx.stroke(); ctx.setLineDash([]);
  text(ctx, step === 0 ? '食品 ×2' : step === 1 ? '食品 ×1' : '机械 ×1', x + w / 2, y + 50, 24, '#fff1bd', 'center'); ctx.restore();
}

function drawGate(ctx: Context, dock: Dock, cargo: CargoId): void {
  const side = dock.side;
  const angle = side === 'north' ? Math.PI / 2 : side === 'south' ? -Math.PI / 2 : side === 'west' ? 0 : Math.PI;
  const { x: gx, y: gy } = dockPosition(dock);
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(angle);
  panel(ctx, { x: -25, y: -40, w: 43, h: 80 }, '#172735', '#ddbc65', 6);
  ctx.fillStyle = PALETTE[cargo].mid; roundedPath(ctx, -20, -31, 31, 62, 4); ctx.fill();
  arrow(ctx, -1, 0, 28, 0, '#fff7cf');
  ctx.restore();
}

function drawSideGate(ctx: Context): void {
  const p = cellCenter({ x: 0, y: 6 });
  panel(ctx, { x: 68, y: p.y - 35, w: 48, h: 70 }, '#30493b', '#c4e298', 6);
  arrow(ctx, 94, p.y, 31, 0, '#e8ffbf');
  text(ctx, '侧门', 89, p.y - 55, 21, '#e8ffbf', 'center');
  text(ctx, '全订单', 80, p.y + 57, 16, '#d4e6bb', 'center', 600);
}

function drawRoute(ctx: Context, route: Point[], active: boolean, opacity = 1): void {
  if (!route.length) return;
  ctx.save(); ctx.globalAlpha *= opacity; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = (): void => { ctx.beginPath(); route.forEach((p, i) => { const c = cellCenter(p); if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); }); };
  if (route.length > 1) {
    path(); ctx.strokeStyle = active ? 'rgba(255,210,72,.28)' : 'rgba(94,237,200,.20)'; ctx.lineWidth = active ? 32 : 22; ctx.stroke();
    path(); ctx.setLineDash(active ? [] : [13, 12]); ctx.strokeStyle = active ? '#fff1a2' : '#b4fff0'; ctx.lineWidth = active ? 10 : 6; ctx.stroke(); ctx.setLineDash([]);
  }
  for (let i = 0; i < route.length; i++) {
    const c = cellCenter(route[i]);
    if (i < route.length - 1) arrow(ctx, c.x, c.y, 25, Math.atan2(route[i + 1].y - route[i].y, route[i + 1].x - route[i].x), active ? '#fff5b6' : '#bafcec');
    else { ctx.strokeStyle = active ? '#fff4b0' : '#b4fff0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c.x, c.y, 17, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

/** Highlight the exact Domain-selected cells, including canonical tie-breaks. */
function drawChosenGroups(ctx: Context, view: ViewState): void {
  const reducedShipment = view.animation && view.profile?.settings.reducedMotion ? view.animation.shipment : null;
  if (!reducedShipment && (!view.preview?.valid || view.animation)) return;
  const cells = new Set(reducedShipment?.cells ?? (view.preview?.valid ? view.preview.shipments.flatMap(shipment => shipment.cells) : []));
  ctx.save(); ctx.strokeStyle = '#cbffde'; ctx.lineWidth = 4; ctx.fillStyle = 'rgba(179,255,207,.15)';
  for (const index of cells) {
    const x = L.board.x + index % 7 * L.board.cell + 4, y = L.board.y + Math.floor(index / 7) * L.board.cell + 4;
    ctx.fillRect(x, y, 112, 112); ctx.strokeRect(x, y, 112, 112);
  }
  ctx.restore();
}

function drawExtraClears(ctx: Context, view: ViewState): void {
  const shipments = view.animation ? [view.animation.shipment] : view.preview?.valid ? view.preview.shipments : [];
  const cells = new Set(shipments.flatMap(shipping => shipping.extraClearedCells ?? []));
  ctx.save(); ctx.strokeStyle = '#ffc893'; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
  for (const index of cells) {
    const x = L.board.x + index % 7 * L.board.cell + 9, y = L.board.y + Math.floor(index / 7) * L.board.cell + 9;
    ctx.strokeRect(x, y, 102, 102);
  }
  ctx.setLineDash([]); ctx.restore();
}

function drawPlacement(ctx: Context, state: RunState, view: ViewState): void {
  const piece = state.candidates.find(p => p.id === view.selectedPieceId);
  if (!piece) return;
  if (view.hoverOrigin) {
    const shape = SHAPES.find(s => s.id === piece.shapeId);
    shape?.cells.forEach(p => {
      const cx = p.x + view.hoverOrigin!.x, cy = p.y + view.hoverOrigin!.y;
      if (cx < 0 || cy < 0 || cx > 6 || cy > 6) return;
      const x = L.board.x + cx * L.board.cell + 4, y = L.board.y + cy * L.board.cell + 4;
      const valid = view.preview?.valid;
      ctx.fillStyle = valid ? 'rgba(223,239,144,.32)' : 'rgba(231,69,48,.30)'; ctx.fillRect(x, y, 112, 112);
      ctx.strokeStyle = valid ? '#f3f6b1' : '#ff7959'; ctx.lineWidth = 5; ctx.strokeRect(x + 2, y + 2, 108, 108);
      if (piece.trait && !view.dragPoint) cargoBox(ctx, piece.cargo, x + 1, y, 110, .7, pieceTrait(piece), view.profile?.cosmetics.cargo);
    });
  }
  if (view.dragPoint) {
    const shape = SHAPES.find(s => s.id === piece.shapeId); if (!shape) return;
    ctx.save(); ctx.globalAlpha = .8;
    shape.cells.forEach(p => cargoBox(ctx, piece.cargo, view.dragPoint!.x + p.x * 120 - 55, view.dragPoint!.y + p.y * 120 - 55, 110, 1, pieceTrait(piece), view.profile?.cosmetics.cargo)); ctx.restore();
  }
}

function drawPlacementFeedback(ctx: Context, view: ViewState): void {
  const effect = view.placementFx; if (!effect) return;
  const reduced = !!view.profile?.settings.reducedMotion;
  ctx.save(); ctx.globalAlpha = reduced ? 1 : Math.max(0, 1 - effect.progress);
  ctx.strokeStyle = '#fff2ae'; ctx.lineWidth = 4;
  for (const index of effect.cells) {
    if (index < 0 || index >= 49) continue;
    ctx.strokeRect(L.board.x + index % 7 * L.board.cell + 4, L.board.y + Math.floor(index / 7) * L.board.cell + 4, 112, 112);
  }
  ctx.restore();
}

function drawShipment(ctx: Context, shipment: Shipment, progress: number, view: ViewState): void {
  const reduced = !!view.profile?.settings.reducedMotion, frame = shipmentFrame(progress, reduced);
  const feedback = chainFeedback(shipment.chain), pose = routePose(shipment.path, frame.move);
  const dock = DOCKS.find(d => d.id === shipment.dockId), target = dock ? dockPosition(dock) : null;
  if (pose) {
    if (frame.stage === 'move') drawParticles(ctx, feedbackParticles(pose, shipment.chain, frame.move, 'move', reduced), '#c9baa0');
    forklift(ctx, pose.x, pose.y, 99, pose.angle, view.profile?.cosmetics.forklift);
  }
  if (target && frame.stage === 'collect') {
    if (!reduced) {
      // One bounded pulse, confined to the gate and optionally the outer board rim.
      const pulse = Math.sin(Math.PI * frame.collect);
      ctx.save(); ctx.globalAlpha = feedback.flash * pulse; ctx.strokeStyle = '#ffe8a0'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(target.x, target.y, 39, 0, Math.PI * 2); ctx.stroke();
      if (feedback.pulse) { ctx.globalAlpha = .18 * pulse; ctx.lineWidth = 5; ctx.strokeRect(L.board.x - 22, L.board.y - 21, L.board.size + 44, L.board.size + 42); }
      ctx.restore();
      drawParticles(ctx, feedbackParticles(target, shipment.chain, frame.collect, 'collect'), '#ffe29b');
    }
    // Scores stay in the Dock margin. Side-gate route entry never substitutes for the order Dock.
    const side = dock!.side;
    const x = side === 'west' ? 55 : side === 'east' ? 1025 : side === 'south' && shipment.chain > 1 ? 816 : target.x;
    const y = side === 'north' ? 522 : side === 'south' ? shipment.chain > 1 ? 1441 : 1426 : target.y - 58;
    const maxWidth = side === 'west' || side === 'east' ? 94 : 244;
    const label = `+${number(shipment.score)}`;
    ctx.font = `900 ${feedback.fontSize}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const size = Math.min(feedback.fontSize, feedback.fontSize * maxWidth / Math.max(1, ctx.measureText(label).width));
    outlinedText(ctx, label, x, y, size, '#ffe48a', 'center');
  }
  if (shipment.chain > 1) {
    panel(ctx, { x: 370, y: 1432, w: 340, h: 57 }, '#5a3f26', '#b98d40', 12);
    text(ctx, `${shipment.chain} 连锁出库！`, 540, 1460, Math.min(36, feedback.fontSize - 8), '#ffdf75', 'center', 900);
  }
}

function drawParticles(ctx: Context, particles: ReturnType<typeof feedbackParticles>, color: string): void {
  if (!particles.length) return;
  ctx.save(); ctx.fillStyle = color;
  for (const particle of particles) {
    ctx.globalAlpha = particle.alpha; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawNotice(ctx: Context, view: ViewState): void {
  const notice = view.noticeFx; if (!notice) return;
  const failure = notice.kind === 'fail';
  panel(ctx, { x: 252, y: 1430, w: 576, h: 67 }, failure ? '#493b31' : '#304b40', failure ? '#ccab88' : '#b5ce91', 12);
  text(ctx, notice.label, 540, 1463, 26, failure ? '#f5d8ba' : '#e3efca', 'center', 700);
}

function drawTrays(ctx: Context, state: RunState, view: ViewState): void {
  const shipments = view.animation ? [view.animation.shipment] : view.preview?.valid ? view.preview.shipments : [];
  const extra = new Set(shipments.flatMap(shipping => shipping.extraClearedCells ?? [])).size;
  const detail = [shipments.some(shipping => shipping.usedPalletPass) ? '穿托盘1次 · 托盘保留' : '', extra ? `额外清理${extra}格 · 不计分` : ''].filter(Boolean).join(' / ');
  if (!view.noticeFx && (!view.animation || view.animation.shipment.chain < 2)) {
    const step = tutorialStep(state);
    const hint = state.rulesetVersion === 3 && step !== null
      ? ['第1步：把食品横2拖进虚线框', '第2步：把食品接在右侧，凑成3件出货', '第3步：补上机械，先清路，再连锁出货'][step]
      : step === 0 ? '第1步：把左侧食品拖进虚线框' : step === 1 ? '第2步：把中间食品接在右侧，凑成3格' : detail || view.message || '拖入货件，或点选后点击落点';
    text(ctx, hint, 540, 1467, detail ? 24 : 27, '#efe3c9', 'center', 600);
  }
  text(ctx, '待入库', 58, 1502, 22, '#b8c3cd');
  text(ctx, detail && view.animation && view.animation.shipment.chain > 1 ? detail : '固定朝向 · 不可旋转', 1027, 1502, detail ? 18 : 20, '#b2c1ca', 'right', 500);
  const trays = getTrayRects(state.candidates.length);
  state.candidates.forEach((piece, index) => {
    const r = trays[index]; if (!r) return;
    const selected = piece.id === view.selectedPieceId || (tutorialStep(state) !== null && (state.rulesetVersion === 3 ? index === 0 : tutorialStep(state) === index) && !view.selectedPieceId);
    panel(ctx, r, selected ? '#485045' : '#293c50', selected ? '#f4cf69' : '#718396');
    if (selected) { roundedPath(ctx, r.x + 7, r.y + 7, r.w - 14, r.h - 14, 13); ctx.strokeStyle = '#eec860'; ctx.lineWidth = 3; ctx.stroke(); }
    text(ctx, `0${index + 1}`, r.x + 20, r.y + 26, 17, '#718b9c');
    const invalid = view.invalidFx?.pieceId === piece.id;
    const reduced = !!view.profile?.settings.reducedMotion;
    const progress = invalid ? view.invalidFx!.progress : view.noticeFx?.kind === 'fail' ? view.noticeFx.progress : null;
    if (progress !== null && !reduced) {
      const squash = placementPose(progress, false), center = { x: r.x + r.w / 2, y: r.y + 126 };
      ctx.save(); ctx.translate(center.x, center.y + (invalid ? reboundOffset(progress, false) : 0));
      ctx.scale(squash.x, squash.y); ctx.translate(-center.x, -center.y);
      drawPieceInTray(ctx, piece, r, selected, view.profile?.cosmetics.cargo); ctx.restore();
    } else drawPieceInTray(ctx, piece, r, selected, view.profile?.cosmetics.cargo);
    if (invalid) { ctx.save(); ctx.strokeStyle = '#ffb28b'; ctx.lineWidth = 3; roundedPath(ctx, r.x + 7, r.y + 7, r.w - 14, r.h - 14, 13); ctx.stroke(); ctx.restore(); }
    const label = piece.trait ? `${traitName[piece.trait]} · ${cargoName(piece.cargo)}` : cargoName(piece.cargo);
    text(ctx, label, r.x + r.w / 2, r.y + r.h - 27, piece.trait && r.w < 300 ? 24 : 27, selected ? '#ffe397' : '#e7e9df', 'center');
  });
}

function drawPieceInTray(ctx: Context, piece: Piece, r: Rect, selected: boolean, cargoStyle?: CargoStyleId): void {
  const shape = SHAPES.find(s => s.id === piece.shapeId); if (!shape?.cells.length) return;
  const width = Math.max(...shape.cells.map(p => p.x)) + 1, height = Math.max(...shape.cells.map(p => p.y)) + 1;
  const cell = Math.min(piece.trait ? 104 : 74, Math.min(230, r.w - 54) / width, 166 / height);
  const x = r.x + (r.w - width * cell) / 2, y = r.y + 31 + (166 - height * cell) / 2;
  if (selected) { ctx.fillStyle = 'rgba(241,190,79,.09)'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + 199, Math.min(105, r.w / 2 - 20), 14, 0, 0, Math.PI * 2); ctx.fill(); }
  shape.cells.forEach(p => cargoBox(ctx, piece.cargo, x + p.x * cell, y + p.y * cell, cell - 2, 1, pieceTrait(piece), cargoStyle));
}

function drawFooter(ctx: Context, state: RunState, view: ViewState): void {
  if (state.mode === 'daily') text(ctx, `本地每日 ${state.challengeDay ?? view.dailyLabel ?? '日期待确认'} · 北京时间`, 54, 1840, 21, '#bfbaa8', 'left', 500);
  else if (state.rulesetVersion >= 2 && state.shift >= 3) text(ctx, '托盘1格计2件 · 加急到期变废物 · 规则见暂停', 54, 1840, 21, '#bfbaa8', 'left', 500);
  else text(ctx, '凑够订单 → 空格通路 → 自动出库', 540, 1840, 24, '#bfbaa8', 'center', 500);
  text(ctx, view.saveStatus || '本机存档', 54, 1888, 19, '#8297a6', 'left', 500);
  text(ctx, `规则 v${state.rulesetVersion} · 开发版 / ${state.mode === 'daily' ? '本地每日挑战' : state.mode === 'tutorial' ? '初次入库' : state.overtime ? '加班挑战' : '标准班次'}`, 1027, 1888, 18, '#8297a6', 'right', 500);
  roundedPath(ctx, L.debug.x, L.debug.y, L.debug.w, L.debug.h, 6); ctx.fillStyle = 'rgba(13,23,31,.86)'; ctx.fill();
  text(ctx, '状态', L.debug.x + L.debug.w / 2, L.debug.y + 23, 20, '#9cabaf', 'center');
}

function shade(ctx: Context): void { ctx.fillStyle = 'rgba(5,11,18,.84)'; ctx.fillRect(0, 0, 1080, 1920); }

function drawPause(ctx: Context, recovery: boolean, rulesetVersion: number, error?: string, challengeDay?: string): void {
  shade(ctx); panel(ctx, { x: 173, y: 582, w: 734, h: 839 }, '#30455a', '#9aabaf', 28);
  hazard(ctx, { x: 201, y: 610, w: 678, h: 19 });
  forklift(ctx, 540, 744, 140, -.12);
  outlinedText(ctx, error ? '存档需要处理' : recovery ? '仓库还在等你' : '休息一下', 540, 868, 62, CREAM, 'center');
  text(ctx, error ? '现有存档无法安全继续' : recovery ? challengeDay ? `本地每日 ${challengeDay} · 已保存的挑战` : '已找到本机保存的进度' : '货物与订单都已暂停', 540, 960, 31, '#c6d1d6', 'center', 500);
  text(ctx, error ? '重新开始前会保留损坏存档原文' : recovery ? '继续上次班次，或开始全新一局' : '回来时，继续把仓库整理得井井有条', 540, 1013, 25, '#9bafbf', 'center', 500);
  if (!error && rulesetVersion >= 2) {
    const rules = [
      '托盘占1格计2件；万能可连接当前订单货类',
      '加急：后续有效放置倒数归零，变废弃物',
      '废物占格不出库；危险品出货时清相邻废物',
      '穿托盘不搬走托盘；额外清理不计分',
    ];
    rules.forEach((line, index) => text(ctx, line, 540, 1482 + index * 39, 25, '#d5ddda', 'center', 500));
  }
  if (error) {
    wrap(ctx, error, 246, 1094, 588, 23, 34);
    button(ctx, L.restart, '保留旧档并重新开始');
  } else {
    button(ctx, L.resume, recovery ? '继续上次班次' : '继续工作'); button(ctx, L.restart, '重新开始', false);
  }
}

function wrap(ctx: Context, value: string, x: number, y: number, width: number, fontSize = 27, lineHeight = 43): void {
  let line = '', lineY = y;
  ctx.font = `500 ${fontSize}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
  for (const char of value) {
    if (char === '\n' || ctx.measureText(line + char).width > width) { text(ctx, line, x, lineY, fontSize, '#d5dce1', 'left', 500); line = char === '\n' ? '' : char; lineY += lineHeight; }
    else line += char;
  }
  if (line) text(ctx, line, x, lineY, fontSize, '#d5dce1', 'left', 500);
}

function drawUpgrades(ctx: Context, state: RunState): void {
  shade(ctx); text(ctx, `第 ${state.shift} 班 · 已完成 ${state.completedOrders} 单`, 540, 419, 29, '#b8c9d6', 'center');
  outlinedText(ctx, '选择一项升级', 540, 520, 75, '#ffe5a1', 'center');
  text(ctx, '改变搬运方式，让下一次出库更从容', 540, 593, 29, '#d7dedc', 'center', 500);
  state.upgradeChoices.forEach((id, index) => {
    const upgrade = UPGRADES.find(u => u.id === id), r = L.upgradeRects[index]; if (!upgrade || !r) return;
    const colors = ['#6dbde1', '#b091df', '#efbb5d'];
    panel(ctx, r, ['#1d4c69', '#493462', '#5a472c'][index], colors[index], 21);
    roundedPath(ctx, r.x + 9, r.y + 9, r.w - 18, r.h - 18, 15); ctx.strokeStyle = colors[index]; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, `0${index + 1}`, r.x + 23, r.y + 33, 19, colors[index]);
    text(ctx, upgrade.title, r.x + r.w / 2, r.y + 87, 34, CREAM, 'center', 900);
    ctx.fillStyle = 'rgba(9,21,30,.35)'; roundedPath(ctx, r.x + 29, r.y + 137, r.w - 58, 180, 15); ctx.fill();
    drawUpgradeModifier(ctx, upgrade, r, colors[index]);
    text(ctx, upgrade.behavior ? '规则变化' : '计分 / 补给', r.x + r.w / 2, r.y + 341, 21, colors[index], 'center', 600);
    const description = upgrade.description.replace(/Dock/g, '出货口').replace(/Shift(\d+)/g, '第$1班');
    wrap(ctx, description, r.x + 30, r.y + 377, r.w - 60, 24, 32);
    roundedPath(ctx, r.x + 27, r.y + r.h - 75, r.w - 54, 47, 10); ctx.fillStyle = colors[index]; ctx.fill();
    text(ctx, '选择此项', r.x + r.w / 2, r.y + r.h - 51, 25, '#172737', 'center');
  });
  text(ctx, '选择后立即生效 · 原棋盘继续', 540, 1310, 26, '#aabcc9', 'center', 500);
}

/** Stable effect identity replaces unrelated cargo icons tied to card position. */
function drawUpgradeModifier(ctx: Context, upgrade: Upgrade, r: Rect, color: string): void {
  const labels: Record<string, [string, string]> = {
    overfill: ['+', '超额装载加分'], deep_route: ['远', '长路线加分'], small_parcels: ['小', '小件补给增加'],
    chain: ['×', '连锁倍率增加'], contract: ['+', '订单基础分增加'], variety: ['换', '不同货类连运'],
    side_gate: ['门+', '全订单共用侧门'], pallet_pass: ['通', '穿过托盘不搬走'], small_order_first: ['序', '少量旧单优先'],
    light_orders: ['−', '后续新单减量'], stock_orders: ['库', '库存影响新订单'], four_choices: ['4', '同时四个候选'],
    pallet_supply: ['×2', '定期单格托盘'], rush_buffer: ['+2', '加急期限延长'], hazard_clearance: ['清', '清相邻废弃物'],
    wild_supply: ['*', '增加万能货件'], sweep_route: ['扫', '清理路线旁废物'], extra_pickup: ['捎', '顺路清普通货物'],
  };
  const [mark, label] = labels[upgrade.effect] ?? ['+', upgrade.title];
  const x = r.x + r.w / 2, y = r.y + 211;
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 52, 0, Math.PI * 2); ctx.stroke();
  text(ctx, mark, x, y, 52, '#fff0c8', 'center', 900);
  text(ctx, label, x, r.y + 284, 22, '#d6e1de', 'center', 600);
}

function drawResult(ctx: Context, state: RunState, view: ViewState): void {
  shade(ctx);
  const won = state.result === 'won', tutorial = state.mode === 'tutorial', daily = state.mode === 'daily';
  const retired = state.overtime && state.endReason === 'retired';
  const title = tutorial ? won ? '教学完成！' : '爆仓了！' : retired ? '加班结算' : state.overtime ? '加班结束' : daily ? won ? '今日挑战完成' : '今日挑战结算' : won ? '完美收工！' : '爆仓了！';
  outlinedText(ctx, title, 540, 414, 88, won || retired ? '#fff0bb' : '#ffbd86', 'center');
  const subtitle = tutorial ? '相邻成组、留出通路，清墙还能带来连锁' : retired ? '已主动结束加班，本轮到此结束' : state.overtime ? '这次加班已结束，下次再挑战新纪录' : daily ? `本地每日挑战 · ${state.challengeDay ?? view.dailyLabel ?? '日期待确认'}` : won ? '五个班次全部完成，仓库交给下一班' : `${state.candidates.length === 4 ? '四' : state.candidates.length === 1 ? '一个' : '三'}${state.candidates.length === 1 ? '' : '个'}候选货件都没有合法落点`;
  text(ctx, subtitle, 540, 507, 28, '#d9d9cf', 'center', 500);
  panel(ctx, { x: 174, y: 581, w: 732, h: 496 }, '#415263', '#b2a888', 26);
  roundedPath(ctx, 203, 610, 674, 269, 16); ctx.fillStyle = gradient(ctx, 203, 610, 269, '#f8e9c7', '#decaa4'); ctx.fill();
  text(ctx, tutorial ? '教学得分' : '本局得分', 540, 657, 30, '#5c4936', 'center');
  outlinedText(ctx, number(state.score), 540, 742, 94, '#ffce5b', 'center');
  text(ctx, `最高连锁  ×${state.maxChain}`, 240, 830, 27, '#534332');
  text(ctx, `完成订单  ${state.completedOrders}`, 840, 830, 27, '#534332', 'right');
  const seconds = Math.floor(view.elapsed / 1000), time = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  text(ctx, tutorial ? '已掌握入库与清路' : state.overtime ? '加班挑战' : `到达第 ${state.shift} 班`, 242, 939, 29, '#e7e4d4'); text(ctx, time, 838, 939, 29, '#e7e4d4', 'right');
  const peak=state.maxOccupancy===undefined?'未记录（旧档）':`${Math.round(state.maxOccupancy/49*100)}%（${state.maxOccupancy}/49）`;
  text(ctx, `最高占用  ${peak}`, 240, 992, 25, '#e7e4d4');
  const selected=[...new Set(state.upgrades)].map(id=>UPGRADES.find(upgrade=>upgrade.id===id)?.title??id);
  const keyUpgrades=selected.length?selected.slice(0,3).join(' / ')+(selected.length>3?` 等${selected.length}项`:''):'无';
  text(ctx, `关键升级  ${keyUpgrades}`, 240, 1041, 23, '#d4dcdd', 'left', 500);
  if (tutorial) text(ctx, '练习不计入正式成绩与五班全勤', 540, 1118, 28, '#c1d1d6', 'center', 500);
  else if (daily) text(ctx, '同日同规则固定种子 · 每日挑战不进入加班', 540, 1118, 25, '#c1d1d6', 'center', 500);
  else if (!getUiControls(state, view).some(control => control.action.type === 'continueOvertime')) text(ctx, '下一次，给叉车留一条路', 540, 1118, 29, '#c1d1d6', 'center', 500);
  drawControls(ctx, state, view);
  text(ctx, view.profileStatus || '本地记录', 540, 1588, 24, '#bbcad0', 'center', 500);
  text(ctx, daily ? '北京时间（UTC+08:00）· 客户端日期 · 无在线排行' : '本地记录模式 · 无在线排行', 540, 1643, 23, '#91a4b3', 'center', 500);
}

function drawDebug(ctx: Context, state: RunState, view: ViewState): void {
  const pages=debugPages(state,view),page=(view.debugPage??0)%pages.length;
  panel(ctx, { x: 72, y: 390, w: 936, h: 1310 }, '#0f2634', '#8fa9af');
  text(ctx, `规则 v${state.rulesetVersion} · 开发版`, 112, 445, 31, '#f2d38b');
  text(ctx, `诊断 ${page+1}/${pages.length}`, 960, 445, 28, '#f2d38b', 'right');
  pages[page].forEach((line,i)=>text(ctx,line,112,515+i*40,24,'#c6d1d7','left',500));
  button(ctx, DEBUG_PREVIOUS, '上一页', false);button(ctx, DEBUG_NEXT, '下一页', false);
  text(ctx, '只读诊断 · 点击右下「状态」收起', 540, 1655, 23, '#e9c473', 'center', 500);
}

/** Shared controls are also the only hit regions consumed by Input. */
function drawControls(ctx: Context, state: RunState, view: ViewState): void {
  getUiControls(state, view).forEach((control, index) => drawControl(ctx, control, index === 0 && !['cancel', 'toggleSound'].includes(control.action.type)));
}

function drawControl(ctx: Context, control: UiControl, primary: boolean): void {
  const { rect: r, disabled, selected } = control;
  const warm = !disabled && (primary || selected);
  ctx.save();
  roundedPath(ctx, r.x, r.y + 6, r.w, r.h, 18); ctx.fillStyle = '#08121d'; ctx.fill();
  roundedPath(ctx, r.x, r.y, r.w, r.h, 18);
  ctx.fillStyle = gradient(ctx, r.x, r.y, r.h, disabled ? '#34404c' : warm ? '#ffe184' : '#40576f', disabled ? '#293440' : warm ? '#e7ae46' : '#243b51'); ctx.fill();
  ctx.strokeStyle = disabled ? '#526271' : warm ? '#bd8d38' : '#7890a3'; ctx.lineWidth = 3; ctx.stroke();
  roundedPath(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 13); ctx.strokeStyle = disabled ? '#455565' : warm ? '#fff0ba' : '#526e85'; ctx.lineWidth = 1.5; ctx.stroke();
  if (selected) { roundedPath(ctx, r.x + 12, r.y + 22, 7, r.h - 44, 3); ctx.fillStyle = '#654016'; ctx.fill(); }
  const lines = control.label.split('\n');
  lines.forEach((line, index) => {
    let size = lines.length > 1 ? index ? 22 : 29 : r.w < 420 ? 32 : 36;
    ctx.font = `800 ${size}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const measured = ctx.measureText(line).width;
    if (measured > r.w - 48) size *= (r.w - 48) / measured;
    text(ctx, line, r.x + r.w / 2, r.y + r.h / 2 + (index - (lines.length - 1) / 2) * 34, size, disabled ? '#a2b1be' : warm ? '#49361b' : CREAM, 'center', index ? 500 : 800);
  });
  ctx.restore();
}

function drawMenu(ctx: Context, state: RunState, view: ViewState): void {
  text(ctx, 'WAREHOUSE  /  LAST SLOT', 540, 120, 22, '#b7b098', 'center', 600);
  outlinedText(ctx, '爆仓', 540, 267, 151, CREAM, 'center');
  outlinedText(ctx, '最后一格', 540, 387, 79, '#ffe3a3', 'center');
  hazard(ctx, { x: 314, y: 448, w: 452, h: 14 });
  ctx.fillStyle = 'rgba(255,230,159,.07)'; ctx.beginPath(); ctx.ellipse(540, 553, 180, 33, 0, 0, Math.PI * 2); ctx.fill();
  forklift(ctx, 540, 523, 140, -.12, view.profile?.cosmetics.forklift);
  panel(ctx, { x: 180, y: 610, w: 720, h: 195 }, '#304758', '#849792', 20);
  const best = view.profile?.bestScores[`standard.v${state.rulesetVersion}`];
  text(ctx, `标准最高分 · v${state.rulesetVersion}`, 222, 653, 25, '#a9c0c9', 'left', 500);
  text(ctx, number(best?.score ?? 0), 222, 720, 48, '#ffe29c', 'left', 900);
  text(ctx, '最高连锁', 850, 653, 25, '#a9c0c9', 'right', 500);
  text(ctx, `×${view.profile?.stats.maxChain ?? 0}`, 850, 720, 48, '#cce8ce', 'right', 900);
  text(ctx, `加班最高分 · ${number(view.profile?.bestScores[`overtime.v${state.rulesetVersion}`]?.score ?? 0)}`, 540, 774, 23, '#a9c0c9', 'center', 500);
  drawControls(ctx, state, view);
  text(ctx, `${view.dailyLabel ?? '日期待确认'} · 北京时间（UTC+08:00）`, 540, 1460, 27, '#d1dccf', 'center', 500);
  text(ctx, '本地每日挑战 · 同日同规则固定种子 · 无在线排行', 540, 1513, 23, '#9bafbd', 'center', 500);
  const unlocked = ACHIEVEMENTS.filter(item => view.profile?.achievements.includes(item.id));
  text(ctx, `成就 ${unlocked.length} / ${ACHIEVEMENTS.length}`, 540, 1610, 24, '#ecc778', 'center', 600);
  text(ctx, unlocked.length ? unlocked.slice(0, 2).map(item => item.name).join('  ·  ') : '首次正式出货，解锁蓝色叉车', 540, 1660, 26, '#c4d2d6', 'center', 500);
  text(ctx, view.profileStatus || '长期记录保存在本机', 540, 1777, 23, '#9db0bc', 'center', 500);
  text(ctx, '纯外观解锁 · 没有永久战力', 540, 1845, 22, '#7f95a6', 'center', 500);
}

function drawSettings(ctx: Context, state: RunState, view: ViewState): void {
  outlinedText(ctx, '设置与外观', 540, 157, 71, CREAM, 'center');
  text(ctx, '按自己的节奏值班', 540, 237, 28, '#b1c4cf', 'center', 500);
  text(ctx, '游玩设置', 133, 312, 25, '#e0c18a', 'left', 600);
  text(ctx, '简化出库动画，仍保留结果与路径提示', 540, 638, 24, '#a6bdca', 'center', 500);
  text(ctx, '仓库主题', 133, 686, 27, '#e0c18a', 'left', 600);
  text(ctx, '叉车涂装', 133, 891, 27, '#e0c18a', 'left', 600);
  FORKLIFTS.forEach((item, index) => {
    const x = 262 + index * 278;
    forklift(ctx, x, 939, 71, 0, item.id as ForkliftId);
  });
  text(ctx, '货箱样式', 133, 1142, 27, '#e0c18a', 'left', 600);
  cargoBox(ctx, 'cargo.food', 306, 1158, 55, 1, undefined, 'classic');
  cargoBox(ctx, 'cargo.food', 724, 1158, 55, 1, undefined, 'outline');
  drawControls(ctx, state, view);
  text(ctx, '外观不改变订单、随机序列与得分规则', 540, 1374, 24, '#a8bbc6', 'center', 500);
  wrap(ctx, view.profileStatus || '长期记录保存在本机', 153, 1431, 774, 23, 30);
}

function drawActivePause(ctx: Context, state: RunState, view: ViewState): void {
  shade(ctx);
  const overtime = !!state.overtime;
  panel(ctx, { x: 173, y: 395, w: 734, h: overtime ? 1310 : 1160 }, '#30455a', '#95a9b1', 28);
  hazard(ctx, { x: 201, y: 423, w: 678, h: 18 });
  forklift(ctx, 540, 551, 137, -.12, view.profile?.cosmetics.forklift);
  outlinedText(ctx, overtime ? '加班休息中' : '休息一下', 540, 674, 68, CREAM, 'center');
  text(ctx, '货物与订单都已暂停', 540, 761, 29, '#c6d1d6', 'center', 500);
  const rules = state.rulesetVersion >= 2 ? [
    '托盘占1格计2件；万能可连接当前订单货类',
    '加急：后续有效放置倒数归零，变废弃物',
    '废物占格不出库；危险品出货时清相邻废物',
    '穿托盘不搬走托盘；额外清理不计分',
  ] : ['同类货物相邻成组，达到订单数量', '从出货口留出空格通路，叉车自动搬运'];
  rules.forEach((line, index) => text(ctx, line, 540, 850 + index * 42, 24, '#b7cbd4', 'center', 500));
  drawControls(ctx, state, view);
  text(ctx, view.saveStatus || '当前值班保留在本机', 540, overtime ? 1774 : 1630, 24, '#a3bac8', 'center', 500);
}

function drawConfirmation(ctx: Context, state: RunState, view: ViewState): void {
  shade(ctx);
  panel(ctx, { x: 140, y: 595, w: 800, h: 765 }, '#344859', '#c5b98f', 28);
  hazard(ctx, { x: 170, y: 627, w: 740, h: 16 });
  const kind = view.confirmation?.kind;
  const title = kind === 'resetProfile' ? '重置长期记录？' : kind === 'finishOvertime' ? '结束这次加班？' : '开始新的值班？';
  outlinedText(ctx, title, 540, 750, 59, CREAM, 'center');
  const lines = kind === 'resetProfile' ? ['设置、外观和本地成绩将恢复初始状态。', '当前值班仍会保留。', '当前局之后的结算会计入新记录。']
    : kind === 'finishOvertime' ? ['将按当前分数结算这次加班。', '结算后不能继续本次加班。', '取消可回到原来的仓库。']
      : ['新局会替换尚未完成的当前值班。', view.confirmation?.mode === 'daily' ? '开始今日的本地固定种子挑战。' : '开始一轮全新的标准五班挑战。', '取消会完整保留当前进度。'];
  lines.forEach((line, index) => text(ctx, line, 540, 897 + index * 63, 29, '#d1dde1', 'center', 500));
  drawControls(ctx, state, view);
}
