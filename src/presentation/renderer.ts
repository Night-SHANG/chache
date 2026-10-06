import {buildOutboundTransport,sampleOutboundTransport} from './outbound-transport.ts';
import {outboundGroupCargoPose} from './outbound-transport-view.ts';
import {boardGeometry} from './board-geometry.ts';
import { ACHIEVEMENTS, FORKLIFTS, getColorExitProfile, getEndlessProfile, getOutboundProfile } from '../application/profile.ts';
import type { CargoStyleId, ForkliftId } from '../application/profile.ts';
import {debugPages,DEBUG_PREVIOUS,DEBUG_NEXT} from './debug-layout.ts';
import { LEGACY_SLOTS, OUTBOUND_DIFFICULTY_NAMES, colorTierLabel, outboundDifficultyLabel, getUiControls, hasLegacyRun, runSlotLabel } from './ui.ts';
import type { UiControl } from './ui.ts';
import { OUTBOUND_DIFFICULTIES } from '../domain/v6/content.ts';
import { tierForSlot } from '../application/run-slots.ts';
import { pieceCellCargo } from '../domain/pieces.ts';
import { pieceCaption } from './mixed-piece-feedback.ts';
import { CARGO, DOCKS, SHAPES, UPGRADES, RULES_V4_CONFIG } from '../domain/content.ts';
import { colorExitCargoPose } from './color-exit-motion.ts';
import {drawColorExitCards,colorExitBoardHint,drawColorExitGates,drawColorExitRoutes,drawColorExitShipment,drawColorExitHelpDiagram,drawMixedRemainder} from './color-exit-renderer.ts';
import {growthFeedback} from './growth-feedback.ts';
import {ITEM_NAMES,ITEM_PRICES,resultEarnedCoins} from './economy-ui.ts';
import {UPGRADES_V9} from '../domain/v9/content.ts';
import {chooseUpgradeV9} from '../domain/v9/upgrades.ts';
import {generationDistributionV9} from '../domain/v9/generation.ts';
import {pieceCellsV9} from '../domain/v9/board.ts';
import {isInboundV9,isOutboundEndlessV10} from '../domain/playable.ts';
import type {GameRun,GameShipment} from '../domain/playable.ts';
import type {PieceV9} from '../domain/v9/types.ts';

import type {GeometrySource} from './board-geometry.ts';
import {drawGuide} from './tutorial-view.ts';
import { boardHint, orderFeedback } from './order-feedback.ts';
import type { CargoId, Cell, CellTrait, Dock, Piece, Point, RunState, Shipment, Upgrade } from '../domain/types.ts';
import { L, cellCenter, getTrayRects } from './layout.ts';
import { chainFeedback, collectPose, dockPosition, feedbackParticles, placementPose, reboundOffset, shipmentPose, shipmentGate, shipmentFrame } from './motion.ts';
import type { Rect } from './layout.ts';
import type { ViewState } from './view-types.ts';
import { CREAM, MUTED, PALETTE, arrow, button, cargoBox, forklift, gradient, hazard, icon, outlinedText, panel, rivet, roundedPath, text } from './assets.ts';

type Context = CanvasRenderingContext2D;
const cargoName = (id: CargoId): string => CARGO.find(c => c.id === id)?.name ?? '货物';
const number = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const traitName = { pallet: '托盘', rush: '加急', hazard: '危险', wildcard: '万能' } as const;
const pieceTrait = (piece: Piece): CellTrait | undefined => piece.trait ? { kind: piece.trait, remaining: piece.rushTurns } : undefined;
const outboundLabel = (state:GameRun):string => ('difficultyId' in state?state.difficultyId:undefined) ? `出库 · ${outboundDifficultyLabel(('difficultyId' in state?state.difficultyId:undefined)!)}` : ('colorTier' in state?state.colorTier:undefined) ? `出库 · ${colorTierLabel(('colorTier' in state?state.colorTier:undefined)!)}` : '出库模式';
const persistenceWarnings = (view:ViewState):string[] => [...new Set([view.saveStatus,view.profileStatus].filter((value):value is string=>!!value&&/失败|无法|不可用|未写入|未保存|尚未|异常|损坏|请先|需先|已保护/.test(value)))];
function drawPersistenceWarnings(ctx:Context,view:ViewState,y:number,x=540,width=880):void {
  persistenceWarnings(view).forEach((warning,index)=>wrap(ctx,warning,x-width/2,y+index*55,width,22,28));
}

