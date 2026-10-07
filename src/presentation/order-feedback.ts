import { orderStatus } from '../domain/board.ts';
import type { OrderStatus } from '../domain/board.ts';
import { CARGO } from '../domain/content.ts';
import type { CargoId, Order } from '../domain/types.ts';
import type {GameRun,GameShipment} from '../domain/playable.ts';
import {isInboundRun,isOutboundEndlessV10,isOutboundToolsRun} from '../domain/playable.ts';
import {inboundGroups,inboundOrderGroup,inboundDocks} from './inbound-helpers.ts';
import {collectGroupsV6,findRouteV6} from '../domain/v6/board.ts';
import {OUTBOUND_DOCKS,OUTBOUND_ENTRY} from '../domain/v6/content.ts';
import type { ViewState } from './view-types.ts';

export interface OrderFeedback {
  /** Quantity and availability on the committed board, or the animation snapshot. */
  status: OrderStatus;
  label: string;
  /** Real shipment occupying this card's Dock, even if the order was refreshed. */
  shipping?: GameShipment;
  /** Predicted shipment of this exact order, never inferred from cargo or Dock. */
  previewShipment?: GameShipment;
}

const cargoName = (cargo: CargoId): string => CARGO.find(item => item.id === cargo)?.name ?? '货物';
export function playableOrderStatus(state:GameRun,order:Order):OrderStatus {
 if(isInboundRun(state)){const groups=inboundGroups(state,order.cargo),count=Math.max(0,...groups.map(g=>g.units)),chosen=inboundOrderGroup(state,order);if(chosen)return {count:chosen.group.units,status:'ready',path:chosen.path,reason:'ready'};if(count<order.amount)return {count,status:'need',path:[],reason:'insufficient'};const d=inboundDocks(state).find(d=>d.id===order.dockId),entry=d?d.entry.y*state.boardSize+d.entry.x:-1;return {count,status:'blocked',path:[],reason:entry>=0&&state.board[entry]!==null&&!state.levels.side_gate?'entry-blocked':'route-blocked'};}
 if((isOutboundEndlessV10(state)||isOutboundToolsRun(state))){const dock=OUTBOUND_DOCKS.find(d=>d.id===order.dockId),groups=collectGroupsV6(state.board).filter(g=>g.cargo===order.cargo),group=dock?groups.find(g=>g.cells.includes(dock.entry.y*9+dock.entry.x)):undefined,count=group?.cells.length??0,largestGroupCount=Math.max(0,...groups.map(g=>g.cells.length));if(count<order.amount)return {count,largestGroupCount,exitConnected:!!group,status:'need',path:[],reason:group?'insufficient':'exit-unconnected'};if(state.board[76]!==null)return {count,largestGroupCount,exitConnected:true,status:'blocked',path:[],reason:'entry-blocked'};const path=findRouteV6(state.board,OUTBOUND_ENTRY,group!.cells);return {count,largestGroupCount,exitConnected:true,status:path?'ready':'blocked',path:path??[],reason:path?'ready':'route-blocked'};}
 return orderStatus(state,order);
}
const baseHint = '';

/** Presentation-only explanations; dispatch eligibility remains owned by Domain. */
export function orderFeedback(state: GameRun, order: Order, view: ViewState): OrderFeedback {
  const visibleState:GameRun = view.animation ? isInboundRun(state)?{...state,board:view.animation.board,cellTraits:view.animation.cellTraits??Array(state.board.length).fill(null)}:(isOutboundEndlessV10(state)||isOutboundToolsRun(state))?{...state,board:view.animation.board}:{...state,board:view.animation.board,cellTraits:view.animation.cellTraits} : state;
  const status = playableOrderStatus(visibleState, order);
  const shipping = view.animation?.shipment.dockId === order.dockId ? view.animation.shipment : undefined;
  if (shipping) return { status, label: `出货中 · +${shipping.score}`, shipping };
  const previewShipment = !view.animation && view.preview?.valid ? view.preview.shipments.find(shipment => shipment.orderId === order.id) : undefined;
  if (previewShipment) return { status, label: '预计出货', previewShipment };
  if (status.status === 'ready') {
    const label = !view.animation && view.preview
      ? view.preview.valid ? '暂不出货' : '这里放不下'
      : '已就绪 · 等待放置';
    return { status, label };
  }
  if (status.status === 'blocked') {
    const label = status.reason === 'entry-blocked' ? '入口堵塞'
      : status.reason === 'route-blocked' ? '无空路' : '通路被堵';
    return { status, label };
  }
  return { status, label: `还差${Math.max(0, order.amount - status.count)}${state.rulesetVersion >= 2 ? '件' : '格'}` };
}

/** One short line, ordered by what the player can currently observe or do. */
export function boardHint(state: GameRun, view: ViewState): string {
  if (view.animation) return `${cargoName(view.animation.shipment.cargo)}出货中`;
  if (view.preview?.valid && view.preview.shipments.length) {
    const names = [...new Set(view.preview.shipments.map(shipment => cargoName(shipment.cargo)))];
    return `预计出货：${names.join('、')}`;
  }
  if (view.preview && !view.preview.valid) return view.preview.reason==='入口需留空'?'入口需留空':'这里放不下，换个位置';
  if (state.orders.some(order => playableOrderStatus(state, order).status === 'ready')) {
    return view.preview?.valid ? '暂不出货' : '已就绪 · 等待放置';
  }
  const ordered = new Set(state.orders.map(order => order.cargo));
  const selected = state.candidates.find(piece => piece.id === view.selectedPieceId);
  if (selected) {
    return !ordered.has(selected.cargo) && !(state.rulesetVersion >= 2 && selected.trait === 'wildcard')
      ? `${cargoName(selected.cargo)}暂无订单` : baseHint;
  }
  if (!view.dragPoint && !view.hoverOrigin && !view.preview) {
    // Count physical stock, not pallet units. Catalogue order makes ties stable.
    let most: CargoId | undefined, largest = 0;
    for (const cargo of CARGO) {
      if (ordered.has(cargo.id)) continue;
      const count = state.board.reduce((total, cell, index) => {
        const trait = state.rulesetVersion >= 2 ? state.cellTraits?.[index]?.kind : undefined;
        return total + Number(cell === cargo.id && trait !== 'wildcard' && trait !== 'waste');
      }, 0);
      if (count > largest) { most = cargo.id; largest = count; }
    }
    if (most) return `${cargoName(most)}暂无订单`;
  }
  return baseHint;
}
