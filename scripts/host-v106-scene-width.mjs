/** Original production bundles only. Isolated QA accounts are never player data. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';
import {createPaginatedBrowserHost} from './paginated-cosmetics-browser-host.mjs';
import {createGrowthHost} from './growth-host-support.mjs';
import {cosmeticAccountStorage} from './cosmetic-stage15-host-support.mjs';
import {attachPixelWitness} from './refinement-host-support.mjs';
import {PaginatedCosmeticsDriver} from './paginated-cosmetics-host-runtime.mjs';
import {getCosmeticSet} from '../src/application/cosmetic-sets.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const baseline=resolve(arg('--baseline')??'../v105-review/paid-final'),build=resolve(arg('--build')??'build'),out=resolve(arg('--out')??'artifacts/v106-background');
await mkdir(out,{recursive:true});
for(const weight of ['Regular','Bold'])GlobalFonts.registerFromPath(`/usr/share/fonts/opentype/noto/NotoSansCJK-${weight}.ttc`,'Noto Sans CJK SC');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),expected={browser:'85534a47ecf9e1c972150c98db333e0776c67eca38d3265520c265407e17d493',wechat:'a5c315ecde01d43ba03e88e327032457d27418c7b617362580124a4190c60309'};
const manifest=JSON.parse(await readFile(resolve(build,'browser/build-manifest.json'),'utf8'));
assert.equal(manifest.version,'1.0.6');assert.equal(manifest.shopPricingMode,'paid');assert.equal(manifest.developerDiagnostics,false);
assert.deepEqual(manifest,JSON.parse(await readFile(resolve(build,'wechat/build-manifest.json'),'utf8')));
for(const target of ['browser','wechat'])assert.equal(hash(await readFile(resolve(baseline,`${target}/${target==='browser'?'app':'game'}.js`))),expected[target]);
const report={version:'1.0.6',manifest,baselineHashes:expected,status:'RUNNING',kind:'Unmodified production bundles in native Canvas/DOM-event and wx hosts',limitations:['Not a real browser GUI, WeChat developer tool, Windows GUI or physical-device test.','All owned-theme/funded accounts are isolated fixtures.','Only one non-default background is horizontally fitted to the classic finite frame; UI is unchanged. Tall-window top and bottom letterboxing is intentionally unchanged.'],cases:[],images:[],failures:[]};
const themes=COSMETIC_CATALOG.filter(item=>item.kind==='theme'),classic=theme=>['day','night'].includes(theme);
const standard={name:'wide',width:1356,height:660,safeTop:0,dpr:1};
const configs=[{name:'phone',width:446,height:694,safeTop:0,dpr:1},{name:'exact',width:432,height:768,safeTop:0,dpr:1},{name:'tall',width:390,height:844,safeTop:0,dpr:1},{name:'tablet',width:768,height:1024,safeTop:0,dpr:1},{name:'landscape',width:1440,height:900,safeTop:0,dpr:1},{name:'safe-dpr2',width:512,height:800,safeTop:32,dpr:2}];
const storage=theme=>cosmeticAccountStorage({wallet:244,label:'FUNDED: isolated v1.0.6 background comparison',owned:COSMETIC_CATALOG.map(item=>item.key),cosmetics:{theme,cargo:getCosmeticSet(theme)?.cargo??'classic',forklift:getCosmeticSet(theme)?.forklift??'yellow'}});
async function host(root,target,theme,config,data=storage(theme)){
 const bundlePath=resolve(root,`${target}/${target==='browser'?'app':'game'}.js`),options={...config,bundlePath,storage:data,epoch:Date.parse('2026-10-11T00:00:00Z')};
 const h=target==='browser'?await createPaginatedBrowserHost(options):await createGrowthHost({...options,deferImageLoads:true});
 await h.settleImages();assert.ok(h.imageTrace.every(row=>row.status==='loaded'));h.frame(0);assert.equal(h.account().account.profile.cosmetics.theme,theme);return h;
}
function compare(before,after,target,theme,config,name){
 const dpr=config.dpr,safe=target==='wechat'?config.safeTop:0,scale=Math.min(config.width/1080,(config.height-safe)/1920),ox=(config.width-1080*scale)/2,oy=safe+(config.height-safe-1920*scale)/2;
 assert.deepEqual(after.labels,before.labels,`${name}: text geometry changed`);assert.deepEqual(after.account(),before.account(),`${name}: account changed`);
 if(classic(theme))assert.deepEqual(after.context.getImageData(0,0,after.canvas.width,after.canvas.height).data,before.context.getImageData(0,0,before.canvas.width,before.canvas.height).data,`${name}: default artwork changed`);
 const left=Math.floor((ox-57*scale)*dpr),right=Math.ceil((ox+1148*scale)*dpr),data=after.context.getImageData(0,0,after.canvas.width,after.canvas.height).data;
 let outsidePixels=0;
 if(!classic(theme))for(let y=0;y<after.canvas.height;y++)for(const [start,end]of [[0,Math.max(0,left)],[Math.min(after.canvas.width,right),after.canvas.width]])for(let x=start;x<end;x++){
  const i=(y*after.canvas.width+x)*4;assert.ok(data[i]===12&&data[i+1]===19&&data[i+2]===28&&data[i+3]===255,`${name}: outside classic frame changed ${x},${y}`);outsidePixels++;
 }
 const row={name,target,theme,config,scale,offsetX:ox,offsetY:oy,classicFrame:{x:ox-57*scale,right:ox+1148*scale},backgroundPixelsIntentionallyChanged:!classic(theme),textIdentical:true,accountIdentical:true,defaultFullCanvasIdentical:classic(theme),outsidePixels,bundleSha256:after.gameJsSha256,board:boardGeometry(after.account().account?.run?.state)};report.cases.push(row);return row;
}
async function saveImage(h,name){const path=resolve(out,`${name}.png`),bytes=await h.canvas.encode('png');await writeFile(path,bytes);report.images.push({name,path,sha256:hash(bytes)});return path;}
async function run(name,fn){try{await fn();}catch(error){report.failures.push({name,error:String(error),stack:error.stack});console.error(`FAIL ${name}: ${error}`);}globalThis.gc?.();}
for(const target of ['browser','wechat'])for(const item of themes)await run(`${target}-${item.id}-wide-menu`,async()=>{
 const before=await host(baseline,target,item.id,standard),after=await host(build,target,item.id,standard),name=`${target}-${item.id}-wide-menu`;
 compare(before,after,target,item.id,standard,name);await saveImage(after,name);
 if(target==='browser'&&['day','night','cold_chain'].includes(item.id))await saveImage(before,`baseline-${item.id}-wide-menu`);
});
for(const target of ['browser','wechat'])for(const theme of ['day','night','rail_freight','cold_chain','forest_depot','harbor','ocean_vault'])for(const config of configs)await run(`${target}-${theme}-${config.name}-menu`,async()=>{
 const before=await host(baseline,target,theme,config),after=await host(build,target,theme,config),name=`${target}-${theme}-${config.name}-menu`;compare(before,after,target,theme,config,name);
 if(['day','night','rail_freight','cold_chain','forest_depot','harbor','ocean_vault'].includes(theme)&&['phone','tall','tablet','landscape','safe-dpr2'].includes(config.name))await saveImage(after,name);
});
for(const target of ['browser','wechat'])for(const theme of ['day','night','cold_chain'])await run(`${target}-${theme}-flow`,async()=>{
 const before=attachPixelWitness(await host(baseline,target,theme,standard)),after=attachPixelWitness(await host(build,target,theme,standard));
 const drivers=[before,after].map(h=>new PaginatedCosmeticsDriver(h,out,[],Date.parse('2026-10-11T00:00:00Z')));
 const capture=async(screen)=>{compare(before,after,target,theme,standard,`${target}-${theme}-${screen}`);if(theme==='cold_chain')await saveImage(after,`${target}-${theme}-${screen}`);};
 for(const d of drivers)d.shop();await capture('shop');
 for(const d of drivers)d.preview('theme','cold_chain');await capture('shop-preview');
 for(const d of drivers)d.action({type:'back'});await capture('returned-home');
 for(const d of drivers)d.action({type:'chooseInbound'});await capture('inbound-menu');
 for(const d of drivers)d.action({type:'newRun',mode:'standard',inboundDifficulty:'hard'});await capture('prepare');
 for(const d of drivers)d.action({type:'prepareNext'});await capture('game');
 for(const d of drivers)d.pause();await capture('pause');
 for(const d of drivers)d.action({type:'continue'});await capture('resume');
 const oldData=new Map(before.storage),newData=new Map(after.storage),rebootOld=await host(baseline,target,theme,standard,oldData),rebootNew=await host(build,target,theme,standard,newData);
 assert.deepEqual(rebootNew.account(),rebootOld.account());compare(rebootOld,rebootNew,target,theme,standard,`${target}-${theme}-restart-account`);
});
for(const target of ['browser','wechat'])for(const theme of ['day','cold_chain','rail_freight','forest_depot'])await run(`${target}-${theme}-user-shop`,async()=>{
 const config={name:'user-shop',width:1385,height:676,safeTop:0,dpr:1},before=attachPixelWitness(await host(baseline,target,theme,config)),after=attachPixelWitness(await host(build,target,theme,config));
 const drivers=[before,after].map(h=>new PaginatedCosmeticsDriver(h,out,[],Date.parse('2026-10-11T00:00:00Z')));for(const d of drivers)d.appearance('sets');
 assert.deepEqual(drivers[1].controls(),drivers[0].controls());compare(before,after,target,theme,config,`${target}-${theme}-user-shop`);await saveImage(after,`${target}-${theme}-user-shop`);
});
const contact=createCanvas(678*4,370*4),sheet=contact.getContext('2d');sheet.fillStyle='#151a24';sheet.fillRect(0,0,contact.width,contact.height);sheet.fillStyle='#e0e6e9';sheet.font='18px "Noto Sans CJK SC"';for(const [i,item]of themes.entries()){const x=(i%4)*678,y=Math.floor(i/4)*370;sheet.fillText(item.name+' · 1356×660',x+12,y+27);sheet.drawImage(await loadImage(resolve(out,`browser-${item.id}-wide-menu.png`)),x,y+40,678,330);}await writeFile(resolve(out,'all-sixteen-ultrawide.png'),contact.toBuffer('image/png'));
report.status=report.failures.length?'FAIL':'PASS';report.completedAt=new Date().toISOString();report.counts={cases:report.cases.length,failures:report.failures.length,images:report.images.length};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,...report.counts,out}));if(report.failures.length)process.exitCode=1;
