import { orderStatus } from '../domain/board.ts';
import type { OrderStatus } from '../domain/board.ts';
import { CARGO } from '../domain/content.ts';
import type { CargoId, Order, RunState, Shipment } from '../domain/types.ts';
import type { ViewState } from './view-types.ts';

export interface OrderFeedback {
  /** Quantity and availability on the committed board, or the animation snapshot. */
  status: OrderStatus;
  label: string;
  /** Real shipment occupying this card's Dock, even if the order was refreshed. */
  shipping?: Shipment;
  /** Predicted shipment of this exact order, never inferred from cargo or Dock. */
  previewShipment?: Shipment;
}

const cargoName = (cargo: CargoId): string => CARGO.find(item => item.id === cargo)?.name ?? '货物';
const baseHint = '';

/** Presentation-only explanations; dispatch eligibility remains owned by Domain. */
export function orderFeedback(state: RunState, order: Order, view: ViewState): OrderFeedback {
  const visibleState = view.animation ? { ...state, board: view.animation.board, cellTraits: view.animation.cellTraits } : state;
  const status = orderStatus(visibleState, order);
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
export function boardHint(state: RunState, view: ViewState): string {
  if (view.animation) return `${cargoName(view.animation.shipment.cargo)}出货中`;
  if (view.preview?.valid && view.preview.shipments.length) {
    const names = [...new Set(view.preview.shipments.map(shipment => cargoName(shipment.cargo)))];
    return `预计出货：${names.join('、')}`;
  }
  if (view.preview && !view.preview.valid) return '这里放不下，换个位置';
  if (state.orders.some(order => orderStatus(state, order).status === 'ready')) {
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
