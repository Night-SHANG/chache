import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {configureStaticArt,prepareStaticArt} from '../../../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES} from '../../../src/presentation/static-art-manifest.ts';
import {render} from '../../../src/presentation/renderer.ts';
import {createProfile} from '../../../src/application/profile.ts';
import {createRunV18} from '../../../src/domain/v18/engine.ts';
import {computeAndroidViewport} from '../../../src/platform/android-viewport.ts';
import {FRAME_BACKDROP} from '../../../src/platform/types.ts';
import type{ThemeId}from'../../../src/application/profile.ts';
import type{ViewState}from'../../../src/presentation/view-types.ts';
import type{Rect}from'../../../src/presentation/layout.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
configureStaticArt(async path=>await loadImage(new URL('../../../'+Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!.sourcePath,import.meta.url).pathname) as unknown as CanvasImageSource);
const out='artifacts/android-v114/background-adaptation';await mkdir(out,{recursive:true});
const themes=Object.keys(STATIC_ART_SCENES) as ThemeId[],shared=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'];
const sizes=[{name:'16by9',w:432,h:768},{name:'18by9',w:432,h:864},{name:'20by9',w:432,h:960},{name:'21by9',w:432,h:1008}];
const insets=[{name:'none',top:0,right:0,bottom:0,left:0},{name:'symmetric',top:30,right:12,bottom:30,left:12},{name:'asymmetric',top:36,right:6,bottom:18,left:18}];
const records=[];
const mosaics=sizes.map(s=>{const c=createCanvas(250*6,610*3),ctx=c.getContext('2d');ctx.fillStyle='#0c131c';ctx.fillRect(0,0,c.width,c.height);return {c,ctx,name:s.name};});
for(const [ti,theme]of themes.entries()){
 await prepareStaticArt({scene:`scene.${theme}`,shared,previews:[]});
 for(const [si,size]of sizes.entries())for(const inset of insets){
 const vp=computeAndroidViewport({x:0,y:0,w:size.w,h:size.h},{active:true,owner:true,widthPx:size.w,heightPx:size.h,insetsPx:inset});
 const content={x:(vp.safeRect.x-vp.origin.x)/vp.scale,y:(vp.safeRect.y-vp.origin.y)/vp.scale,w:vp.safeRect.w/vp.scale,h:vp.safeRect.h/vp.scale};
 for(const screen of ['menu','game'] as const){
 const pair=[];for(const stage of ['before','after']as const){
 const c=createCanvas(size.w,size.h),ctx=c.getContext('2d');ctx.fillStyle=FRAME_BACKDROP;ctx.fillRect(0,0,c.width,c.height);ctx.setTransform(vp.scale,0,0,vp.scale,vp.origin.x,vp.origin.y);
 const view:ViewState={screen,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'}},...(stage==='after'?{androidContentBounds:content}:{})};
 render(ctx as unknown as CanvasRenderingContext2D,createRunV18({seed:71,mode:'standard'}),view,stage==='after'?vp.overlay:{x:vp.overlay.x,y:0,w:vp.overlay.w,h:1920},vp.overlay,FRAME_BACKDROP);pair.push(c);
 if(screen==='menu'&&inset.name==='asymmetric')await writeFile(`${out}/${theme}-${size.name}-${inset.name}-${screen}-${stage}.png`,c.toBuffer('image/png'));
 if(screen==='menu'&&inset.name==='asymmetric'&&stage==='after'){const{ctx}=mosaics[si],x=ti%6*250,y=Math.floor(ti/6)*610;const displayScale=Math.min(242/size.w,565/size.h),displayH=size.h*displayScale,displayW=size.w*displayScale;ctx.drawImage(c,x+(242-displayW)/2,y+25,displayW,displayH);ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText(theme,x+5,y+20);}
 }
 if(screen==='game'){
 const region:Rect={x:Math.ceil(vp.origin.x+vp.scale*124),y:Math.ceil(vp.origin.y+vp.scale*564),w:Math.floor(vp.scale*832),h:Math.floor(vp.scale*832)};
 const hashes=pair.map(c=>createHash('sha256').update(c.getContext('2d').getImageData(region.x,region.y,region.w,region.h).data).digest('hex'));records.push({theme,size:size.name,insets:inset.name,boardEqual:hashes[0]===hashes[1],hashes});
 if(theme==='day'&&size.name==='21by9'&&inset.name==='asymmetric')for(const[i,c]of pair.entries())await writeFile(`${out}/day-game-${i?'after':'before'}.png`,c.toBuffer('image/png'));
 }
 }
 }
}
for(const{name,c}of mosaics)await writeFile(`${out}/all-17-${name}.png`,c.toBuffer('image/png'));
await writeFile(`${out}/board-pixel-checks.json`,JSON.stringify(records,null,2));
console.log(JSON.stringify({screensRendered:17*4*3*2*2,boardChecks:records.length,boardEqual:records.filter(r=>r.boardEqual).length,failures:records.filter(r=>!r.boardEqual).map(({theme,size,insets})=>({theme,size,insets}))}));
