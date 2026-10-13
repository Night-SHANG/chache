import test from 'node:test';
import assert from 'node:assert/strict';
import {StaticArtResources} from '../src/presentation/static-art-resources.ts';
import {StaticArtGate} from '../src/presentation/static-art-gate.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getShopControls} from '../src/presentation/economy-ui.ts';
const settle=()=>new Promise<void>(r=>setImmediate(r));
const good=(path:string)=>{const r=Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!;return {width:r.width,height:r.height} as CanvasImageSource;};
test('appearance opens directly to three item categories without bundle actions',()=>{
 const {session}=sessionHost();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
 const controls=getShopControls(session.view),sections=controls.filter(c=>c.action.type==='selectShopSection');
 assert.deepEqual(sections.map(c=>c.label),['场景','货箱','叉车']);
 assert.equal(controls.some(c=>c.action.type==='previewCosmeticSet'),false);
});
test('cold scene preview does not replace a ready shop with the full-screen art gate',async()=>{
 const {session}=sessionHost();const resources=new StaticArtResources(async path=>{if(path.includes('preview'))return new Promise(()=>{});return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();assert.equal(gate.isReady(),true);
 session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});session.action({type:'selectShopSection',section:'theme'});session.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});
 gate.refresh();await settle();assert.equal(gate.isReady(),true);assert.equal(gate.paint({} as CanvasRenderingContext2D),true);resources.dispose();
});
test('recent item preview survives confirmation-shaped requirements and return',async()=>{
 const counts=new Map<string,number>();const resources=new StaticArtResources(async path=>{counts.set(path,(counts.get(path)??0)+1);return good(path);});
 const core={scene:'scene.day',shared:['cargo.core'],previews:[]},page={...core,previews:['preview.day.item']};
 await resources.prepare(page);await resources.prepare(core);await resources.prepare(page);
 assert.equal(counts.get(STATIC_ART_RESOURCES['preview.day.item'].src),1);resources.dispose();
});
test('preview failure keeps core ready and retry touch cannot leak into shop input',async()=>{
 const {session}=sessionHost();let fail=true;const resources=new StaticArtResources(async path=>{if(fail&&path.includes('preview'))throw Error('fixture image failure');return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});gate.refresh();await settle();assert.equal(gate.isReady(),true);
 const events:string[]=[];session.input.down=()=>events.push('down');session.input.up=()=>events.push('up');
 const pointer=(type:'down'|'up'|'cancel')=>({type,id:1,point:{x:540,y:860}} as const);
 gate.pointer(pointer('up'));assert.deepEqual(events,[]);gate.pointer(pointer('down'));gate.pointer(pointer('cancel'));gate.pointer(pointer('up'));assert.deepEqual(events,[]);
 fail=false;gate.pointer(pointer('down'));gate.pointer(pointer('up'));await settle();assert.equal(resources.status().status,'ready');assert.deepEqual(events,[]);resources.dispose();
});
test('idle warming yields one image per call and respects pause without foreground eviction',async()=>{
 const calls:string[]=[];const resources=new StaticArtResources(async path=>{calls.push(path);return good(path);});
 await resources.prepare({scene:'scene.day',shared:['cargo.core'],previews:[]});const initial=calls.length;
 const warm=['preview.day.item','preview.night.item'];resources.warm(warm);await settle();assert.equal(calls.length,initial);
 resources.setWarmPaused(false);resources.warm(warm);await settle();assert.equal(calls.length,initial+1);assert.ok(resources.getImage('scene.day'));assert.ok(resources.getImage('cargo.core'));
 resources.setWarmPaused(true);resources.warm(warm);await settle();assert.equal(calls.length,initial+1);
 resources.setWarmPaused(false);resources.warm(warm);await settle();assert.equal(calls.length,initial+2);resources.warm(warm);await settle();assert.equal(calls.length,initial+2);resources.dispose();
});
test('confirmed render on home is required before background images are warmed',async()=>{
 const {session}=sessionHost();const calls:string[]=[];const resources=new StaticArtResources(async path=>{calls.push(path);return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();assert.ok(calls.every(path=>!path.includes('preview')));gate.isReady();await settle();assert.ok(calls.every(path=>!path.includes('preview')));
 gate.didPaint();await settle();assert.equal(calls.filter(path=>path.includes('preview')).length,1);gate.hide();gate.didPaint();await settle();assert.equal(calls.filter(path=>path.includes('preview')).length,1);resources.dispose();
});
test('failed optional preview cannot prevent a newly selected core scene from loading',async()=>{
 const resources=new StaticArtResources(async path=>{if(path.includes('preview'))throw Error('preview failed');return good(path);});
 const first={scene:'scene.day',shared:[],previews:['preview.night.item']};await resources.prepare(first);
 const next={...first,scene:'scene.night'};await resources.prepare(next,{...next,previews:[]});
 assert.equal(resources.readiness(['scene.night']).status,'ready');assert.equal(resources.status().status,'error');resources.dispose();
});
test('foreground demand sharing an inflight warm image resolves when that image arrives',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});const resources=new StaticArtResources(async path=>{if(path.includes('preview'))await wait;return good(path);});
 const core={scene:'scene.day',shared:[],previews:[]};await resources.prepare(core);resources.setWarmPaused(false);resources.warm(['preview.day.item']);
 let resolved=false;const joined=resources.prepare({...core,previews:['preview.day.item']}).then(()=>{resolved=true;});release();await settle();assert.equal(resources.status().status,'ready');assert.equal(resolved,true);await joined;resources.dispose();
});
test('two-finger local retry never forwards a concurrent purchase gesture',async()=>{
 const {session}=sessionHost();const resources=new StaticArtResources(async path=>{if(path.includes('preview'))throw Error('preview failed');return good(path);}),gate=new StaticArtGate(session,resources);
 gate.refresh();await settle();session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});gate.refresh();await settle();
 const events:string[]=[];session.input.down=()=>events.push('down');session.input.up=()=>events.push('up');
 gate.pointer({type:'down',id:1,point:{x:540,y:860}});gate.pointer({type:'down',id:2,point:{x:700,y:1710}});gate.pointer({type:'up',id:1,point:{x:540,y:860}});gate.pointer({type:'up',id:2,point:{x:700,y:1710}});assert.deepEqual(events,[]);resources.dispose();
});
test('idle work interrupted by hide can resume rather than permanently skipping its image',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let previews=0;const resources=new StaticArtResources(async path=>{if(path.includes('preview')){previews++;await wait;}return good(path);});
 await resources.prepare({scene:'scene.day',shared:[],previews:[]});resources.setWarmPaused(false);resources.warm(['preview.day.item']);resources.setWarmPaused(true);release();await settle();assert.equal(resources.getImage('preview.day.item'),null);
 resources.setWarmPaused(false);resources.warm(['preview.day.item']);await settle();assert.equal(previews,2);assert.ok(resources.getImage('preview.day.item'));resources.dispose();
});
