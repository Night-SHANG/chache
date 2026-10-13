/** Source renderer continuity evidence, not a native WebView/splash acceptance.
 * Normal first frames have exactly their current scene and forklift decoded.
 * Error frames keep the same simplified frame as other shared PNGs settle.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {computeAndroidViewport} from '../src/platform/android-viewport.ts';
import {render} from '../src/presentation/renderer.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES,STATIC_ART_SCENES} from '../src/presentation/static-art-manifest.ts';

const out=resolve(process.env.ANDROID_BACKGROUND_QA_DIR??'qa/android-background-continuity');
await mkdir(out,{recursive:true});
const report={kind:'Source renderer native-Canvas frame sequence',status:'RUNNING',nativeAndroidAcceptance:'NOT RUN',cases:[]};
const themes=Object.keys(STATIC_ART_SCENES),state=createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'});
const rawLoader=async path=>await loadImage(resolve(Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path).sourcePath));
const hash=ctx=>createHash('sha256').update(ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data).digest('hex');
for(const theme of themes)for(const ratio of [16/9,18/9,20/9,21/9]){
 const width=360,height=Math.round(width*ratio),sheet=createCanvas(width*3,(height+26)*2),sheetContext=sheet.getContext('2d');
 for(const [row,failed] of [false,true].entries()){
  configureStaticArt(async path=>{if(failed&&path===STATIC_ART_RESOURCES[`scene.${theme}`].src)throw Error('intentional scene failure');return await rawLoader(path);});
  const first=await prepareStaticArt({scene:`scene.${theme}`,shared:['forklift.base'],previews:[]});assert.equal(first.status,failed?'error':'ready');
  const vp=computeAndroidViewport({x:0,y:0,w:width,h:height},{active:true,owner:true,widthPx:width,heightPx:height,insetsPx:{top:0,right:0,bottom:0,left:0}});
  const view={screen:'menu',profile:{...createProfile(),cosmetics:{theme,cargo:'classic',forklift:'yellow'}},selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,androidContentBounds:vp.content};
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),hashes=[];
  for(let frame=0;frame<3;frame++){
   if(frame)await prepareStaticArt({scene:`scene.${theme}`,shared:['forklift.base',...(frame===1?['cargo.core']:['cargo.core','material.scene','material.board','frame.classic','tools.core','forklift.styled','material.cargo'])],previews:[]});
   ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#101923';ctx.fillRect(0,0,width,height);ctx.setTransform(vp.scale,0,0,vp.scale,vp.origin.x,vp.origin.y);
   render(ctx,state,view,vp.overlay,vp.overlay,'#101923');hashes.push(hash(ctx));
   assert.equal(hashes[frame],hashes[0],`${theme}/${ratio}/${failed?'fallback':'ready'} frame ${frame} moved after optional PNGs`);
   const name=`${theme}-${Math.round(ratio*9)}x9-${failed?'failed':'ready'}-${frame}.png`,encoded=canvas.toBuffer('image/png');await writeFile(resolve(out,name),encoded);
   sheetContext.fillStyle='#101923';sheetContext.fillRect(width*frame,(height+26)*row,width,height+26);sheetContext.fillStyle='#ffffff';sheetContext.font='13px sans-serif';sheetContext.fillText(`${failed?'failed scene':'ready scene'} / ${frame===0?'first visible':`optional batch ${frame}`}`,width*frame+8,(height+26)*row+18);sheetContext.drawImage(await loadImage(encoded),width*frame,(height+26)*row+26);
  }
  report.cases.push({theme,ratio,mode:failed?'stable error fallback':'ready PNG first frame',frames:hashes.length,hashes});
 }
 if(['day','cold_chain','ocean_vault'].includes(theme)&&ratio===21/9)await writeFile(resolve(out,`${theme}-21x9-sequence.png`),sheet.toBuffer('image/png'));
}
report.status='PASS';report.frames=report.cases.reduce((sum,item)=>sum+item.frames,0);await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${report.cases.length} cases / ${report.frames} rendered frames; every same-scene sequence is pixel-identical.`);
