import type {GameRun} from '../domain/playable.ts';
import type {ViewState} from './view-types.ts';
import {boardGeometry} from './board-geometry.ts';
import {shipmentGate,dockPosition} from './motion.ts';

/** Cards and doors share the same historical order identities for the whole batch. */
export function orderPresentation(state:GameRun,view:ViewState){
 const animation=state.mode==='color_exit'?null:view.animation;
 const orders=animation?.orders??state.orders,completedOrderIds=animation?.completedOrderIds??[],queuedOrderIds=animation?.queuedOrderIds??[];
 const gates=orders.filter(order=>!completedOrderIds.includes(order.id)).map(order=>({dockId:order.dockId,cargo:order.cargo}));
 const shipment=animation?.shipment,entrance=shipment&&shipmentGate(shipment);
 if(shipment&&entrance){
  const dock=boardGeometry(state).docks.find(candidate=>{const p=dockPosition(candidate,state);return p.x===entrance.x&&p.y===entrance.y;});
  if(dock){const gate=gates.find(item=>item.dockId===dock.id);if(gate)gate.cargo=shipment.cargo;else gates.push({dockId:dock.id,cargo:shipment.cargo});}
 }
 return {orders,completedOrderIds,queuedOrderIds,gates};
}