/** Stateless shared renderer: platform scales this 1080 × 1920 composition. */
export function render(ctx: Context, state: GameRun, view: ViewState): void {
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, L.width, L.height);
  drawWarehouse(ctx, view);
  if(view.accountBlocked){drawFlow(ctx,state,view,view.readOnlyReason?'只读模式':'保存结果尚未确认',view.readOnlyReason??'已有棋盘、金币和库存保持上次确认状态。');ctx.restore();return;}
  if (view.confirmation) { drawConfirmation(ctx, state, view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'menu') { drawMenu(ctx, state, view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'inboundMenu') { drawInboundMenu(ctx,state,view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'colorTiers') { drawColorTierSelection(ctx,state,view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'legacyRuns') { drawLegacyRuns(ctx,state,view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'settings') { drawSettings(ctx, state, view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'colorIntro') { drawHelp(ctx,state,view); ctx.restore(); return; }
  if (!view.needsResume && view.screen === 'helpDetails') { drawHelpDetails(ctx,state,view); ctx.restore(); return; }
  if(['shop','prepareTools','prepareCleanup','guideOffer'].includes(view.screen??'')){drawEconomyFlow(ctx,state,view);ctx.restore();return;}
  drawHeader(ctx, state, view);
  const shown=view.toolSelection?.preview??state;
  const board = view.animation?.board ?? shown.board;
  // Never mix an intermediate board with already-expired or cleared final traits.
  const cellTraits = view.animation ? view.animation.cellTraits : state.cellTraits;
  if(state.mode==='color_exit')drawColorExitCards(ctx,state,view);else drawOrders(ctx, state, view);
  drawBoard(ctx, state, view, board, cellTraits);
  drawTrays(ctx, shown, view);
  drawFooter(ctx, state, view);
  if (view.developerMode === true && view.debug) drawDebug(ctx, state, view);
  if (view.needsResume) drawRecovery(ctx,state,view);
  else if (view.paused && state.phase!=='result') drawActivePause(ctx, state, view);
  else if(view.toolSelection)drawToolSelection(ctx,state,view);
  else if(view.supplyUpgrade)drawFlow(ctx,state,view,'选择专供货类','');
  else if(isInboundV9(state)&&state.phase==='cleanup'&&!view.animation)drawFlow(ctx,state,view,'选择清扫方式','本局只能选择一种，空触发不会积存。');
  else if(isInboundV9(state)&&state.phase==='upgrade'&&!view.animation)drawGrowthUpgrades(ctx,state,view);
  else if (state.phase === 'upgrade' && !view.animation&&!isOutboundEndlessV10(state)&&!isInboundV9(state)) drawUpgrades(ctx, state);
  else if (state.phase === 'result' && !view.animation && view.noticeFx?.kind !== 'fail') drawResult(ctx, state, view);
  if (!view.paused && !view.needsResume && view.noticeFx) drawNotice(ctx, view);
  if (!view.paused && !view.needsResume && ['input','rescue'].includes(state.phase) && !view.animation&&!view.toolSelection&&!view.supplyUpgrade) drawControls(ctx,state,view);
  if(isInboundV9(state))drawGrowthFeedback(ctx,state,view);
  if(isInboundV9(state)&&state.phase==='rescue'&&!view.toolSelection&&!view.paused&&!view.needsResume&&!view.animation)text(ctx,'当前放不下，选择剩余工具救场，或结束并结算。',540,1468,25,'#ffe3a3','center');
  if(view.guide&&state.phase==='input'&&!view.animation&&!view.paused&&!view.needsResume&&!view.toolSelection&&!view.supplyUpgrade)drawGuide(ctx,state,view);
  if(view.growthFx&&!view.animation)text(ctx,view.growthFx.label,540,1468,27,'#ffe3a3','center');
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

function drawHeader(ctx: Context, state: GameRun, view: ViewState): void {
  text(ctx, 'WAREHOUSE  /  LAST SLOT', 58, 35, 16, '#b6aa90', 'left', 600);
  outlinedText(ctx, '爆仓', 49, 112, 115);
  outlinedText(ctx, '最后一格', 63, 206, 57);
  hazard(ctx, { x: 55, y: 249, w: 425, h: 15 });
  forklift(ctx, 427, 177, 88, -.12, view.profile?.cosmetics.forklift);
  panel(ctx, { x: 548, y: 54, w: 363, h: 151 });
  text(ctx, ('difficultyId' in state?state.difficultyId:undefined) ? outboundDifficultyLabel(('difficultyId' in state?state.difficultyId:undefined)!) : ('colorTier' in state?state.colorTier:undefined) ? colorTierLabel(('colorTier' in state?state.colorTier:undefined)!) : '当前分数', 577, 89, ('colorTier' in state?state.colorTier:undefined) || ('difficultyId' in state?state.difficultyId:undefined) ? 23 : 25, MUTED);
  text(ctx, number(state.score), 878, 151, 56, '#ffe087', 'right', 900);
  panel(ctx, L.pause, '#40536b');
  ctx.fillStyle = CREAM; roundedPath(ctx, 966, 80, 12, 47, 4); ctx.fill(); roundedPath(ctx, 989, 80, 12, 47, 4); ctx.fill();
  text(ctx, '连锁', L.chain.x, L.chain.y + 21, 20, MUTED);
  text(ctx, `×${state.lastChain}`, L.chain.x + L.chain.w, L.chain.y + 21, 28, '#f7cc67', 'right');
  panel(ctx, { x: 548, y: 226, w: 486, h: 70 }, '#25394c', '#53687a', 13);
  text(ctx, state.mode==='color_exit'?`阶段 ${state.shift}/5`:state.mode==='endless'?`阶段 ${state.shift}/5`:state.overtime ? '加班挑战' : `第 ${state.shift} 班`, 573, 261, 28, '#e4f1f1');
  const progress = Math.min(6, state.completedOrders - (state.shift - 1) * 6);
  for (let i = 0; i < 5; i++) {
    const x = 735 + i * 57;
    if (i < 4) { ctx.fillStyle = i < state.shift - 1 ? '#d3aa4f' : '#465563'; ctx.fillRect(x, 257, 55, 5); }
    ctx.fillStyle = i < state.shift ? '#ffc958' : '#243240'; ctx.strokeStyle = '#7f90a1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, 260, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    text(ctx, String(i + 1), x, 260, 15, i < state.shift ? '#48321d' : '#8d9ba7', 'center');
  }
  text(ctx, state.mode==='color_exit'?'出货批次':state.mode==='endless'?'完成订单':'本班订单', 57, 291, 22, MUTED);
  for (let i = 0; state.mode!=='endless' && i < 6; i++) { roundedPath(ctx, 180 + i * 43, 281, 35, 16, 4); ctx.fillStyle = i < progress ? '#ffc74d' : '#111c27'; ctx.fill(); }
  text(ctx, state.mode==='color_exit'?state.rulesetVersion===10?`${state.completedOrders} 批`:`${state.completedOrders}/30 批`:state.mode==='endless'?`${state.completedOrders} 单`:`${Math.max(0, progress)} / 6`, 474, 289, 23, CREAM, 'right');
}

function drawOrders(ctx: Context, state: GameRun, view: ViewState): void {
  text(ctx, '出库订单', 56, 330, 26, CREAM);
  const w = (972 - (state.orders.length - 1) * 16) / Math.max(1, state.orders.length);
  state.orders.forEach((order, i) => {
    const x = 54 + i * (w + 16), y = 357;
    const feedback = orderFeedback(state, order, view), { status, shipping, previewShipment } = feedback;
    const cargo = shipping?.cargo ?? order.cargo;
    const p = PALETTE[cargo], ready = !!shipping || !!previewShipment || status.status === 'ready';
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
    const stage = shipping && view.animation ? shipmentFrame(view.animation.progress, !!view.profile?.settings.reducedMotion).stage : null;
    const label = shipping ? `${stage === 'exit' ? '正在离场' : stage === 'carry' ? '载货倒车中' : stage === 'collect' ? '装载中' : '叉车接货中'} · +${shipping.score}` : feedback.label;
    text(ctx, label, x + 35, y + 108, state.orders.length > 3 ? 17 : 21, statusColor, 'left', 600);
  });
}

function drawBoard(ctx: Context, state: GameRun, view: ViewState, board: Cell[], cellTraits?: (CellTrait | null)[]): void {
  const geometry=boardGeometry(state), {x,y,size,cell,dimension,scale,boxSize}=geometry;
  const lesson = tutorialStep(state), delivery = view.animation && (view.profile?.settings.reducedMotion || shipmentFrame(view.animation.progress, false).stage === 'exit');
  const lessonHint = !view.animation && lesson !== null ? ['把食品拖进虚线框。', '再接上1件食品，凑够订单。', '补上机械，清路后继续出货。'][lesson] : null;
  if(view.animation&&state.mode==='color_exit'&&view.animation.shipment.chain>1)text(ctx,`${view.animation.shipment.chain}连出货`,540,L.boardHint.y+L.boardHint.h/2,28,'#ffdf75','center',900);
  else if (!delivery&&!view.guide) text(ctx, (view.placementRisk?(view.developerMode===true?view.placementRisk.message:view.placementRisk.kind==='entry-blocked'?'入口堵塞':'通路将被切断'):undefined)??(state.mode==='color_exit'?colorExitBoardHint(state,view):lessonHint ?? boardHint(state, view)), 540, L.boardHint.y + L.boardHint.h / 2, 22, view.placementRisk?'#ff967a':'#d9d0b7', 'center', 600);
  panel(ctx, { x: x - 26, y: y - 24, w: size + 52, h: size + 54 }, '#56616a', '#829098', 12);
  hazard(ctx, { x: x - 13, y: y - 13, w: size + 26, h: 14 });
  hazard(ctx, { x: x - 13, y: y + size - 1, w: size + 26, h: 14 });
  hazard(ctx, { x: x - 13, y, w: 14, h: size }, true); hazard(ctx, { x: x + size - 1, y, w: 14, h: size }, true);
  ctx.fillStyle = '#453e34'; ctx.fillRect(x, y, size, size);
  for (let row = 0; row < dimension; row++) for (let col = 0; col < dimension; col++) {
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
  if(state.mode==='color_exit')drawColorExitGates(ctx,state,view);
  else {
    state.orders.forEach(order => {
      const dock = boardGeometry(state).docks.find(d => d.id === order.dockId), shipping = view.animation?.shipment;
      if (dock) drawGate(ctx, dock, shipping?.dockId === order.dockId ? shipping.cargo : order.cargo,state);
    });
    const finalShipment = view.animation?.shipment;
    if (finalShipment && !state.orders.some(order => order.dockId === finalShipment.dockId)) {
      const dock = boardGeometry(state).docks.find(d => d.id === finalShipment.dockId);if (dock) drawGate(ctx, dock, finalShipment.cargo,state);
    }
    if (isInboundV9(state)?state.levels.side_gate>0:'upgrades' in state&&state.upgrades.includes('upgrade.side_gate')) drawSideGate(ctx,state);
    if (view.preview?.valid) view.preview.shipments.forEach(s => drawRoute(ctx, s.path, false,1,state));
  }
  const shipment = view.animation?.shipment, reduced = !!view.profile?.settings.reducedMotion;
  const frame = view.animation ? shipmentFrame(view.animation.progress, reduced) : null;
  if (shipment && frame && !('transport' in shipment&&shipment.transport==='conveyor')) drawRoute(ctx, shipment.path, true, reduced ? 1 : .25 + frame.route * .75,state);
  const transport = shipment && frame ? shipmentPose(shipment, frame) : null;
  const conveyor = !!shipment&&'transport' in shipment&&shipment.transport==='conveyor';
  const outboundPlan=conveyor&&!reduced&&shipment?(view.animation?.transportPlan??buildOutboundTransport(shipment as Shipment,board)):null;
  const outboundFrame=outboundPlan&&view.animation?sampleOutboundTransport(outboundPlan,view.animation.progress):null;
  const loaded = !!shipment && !conveyor && !reduced && (frame?.stage === 'carry' || frame?.stage === 'exit');
  const collecting = shipment && !conveyor && frame?.stage === 'collect' && !reduced;
  const drawCargo = (cargo: CargoId, index: number): void => {
    const source = { x: x + index % dimension * cell + cell/2, y: y + Math.floor(index / dimension) * cell + cell/2-scale };
    const isShipment = shipment?.cells.includes(index), extra = (shipment&&'extraClearedCells' in shipment&&shipment.extraClearedCells?.includes(index));
    const flowPose = conveyor && isShipment && shipment && frame ? outboundFrame?outboundGroupCargoPose(shipment as Shipment,index,outboundFrame):reduced?colorExitCargoPose(shipment as Shipment,index,frame):{...source,scale:1,alpha:1} : null;
    const pose = flowPose ?? (collecting && isShipment && transport ? collectPose(source, transport.cargo, frame!.collect, false) : { ...source, scale: 1 });
    const placed = view.placementFx?.cells.includes(index) ? placementPose(view.placementFx.progress, reduced) : { x: 1, y: 1 };
    const failure = view.noticeFx?.kind === 'fail' ? placementPose(view.noticeFx.progress, reduced) : { x: 1, y: 1 };
    // Extra clears are unscored cleanup, so they disappear in place instead of flying to a Dock.
    const cleanupScale = collecting && extra ? 1 - frame!.collect * .9 : 1;
    ctx.save();
    if(conveyor&&isShipment){ctx.beginPath();ctx.rect(x-30,y-30,size+60,size+60);ctx.clip();}
    ctx.translate(pose.x, pose.y);
    ctx.scale(pose.scale * cleanupScale * placed.x * failure.x, pose.scale * cleanupScale * placed.y * failure.y);
    cargoBox(ctx, cargo, -boxSize/2, -boxSize/2, boxSize, flowPose?.alpha ?? (collecting && extra ? 1 - frame!.collect : 1), cellTraits?.[index], view.profile?.cosmetics.cargo);
    ctx.restore();
  };
  board.forEach((cargo, index) => {
    if (!cargo || loaded && (shipment?.cells.includes(index) || (shipment&&'extraClearedCells' in shipment&&shipment.extraClearedCells?.includes(index)))) return;
    if (!(collecting && shipment?.cells.includes(index))) drawCargo(cargo, index);
  });
  // The selected group gathers at the fork; the carried pallet replaces it only after loading.
  if (collecting) shipment?.cells.forEach(index => { const cargo = board[index]; if (cargo) drawCargo(cargo, index); });
  if(state.mode==='color_exit')drawColorExitRoutes(ctx,view);else drawChosenGroups(ctx, view,state);
  drawExtraClears(ctx, view,state);
  drawPlacementFeedback(ctx, view,state);
  drawPlacement(ctx, state, view);
  if(view.placementRisk&&!view.animation){ctx.save();ctx.strokeStyle='#ff7959';ctx.lineWidth=4;for(const index of view.placementRisk.cells){if(index>=0&&index<dimension*dimension)ctx.strokeRect(x+index%dimension*cell+4*scale,y+Math.floor(index/dimension)*cell+4*scale,cell-8*scale,cell-8*scale);}ctx.restore();}
  if(state.rulesetVersion===5||state.rulesetVersion===6||state.rulesetVersion===8||state.rulesetVersion===10)drawMixedRemainder(ctx,state,view);
  if (view.animation) {if(conveyor)drawColorExitShipment(ctx,view.animation.shipment as Shipment,view.animation.progress,view);else drawShipment(ctx, view.animation.shipment, view.animation.progress, view);}
}

/** Optional teaching overlay only; no commands or occupancy are changed. */
function tutorialStep(state: GameRun): 0 | 1 | 2 | null {
  if (state.rulesetVersion === 3 && state.mode === 'tutorial' && state.phase === 'input') return state.tutorialStep === 0 || state.tutorialStep === 1 || state.tutorialStep === 2 ? state.tutorialStep : null;
  if (state.mode !== 'tutorial' || state.phase !== 'input' || state.completedOrders > 0) return null;
  if (state.commandIndex === 0) return 0;
  if (state.commandIndex === 1 && state.board[8] === 'cargo.food' && state.board[9] === 'cargo.food' && state.board[10] === null
    && state.candidates[1]?.cargo === 'cargo.food' && state.candidates[1]?.shapeId === 'shape.single') return 1;
  return null;
}

function drawTutorialTarget(ctx: Context, state: GameRun, view: ViewState): void {
  const step = tutorialStep(state); if (step === null || view.animation || view.dragPoint) return;
  const x = L.board.x + (step === 0 ? 1 : 3) * L.board.cell + 10, y = L.board.y + (step === 2 ? 4 : 1) * L.board.cell + 10;
  const w = (step === 0 ? 2 : 1) * L.board.cell - 20;
  ctx.save(); roundedPath(ctx, x, y, w, 100, 10); ctx.fillStyle = 'rgba(255,225,126,.10)'; ctx.fill();
  ctx.strokeStyle = '#ffe58d'; ctx.lineWidth = 4; ctx.setLineDash([11, 9]); ctx.stroke(); ctx.setLineDash([]);
  text(ctx, step === 0 ? '食品 ×2' : step === 1 ? '食品 ×1' : '机械 ×1', x + w / 2, y + 50, 24, '#fff1bd', 'center'); ctx.restore();
}

function drawGate(ctx: Context, dock: Dock, cargo: CargoId,source?:GeometrySource): void {
  const side = dock.side;
  const angle = side === 'north' ? Math.PI / 2 : side === 'south' ? -Math.PI / 2 : side === 'west' ? 0 : Math.PI;
  const { x: gx, y: gy } = dockPosition(dock,source);
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(angle);
  panel(ctx, { x: -25, y: -40, w: 43, h: 80 }, '#172735', '#ddbc65', 6);
  ctx.fillStyle = PALETTE[cargo].mid; roundedPath(ctx, -20, -31, 31, 62, 4); ctx.fill();
  arrow(ctx, -1, 0, 28, 0, '#fff7cf');
  ctx.restore();
}

function drawSideGate(ctx: Context,state:GameRun): void {
  const p = cellCenter({ x: 0, y: boardGeometry(state).dimension-1 },state);
  panel(ctx, { x: 68, y: p.y - 35, w: 48, h: 70 }, '#30493b', '#c4e298', 6);
  arrow(ctx, 94, p.y, 31, 0, '#e8ffbf');
  text(ctx, '侧门', 89, p.y - 55, 21, '#e8ffbf', 'center');
  text(ctx, '全订单', 80, p.y + 57, 16, '#d4e6bb', 'center', 600);
}

function drawRoute(ctx: Context, route: Point[], active: boolean, opacity = 1,source?:GeometrySource): void {
  if (!route.length) return;
  ctx.save(); ctx.globalAlpha *= opacity; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = (): void => { ctx.beginPath(); route.forEach((p, i) => { const c = cellCenter(p,source); if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); }); };
  if (route.length > 1) {
    path(); ctx.strokeStyle = active ? 'rgba(255,210,72,.28)' : 'rgba(94,237,200,.20)'; ctx.lineWidth = active ? 32 : 22; ctx.stroke();
    path(); ctx.setLineDash(active ? [] : [13, 12]); ctx.strokeStyle = active ? '#fff1a2' : '#b4fff0'; ctx.lineWidth = active ? 10 : 6; ctx.stroke(); ctx.setLineDash([]);
  }
  for (let i = 0; i < route.length; i++) {
    const c = cellCenter(route[i],source);
    if (i < route.length - 1) arrow(ctx, c.x, c.y, 25, Math.atan2(route[i + 1].y - route[i].y, route[i + 1].x - route[i].x), active ? '#fff5b6' : '#bafcec');
    else { ctx.strokeStyle = active ? '#fff4b0' : '#b4fff0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(c.x, c.y, 17, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

/** Highlight the exact Domain-selected cells, including canonical tie-breaks. */
function drawChosenGroups(ctx: Context, view: ViewState,state:GameRun): void {
  const reducedShipment = view.animation && view.profile?.settings.reducedMotion ? view.animation.shipment : null;
  if (!reducedShipment && (!view.preview?.valid || view.animation)) return;
  const geometry=boardGeometry(state);
  const cells = new Set(reducedShipment?.cells ?? (view.preview?.valid ? view.preview.shipments.flatMap(shipment => shipment.cells) : []));
  ctx.save(); ctx.strokeStyle = '#cbffde'; ctx.lineWidth = 4; ctx.fillStyle = 'rgba(179,255,207,.15)';
  for (const index of cells) {
    const x = L.board.x + index % geometry.dimension * geometry.cell + 4, y = L.board.y + Math.floor(index / geometry.dimension) * geometry.cell + 4;
    ctx.fillRect(x, y, geometry.cell-8, geometry.cell-8); ctx.strokeRect(x, y, geometry.cell-8, geometry.cell-8);
  }
  ctx.restore();
}

function drawExtraClears(ctx: Context, view: ViewState,state:GameRun): void {
  const shipments = view.animation ? [view.animation.shipment] : view.preview?.valid ? view.preview.shipments : [];
  const geometry=boardGeometry(state);
  const cells = new Set(shipments.flatMap(shipping => ('extraClearedCells' in shipping?shipping.extraClearedCells:undefined) ?? []));
  ctx.save(); ctx.strokeStyle = '#ffc893'; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
  for (const index of cells) {
    const x = L.board.x + index % geometry.dimension * geometry.cell + 9, y = L.board.y + Math.floor(index / geometry.dimension) * geometry.cell + 9;
    ctx.strokeRect(x, y, geometry.cell-18, geometry.cell-18);
  }
  ctx.setLineDash([]); ctx.restore();
}

function drawPlacement(ctx: Context, state: GameRun, view: ViewState): void {
  const {dimension,cell,boxSize,scale}=boardGeometry(state);
  const piece = state.candidates.find(p => p.id === view.selectedPieceId);
  if (!piece) return;
  if (view.hoverOrigin) {
    const shape = {cells:'quarterTurns' in piece?pieceCellsV9(piece as PieceV9):SHAPES.find(s=>s.id===piece.shapeId)?.cells??[]};
    shape?.cells.forEach((p, index) => {
      const cx = p.x + view.hoverOrigin!.x, cy = p.y + view.hoverOrigin!.y;
      if (cx < 0 || cy < 0 || cx >=dimension || cy >=dimension) return;
      const x = L.board.x + cx * cell + 4*scale, y = L.board.y + cy * cell + 4*scale;
      const valid = view.preview?.valid&&!view.placementRisk;
      ctx.fillStyle = valid ? 'rgba(223,239,144,.32)' : 'rgba(231,69,48,.30)'; ctx.fillRect(x, y, 112*scale, 112*scale);
      ctx.strokeStyle = valid ? '#f3f6b1' : '#ff7959'; ctx.lineWidth = 5; ctx.strokeRect(x + 2*scale, y + 2*scale, 108*scale, 108*scale);
      if (state.rulesetVersion===5 || state.rulesetVersion===6 || state.rulesetVersion===8 || piece.trait && !view.dragPoint) cargoBox(ctx, pieceCellCargo(piece,index), x + scale, y, boxSize, .7, pieceTrait(piece), view.profile?.cosmetics.cargo);
    });
  }
  if (view.dragPoint) {
    const shape = {cells:'quarterTurns' in piece?pieceCellsV9(piece as PieceV9):SHAPES.find(s=>s.id===piece.shapeId)?.cells??[]}; if (!shape) return;
    ctx.save(); ctx.globalAlpha = .8;
    shape.cells.forEach((p,index) => cargoBox(ctx, pieceCellCargo(piece,index), view.dragPoint!.x + p.x * cell - boxSize/2, view.dragPoint!.y + p.y * cell - boxSize/2, boxSize, 1, pieceTrait(piece), view.profile?.cosmetics.cargo)); ctx.restore();
  }
}

function drawPlacementFeedback(ctx: Context, view: ViewState,state:GameRun): void {
  const {dimension,cell,scale}=boardGeometry(state);
  const effect = view.placementFx; if (!effect) return;
  const reduced = !!view.profile?.settings.reducedMotion;
  ctx.save(); ctx.globalAlpha = reduced ? 1 : Math.max(0, 1 - effect.progress);
  ctx.strokeStyle = '#fff2ae'; ctx.lineWidth = 4;
  for (const index of effect.cells) {
    if (index < 0 || index >= dimension*dimension) continue;
    ctx.strokeRect(L.board.x + index % dimension * cell + 4*scale, L.board.y + Math.floor(index / dimension) * cell + 4*scale, 112*scale, 112*scale);
  }
  ctx.restore();
}

function drawShipment(ctx: Context, shipment: GameShipment, progress: number, view: ViewState): void {
  const reduced = !!view.profile?.settings.reducedMotion, frame = shipmentFrame(progress, reduced);
  const feedback = chainFeedback(shipment.chain), pose = shipmentPose(shipment, frame);
  const dock = boardGeometry(shipment).docks.find(d => d.id === shipment.dockId), target = dock ? dockPosition(dock,shipment) : null;
  if (pose) {
    // The doorway occludes vehicles outside the warehouse, never the order or tray UI.
    ctx.save(); ctx.beginPath(); ctx.rect(L.board.x - 30, L.board.y - 30, L.board.size + 60, L.board.size + 60); ctx.clip();
    if (frame.stage === 'move' || frame.stage === 'carry') drawParticles(ctx, feedbackParticles(pose, shipment.chain, frame.stage === 'move' ? frame.move : frame.carry, 'move', reduced), '#c9baa0');
    ctx.globalAlpha *= reduced ? 1 : pose.alpha;
    forklift(ctx, pose.x, pose.y, 99, pose.angle, view.profile?.cosmetics.forklift);
    if (!reduced && pose.loaded) {
      const cargo = pose.cargo;
      // A stylized batch on the forks, not a new physical body or a gameplay cell.
      ctx.fillStyle = '#af8750'; ctx.strokeStyle = '#54442f'; ctx.lineWidth = 3;
      roundedPath(ctx, cargo.x - 35, cargo.y + 16, 70, 17, 3); ctx.fill(); ctx.stroke();
      cargoBox(ctx, shipment.cargo, cargo.x - 32, cargo.y - 34, 64, 1, undefined, view.profile?.cosmetics.cargo);
      panel(ctx, { x: cargo.x - 34, y: cargo.y + 24, w: 68, h: 28 }, '#17372f', '#b0daa1', 6);
      text(ctx, `${shipment.units ?? shipment.cells.length}件`, cargo.x, cargo.y + 38, 20, '#f4ffe5', 'center', 800);
    }
    ctx.restore();
  }
  if (target && (reduced || frame.stage === 'exit')) {
    if (!reduced) {
      // One bounded pulse, confined to the gate and optionally the outer board rim.
      const pulse = Math.sin(Math.PI * frame.exit), gate = shipmentGate(shipment) ?? target;
      ctx.save(); ctx.globalAlpha = feedback.flash * pulse; ctx.strokeStyle = '#ffe8a0'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(gate.x, gate.y, 39, 0, Math.PI * 2); ctx.stroke();
      if (feedback.pulse) { ctx.globalAlpha = .18 * pulse; ctx.lineWidth = 5; ctx.strokeRect(L.board.x - 22, L.board.y - 21, L.board.size + 44, L.board.size + 42); }
      ctx.restore();
      drawParticles(ctx, feedbackParticles(gate, shipment.chain, frame.exit, 'collect'), '#ffe29b');
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
    text(ctx, `${shipment.chain}连出货`, 540, 1460, Math.min(36, feedback.fontSize - 8), '#ffdf75', 'center', 900);
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

function drawTrays(ctx: Context, state: GameRun, view: ViewState): void {
  const shipments = view.animation ? [view.animation.shipment] : view.preview?.valid ? view.preview.shipments : [];
  const extra = new Set(shipments.flatMap(shipping => ('extraClearedCells' in shipping?shipping.extraClearedCells:undefined) ?? [])).size;
  const detail = [shipments.some(shipping => ('usedPalletPass' in shipping&&shipping.usedPalletPass)) ? '托盘保留' : '', extra ? `额外清理${extra}格` : ''].filter(Boolean).join(' / ');
  if (!view.noticeFx && (!view.animation || view.animation.shipment.chain < 2)) {
    const hint = detail || (tutorialStep(state) === null ? view.message : '');
    if(hint)text(ctx, hint, 540, 1467, 24, '#efe3c9', 'center', 600);
  }
  text(ctx, '待入库', 58, 1502, 22, '#b8c3cd');
  text(ctx, `空位 ${state.board.filter(cell=>cell===null).length}`, 1027, 1502, 22, '#b2c1ca', 'right', 500);
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
    const compact=r.h<180,cellCount='quarterTurns' in piece?pieceCellsV9(piece as PieceV9).length:SHAPES.find(shape=>shape.id===piece.shapeId)?.cells.length??0;
    const label = piece.trait ? `${traitName[piece.trait]} · ${pieceCaption(piece).replace('双色·','').replace(/\//g,' / ')}` : pieceCaption(piece).replace('双色·','').replace(/\//g,' / ')+(compact?` · ${cellCount}格`:'');
    text(ctx, label, r.x + r.w / 2, r.y + r.h - (compact?19:18), compact?24:'cellCargos' in piece&&piece.cellCargos ? 23 : piece.trait && r.w < 300 ? 24 : 27, selected ? '#ffe397' : '#e7e9df', 'center');
  });
}

function drawPieceInTray(ctx: Context, piece: Piece, r: Rect, selected: boolean, cargoStyle?: CargoStyleId): void {
  const shape = {cells:'quarterTurns' in piece?pieceCellsV9(piece as PieceV9):SHAPES.find(s=>s.id===piece.shapeId)?.cells??[]}; if (!shape?.cells.length) return;
  const width = Math.max(...shape.cells.map(p => p.x)) + 1, height = Math.max(...shape.cells.map(p => p.y)) + 1;
  const areaHeight=r.h<180?58:Math.min(166,Math.max(42,r.h-60)),cell = Math.min(piece.trait ? 104 : 74, Math.min(230, r.w - 54) / width, areaHeight / height);
  const x = r.x + (r.w - width * cell) / 2, y = r.y + 25 + (areaHeight - height * cell) / 2;
  if (selected) { ctx.fillStyle = 'rgba(241,190,79,.09)'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h - 29, Math.min(105, r.w / 2 - 20), 14, 0, 0, Math.PI * 2); ctx.fill(); }
  shape.cells.forEach((p,index) => cargoBox(ctx, pieceCellCargo(piece,index), x + p.x * cell, y + p.y * cell, cell - 2, 1, pieceTrait(piece), cargoStyle));
}

function drawFooter(ctx: Context, state: GameRun, view: ViewState): void {
  if(state.mode==='daily'&&!persistenceWarnings(view).length)text(ctx,`每日挑战 · ${('challengeDay' in state?state.challengeDay:view.account?.run?.identity.challengeDay)??view.dailyLabel??'日期待确认'}`,54,1840,23,'#bfbaa8');
  drawPersistenceWarnings(ctx,view,1830,427,746);
  if(view.developerMode===true){
    roundedPath(ctx,L.debug.x,L.debug.y,L.debug.w,L.debug.h,6);ctx.fillStyle='rgba(13,23,31,.86)';ctx.fill();
    text(ctx,'状态',L.debug.x+L.debug.w/2,L.debug.y+23,20,'#9cabaf','center');
  }
}

function shade(ctx: Context): void { ctx.fillStyle = 'rgba(5,11,18,.84)'; ctx.fillRect(0, 0, 1080, 1920); }

function drawRecovery(ctx: Context, state:GameRun, view:ViewState): void {
  const error=view.recoveryError;
  shade(ctx);panel(ctx,{x:173,y:582,w:734,h:839},'#30455a','#9aabaf',28);
  hazard(ctx,{x:201,y:610,w:678,h:19});forklift(ctx,540,744,140,-.12);
  outlinedText(ctx,error?'暂时无法读取进度':'继续上次游戏？',540,868,error?49:62,CREAM,'center');
  const identity=state.mode==='color_exit'?outboundLabel(state):state.mode==='endless'?'无限入库':state.mode==='daily'?`每日挑战 · ${('challengeDay' in state?state.challengeDay:view.account?.run?.identity.challengeDay)??'日期待确认'}`:state.mode==='tutorial'?'入库教学':'入库模式';
  text(ctx,identity,540,954,29,'#c6d1d6','center',500);
  text(ctx,error?'已有进度仍保留，请重试。':`得分 ${number(state.score)}`,540,1015,27,error?'#ffc9a3':'#ffe5a1','center');
  button(ctx,L.resume,error?'重试':'继续游戏');
  button(ctx,L.restart,'重新开始',false);button(ctx,L.recoveryMenu,'返回主页',false);
  if(error)wrap(ctx,error,246,1558,588,23,34);
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
  state.upgradeChoices.forEach((id, index) => {
    const upgrade = UPGRADES.find(u => u.id === id), r = L.upgradeRects[index]; if (!upgrade || !r) return;
    const colors = ['#6dbde1', '#b091df', '#efbb5d'];
    panel(ctx, r, ['#1d4c69', '#493462', '#5a472c'][index], colors[index], 21);
    roundedPath(ctx, r.x + 9, r.y + 9, r.w - 18, r.h - 18, 15); ctx.strokeStyle = colors[index]; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, `0${index + 1}`, r.x + 23, r.y + 33, 19, colors[index]);
    text(ctx, upgrade.title, r.x + r.w / 2, r.y + 87, 34, CREAM, 'center', 900);
    ctx.fillStyle = 'rgba(9,21,30,.35)'; roundedPath(ctx, r.x + 29, r.y + 137, r.w - 58, 180, 15); ctx.fill();
    drawUpgradeModifier(ctx, upgrade, r, colors[index]);
    const description = upgrade.description.replace(/Dock/g, '出货口').replace(/Shift(\d+)/g, '第$1班');
    wrap(ctx, description, r.x + 30, r.y + 377, r.w - 60, 24, 32);
    roundedPath(ctx, r.x + 27, r.y + r.h - 75, r.w - 54, 47, 10); ctx.fillStyle = colors[index]; ctx.fill();
    text(ctx, '选择此项', r.x + r.w / 2, r.y + r.h - 51, 25, '#172737', 'center');
  });
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

function drawResult(ctx: Context, state: GameRun, view: ViewState): void {
  shade(ctx);const reward=resultEarnedCoins(state,view);
  if(state.mode==='color_exit'){
    const endless=state.rulesetVersion===10,retired=endless&&state.endReason==='retired';
    const blocked=[8,10].includes(state.rulesetVersion)&&state.result==='failed'&&state.board[76]!==null;
    outlinedText(ctx,endless?'无限出库结算':state.result==='won'?'出库完成！':blocked?'入口堵塞':'空间不足',540,430,62,CREAM,'center');
    text(ctx,retired?'已按当前分数结算':!endless&&state.result==='won'?'已完成30批出货':blocked?'无法继续出货':'所有货件都放不下了',540,520,27,'#d9d9cf','center',500);
    panel(ctx,{x:174,y:600,w:732,h:455},'#415263','#b2a888',26);
    text(ctx,outboundLabel(state),540,670,28,CREAM,'center');outlinedText(ctx,number(state.score),540,774,90,'#ffce5b','center');
    text(ctx,`出货批次 ${state.completedOrders}${endless?'':' · 目标30批'}`,540,897,30,CREAM,'center');
    text(ctx,`累计出货 ${state.score/RULES_V4_CONFIG.pointsPerCell}件`,540,945,27,CREAM,'center');
    text(ctx,`最高连锁 ×${state.maxChain}`,540,1001,26,'#d4dcdd','center');
    if(reward)text(ctx,`本局金币 +${number(reward.earnedCoins)} · 余额 ${number(reward.wallet)}`,540,1035,26,'#ffe3a3','center');
    drawControls(ctx,state,view);drawPersistenceWarnings(ctx,view,1590);return;
  }
  const endless=state.mode==='endless';
  const won = state.result === 'won', tutorial = state.mode === 'tutorial', daily = state.mode === 'daily';
  const retired = state.endReason === 'retired';
  const title = endless ? '无限入库结算' : tutorial ? won ? '教学完成！' : '爆仓了！' : retired ? state.overtime?'加班结算':'入库结算' : state.overtime ? '加班结束' : daily ? won ? '今日挑战完成' : '今日挑战结算' : won ? '完美收工！' : '爆仓了！';
  outlinedText(ctx, title, 540, 414, 88, won || retired ? '#fff0bb' : '#ffbd86', 'center');
  const subtitle = endless ? retired ? '已按当前分数结算' : '所有货件都放不下了' : tutorial ? '可以开始正式值班了' : retired ? '已按当前分数结算' : state.overtime ? '所有货件都放不下了' : daily ? `每日挑战 · ${('challengeDay' in state?state.challengeDay:view.account?.run?.identity.challengeDay) ?? view.dailyLabel ?? '日期待确认'}` : won ? '五个班次全部完成' : '所有货件都放不下了';
  text(ctx, subtitle, 540, 507, 28, '#d9d9cf', 'center', 500);
  panel(ctx, { x: 174, y: 581, w: 732, h: 496 }, '#415263', '#b2a888', 26);
  roundedPath(ctx, 203, 610, 674, 269, 16); ctx.fillStyle = gradient(ctx, 203, 610, 269, '#f8e9c7', '#decaa4'); ctx.fill();
  text(ctx, tutorial ? '教学得分' : '本局得分', 540, 657, 30, '#5c4936', 'center');
  outlinedText(ctx, number(state.score), 540, 742, 94, '#ffce5b', 'center');
  text(ctx, `最高连锁  ×${state.maxChain}`, 240, 830, 27, '#534332');
  text(ctx, `完成订单  ${state.completedOrders}`, 840, 830, 27, '#534332', 'right');
  const seconds = Math.floor(view.elapsed / 1000), time = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  text(ctx, tutorial ? '已掌握入库与清路' : endless ? `到达阶段 ${state.shift} · 持续接单` : state.overtime ? '加班挑战' : `到达第 ${state.shift} 班`, 242, 939, 29, '#e7e4d4'); text(ctx, time, 838, 939, 29, '#e7e4d4', 'right');
  const peak=state.maxOccupancy===undefined?'未记录':`${state.maxOccupancy}/${state.board.length}格`;
  text(ctx, `最高占用  ${peak}`, 240, reward?977:992, 25, '#e7e4d4');
  const selected=isInboundV9(state)?UPGRADES_V9.filter(u=>state.levels[u.id]>0).map(u=>`${u.title} ${state.levels[u.id]}层`):'upgrades' in state?[...new Set(state.upgrades)].map(id=>UPGRADES.find(upgrade=>upgrade.id===id)?.title??id):[];
  ctx.font='500 23px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  let shown=Math.min(2,selected.length),upgradeSummary=selected.length?`关键升级  ${selected.slice(0,shown).join(' / ')}${selected.length>shown?` 等${selected.length}项`:''}`:'关键升级  无';
  while(shown>0&&ctx.measureText(upgradeSummary).width>646){shown--;upgradeSummary=`关键升级  ${selected.slice(0,shown).join(' / ')}${shown?' · ':''}共${selected.length}项`;}
  text(ctx,upgradeSummary,240,reward?1016:1041,23,'#d4dcdd','left',500);
  if(reward)text(ctx,`本局金币 +${number(reward.earnedCoins)} · 余额 ${number(reward.wallet)}`,540,1060,26,'#ffe3a3','center');
  if(tutorial)text(ctx,'正式值班：每班6单，共5班',540,1118,25,'#e7e8cf','center',600);
  drawControls(ctx,state,view);
  drawPersistenceWarnings(ctx,view,1588);
}

function drawDebug(ctx: Context, state: GameRun, view: ViewState): void {
  if(isInboundV9(state)||isOutboundEndlessV10(state)){panel(ctx,{x:72,y:390,w:936,h:1310});text(ctx,`规则 v${state.rulesetVersion} · 指令 ${state.commandIndex}`,540,500,30,CREAM,'center');return;}
  const pages=debugPages(state,view),page=(view.debugPage??0)%pages.length;
  panel(ctx, { x: 72, y: 390, w: 936, h: 1310 }, '#0f2634', '#8fa9af');
  text(ctx, `规则 v${state.rulesetVersion} · 开发版`, 112, 445, 31, '#f2d38b');
  text(ctx, `诊断 ${page+1}/${pages.length}`, 960, 445, 28, '#f2d38b', 'right');
  pages[page].forEach((line,i)=>text(ctx,line,112,515+i*40,24,'#c6d1d7','left',500));
  button(ctx, DEBUG_PREVIOUS, '上一页', false);button(ctx, DEBUG_NEXT, '下一页', false);
  text(ctx, '只读诊断 · 点击右下「状态」收起', 540, 1655, 23, '#e9c473', 'center', 500);
}

/** Shared controls are also the only hit regions consumed by Input. */
function drawControls(ctx: Context, state: GameRun, view: ViewState): void {
  getUiControls(state, view).forEach((control, index) => drawControl(ctx, control, index === 0 && !['toggleSound','comparisonSeedNext'].includes(control.action.type)));
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
    let size = lines.length > 1 ? index ? 28 : 36 : r.w < 420 ? 32 : 36;
    ctx.font = `800 ${size}px "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const measured = ctx.measureText(line).width;
    if (measured > r.w - 48) size *= (r.w - 48) / measured;
    text(ctx, line, r.x + r.w / 2, r.y + r.h / 2 + (index - (lines.length - 1) / 2) * 47, size, disabled ? '#a2b1be' : warm ? '#49361b' : CREAM, 'center', index ? 500 : 800);
  });
  ctx.restore();
}

function drawMenu(ctx: Context, state: GameRun, view: ViewState): void {
  text(ctx, 'WAREHOUSE  /  LAST SLOT', 540, 120, 22, '#b7b098', 'center', 600);
  outlinedText(ctx, '爆仓', 540, 267, 151, CREAM, 'center');
  outlinedText(ctx, '最后一格', 540, 387, 79, '#ffe3a3', 'center');
  hazard(ctx, { x: 314, y: 448, w: 452, h: 14 });
  ctx.fillStyle = 'rgba(255,230,159,.07)'; ctx.beginPath(); ctx.ellipse(540, 601, 180, 33, 0, 0, Math.PI * 2); ctx.fill();
  forklift(ctx, 540, 565, 160, -.12, view.profile?.cosmetics.forklift);
  text(ctx,`金币 ${view.account?.wallet??0}`,540,670,29,'#ffe3a3','center');
  drawControls(ctx, state, view);
  const unlocked = ACHIEVEMENTS.filter(item => view.profile?.achievements.includes(item.id));
  text(ctx, unlocked.length ? unlocked.slice(0, 2).map(item => item.name).join('  ·  ') : '首次出货，解锁蓝色叉车', 540, 1534, 26, '#c4d2d6', 'center', 500);
  drawPersistenceWarnings(ctx,view,1660);
}

function drawInboundMenu(ctx:Context,state:GameRun,view:ViewState):void{
  outlinedText(ctx,'入库模式',540,200,79,CREAM,'center');
  const best=view.account?view.account.profile.results['inbound.standard.v9.plain']?.best?.score??0:view.profile?.bestScores['standard.v3']?.score??0;
  const endlessBest=view.account?view.account.profile.results['inbound.endless.v9.plain']?.best?.score??0:view.profile?getEndlessProfile(view.profile).bestScores.v7?.score??0:0;
  text(ctx,`五班最高分 ${number(best)} · 无限最高分 ${number(endlessBest)}`,540,390,29,'#ffe3a3','center');
  if(view.account)text(ctx,`带工具五班 ${number(view.account.profile.results['inbound.standard.v9.tools']?.best?.score??0)} · 无限 ${number(view.account.profile.results['inbound.endless.v9.tools']?.best?.score??0)}`,540,445,24,'#a9c0c9','center',500);
  else text(ctx,`加班最高分 · ${number(view.profile?.bestScores['overtime.v3']?.score??0)}`,540,445,24,'#a9c0c9','center',500);
  const cards=[['普通五班','每班6单，共5班'],['无限入库','持续接单，挑战高分'],['每日挑战',view.dailyLabel??'日期待确认']];
  cards.forEach(([title,description],index)=>{
    const y=545+index*290;
    panel(ctx,{x:170,y,w:740,h:280},'#293f51','#718d98',20);
    text(ctx,title,210,y+55,35,'#ffe8b4');
    text(ctx,description,210,y+111,25,'#b8cdd5','left',500);
  });
  drawControls(ctx,state,view);
  drawPersistenceWarnings(ctx,view,1775);
}

function drawColorTierSelection(ctx:Context,state:GameRun,view:ViewState):void {
  outlinedText(ctx,'出库模式',540,157,70,CREAM,'center');
  text(ctx,'选择难度',540,233,29,'#c5d6db','center',500);
  OUTBOUND_DIFFICULTIES.forEach((difficulty,index)=>{
    const y=452+index*244;panel(ctx,{x:132,y,w:816,h:242},'#293f51','#718d98',20);text(ctx,OUTBOUND_DIFFICULTY_NAMES[difficulty],170,y+37,33,'#ffe8b4');
    const normal=view.account?.profile.results[`outbound.v8.${difficulty}`],endless=view.account?.profile.results[`outboundEndless.v10.${difficulty}`];
    const oldBest=view.account?view.account.profile.legacyResults.outboundV8?.[difficulty]?.bestScores.v8?.score??0:view.profile?getOutboundProfile(view.profile,difficulty,8).bestScores.v8?.score??0:0;
    const best=Math.max(oldBest,normal?.best?.score??0);
    text(ctx,`普通 · 30批 · 最高分 ${number(best)}`,170,y+85,23,'#b8cdd5','left',500);text(ctx,`无限 · 最高分 ${number(endless?.best?.score??0)} · ${endless?.maxUnits??0}批`,552,y+85,23,'#b8cdd5','left',500);
  });
  drawControls(ctx,state,view);drawPersistenceWarnings(ctx,view,1790);
}

function drawLegacyRuns(ctx:Context,state:GameRun,view:ViewState):void{
  outlinedText(ctx,'旧版出库 · 7×7',540,205,72,CREAM,'center');
  text(ctx,'继续旧局、查看结算或处理损坏存档',540,296,29,'#c5d6db','center',500);
  text(ctx,'重新开始时会前往新的9×9难度选择',540,350,26,'#b8cdd5','center',500);
  const slots=LEGACY_SLOTS.filter(slot=>hasLegacyRun(view,slot));
  slots.forEach((slot,index)=>{
    const tier=tierForSlot(slot),profile=view.profile?getColorExitProfile(view.profile,tier):undefined;
    const best=profile?.bestScores[tier?'v5':'v4']?.score??0;
    text(ctx,`${tier?'本档':'旧纯色'}最高分 ${number(best)}`,540,530+index*220,25,'#b8cdd5','center',500);
  });
  if(!slots.length)text(ctx,'未找到旧版7×7存档',540,730,31,'#d0ddd7','center');
  drawControls(ctx,state,view);
  text(ctx,view.saveStatus||'旧版存档与历史成绩保留在本机',540,1760,24,'#b8cdd5','center',500);
}

function drawSettings(ctx: Context, state: GameRun, view: ViewState): void {
  outlinedText(ctx, '设置与外观', 540, 157, 71, CREAM, 'center');
  text(ctx, '游玩设置', 133, 312, 25, '#e0c18a', 'left', 600);
  text(ctx, '减少动画，保留路径提示', 540, 638, 24, '#a6bdca', 'center', 500);
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
  drawPersistenceWarnings(ctx,view,1400,540,774);
}

function drawActivePause(ctx:Context,state:GameRun,view:ViewState):void {
  shade(ctx);panel(ctx,{x:173,y:395,w:734,h:1464},'#30455a','#95a9b1',28);
  hazard(ctx,{x:201,y:423,w:678,h:18});
  outlinedText(ctx,'已暂停',540,520,62,CREAM,'center');
  const goal=state.mode==='color_exit'?state.rulesetVersion===10?`无限出库 · 已出货 ${state.completedOrders} 批`:`出货 ${state.completedOrders}/30 批`
    : state.mode==='endless'?`无限入库 · 得分 ${number(state.score)}`
    : state.overtime?`加班挑战 · 得分 ${number(state.score)}`
    : state.mode==='tutorial'?'入库教学'
    : `第${state.shift}班 · 本班${Math.max(0,state.completedOrders-(state.shift-1)*6)}/6单`;
  text(ctx,goal,540,653,29,'#ffe3a1','center',700);
  drawControls(ctx,state,view);drawPersistenceWarnings(ctx,view,752,540,630);
}

function drawConfirmation(ctx:Context,state:GameRun,view:ViewState):void {
  shade(ctx);panel(ctx,{x:140,y:595,w:800,h:765},'#344859','#c5b98f',28);hazard(ctx,{x:170,y:627,w:740,h:16});
  const confirmation=view.confirmation,kind=confirmation?.kind;
  const title=kind==='purchase'&&confirmation?.item?`购买${ITEM_NAMES[confirmation.item]}？`:kind==='resetProfile'?'重置游戏记录？':kind==='finishOvertime'||kind==='finishEndless'?'结束并结算？':kind==='leaveRun'?confirmation?.nextScreen==='colorTiers'?'结束本局并选择难度？':'结束本局并返回主页？':kind==='switchMode'?'保留进度并切换？':'重新开始？';
  outlinedText(ctx,title,540,747,kind==='leaveRun'?51:56,CREAM,'center');
  const target=confirmation?.variant?runSlotLabel(confirmation.variant):'入库模式';
  const lines=kind==='purchase'&&confirmation?.item?[`花费 ${ITEM_PRICES[confirmation.item]} 金币。`,`余额 ${view.account?.wallet??0} → ${Math.max(0,(view.account?.wallet??0)-ITEM_PRICES[confirmation.item])}。`]:kind==='switchMode'?['当前进度会保留。',`切换到${target}。`]
    :kind==='resetProfile'?['清空显示的成绩记录。','金币、库存、日奖励记录、设置和外观会保留。']
    :kind==='finishOvertime'||kind==='finishEndless'?['将记录当前分数。','结束后不能继续本局。']
    :view.recoveryError?['本局进度将丢失。','原存档仅留作恢复备份。','历史成绩和设置会保留。']
    :view.accountRunId?['本局进度将丢失，不登记放弃成绩。','已获金币保留，未用工具退回。','历史成绩和设置会保留。']:['本局进度将丢失。','历史成绩和设置会保留。'];
  lines.forEach((line,index)=>text(ctx,line,540,858+index*64,27,'#d1dde1','center',500));
  drawControls(ctx,state,view);
}

function drawHelp(ctx:Context,state:GameRun,view:ViewState):void {
  outlinedText(ctx,'玩法说明',540,250,62,CREAM,'center');
  const outbound=state.mode==='color_exit';
  const basics=outbound?[
    '同类货物上下左右相连，至少4件。',
    '连到同色出口，南入口到货物旁留空路。',
    state.rulesetVersion===10?'无限持续出货；入口堵塞或货件全放不下时结束。':state.rulesetVersion===8?'出货30批过关；入口堵塞或货件全放不下时结束。':'出货30批过关；货件全放不下时结束。',
  ]:[
    '按订单配货，同类货物上下左右相连。',
    '数量达标，出货口到货物旁留出空路。',
    isInboundV9(state)?'旋转工具可改朝向；道具可在放不下时救场。':'货件不能旋转；所有货件都放不下时结束。',
  ];
  basics.forEach((line,index)=>text(ctx,line,540,365+index*69,index===2&&outbound?25:28,'#e4e4d7','center',500));
  if(outbound)drawColorExitHelpDiagram(ctx,{x:140,y:640,w:800,h:430},!!('colorTier' in state?state.colorTier:undefined)||!!('difficultyId' in state?state.difficultyId:undefined),state);
  else drawInboundHelpDiagram(ctx);
  drawControls(ctx,state,view);
}

function drawInboundHelpDiagram(ctx:Context):void {
  panel(ctx,{x:140,y:640,w:800,h:430},'#20394b','#587586',14);
  const origin={x:205,y:725},cell=66;
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){ctx.fillStyle='#56636a';ctx.fillRect(origin.x+col*cell+1,origin.y+row*cell+1,cell-2,cell-2);}
  for(let col=0;col<3;col++)cargoBox(ctx,'cargo.food',origin.x+col*cell+3,origin.y+cell+3,cell-6);
  ctx.strokeStyle='#9edfff';ctx.lineWidth=5;ctx.setLineDash([12,9]);ctx.beginPath();ctx.moveTo(370,685);ctx.lineTo(370,758);ctx.stroke();ctx.setLineDash([]);
  arrow(ctx,370,725,20,Math.PI/2,'#9edfff');
  icon(ctx,'cargo.food',570,756,44,PALETTE['cargo.food'].light);text(ctx,'食品 3/3件',610,756,29,CREAM);
  text(ctx,'数量达标',570,837,28,'#d9ffc1');text(ctx,'留出空路即可出货',570,900,25,'#d9ffc1');
  text(ctx,'虚线：叉车通路',340,1030,23,'#9edfff','center');
}

function drawHelpDetails(ctx:Context,state:GameRun,view:ViewState):void {
  outlinedText(ctx,'特殊货物与升级',540,250,58,CREAM,'center');
  const rules=isInboundV9(state)?[
    '双倍箱：占1格，计2件；万能可连接订单货类。',
    '加急放下剩3次，之后先出货再扣数。',
    '期限归零成为废物，占格、不出货。',
    '清扫二选一：每2单，或每6次有效放置。',
    '清扫只清旧废物，空触发不会积存。',
    '旋转改朝向；清障选1至2格；万能工具改单格。',
    '普通、无限最多带2种工具；未用的结束退回。',
    '减量：当前和新订单都少1件，最低3件。',
    '扩仓、候选扩容、公共侧门与奖金立即生效。',
  ]:[
    '托盘：占1格，计2件。',
    '万能：可连接当前订单的货类。',
    '加急：后续有效放置后倒数，归零变为废弃物。',
    '废弃物：占格，不出货。',
    '危险品：出货时清理相邻废弃物。',
    '穿托盘：叉车通过后，托盘仍留在原格。',
    '侧门：所有订单共用。',
    '额外清理不计分；减量升级只影响后续新单。',
    '每次放置检查原有订单，新单等下一次放置。',
  ];
  rules.forEach((line,index)=>text(ctx,line,150,415+index*103,27,'#d5e7df','left',500));
  drawControls(ctx,state,view);
}

function drawFlow(ctx:Context,state:GameRun,view:ViewState,title:string,description:string):void {
 shade(ctx);panel(ctx,{x:132,y:395,w:816,h:1230},'#293f51','#718d98',24);outlinedText(ctx,title,540,520,55,CREAM,'center');wrap(ctx,description,210,650,660,27,40);drawControls(ctx,state,view);drawPersistenceWarnings(ctx,view,1700);
}
function drawEconomyFlow(ctx:Context,state:GameRun,view:ViewState):void {
 const screen=view.screen,title=screen==='shop'?'金币商店':screen==='prepareTools'?'选择携带工具':screen==='prepareCleanup'?'选择清扫方式':view.guideTrack==='outbound'?'出库引导':'入库引导';
 outlinedText(ctx,title,540,220,72,CREAM,'center');text(ctx,`金币 ${view.account?.wallet??0}`,540,340,31,'#ffe3a3','center');
 const description=screen==='shop'?`旋转${ITEM_PRICES.rotate} · 清障${ITEM_PRICES.clear} · 万能${ITEM_PRICES.wildcard}。每局最多带2件，同类最多1件。`:screen==='prepareTools'?'可以不带工具免费开始。未使用的工具在结束本局时退回。':screen==='prepareCleanup'?'按单每2单清理，定期每6次有效放置清理旧废物。':view.guideTrack==='outbound'?'在真实普通简单局里学习连接出口与双色出货。':'在真实五班局里学习订单、升级、加急与清扫。';
 wrap(ctx,description,170,430,740,27,42);drawControls(ctx,state,view);drawPersistenceWarnings(ctx,view,1720);
}
function drawToolSelection(ctx:Context,state:GameRun,view:ViewState):void {
 const tool=view.toolSelection;if(!tool)return;const geometry=boardGeometry(state);ctx.save();ctx.strokeStyle='#ffe3a3';ctx.lineWidth=5;for(const cell of tool.cells)ctx.strokeRect(geometry.x+cell%geometry.dimension*geometry.cell+4,geometry.y+Math.floor(cell/geometry.dimension)*geometry.cell+4,geometry.cell-8,geometry.cell-8);ctx.restore();
 text(ctx,tool.error??(tool.item==='clear'?'点击1至2个占用格，确认后清障':tool.item==='rotate'?'选择一个货件，再预览旋转朝向':'选择一个候选，确认后变成单格万能货'),540,1390,25,tool.error?'#ffb28b':'#ffe3a3','center');drawControls(ctx,state,view);
}
function drawGrowthUpgrades(ctx:Context,state:import('../domain/v9/types.ts').InboundRunV9,view:ViewState):void {
 shade(ctx);text(ctx,`已完成 ${state.completedOrders} 单`,540,419,29,'#b8c9d6','center');outlinedText(ctx,'选择一项升级',540,520,75,'#ffe5a1','center');
 state.upgradeChoices.forEach((id,index)=>{const upgrade=UPGRADES_V9.find(u=>u.id===id),r=L.upgradeRects[index];if(!upgrade||!r)return;const before=state.levels[id],after=before+1;panel(ctx,r,['#1d4c69','#493462','#5a472c'][index],['#6dbde1','#b091df','#efbb5d'][index],21);text(ctx,upgrade.title,r.x+r.w/2,r.y+78,32,CREAM,'center');text(ctx,`${before}层 → ${after}层`,r.x+r.w/2,r.y+159,30,'#ffe3a3','center');
  const projected=chooseUpgradeV9(state,id,id==='cargo_supply'?state.supplyCargo??CARGO[0].id:undefined).state;
  const beforeDistribution=generationDistributionV9(state),afterDistribution=generationDistributionV9(projected);
  const small=(distribution:ReturnType<typeof generationDistributionV9>)=>Math.round(distribution.ordinaryShapes.filter(p=>(SHAPES.find(s=>s.id===p.shapeId)?.cells.length??0)<=2).reduce((n,p)=>n+p.probability,0)*100);
  const value=id==='candidate_slots'?`${state.candidates.length} → ${projected.candidates.length} 个候选`:id==='warehouse_expand'?`${state.boardSize}×${state.boardSize} → ${projected.boardSize}×${projected.boardSize} · +${projected.board.length-state.board.length}空格`:id==='side_gate'?'无 → 西南公共侧门':id==='pallet_rate'?`${Math.round(beforeDistribution.traits.pallet*100)}% → ${Math.round(afterDistribution.traits.pallet*100)}%`:id==='small_parcels'?`小件 ${small(beforeDistribution)}% → ${small(afterDistribution)}%`:id==='cargo_supply'?state.supplyCargo?`${Math.round((beforeDistribution.nonWildcardCargos.find(c=>c.cargo===state.supplyCargo)?.probability??0)*100)}% → ${Math.round((afterDistribution.nonWildcardCargos.find(c=>c.cargo===state.supplyCargo)?.probability??0)*100)}%`:'选货类后，显示该类实际概率':id==='light_orders'?`当前${state.orders.map(o=>o.amount).join('/')}件 → ${projected.orders.map(o=>o.amount).join('/')}件`:id==='order_bonus'?`${before*50} → ${after*50} 分/单`:id==='overfill_bonus'?`${before*10} → ${after*10} 分/超额单位`:`${before*100} → ${after*100} 分/连单`;
  wrap(ctx,value,r.x+24,r.y+250,r.w-48,25,37);wrap(ctx,upgrade.description,r.x+24,r.y+380,r.w-48,23,34);text(ctx,'选择此项',r.x+r.w/2,r.y+r.h-52,27,'#ffe3a3','center');
 });
 getUiControls(state,view).filter(c=>c.action.type==='skipTutorial').forEach(c=>drawControl(ctx,c,false));
}
function drawGrowthFeedback(ctx:Context,state:import('../domain/v9/types.ts').InboundRunV9,view:ViewState):void {
 if(view.animation||view.paused||state.phase==='result'||state.phase==='upgrade'||state.phase==='cleanup')return;
 const preview=view.preview?.stateAfter&&isInboundV9(view.preview.stateAfter)?{...view.preview,stateAfter:view.preview.stateAfter,events:[],shipments:view.preview.shipments.filter(s=> 'gateId' in s)}:null;
 const feedback=growthFeedback(state,preview),geometry=boardGeometry(state);ctx.save();for(const item of feedback.rush){const x=geometry.x+item.cell%geometry.dimension*geometry.cell,y=geometry.y+Math.floor(item.cell/geometry.dimension)*geometry.cell;ctx.strokeStyle=item.outcome==='ships'?'#c4ffdb':item.outcome==='expires'?'#dd956f':'#e99e8e';ctx.lineWidth=3;ctx.strokeRect(x+6,y+6,geometry.cell-12,geometry.cell-12);text(ctx,item.outcome==='ships'?'出货':item.outcome==='expires'?'废物':String(item.remaining),x+geometry.cell-20,y+geometry.cell-19,19,ctx.strokeStyle as string,'center');}ctx.restore();
 if(feedback.sweep)text(ctx,`清扫 ${feedback.sweep.progress}/${feedback.sweep.target}`,540,1502,23,'#c6d1d6','center');
}
