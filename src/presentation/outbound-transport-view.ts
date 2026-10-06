import type {Point,Shipment} from '../domain/types.ts';
import {boardGeometry} from './board-geometry.ts';
import {cellCenter} from './layout.ts';
import type {sampleOutboundTransport} from './outbound-transport.ts';
type TransportSample=ReturnType<typeof sampleOutboundTransport>;

/** The whole floor footprint stays inside a single grid cell, including stationary turns. */
export function outboundVehicleDisplay(shipment:Shipment,frame:TransportSample){
 const geometry=boardGeometry(shipment),center=cellCenter(frame.position,geometry),forward={x:Math.cos(frame.angle),y:Math.sin(frame.angle)},cell=geometry.cell;
 return {x:center.x-forward.x*cell*.1,y:center.y-forward.y*cell*.1,angle:frame.angle,alpha:frame.alpha,vehicleSize:cell*.6,
  cargo:{x:center.x+forward.x*cell*.18,y:center.y+forward.y*cell*.18},cargoSize:cell*.34,loadedCount:frame.loadedCount};
}
/** Only the current adjacent crate moves to the forks. Already collected crates live on the stack. */
export function outboundPickupCargoPose(shipment:Shipment,cell:number,frame:TransportSample):Point&{scale:number;alpha:number}{
 const geometry=boardGeometry(shipment),source=cellCenter({x:cell%geometry.dimension,y:Math.floor(cell/geometry.dimension)},geometry);
 if(frame.pickedCells.includes(cell))return {...source,scale:1,alpha:0};
 if(frame.pickup?.cell!==cell)return {...source,scale:1,alpha:1};
 const progress=frame.pickup.progress,target=outboundVehicleDisplay(shipment,frame).cargo;
 return {x:source.x+(target.x-source.x)*progress,y:source.y+(target.y-source.y)*progress,scale:1-progress*(1-geometry.cell*.34/geometry.boxSize),alpha:1};
}
