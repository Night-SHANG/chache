import type { BoardGeometry } from './board-geometry.ts';
import { text } from './assets.ts';

/** Shared no-cargo marking for the actual board and cosmetic preview. */
export function drawReservedEntryMarkers(ctx:CanvasRenderingContext2D,g:Readonly<BoardGeometry>,indices:readonly number[]):void {
 ctx.save();
 for(const index of indices){
  const x=g.x+index%g.dimension*g.cell,y=g.y+Math.floor(index/g.dimension)*g.cell,c=g.cell;
  ctx.fillStyle='#294a51';ctx.fillRect(x+3,y+3,c-6,c-6);
  ctx.save();ctx.beginPath();ctx.rect(x+5,y+5,c-10,c-10);ctx.clip();ctx.strokeStyle='rgba(158,223,255,.22)';ctx.lineWidth=7*g.scale;
  for(let offset=-c;offset<c*2;offset+=24*g.scale){ctx.beginPath();ctx.moveTo(x+offset,y+c);ctx.lineTo(x+offset+c,y);ctx.stroke();}ctx.restore();
  ctx.strokeStyle='#9edfff';ctx.lineWidth=3*g.scale;ctx.strokeRect(x+6*g.scale,y+6*g.scale,c-12*g.scale,c-12*g.scale);
  const mid=x+c/2,top=y+c*.28,w=c*.28;ctx.fillStyle='#294a51';ctx.fillRect(mid-w*.7,top-5,w*1.4,w*1.5);
  ctx.strokeStyle='#c3e8f5';ctx.lineWidth=3*g.scale;ctx.strokeRect(mid-w/2,top,w,w);ctx.beginPath();ctx.moveTo(mid-w*.7,top+w*1.2);ctx.lineTo(mid+w*.7,top-w*.2);ctx.stroke();
  text(ctx,'留空',mid,y+c*.81,23*g.scale,'#cfedfa','center');
 }
 ctx.restore();
}

