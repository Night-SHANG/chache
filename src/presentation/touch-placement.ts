import type {Point} from '../domain/types.ts';
import type {GameRun} from '../domain/playable.ts';
import {boardGeometry} from './board-geometry.ts';
import {getTrayRects,hitTestPoint,L} from './layout.ts';

/** A modest logical-cell offset, independent of DPR and cargo height. At 7/9
 * cells the bottom-row finger stays above the tray; tall cargo is not lifted
 * several rows. Device comfort still needs a real-phone check. */
export function touchDragLift(state:GameRun):number {return boardGeometry(state).cell*1.25;}

/** The drag drawing, grid preview and release must resolve this same point.
 * The original pointer still owns cancellation: lifting a tray/offscreen touch
 * must never manufacture a board drop. Mouse, pen and tap/tap remain direct. */
export function projectPlacementPoint(point:Point,state:GameRun,touchDrag:boolean):Point|null {
 if(!touchDrag)return point;
 const trayTop=Math.min(...getTrayRects(state.candidates.length).map(rect=>rect.y));
 if(!hitTestPoint(point,{x:0,y:0,w:L.width,h:L.height})||point.y>=trayTop)return null;
 return {x:point.x,y:point.y-touchDragLift(state)};
}
