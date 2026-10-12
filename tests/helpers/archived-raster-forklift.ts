import assert from 'node:assert/strict';
import { roundedPath } from '../../scripts/static-art-authoring/src/presentation/assets.ts';
import { drawThemedForkliftBody } from '../../scripts/static-art-authoring/src/presentation/themed-forklift-art.ts';
import type { ForkliftId } from '../../scripts/static-art-authoring/src/application/profile.ts';

/** Historical v0.20 raster compositor, for frozen asset validation only.
 * The active v0.24 dispatch is verified separately by structural-forklift-art.test.ts.
 * Keep the original wheel/shadow/fork sequence so all existing archive hashes remain meaningful.
 */
export function archivedRasterForklift(ctx: CanvasRenderingContext2D,x:number,y:number,size:number,angle:number,paint:ForkliftId):void {
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size/110,size/110);
 ctx.fillStyle='rgba(0,0,0,.33)';ctx.beginPath();ctx.ellipse(0,7,57,39,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#131920';for(const xx of [-32,19])for(const yy of [-36,23]){roundedPath(ctx,xx,yy,23,17,4);ctx.fill();}
 assert.equal(drawThemedForkliftBody(ctx,paint),true,'archive fixture requires the actual retained atlas');
 ctx.strokeStyle='#2d3438';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(30,-31);ctx.lineTo(30,31);ctx.stroke();
 ctx.strokeStyle='#bac1ba';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(31,-17);ctx.lineTo(61,-17);ctx.moveTo(31,17);ctx.lineTo(61,17);ctx.stroke();
 ctx.fillStyle='#fff2a5';ctx.fillRect(24,-24,5,7);ctx.fillRect(24,17,5,7);ctx.restore();
}
