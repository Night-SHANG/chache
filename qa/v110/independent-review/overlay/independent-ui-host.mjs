/** Independent original-bundle DOM/wx Canvas review. No production edits or real-device claims. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const parameter=(name,flag)=>{const value=process.env[name]??arg(flag);if(!value)throw Error(`Required ${name} or ${flag}`);return resolve(value);};
const source=parameter('SOURCE','--source'),baseline=parameter('BASELINE','--baseline'),build=parameter('BUILD','--build'),oldBuild=parameter('OLD_BUILD','--old-build'),out=parameter('OUT','--out');
const {createGrowthHost}=await import(pathToFileURL(resolve(baseline,'scripts/growth-host-support.mjs')).href);
const {createPaginatedBrowserHost}=await import(pathToFileURL(resolve(baseline,'scripts/paginated-cosmetics-browser-host.mjs')).href);
const {cosmeticAccountStorage}=await import(pathToFileURL(resolve(baseline,'scripts/cosmetic-stage15-host-support.mjs')).href);
const {COSMETIC_CATALOG}=await import(pathToFileURL(resolve(baseline,'src/application/cosmetics.ts')).href);
const {GlobalFonts}=createRequire(resolve(baseline,'package.json'))('@napi-rs/canvas');
for(const w of ['Regular','Bold'])assert.ok(GlobalFonts.registerFromPath(`/usr/share/fonts/opentype/noto/NotoSansCJK-${w}.ttc`,'Noto Sans CJK SC'));
await mkdir(out,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
async function sourceHash(){async function walk(dir){let result=[];for(const e of await readdir(resolve(source,dir),{withFileTypes:true})){if(e.name==='__pycache__'||e.name.endsWith('.pyc'))continue;const p=`${dir}/${e.name}`;result.push(...(e.isDirectory()?await walk(p):[p]));}return result;}const h=createHash('sha256');for(const p of [...await walk('src'),...await walk('scripts'),...await walk('assets'),'package.json','package-lock.json'].sort()){h.update(p);h.update(await readFile(resolve(source,p)));}return h.digest('hex');}
async function binding(){return {sourceSha256:await sourceHash(),browser:hash(await readFile(resolve(build,'browser/app.js'))),wechat:hash(await readFile(resolve(build,'wechat/game.js')))};}
const initial=await binding(),manifest=JSON.parse(await readFile(resolve(build,'browser/build-manifest.json'),'utf8'));assert.equal(initial.sourceSha256,manifest.sourceSha256);assert.equal(manifest.version,'1.0.10');
const report={kind:'Independent unmodified app.js/game.js DOM-event and native Canvas wx host. Not browser GUI, WeChat tools or physical-device evidence.',initial,manifest,baseline:{browser:hash(await readFile(resolve(oldBuild,'browser/app.js'))),wechat:hash(await readFile(resolve(oldBuild,'wechat/game.js')))},cases:[],images:[],failures:[]};
const labels=['继续游戏','重新开始','返回主页','设置','玩法说明','结束并结算'];
const configs=[{name:'reference',width:426,height:674,dpr:1,safeTop:0},{name:'exact-dpr2',width:540,height:960,dpr:2,safeTop:0},{name:'integer-shift',width:512,height:768,dpr:1,safeTop:0},{name:'wide',width:1356,height:660,dpr:1,safeTop:0},{name:'safe-dpr3',width:390,height:844,dpr:3,safeTop:24}];
const modes=[{name:'inbound-standard',family:'inbound',endless:false},{name:'inbound-endless',family:'inbound',endless:true},{name:'outbound-normal',family:'outbound',endless:false},{name:'outbound-endless',family:'outbound',endless:true}];
function tap(h,x,y){h.tap(x,y);h.frame(h.time+300);}
function named(h,text,index=0){const row=h.styles.filter(r=>r.text===text)[index];assert.ok(row,`Missing label ${text}`);tap(h,row.x,row.y);}
function storage(h){return JSON.stringify([...h.storage].sort(([a],[b])=>a.localeCompare(b)));}
function pixel(h,x,y){return [...h.context.getImageData(x,y,1,1).data];}
function rgbaRegion(h,r){const m=h.context.getTransform(),x=Math.round(r.x*m.a+m.e),y=Math.round(r.y*m.d+m.f),w=Math.round(r.w*m.a),z=Math.round(r.h*m.d);return h.context.getImageData(x,y,w,z).data;}
async function make(dir,target,config,mode,theme='cold_chain'){
 const data=cosmeticAccountStorage({label:'FUNDED: independent overlay audit, synthetic owned-theme fixture only',wallet:0,owned:COSMETIC_CATALOG.map(r=>r.key),cosmetics:{theme,cargo:'classic',forklift:'yellow'}}),opts={...config,storage:data,epoch:Date.parse('2026-10-11T12:00:00Z'),bundlePath:resolve(dir,`${target}/${target==='browser'?'app':'game'}.js`)};
 const h=target==='browser'?await createPaginatedBrowserHost(opts):await createGrowthHost({...opts,deferImageLoads:true});await h.settleImages();assert.ok(h.imageTrace.every(r=>r.status==='loaded'));h.styles=[];
 const fill=h.context.fillText.bind(h.context);h.context.fillText=(text,x,y,...rest)=>{h.styles.push({text:String(text),x,y,font:h.context.font,color:h.context.fillStyle,align:h.context.textAlign,baseline:h.context.textBaseline,alpha:h.context.globalAlpha});return fill(text,x,y,...rest);};const frame=h.frame;h.frame=t=>{h.styles.length=0;frame(t);};h.frame(0);
 named(h,mode.family==='inbound'?'入库模式':'出库模式');if(mode.family==='outbound'&&mode.endless)named(h,'无限');named(h,'开始',mode.family==='inbound'&&mode.endless?1:0);const prep=h.styles.find(r=>r.text.includes('开始游戏'));assert.ok(prep);tap(h,prep.x,prep.y);
 const run=h.account().account.run.state;assert.equal(run.rulesetVersion,mode.family==='inbound'?18:mode.endless?13:12);assert.equal(run.phase,'input');assert.equal(run.mode,mode.family==='inbound'?(mode.endless?'endless':'standard'):'color_exit');
 return h;
}
async function shot(h,name){const bytes=await h.canvas.encode('png'),path=resolve(out,`${name}.png`);await writeFile(path,bytes);report.images.push({name,path:`${name}.png`,sha256:hash(bytes),bundleSha256:h.gameJsSha256});return path;}
async function run(name,fn){try{report.cases.push({name,status:'PASS',...await fn()});console.log('PASS',name);}catch(e){report.failures.push({name,error:String(e)});console.error('FAIL',name,String(e));}await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));globalThis.gc?.();}
for(const target of ['browser','wechat'])for(const mode of modes)for(const cfg of configs.filter(c=>!process.env.UI_CASE_FILTER||c.name===process.env.UI_CASE_FILTER))await run(`${target}-${mode.name}-${cfg.name}`,async()=>{
 const before=await make(oldBuild,target,cfg,mode),after=await make(build,target,cfg,mode);assert.equal(hash(before.canvas.data()),hash(after.canvas.data()),'Unpaused v106 finite background/game pixels changed');
 const activePixels=after.context.getImageData(0,0,after.canvas.width,after.canvas.height);tap(before,986,104);tap(after,986,104);
 const count=mode.endless?6:5,oldLabels=before.styles.filter(r=>labels.includes(r.text)),newLabels=after.styles.filter(r=>labels.includes(r.text));assert.deepEqual(oldLabels.map(r=>r.text),labels.slice(0,count));assert.deepEqual(newLabels,oldLabels.map(r=>({...r,y:r.y-200})));assert.deepEqual(newLabels.map(r=>r.y),labels.slice(0,count).map((_,i)=>942+130*i));
 // Modal header/body are byte-identical at their fixed coordinates, proving no post-panel darkening.
 assert.equal(hash(rgbaRegion(before,{x:194,y:430,w:690,h:390})),hash(rgbaRegion(after,{x:194,y:430,w:690,h:390})));
 const buttonDeltas=[];if(['exact-dpr2','integer-shift'].includes(cfg.name))for(let i=0;i<count;i++){const a=rgbaRegion(before,{x:270,y:1114+130*i,w:540,h:56}),b=rgbaRegion(after,{x:270,y:914+130*i,w:540,h:56});let max=0,changed=0;for(let j=0;j<a.length;j++){const d=Math.abs(a[j]-b[j]);max=Math.max(max,d);if(d)changed++;}buttonDeltas.push({i,max,changed,total:a.length});if(max>0){await shot(before,`pixel-baseline-${target}-${mode.name}-${cfg.name}`);await shot(after,`pixel-v110-${target}-${mode.name}-${cfg.name}`);}console.log('DELTA',target,mode.name,i,max,changed);if(cfg.name==='integer-shift'||i>0)assert.equal(max,0,'Shifted control interior must be byte-identical');else{assert.equal(max,1);assert.equal(changed,481);for(let j=0;j<a.length;j++)if(a[j]!==b[j]){assert.equal(j%4,0);assert.equal(Math.floor(j/(540*4)),21);assert.equal(b[j]-a[j],1);}}}
 const sample=[];for(const [x,y] of [[0,0],[0,Math.floor(after.canvas.height/2)],[after.canvas.width-1,Math.floor(after.canvas.height/2)],[after.canvas.width-1,after.canvas.height-1]]){const i=(y*after.canvas.width+x)*4,b=[...activePixels.data.slice(i,i+4)],p=pixel(after,x,y),expected=b.map((v,i)=>i===3?255:Math.round(v*.16+[5,11,18][i]*.84));assert.ok(p.every((v,i)=>Math.abs(v-expected[i])<=2),`Uncovered viewport ${x},${y}: ${p}/${expected}`);sample.push({x,y,before:b,after:p,expected});}
 if(cfg.name==='reference'||cfg.name==='wide'&&mode.endless){await shot(before,`baseline-${target}-${mode.name}-${cfg.name}`);await shot(after,`v110-${target}-${mode.name}-${cfg.name}`);}
 // Old lower slots are now blank; sides, gameplay board and hidden pause must not receive taps.
 const snap=storage(after),blankPoints=[[-40,950],[1120,950],[0,700],[1080,700],[986,104],[400,700],[540,1662],[540,1792]];
 for(const [x,y] of blankPoints){tap(after,x,y);assert.ok(after.styles.some(r=>r.text==='已暂停'));assert.equal(storage(after),snap);}
 after.pointer('up',540,942);after.frame(after.time+300);assert.ok(after.styles.some(r=>r.text==='已暂停'));after.pointer('down',540,942);after.pointer('move',20,1800);after.pointer('up',20,1800);after.frame(after.time+300);assert.ok(after.styles.some(r=>r.text==='已暂停'));assert.equal(storage(after),snap);
 // New action hit regions are exercised through real registered platform events.
 named(after,'设置');assert.ok(after.styles.some(r=>r.text.startsWith('音乐：')));named(after,'返回');assert.ok(after.styles.some(r=>r.text==='已暂停'));
 named(after,'玩法说明');assert.ok(after.styles.every(r=>r.text!=='已暂停'));const back=after.styles.find(r=>r.text==='返回游戏'||r.text==='返回');assert.ok(back);tap(after,back.x,back.y);assert.ok(after.styles.some(r=>r.text==='已暂停'));
 named(after,'重新开始');assert.ok(after.styles.some(r=>r.text==='开始新局'));named(after,'继续游戏');assert.ok(after.styles.some(r=>r.text==='已暂停'));
 named(after,'返回主页');assert.ok(after.styles.some(r=>r.text==='结束本局'));named(after,'继续游戏');assert.ok(after.styles.some(r=>r.text==='已暂停'));
 if(mode.endless){named(after,'结束并结算');assert.ok(after.styles.some(r=>r.text==='继续游戏'));named(after,'继续游戏');assert.ok(after.styles.some(r=>r.text==='已暂停'));}
 named(after,'继续游戏');assert.ok(after.styles.every(r=>r.text!=='已暂停'));assert.equal(after.account().account.run.state.commandIndex,0);
 return {mode,cfg,buttonDeltas,newLabels,oldLabels,sample,allActionsThroughNativeEvents:true,blankAndCanceledInputsBlocked:true,unpausedFullPixelsIdentical:true,modalHeaderPixelsIdentical:true,buttonPixelsIdentical:cfg.name==='integer-shift',primaryOneRowGradientQuantization:cfg.name==='exact-dpr2',bundleSha256:after.gameJsSha256};
});
report.ending=await binding();assert.deepEqual(report.ending,initial);report.status=report.failures.length?'FAIL':'PASS';report.counts={passed:report.cases.length,failed:report.failures.length,images:report.images.length};await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,...report.counts}));if(report.failures.length)process.exitCode=1;
