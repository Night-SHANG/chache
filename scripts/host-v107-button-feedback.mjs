/** Executes original paid app.js/game.js. Host instrumentation never rewrites product bundles. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createPaginatedBrowserHost} from './paginated-cosmetics-browser-host.mjs';
import {createGrowthHost,validateResumeStorage} from './growth-host-support.mjs';
import {shopNavigationFixtureStorage} from './shop-navigation-host-runtime.mjs';
import {attachPixelWitness,physicalRect} from './refinement-host-support.mjs';
import {PaginatedCosmeticsDriver} from './paginated-cosmetics-host-runtime.mjs';
import {ACCOUNT_KEYS,encodeAccount} from '../src/application/account-store.ts';
import {L,getTrayRects} from '../src/presentation/layout.ts';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const build=resolve(arg('--build')??'build'),out=resolve(arg('--out')??'qa/v107/host');await mkdir(out,{recursive:true});
const report={status:'RUNNING',kind:'Unmodified production bundles, simulated DOM/wx input and native Canvas pixels',limitations:['No real browser GUI, WeChat developer tool or phone tested; sound play and haptic API requests do not prove actual audible/tactile quality.'],cases:[],images:[],failures:[]};
const hash=x=>createHash('sha256').update(x).digest('hex'),center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
function oldStorage(){const data=shopNavigationFixtureStorage(20000),account=structuredClone(validateResumeStorage(data).account);delete account.profile.settings.vibration;const raw=encodeAccount(account);data.set(ACCOUNT_KEYS.a,raw);data.set(ACCOUNT_KEYS.b,raw);return data;}
async function fixture(target,mode='normal',data=oldStorage()){
 const audio=[],vibrations=[];let sequence=0;
 const audioFactory=(src='')=>{const a={src,currentTime:0,loop:false,volume:1,play(){audio.push({event:'play',src:this.src,seq:sequence++});return Promise.resolve();},pause(){audio.push({event:'stop',src:this.src,seq:sequence++});},stop(){this.pause();},destroy(){},onError(){},addEventListener(){}};return a;};
 const vibrate=mode==='absent'?undefined:input=>{vibrations.push(input);if(mode==='throw')throw Error('unsupported test host');return true;};
 const options={bundlePath:resolve(build,target,target==='browser'?'app.js':'game.js'),storage:data,width:390,height:844,dpr:1,audioFactory,vibrate};
 const h=target==='browser'?await createPaginatedBrowserHost(options):await createGrowthHost({...options,deferImageLoads:true});await h.settleImages();
 const d=new PaginatedCosmeticsDriver(attachPixelWitness(h),out,[],Date.parse('2026-10-11T09:00:00Z'));
 const click=()=>audio.filter(x=>x.event==='play'&&x.src==='assets/ui_click.wav').length;
 const act=action=>{d.frame(160);return d.action(action);};
 return {h,d,audio,vibrations,click,act,target};
}
async function check(name,fn){try{report.cases.push({name,...await fn()});}catch(error){report.failures.push({name,error:String(error),stack:error.stack});}}
async function press(f,control,name,{save=false}={}){
 assert.ok(control&&!control.disabled,name);const {h,d}=f;d.frame(160);const p=center(control.rect),r=physicalRect(h,control.rect),before=h.context.getImageData(0,0,h.canvas.width,h.canvas.height).data.slice(),sounds=f.click(),vibrations=f.vibrations.length;
 if(save){const path=resolve(out,`${f.target}-${name}-normal.png`);await writeFile(path,await h.canvas.encode('png'));report.images.push(path);}
 h.pointer('down',p.x,p.y);d.frame(0);const held=h.context.getImageData(0,0,h.canvas.width,h.canvas.height).data;let diff=0;
 for(let y=0;y<h.canvas.height;y++)for(let x=0;x<h.canvas.width;x++){const i=(y*h.canvas.width+x)*4;if(before[i]!==held[i]||before[i+1]!==held[i+1]||before[i+2]!==held[i+2]){diff++;assert.ok(x>=Math.floor(r.x)-1&&x<=Math.ceil(r.x+r.w)+1&&y>=Math.floor(r.y)-1&&y<=Math.ceil(r.y+r.h)+1,`${name} change outside ${x},${y}`);}}
 assert.ok(diff>r.w*r.h/2,`${name} visible pressure`);assert.equal(f.click(),sounds);assert.equal(f.vibrations.length,vibrations);
 if(save){const path=resolve(out,`${f.target}-${name}-pressed.png`);await writeFile(path,await h.canvas.encode('png'));report.images.push(path);}
 h.pointer('cancel',p.x,p.y);h.pointer('up',p.x,p.y);d.frame(0);assert.deepEqual(h.context.getImageData(0,0,h.canvas.width,h.canvas.height).data,before,`${name} cancel exact restore`);assert.equal(f.click(),sounds);assert.equal(f.vibrations.length,vibrations);
 return {name,changedPixels:diff,rect:control.rect};
}
for(const target of ['browser','wechat']){
 const m=JSON.parse(await readFile(resolve(build,target,'build-manifest.json'),'utf8'));assert.equal(m.version,'1.0.7');assert.equal(m.shopPricingMode,'paid');assert.equal(m.developerDiagnostics,false);
 await check(`${target}-whole-controls-and-settings`,async()=>{
  const f=await fixture(target),{d,h}=f,coverage=[],initial=[...h.storage];assert.equal(d.account().profile.settings.vibration,undefined);
  coverage.push(await press(f,d.controls()[0],'home-button',{save:true}));assert.deepEqual([...h.storage],initial,'readonly default vibration does not write legacy account');
  const n=f.click();f.act({type:'settings'});d.screen='settings';d.frame(0);assert.equal(f.click(),n+1,'settings clearFeedback cannot swallow click');assert.equal(f.vibrations.length,0);
  for(const c of d.controls())coverage.push(await press(f,c,`settings-${c.action.type}`,{save:c.action.type==='toggleVibration'}));
  f.act({type:'toggleVibration'});assert.equal(d.account().profile.settings.vibration,false);assert.equal(f.vibrations.length,0);
  const mute=f.click();f.act({type:'toggleSound'});assert.equal(f.click(),mute);f.act({type:'toggleSound'});assert.equal(f.click(),mute,'enabling is silent on same gesture');
  f.act({type:'back'});d.screen='menu';f.act({type:'shop'});coverage.push(await press(f,d.controls().find(c=>c.action.type==='purchase'),'tool-purchase',{save:true}));
  f.act({type:'purchase',item:'rotate'});d.confirmation={kind:'purchase',item:'rotate',quantity:1};d.frame(0);coverage.push(await press(f,d.controls().find(c=>c.action.type==='confirm'),'confirm-buy',{save:true}));coverage.push(await press(f,d.controls().find(c=>c.action.type==='purchaseQuantity'&&c.action.delta===1),'quantity-plus'));
  const wallet=d.account().wallet;f.act({type:'confirm'});assert.equal(d.account().wallet,wallet-80);assert.equal(f.vibrations.length,0,'muted haptic purchase');
  d.frame(400);f.act({type:'selectShopTab',tab:'cosmetics'});coverage.push(await press(f,d.controls().find(c=>c.action.type==='previewCosmeticSet'),'set-card',{save:true}));
  f.act({type:'previewCosmeticSet',id:'cold_chain'});coverage.push(await press(f,d.controls().find(c=>c.action.type==='previewCosmeticSetMember'),'set-member'));f.act({type:'closeShopDetail'});
  f.act({type:'selectShopSection',section:'cargo'});coverage.push(await press(f,d.controls().find(c=>c.action.type==='previewCosmetic'),'cargo-card'));f.act({type:'back'});
  f.act({type:'settings'});d.screen='settings';f.act({type:'toggleVibration'});assert.equal(d.account().profile.settings.vibration,true);f.act({type:'back'});d.screen='menu';
  f.act({type:'chooseInbound'});const ordinary=f.vibrations.length;f.act({type:'newRun',mode:'standard',inboundDifficulty:'hard'});assert.equal(f.vibrations.length,ordinary+1);f.act({type:'toggleItem',item:'rotate'});f.act({type:'prepareNext'});
  coverage.push(await press(f,{rect:L.pause},'pause-icon',{save:true}));coverage.push(await press(f,d.controls().find(c=>c.action.type==='toggleToolbox'),'toolbox-entry'));
  f.act({type:'toggleToolbox'});d.toolboxOpen=true;d.frame(0);coverage.push(await press(f,d.controls().find(c=>c.action.type==='tool'&&!c.disabled),'tool-card'));
  f.act({type:'tool',item:'rotate'});d.toolboxOpen=false;d.toolSelection={item:'rotate',pieceId:null,cells:[],quarterTurns:0};d.frame(0);coverage.push(await press(f,{rect:getTrayRects(d.state().candidates.length,true)[0]},'tool-piece'));
  const count=f.click();h.callbacks.hide();h.callbacks.show();d.paused=true;d.frame();assert.equal(f.click(),count,'background does not replay UI sound');
  return {bundleSha256:h.gameJsSha256,manifestSource:m.sourceSha256,controls:coverage,uiClicks:f.click(),hapticCalls:f.vibrations.length};
 });
 for(const mode of ['absent','throw'])await check(`${target}-${mode}-haptics-safe`,async()=>{const f=await fixture(target,mode);f.act({type:'chooseInbound'});f.act({type:'newRun',mode:'standard',inboundDifficulty:'hard'});assert.ok(f.h.labels.some(x=>x.text.includes('道具')));assert.ok(f.click()>0);return {bundleSha256:f.h.gameJsSha256,clicks:f.click(),hapticAttempts:f.vibrations.length};});
}
report.status=report.failures.length?'FAIL':'PASS';report.bundleFiles=await Promise.all(['browser/app.js','wechat/game.js'].map(async path=>({path,sha256:hash(await readFile(resolve(build,path)))})));await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,images:report.images.length,failures:report.failures},null,2));if(report.failures.length)process.exitCode=1;
