import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {mkdir,writeFile} from 'node:fs/promises';
import {prepareArt} from '../../../tests/helpers/static-art-fixture.ts';
import {createRunV18} from '../../../src/domain/v18/engine.ts';
import {createProfile} from '../../../src/application/profile.ts';
import {computeAndroidViewport} from '../../../src/platform/android-viewport.ts';
import {render} from '../../../src/presentation/renderer.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
const out='artifacts/android-v114/pause';await mkdir(out,{recursive:true});await prepareArt('day');
const width=540,height=1260,vp=computeAndroidViewport({x:0,y:0,w:width,h:height},{active:true,owner:true,widthPx:1080,heightPx:2520,insetsPx:{top:100,right:24,bottom:80,left:36}});
for(const mode of ['standard','endless'])for(const paused of [false,true]){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),state=createRunV18({seed:71,mode});
 const view={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),androidContentBounds:vp.content};
 ctx.fillStyle='#0c131c';ctx.fillRect(0,0,width,height);ctx.setTransform(vp.scale,0,0,vp.scale,vp.origin.x,vp.origin.y);render(ctx,state,view,vp.overlay,vp.overlay,'#0c131c');
 await writeFile(`${out}/${mode}-${paused?'paused':'game'}-21x9.png`,canvas.toBuffer('image/png'));
}
console.log(out);
