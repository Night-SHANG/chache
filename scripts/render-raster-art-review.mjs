import {createCanvas,loadImage} from '@napi-rs/canvas';import {writeFile,mkdir} from 'node:fs/promises';
import {cargoBox} from '../src/presentation/assets.ts';import {CARGO_ATLAS,loadCargoAtlas} from '../src/presentation/cargo-atlas.ts';import {loadThemedForkliftAtlas} from '../src/presentation/themed-forklift-art.ts';import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
const out='artifacts/v0190-art-review';await mkdir(out,{recursive:true});await loadCargoAtlas(p=>loadImage(p));await loadThemedForkliftAtlas(p=>loadImage(p));
const c=createCanvas(1200,14*140+50),ctx=c.getContext('2d');ctx.fillStyle='#142431';ctx.fillRect(0,0,c.width,c.height);ctx.font='18px "Noto Sans CJK SC"';ctx.fillStyle='#e5e7de';ctx.fillText('五色真实材质 64px | 29px/37px实盘 | 动态3/2/1、危险、托盘、万能',15,25);
for(const [row,style] of CARGO_ATLAS.styles.entries()){
 const y=50+row*140;ctx.font='16px "Noto Sans CJK SC"';ctx.fillStyle='#e5e7de';ctx.fillText(COSMETIC_CATALOG.find(i=>i.kind==='cargo'&&i.id===style).name,10,y+22);
 for(const [i,cargo]of CARGO_ATLAS.cargos.entries())cargoBox(ctx,cargo,150+i*70,y+5,64,1,undefined,style);
 for(const [i,cargo]of CARGO_ATLAS.cargos.entries()){cargoBox(ctx,cargo,150+i*34,y+82,29,1,undefined,style);cargoBox(ctx,cargo,360+i*42,y+82,37,1,undefined,style);}
 for(const [i,trait]of [{kind:'rush',remaining:3},{kind:'rush',remaining:2},{kind:'rush',remaining:1},{kind:'hazard'},{kind:'pallet'},{kind:'wildcard'}].entries())cargoBox(ctx,CARGO_ATLAS.cargos[i%5],650+i*73,y+18,60,1,trait,style,true);
 ctx.strokeStyle='#354751';ctx.beginPath();ctx.moveTo(8,y+134);ctx.lineTo(1190,y+134);ctx.stroke();
}
await writeFile(`${out}/all-crates-with-live-badges.png`,c.toBuffer('image/png'));
