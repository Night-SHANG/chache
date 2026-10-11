import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};const param=(name,flag)=>{const x=process.env[name]??arg(flag);if(!x)throw Error(`Missing ${name}`);return resolve(x);};const root=param('SOURCE','--source');
const {createPaginatedBrowserHost}=await import(`${root}/scripts/paginated-cosmetics-browser-host.mjs`);
const {createGrowthHost,validateResumeStorage,sha256}=await import(`${root}/scripts/growth-host-support.mjs`);
const {cosmeticAccountStorage}=await import(`${root}/scripts/cosmetic-stage15-host-support.mjs`);
const {attachPixelWitness}=await import(`${root}/scripts/refinement-host-support.mjs`);
const {PaginatedCosmeticsDriver}=await import(`${root}/scripts/paginated-cosmetics-host-runtime.mjs`);
const {playableChecksum}=await import(`${root}/src/domain/playable.ts`);
const build=param('BUILD','--build'),oldBuild=param('OLD_BUILD','--old-build'),out=param('OUT','--out');await mkdir(out,{recursive:true});
const report={status:'RUNNING',kind:'Unmodified production bundles executed by native Canvas/DOM-event or wx host; no scene injection',limitations:['Not a real browser GUI, WeChat developer tool or physical-device test.','Isolated owned-theme QA fixture, not user data.'],cases:[]};
const cases=[
 {name:'inbound-normal-five',target:'wechat',mode:'standard',theme:'harbor',width:512,height:768,dpr:1},
 {name:'inbound-infinite-six',target:'wechat',mode:'endless',theme:'harbor',width:512,height:768,dpr:1},
 {name:'outbound-normal-five',target:'browser',mode:'normal',outbound:true,theme:'day',width:512,height:768,dpr:1},
 {name:'outbound-infinite-six',target:'browser',mode:'endless',outbound:true,theme:'cold_chain',width:512,height:768,dpr:1},
 {name:'rush-five-safe-dpr2',target:'wechat',mode:'rush',theme:'steam_foundry',width:390,height:844,safeTop:24,dpr:2},
 {name:'wide-classic-infinite',target:'browser',mode:'endless',theme:'day',width:1356,height:660,dpr:1},
 {name:'safe-theme-infinite-dpr3',target:'wechat',mode:'endless',theme:'cold_chain',width:560,height:840,safeTop:24,dpr:3},
];
async function host(c,base){
 const data=cosmeticAccountStorage({wallet:0,label:'FUNDED: isolated pause presentation fixture, zero wallet',owned:[`theme.${c.theme}`],cosmetics:{theme:c.theme,cargo:'classic',forklift:'yellow'}}),options={...c,storage:data,bundlePath:resolve(base,`${c.target}/${c.target==='browser'?'app':'game'}.js`),epoch:Date.parse('2026-10-11T00:00:00Z'),deferImageLoads:true};
 const h=c.target==='browser'?await createPaginatedBrowserHost(options):await createGrowthHost(options);await h.settleImages();h.frame(0);const d=new PaginatedCosmeticsDriver(attachPixelWitness(h),out,[],options.epoch);
 d.action({type:c.outbound?'chooseColorTier':'chooseInbound'});
 if(c.outbound){if(c.mode==='endless')d.action({type:'selectOutboundMode',mode:'endless'});d.action({type:'newRun',mode:'color_exit',difficultyId:'normal',outboundMode:c.mode});}
 else d.action({type:'newRun',mode:c.mode,...(c.mode==='rush'?{}:{inboundDifficulty:'hard'})});
 d.action({type:'prepareNext'});if(c.mode==='rush')d.action({type:'chooseCleanup',branch:'orders'});
 assert.equal(d.state().phase,'input');d.frame(100);return {h,d};
}
const pixels=h=>h.context.getImageData(0,0,h.canvas.width,h.canvas.height).data;
const save=async(h,name)=>{const path=resolve(out,`${name}.png`),bytes=await h.canvas.encode('png');await writeFile(path,bytes);return {path,sha256:sha256(bytes)};};
function rect(h,r){const{w,h:height,safe,dpr}=h.viewport,s=Math.min(w/1080,(height-safe)/1920),ox=(w-1080*s)/2,oy=safe+(height-safe-1920*s)/2;return {x:Math.round((ox+r.x*s)*dpr),y:Math.round((oy+r.y*s)*dpr),w:Math.round(r.w*s*dpr),h:Math.round(r.h*s*dpr)};}
for(const c of cases){
 const current=await host(c,build),old=await host(c,oldBuild);assert.deepEqual(pixels(current.h),pixels(old.h),`${c.name}: unpaused background/art must remain pixel-identical`);
 const beforePixels=new Uint8ClampedArray(pixels(current.h)),active=await save(current.h,`${c.name}-active`),checksum=playableChecksum(current.d.state());
 current.d.pause();old.d.pause();assert.ok(current.h.labels.some(row=>row.text==='已暂停'));assert.ok(old.h.labels.some(row=>row.text==='已暂停'));
 const controls=current.d.controls();assert.deepEqual(controls.map(c=>c.rect.y),controls.map((_,i)=>890+130*i));assert.equal(controls.length,c.mode==='endless'?6:5);
 const after=await save(current.h,`${c.name}-after`),before=await save(old.h,`${c.name}-before`);
 const edgeSamples=[];for(const [x,y]of [[0,0],[0,Math.floor(current.h.canvas.height/2)],[current.h.canvas.width-1,Math.floor(current.h.canvas.height/2)],[current.h.canvas.width-1,current.h.canvas.height-1]]){
  const i=(y*current.h.canvas.width+x)*4,pre=Array.from(beforePixels.slice(i,i+4)),post=Array.from(current.h.context.getImageData(x,y,1,1).data),expect=pre.map((v,k)=>k===3?255:Math.round(v*.16+[5,11,18][k]*.84));assert.ok(post.every((v,k)=>Math.abs(v-expect[k])<=2),`${c.name}: full viewport shade at ${x},${y}`);edgeSamples.push({x,y,pre,post,expect});
 }
 // At integer physical offsets, each inset button's actual pixels are unchanged after translation.
 let buttonPixelEquality=0;if(c.width===512&&c.height===768){for(const control of controls){const afterRect=rect(current.h,{...control.rect,x:control.rect.x+10,y:control.rect.y+10,w:control.rect.w-20,h:control.rect.h-20}),beforeRect=rect(old.h,{...control.rect,x:control.rect.x+10,y:control.rect.y+210,w:control.rect.w-20,h:control.rect.h-20});assert.deepEqual(current.h.context.getImageData(afterRect.x,afterRect.y,afterRect.w,afterRect.h).data,old.h.context.getImageData(beforeRect.x,beforeRect.y,beforeRect.w,beforeRect.h).data,`${c.name}: ${control.label} font/colors unchanged`);buttonPixelEquality++;}}
 const raw=[...current.h.storage];for(const p of [{x:-30,y:1000},{x:1110,y:1000},{x:100,y:800},{x:540,y:1800}]){current.h.tap(p.x,p.y);current.d.frame(16);assert.ok(current.h.labels.some(row=>row.text==='已暂停'));}assert.deepEqual([...current.h.storage],raw,'outside tap does not mutate saved state');assert.equal(playableChecksum(current.d.state()),checksum);
 current.d.action({type:'continue'});assert.ok(!current.h.labels.some(row=>row.text==='已暂停'));assert.equal(playableChecksum(current.d.state()),checksum);current.d.pause();assert.ok(current.h.labels.some(row=>row.text==='已暂停'));validateResumeStorage(current.h.storage);
 report.cases.push({...c,bundleSha256:current.h.gameJsSha256,baselineBundleSha256:old.h.gameJsSha256,active,before,after,controls,buttonPixelEquality,edgeSamples,unpausedPixelsIdentical:true,blockedOutsideTaps:true,resumeAndRepeatedPause:true});console.log('PASS',c.name);await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));
}
report.status='PASS';await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(out);
