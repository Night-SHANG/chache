import type {ItemId} from '../application/account-types.ts';
import {cargoBox,gradient,roundedPath,text} from './assets.ts';

/** Shared procedural warehouse equipment artwork for the shop, carry cards and toolbox. */
export function drawToolIcon(ctx:CanvasRenderingContext2D,item:ItemId,x:number,y:number,size:number):void {
 ctx.save();ctx.translate(x,y);ctx.scale(size/160,size/160);
 ctx.fillStyle='rgba(6,14,23,.3)';ctx.beginPath();ctx.ellipse(79,143,64,11,0,0,Math.PI*2);ctx.fill();
 if(item==='rotate'){
  cargoBox(ctx,'cargo.chem',36,38,103);
  ctx.strokeStyle='#fff0b5';ctx.lineWidth=11;ctx.lineCap='round';ctx.beginPath();ctx.arc(76,72,57,Math.PI*.95,Math.PI*1.98);ctx.stroke();
  ctx.fillStyle='#fff0b5';ctx.strokeStyle='#785a2c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(117,56);ctx.lineTo(149,64);ctx.lineTo(140,31);ctx.closePath();ctx.fill();ctx.stroke();
  roundedPath(ctx,2,89,55,36,8);ctx.fillStyle='#243444';ctx.fill();text(ctx,'90°',29,107,25,'#fff0b5','center');
 }else if(item==='clear'){
  cargoBox(ctx,'cargo.cold',20,49,91);
  ctx.save();ctx.translate(104,77);ctx.rotate(.57);roundedPath(ctx,-7,-69,14,92,5);ctx.fillStyle=gradient(ctx,-7,-69,92,'#f5d19a','#b47742');ctx.fill();ctx.strokeStyle='#6d492d';ctx.lineWidth=3;ctx.stroke();
  roundedPath(ctx,-32,11,64,23,6);ctx.fillStyle='#f3bd54';ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-28,32);ctx.lineTo(-37,68);ctx.lineTo(37,68);ctx.lineTo(28,32);ctx.closePath();ctx.fillStyle='#e8d6a6';ctx.fill();ctx.stroke();ctx.strokeStyle='#b18b56';for(const xx of [-22,-11,0,11,22]){ctx.beginPath();ctx.moveTo(xx,35);ctx.lineTo(xx*1.2,63);ctx.stroke();}ctx.restore();
  ctx.strokeStyle='#a9def2';ctx.lineWidth=4;ctx.lineCap='round';for(const yy of [112,125]){ctx.beginPath();ctx.moveTo(9,yy);ctx.lineTo(26,yy);ctx.stroke();}
 }else{
  cargoBox(ctx,'cargo.electronic',25,24,126);
  ctx.fillStyle='#ffe6a3';ctx.strokeStyle='#57417d';ctx.lineWidth=4;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?18:39,xx=78+Math.cos(a)*r,yy=92+Math.sin(a)*r;if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff2c9';for(const [sx,sy,r] of [[17,33,9],[141,21,13],[146,124,8]]){ctx.beginPath();ctx.moveTo(sx,sy-r);ctx.lineTo(sx+r*.4,sy);ctx.lineTo(sx,sy+r);ctx.lineTo(sx-r*.4,sy);ctx.closePath();ctx.fill();}
 }
 ctx.restore();
}

export function drawToolboxIcon(ctx:CanvasRenderingContext2D,x:number,y:number,size:number):void {
 ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);ctx.lineWidth=5;ctx.strokeStyle='#192533';
 roundedPath(ctx,32,11,36,26,6);ctx.strokeStyle='#efc16b';ctx.stroke();
 roundedPath(ctx,9,31,82,56,9);ctx.fillStyle=gradient(ctx,9,31,56,'#f0c969','#b77934');ctx.fill();ctx.strokeStyle='#604629';ctx.stroke();
 ctx.fillStyle='#ffe5a0';ctx.fillRect(13,49,74,7);ctx.fillStyle='#253949';roundedPath(ctx,42,45,16,22,3);ctx.fill();ctx.fillStyle='#fff0b5';ctx.fillRect(48,49,4,11);ctx.restore();
}
