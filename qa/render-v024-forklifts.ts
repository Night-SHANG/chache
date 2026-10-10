import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { forklift } from '../src/presentation/assets.ts';
import { loadThemedForkliftAtlas } from '../src/presentation/themed-forklift-art.ts';
import type { ForkliftId } from '../src/application/profile.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Review CJK');
const paints: ForkliftId[] = ['yellow','blue','red','white','electric','toy','paper','space','heavy','steam','neon','lava','diving','royal','field','timber','ice','harbor'];
const names=['基础黄','基础蓝','基础红','工程白','电驱 · 保留','玩具 · 保留','纸艺 · 保留','舱内 · 保留','重载','蒸汽','霓虹','熔岩','潜水','皇家','野战','林木','冰晶','港口'];
const out = new URL('../artifacts/v024-forklifts/', import.meta.url); mkdirSync(out,{recursive:true});
await loadThemedForkliftAtlas(async path => await loadImage(new URL(`../${path}`,import.meta.url).pathname) as unknown as CanvasImageSource);
for(const scene of [true,false]){
 const canvas=createCanvas(1000,110+paints.length*98),ctx=canvas.getContext('2d');
 if(scene){ctx.fillStyle='#223843';ctx.fillRect(0,0,canvas.width,canvas.height);}
 ctx.fillStyle=scene?'#f1e8d3':'#263d49';ctx.font='bold 22px "Review CJK"';ctx.fillText('v0.24 结构叉车 / 4 款原样 + 4 款选定旧款 + 10 款新车身',16,30);
 ctx.font='16px "Review CJK"';ctx.fillText('车型',16,78);ctx.fillText('预览 80px',175,78);ctx.fillText('44px',305,78);ctx.fillText('37px',415,78);ctx.fillText('29px · 四向真实栅格尺寸',525,78);ctx.fillText('轮廓对比',857,78);
 paints.forEach((paint,i)=>{const y=110+i*98;if(scene){ctx.fillStyle=i%2?'#20333d':'#29404a';ctx.fillRect(0,y-4,1000,98);ctx.strokeStyle='#344c54';ctx.lineWidth=1;for(let j=0;j<4;j++)ctx.strokeRect(518+j*80,y+10,64,64);}
 ctx.fillStyle=scene?'#f0e5c9':'#263d49';ctx.font='17px "Review CJK"';ctx.fillText(names[i],16,y+48);
 for(const [x,size,angle] of [[215,80,0],[330,44,0],[440,37,0],[550,29,0],[630,29,Math.PI/2],[710,29,Math.PI],[790,29,Math.PI*1.5]])forklift(ctx as unknown as CanvasRenderingContext2D,x,y+43,size,angle,paint);
 const mask=createCanvas(110,90),m=mask.getContext('2d');forklift(m as unknown as CanvasRenderingContext2D,50,43,80,0,paint);const data=m.getImageData(0,0,110,90);for(let j=0;j<data.data.length;j+=4){data.data[j]=data.data[j+1]=data.data[j+2]=scene?232:25;data.data[j+3]=data.data[j+3]>=240?255:0;}m.putImageData(data,0,0);ctx.drawImage(mask,858,y);
 });writeFileSync(new URL(scene?'after-v024-scene.png':'after-v024-transparent.png',out),canvas.toBuffer('image/png'));
}
