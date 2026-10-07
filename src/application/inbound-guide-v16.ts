import type {InboundCommandV16} from '../domain/v16/types.ts';
/** Real standard16 seed: place chemistry, then ship food along the open north route. */
export const INBOUND_GUIDE_V16:{readonly seed:number;readonly commands:readonly InboundCommandV16[]}={
 seed:1,
 commands:[{type:'place',pieceId:'piece.4',origin:{x:1,y:1}},{type:'place',pieceId:'piece.3',origin:{x:3,y:1}}],
};
