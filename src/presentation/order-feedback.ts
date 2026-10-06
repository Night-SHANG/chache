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
const baseHint = '同类相邻成组，给叉车留条路';

/** Presentation-only explanations; dispatch eligibility remains owned by Domain. */
export function orderFeedback(state: RunState, order: Order, view: ViewState): OrderFeedback {
  const visibleState = view.animation ? { ...state, board: view.animation.board, cellTraits: view.animation.cellTraits } : state;
  const status = orderStatus(visibleState, order);
  const shipping = view.animation?.shipment.dockId === order.dockId ? view.animation.shipment : undefined;
  if (shipping) return { status, label: `出库中 · +${shipping.score}`, shipping };
  const previewShipment = !view.animation && view.preview?.valid ? view.preview.shipments.find(shipment => shipment.orderId === order.id) : undefined;
  if (previewShipment) return { status, label: '松手后预计出库', previewShipment };
  if (status.status === 'ready') {
    const label = !view.animation && view.preview
      ? view.preview.valid ? '此落点暂不出库' : '落点无效 · 未结算'
      : '已满足 · 落子后检查';
    return { status, label };
  }
  if (status.status === 'blocked') {
    const label = status.reason === 'entry-blocked' ? '入口被堵 · 请留空'
      : status.reason === 'route-blocked' ? '数量已够 · 无空路' : '数量已够 · 通路被堵';
    return { status, label };
  }
  return { status, label: `再连 ${Math.max(0, order.amount - status.count)} ${state.rulesetVersion >= 2 ? '件' : '格'}` };
}

/** One short line, ordered by what the player can currently observe or do. */
export function boardHint(state: RunState, view: ViewState): string {
  if (view.animation) return `${cargoName(view.animation.shipment.cargo)}正在出库`;
  if (view.preview?.valid && view.preview.shipments.length) {
    const names = [...new Set(view.preview.shipments.map(shipment => cargoName(shipment.cargo)))];
    return `松手后预计出库：${names.join('、')}`;
  }
  if (view.preview && !view.preview.valid) return '落点无效，有效落子后才检查订单';
  if (state.orders.some(order => orderStatus(state, order).status === 'ready')) {
    return view.preview?.valid ? '此落点暂无出库，调整后再试' : '订单已满足，有效落子后检查全部订单';
  }
  const ordered = new Set(state.orders.map(order => order.cargo));
  const selected = state.candidates.find(piece => piece.id === view.selectedPieceId);
  if (selected) {
    return !ordered.has(selected.cargo) && !(state.rulesetVersion >= 2 && selected.trait === 'wildcard')
      ? `${cargoName(selected.cargo)}暂无订单，可先备货` : baseHint;
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
    if (most) return `${cargoName(most)}暂无订单，可先备货`;
  }
  return baseHint;
}
