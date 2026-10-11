import type {Rect} from './layout.ts';
/** Shared full-viewport modal shade; defaults preserve legacy logical-canvas callers. */
export function shade(ctx: CanvasRenderingContext2D, bounds:Rect={x:0,y:0,w:1080,h:1920}, opacity=.84): void { ctx.fillStyle = `rgba(5,11,18,${opacity})`; ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h); }
