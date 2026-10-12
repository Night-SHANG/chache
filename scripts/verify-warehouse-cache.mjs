// Historical v112 renderer evidence. Frozen painters preserve original pixel contracts; this is not v113 runtime validation.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {createCanvas,Image,ImageData} from '@napi-rs/canvas';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Read-only raster QA in a disposable cloud Chromium, never the user's browser.
// Optional --baseline=/path/to/frozen/repo compares against an independent baseline bundle.
// --baseline-cache also exercises a frozen baseline that already contains the native cache.
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'artifacts/mobile-static-cache');
const baselineCached=process.argv.includes('--baseline-cache');
const baseline=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice(11)??root;
await mkdir(out,{recursive:true});
const exportsFor=(dir,cached)=>`
export {render} from '${dir===root?resolve(root,'scripts/static-art-authoring'):dir}/src/presentation/renderer.ts';
export {createRunV18} from '${dir}/src/domain/v18/engine.ts';
export {createProfile} from '${dir}/src/application/profile.ts';
export {COSMETIC_CATALOG} from '${dir}/src/application/cosmetics.ts';
export {loadCargoAtlas} from '${dir===root?resolve(root,'scripts/static-art-authoring'):dir}/src/presentation/cargo-atlas.ts';
export {loadBoardMaterialAtlas} from '${dir===root?resolve(root,'scripts/static-art-authoring'):dir}/src/presentation/board-material-atlas.ts';
export {loadSceneMaterialAtlas} from '${dir===root?resolve(root,'scripts/static-art-authoring'):dir}/src/presentation/scene-frame-atlas.ts';
export {loadThemedForkliftAtlas} from '${dir===root?resolve(root,'scripts/static-art-authoring'):dir}/src/presentation/themed-forklift-art.ts';
${cached?`export {configureWarehouseCache} from '${dir===root?resolve(root,'scripts/static-art-authoring'):dir}/src/presentation/warehouse-cache.ts';`:''}`;
async function bundle(dir,cached,name){return (await build({stdin:{contents:exportsFor(dir,cached),loader:'ts',resolveDir:root},bundle:true,format:'iife',globalName:name,write:false,define:{__PLAYTEST_FREE_SHOP__:'false',__DEV_DIAGNOSTICS__:'false'}})).outputFiles[0].text;}
const [original,current]=await Promise.all([bundle(baseline,baselineCached,'WarehouseOriginal'),bundle(root,true,'WarehouseCached')]);
const assets={};for(const name of ['cargo-materials','board-materials','scene-materials','themed-forklifts'])assets[`assets/${name}.png`]=`data:image/png;base64,${(await readFile(resolve(root,`assets/${name}.png`))).toString('base64')}`;
async function verify({assets,baselineCached}){

  const original=window.WarehouseOriginal,current=window.WarehouseCached;
  for(const api of [original,current])for(const name of ['loadCargoAtlas','loadBoardMaterialAtlas','loadSceneMaterialAtlas','loadThemedForkliftAtlas'])await api[name](path=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=assets[path];}));
  const state=original.createRunV18({mode:'standard',seed:17,inboundDifficulty:'hard'}),base={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false};
  const sizes=[{name:'dpr1',w:360,h:800,s:1/3,x:0,y:80},{name:'dpr2',w:720,h:1600,s:2/3,x:0,y:160},{name:'dpr3',w:1080,h:2400,s:1,x:0,y:240},{name:'fractional',w:540,h:1000,s:.5,x:0,y:20.3},{name:'wide-phase',w:800,h:1000,s:.5,x:130.25,y:20.3},{name:'landscape',w:1356,h:660,s:660/1920,x:(1356-1080*660/1920)/2,y:0},{name:'phone1440',w:1440,h:3120,s:4/3,x:0,y:280}];
  function canvas(spec){const c=document.createElement('canvas');c.width=spec.w;c.height=spec.h;return c;}
  function frame(api,c,spec,view,cached){const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0c131c';ctx.fillRect(0,0,c.width,c.height);ctx.setTransform(spec.s,0,0,spec.s,spec.x,spec.y);api.render(ctx,state,view,{x:-60,y:0,w:1200,h:1920},{x:-spec.x/spec.s,y:-spec.y/spec.s,w:c.width/spec.s,h:c.height/spec.s},cached?'#0c131c':undefined);return ctx.getImageData(0,0,c.width,c.height);}
  const rows=[],pictures=[];
  for(const {id:theme} of [...original.COSMETIC_CATALOG.filter(item=>item.kind==='theme'),{id:'express_sorting'}])for(const spec of sizes)for(const screen of ['menu','game','settings']){
   const profile=original.createProfile();profile.cosmetics.theme=theme;const view={...base,screen,profile,paused:screen==='game'&&theme==='night'},expected=canvas(spec),actual=canvas(spec);let allocations=0;
   current.configureWarehouseCache(()=>{allocations++;return document.createElement('canvas');});if(baselineCached)original.configureWarehouseCache(()=>document.createElement('canvas'));const pixels=frame(original,expected,spec,view,baselineCached);
   for(const phase of ['cold','warm']){
    const actualPixels=frame(current,actual,spec,view,true);let channels=0,maxDelta=0;
    if(typeof Buffer==='undefined'||Buffer.compare(Buffer.from(pixels.data.buffer),Buffer.from(actualPixels.data.buffer))!==0)for(let i=0;i<pixels.data.length;i++){const delta=Math.abs(pixels.data[i]-actualPixels.data[i]);if(delta)channels++;maxDelta=Math.max(maxDelta,delta);}
    rows.push({theme,screen,size:spec.name,phase,channels,maxDelta,allocations});
    if(screen==='game'&&theme==='day'&&spec.name==='wide-phase'&&phase==='warm'){const difference=canvas(spec),diff=new ImageData(spec.w,spec.h);for(let i=0;i<diff.data.length;i++)diff.data[i]=i%4===3?255:Math.abs(pixels.data[i]-actualPixels.data[i]);difference.getContext('2d').putImageData(diff,0,0);pictures.push({name:'original',data:expected.toDataURL()},{name:'cached',data:actual.toDataURL()},{name:'difference',data:difference.toDataURL()});}
   }
   // Explicitly release temporary native raster storage between cases, including on Node hosts.
   current.configureWarehouseCache();if(baselineCached)original.configureWarehouseCache();expected.width=1;expected.height=1;actual.width=1;actual.height=1;
  }
  return {rows,pictures};
}
if(process.argv.includes('--native')){
 const sandbox={document:{createElement:()=>createCanvas(1,1)},Image,ImageData,Buffer,console};sandbox.window=sandbox;
 const result=await runInNewContext(original+'\n'+current+'\n('+verify.toString()+')('+JSON.stringify({assets,baselineCached})+')',sandbox);
 for(const picture of result.pictures)await writeFile(resolve(out,`native-${picture.name}.png`),Buffer.from(picture.data.split(',')[1],'base64'));
 await writeFile(resolve(out,'native-pixels.json'),JSON.stringify({baseline,baselineCached,engine:'@napi-rs/canvas 1.0.10',rows:result.rows},null,2));
 const failed=result.rows.filter(row=>row.channels!==0||row.allocations!==1);console.log(JSON.stringify({comparisons:result.rows.length,failed:failed.length,examples:failed.slice(0,5)}));
 if(failed.length)throw Error('Native raster parity failed');
}else if(process.argv.includes('--html')){
 const html='<!doctype html><meta charset="utf-8"><title>Warehouse static-cache pixel QA</title><h1>Warehouse static-cache pixel QA</h1><pre id="summary">Running offline comparison…</pre><div id="downloads"></div><div id="pictures"></div><script>'+original+'\n'+current+'\n('+verify.toString()+')('+JSON.stringify({assets,baselineCached})+').then(result=>{const rows=result.rows,failed=rows.filter(row=>row.channels!==0||row.allocations!==1);document.getElementById("summary").textContent=JSON.stringify({comparisons:rows.length,failed:failed.length,examples:failed.slice(0,5)});const a=document.createElement("a");a.textContent="Download pixel results";a.download="chromium-pixels.json";a.href="data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify({engine:navigator.userAgent,rows},null,2));document.getElementById("downloads").append(a);for(const picture of result.pictures){const figure=document.createElement("figure"),caption=document.createElement("figcaption"),img=document.createElement("img"),link=document.createElement("a");caption.textContent=picture.name;img.src=picture.data;img.style.width="400px";link.textContent="Download "+picture.name;link.href=picture.data;link.download="chromium-"+picture.name+".png";figure.append(caption,img,link);document.getElementById("pictures").append(figure);}}).catch(error=>document.getElementById("summary").textContent=String(error));<\/script>';
 await writeFile(resolve(out,'browser-qa.html'),html);console.log(resolve(out,'browser-qa.html'));
}else{
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,chromiumSandbox:true,env:{...process.env,HOME:'/tmp/warehouse-cache-chromium',XDG_CACHE_HOME:'/tmp/warehouse-cache-chromium/cache',XDG_CONFIG_HOME:'/tmp/warehouse-cache-chromium/config'}});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<!doctype html><html><body></body></html>');await page.addScriptTag({content:original});await page.addScriptTag({content:current});
 const result=await page.evaluate(verify,{assets,baselineCached});
 for(const picture of result.pictures)await writeFile(resolve(out,`chromium-${picture.name}.png`),Buffer.from(picture.data.split(',')[1],'base64'));
 await writeFile(resolve(out,'chromium-pixels.json'),JSON.stringify({baseline,baselineCached,engine:await browser.version(),errors,rows:result.rows},null,2));
 const failed=result.rows.filter(row=>row.channels!==0||row.allocations!==1);console.log(JSON.stringify({engine:await browser.version(),comparisons:result.rows.length,failed:failed.length,errors,examples:failed.slice(0,5)}));
 if(failed.length||errors.length)throw Error('Warehouse cache pixels or cache-hit assertions differ; see chromium-pixels.json');
}finally{await browser.close();}

}
