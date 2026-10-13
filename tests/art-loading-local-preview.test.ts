import test from 'node:test';
import assert from 'node:assert/strict';
import {StaticArtResources} from '../src/presentation/static-art-resources.ts';
import {StaticArtGate} from '../src/presentation/static-art-gate.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getShopControls} from '../src/presentation/economy-ui.ts';
const settle=()=>new Promise<void>(r=>setImmediate(r));
// Generic cache compatibility cases use inert synthetic fixtures, never production preview assets.
const loaderResources={...STATIC_ART_RESOURCES,...Object.fromEntries(['day','night'].map(theme=>{const key=`preview.${theme}.item`;return [key,{...STATIC_ART_RESOURCES['scene.day'],key,src:`fixture/${key}.png`,width:816,height:232}];}))};
class TestStaticArtResources extends StaticArtResources {constructor(load:(path:string)=>Promise<CanvasImageSource>){super(load,loaderResources);}}

const good=(path:string)=>{const r=Object.values(loaderResources).find(r=>r.src===path)!;return {width:r.width,height:r.height} as CanvasImageSource;};
test('appearance opens directly to three item categories without bundle actions',()=>{
 const {session}=sessionHost();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
 const controls=getShopControls(session.view),sections=controls.filter(c=>c.action.type==='selectShopSection');
 assert.deepEqual(sections.map(c=>c.label),['场景','货箱','叉车']);
 assert.equal(controls.some(c=>c.action.type==='previewCosmeticSet'),false);
});
test('cold scene preview does not replace a ready shop with the full-screen art gate',async()=>{
 const {session}=sessionHost();const resources=new TestStaticArtResources(async path=>{if(path.includes('preview'))return new Promise(()=>{});return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();assert.equal(gate.isReady(),true);
 session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});session.action({type:'selectShopSection',section:'theme'});session.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});
 gate.refresh();await settle();assert.equal(gate.isReady(),true);assert.equal(gate.paint({} as CanvasRenderingContext2D),true);resources.dispose();
});
test('recent item preview survives confirmation-shaped requirements and return',async()=>{
 const counts=new Map<string,number>();const resources=new TestStaticArtResources(async path=>{counts.set(path,(counts.get(path)??0)+1);return good(path);});
 const core={scene:'scene.day',shared:['cargo.core'],previews:[]},page={...core,previews:['preview.day.item']};
 await resources.prepare(page);await resources.prepare(core);await resources.prepare(page);
 assert.equal(counts.get(loaderResources['preview.day.item'].src),1);resources.dispose();
});
test('synchronous shop does not request missing preview PNGs and stale releases stay inert',async()=>{
 const {session}=sessionHost();let previewRequests=0;const resources=new TestStaticArtResources(async path=>{if(path.includes('preview')){previewRequests++;throw Error('obsolete preview');}return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});gate.refresh();await settle();assert.equal(gate.isReady(),true);assert.equal(previewRequests,0);
 const events:string[]=[];session.input.down=()=>events.push('down');session.input.up=()=>events.push('up');
 gate.pointer({type:'up',id:1,point:{x:540,y:860}});assert.deepEqual(events,[]);resources.dispose();
});
test('idle warming yields one image per call and respects pause without foreground eviction',async()=>{
 const calls:string[]=[];const resources=new TestStaticArtResources(async path=>{calls.push(path);return good(path);});
 await resources.prepare({scene:'scene.day',shared:['cargo.core'],previews:[]});const initial=calls.length;
 const warm=['preview.day.item','preview.night.item'];resources.warm(warm);await settle();assert.equal(calls.length,initial);
 resources.setWarmPaused(false);resources.warm(warm);await settle();assert.equal(calls.length,initial+1);assert.ok(resources.getImage('scene.day'));assert.ok(resources.getImage('cargo.core'));
 resources.setWarmPaused(true);resources.warm(warm);await settle();assert.equal(calls.length,initial+1);
 resources.setWarmPaused(false);resources.warm(warm);await settle();assert.equal(calls.length,initial+2);resources.warm(warm);await settle();assert.equal(calls.length,initial+2);resources.dispose();
});
test('only the selected theme prepares a scene after rendering, never a per-item preview',async()=>{
 const {session}=sessionHost();const calls:string[]=[];const resources=new TestStaticArtResources(async path=>{calls.push(path);return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();gate.didPaint();await settle();assert.ok(calls.every(path=>!path.includes('preview')));assert.equal(calls.filter(path=>/static-art\/scene-/.test(path)).length,1);
 session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});session.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});gate.didPaint();await settle();assert.equal(calls.filter(path=>/static-art\/scene-/.test(path)).length,2);assert.equal(gate.isReady(),true);
 gate.hide();gate.didPaint();await settle();assert.equal(calls.filter(path=>/static-art\/scene-/.test(path)).length,2);resources.dispose();
});
test('failed optional preview cannot prevent a newly selected core scene from loading',async()=>{
 const resources=new TestStaticArtResources(async path=>{if(path.includes('preview'))throw Error('preview failed');return good(path);});
 const first={scene:'scene.day',shared:[],previews:['preview.night.item']};await resources.prepare(first);
 const next={...first,scene:'scene.night'};await resources.prepare(next,{...next,previews:[]});
 assert.equal(resources.readiness(['scene.night']).status,'ready');assert.equal(resources.status().status,'error');resources.dispose();
});
test('foreground demand sharing an inflight warm image resolves when that image arrives',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});const resources=new TestStaticArtResources(async path=>{if(path.includes('preview'))await wait;return good(path);});
 const core={scene:'scene.day',shared:[],previews:[]};await resources.prepare(core);resources.setWarmPaused(false);resources.warm(['preview.day.item']);
 let resolved=false;const joined=resources.prepare({...core,previews:['preview.day.item']}).then(()=>{resolved=true;});release();await settle();assert.equal(resources.status().status,'ready');assert.equal(resolved,true);await joined;resources.dispose();
});
test('a secondary finger cannot duplicate the owning equip gesture',async()=>{
 const {session}=sessionHost({wallet:5000});const resources=new TestStaticArtResources(async path=>good(path)),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});session.action({type:'purchaseCosmetic',kind:'theme',id:'cold_chain'});session.action({type:'confirm'});session.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});gate.refresh();const beforeGeneration=session.view.account!.generation,beforeWallet=session.view.account!.wallet;
 gate.pointer({type:'down',id:1,point:{x:700,y:1710}});gate.pointer({type:'down',id:2,point:{x:700,y:1710}});gate.pointer({type:'up',id:1,point:{x:700,y:1710}});gate.pointer({type:'up',id:2,point:{x:700,y:1710}});await settle();assert.equal(session.view.account?.generation,beforeGeneration+1);assert.equal(session.view.account?.wallet,beforeWallet);assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');resources.dispose();
});
test('idle work interrupted by hide can resume rather than permanently skipping its image',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let previews=0;const resources=new TestStaticArtResources(async path=>{if(path.includes('preview')){previews++;await wait;}return good(path);});
 await resources.prepare({scene:'scene.day',shared:[],previews:[]});resources.setWarmPaused(false);resources.warm(['preview.day.item']);resources.setWarmPaused(true);release();await settle();assert.equal(resources.getImage('preview.day.item'),null);
 resources.setWarmPaused(false);resources.warm(['preview.day.item']);await settle();assert.equal(previews,2);assert.ok(resources.getImage('preview.day.item'));resources.dispose();
});
