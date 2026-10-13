import assert from 'node:assert/strict';
import test from 'node:test';
import {StaticArtResources,STATIC_ART_PREVIEW_LIMIT,staticArtStatus,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import * as staticArt from '../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import type {StaticArtRequirements} from '../src/presentation/static-art-resources.ts';
import type {StaticArtResource} from '../src/presentation/static-art-manifest.ts';

const resource=(key:string,width=10,height=10):StaticArtResource=>({key,src:`assets/${key}.png`,sourcePath:`assets/${key}.png`,package:'main',width,height,bytes:10,sha256:'fixture',pixelSha256:'fixture'});
const table=Object.fromEntries([resource('scene.day',1205,1920),resource('scene.night',1205,1920),resource('scene.harbor',1205,1920),resource('cargo.core'),resource('preview.day.card',360,246),resource('preview.harbor.set',816,840),resource('preview.night.classic',816,780)].map(value=>[value.key,value]));
const requirements=(scene='scene.day',previews:string[]=[]):StaticArtRequirements=>({scene,shared:['cargo.core'],previews});
const image=(key:string)=>({width:table[key].width,height:table[key].height,key}) as unknown as CanvasImageSource;
const keyFor=(path:string)=>Object.values(table).find(entry=>entry.src===path)!.key;
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferredLoader(){const requested:string[]=[],pending=new Map<string,{resolve:(image:CanvasImageSource)=>void;reject:(error:Error)=>void}>();return {requested,pending,load:(path:string)=>{const key=keyFor(path);requested.push(key);return new Promise<CanvasImageSource>((resolve,reject)=>pending.set(key,{resolve,reject}));},resolve(key:string){pending.get(key)!.resolve(image(key));pending.delete(key);}};}

test('default resources load once and return only dimension-checked ready images',async()=>{
 const paths:string[]=[];const service=new StaticArtResources(async path=>{paths.push(path);return image(keyFor(path));},table);
 assert.equal(service.getImage('scene.day'),null);const result=await service.prepare(requirements());assert.equal(result.status,'ready');assert.equal(result.loaded,2);assert.equal((service.getImage('scene.day') as unknown as {key:string}).key,'scene.day');
 await service.prepare(requirements());assert.equal(paths.length,2);
});
test('saved non-default scene waits for its own local image and never substitutes day',async()=>{
 const loader=deferredLoader(),service=new StaticArtResources(loader.load,table);
 const ready=service.prepare(requirements('scene.harbor'));await settle();assert.equal(service.status().status,'loading');assert.deepEqual(loader.requested,['scene.harbor']);assert.equal(service.getImage('scene.day'),null);loader.resolve('scene.harbor');await settle();loader.resolve('cargo.core');assert.equal((await ready).status,'ready');assert.equal(service.getImage('scene.day'),null);assert.ok(service.getImage('scene.harbor'));
});
for(const failure of ['decode','dimensions','missing'] as const)test(`${failure} failure stays visible until one explicit retry`,async()=>{
 let attempts=0,fail=true;const service=new StaticArtResources(async path=>{attempts++;if(fail){if(failure==='dimensions')return {width:1,height:1} as CanvasImageSource;throw Error(failure);}return image(keyFor(path));},table);
 const result=await service.prepare(requirements());assert.equal(result.status,'error');assert.ok(result.error);assert.equal(service.getImage('scene.day'),null);const failedAttempts=attempts;await service.prepare(requirements());await settle();assert.equal(attempts,failedAttempts);fail=false;assert.equal((await service.retry(requirements())).status,'ready');assert.equal(attempts,failedAttempts+2);
});
test('missing manifest key is an explicit error without inventing an asset or changing selection',async()=>{
 let loads=0;const service=new StaticArtResources(async()=>{loads++;throw Error('unexpected');},table);const result=await service.prepare(requirements('scene.absent'));assert.equal(result.status,'error');assert.match(result.error??'',/scene.absent/);assert.equal(loads,0);
});
test('a stale scene completion cannot replace the latest selection and only one scene decodes at a time',async()=>{
 const loader=deferredLoader(),service=new StaticArtResources(loader.load,table);const first=service.prepare(requirements());loader.resolve('scene.day');await settle();loader.resolve('cargo.core');await first;
 const stale=service.prepare(requirements('scene.night'));const latest=service.prepare(requirements('scene.harbor'));assert.equal((await stale).status,'superseded');assert.deepEqual(loader.requested,['scene.day','cargo.core','scene.night']);assert.equal(service.retention().sceneImages,1);assert.equal(service.retention().inFlightScenes,1);
 loader.resolve('scene.night');await settle();assert.equal(service.getImage('scene.night'),null);assert.ok(service.getImage('scene.day'));assert.equal(service.retention().inFlightScenes,1);loader.resolve('scene.harbor');assert.equal((await latest).status,'ready');assert.equal(service.getImage('scene.day'),null);assert.ok(service.getImage('scene.harbor'));assert.equal(service.retention().sceneImages,1);
});
test('repeated theme changes release previous scenes immediately after each success',async()=>{
 const service=new StaticArtResources(async path=>image(keyFor(path)),table);for(let i=0;i<30;i++){const key=['scene.day','scene.night','scene.harbor'][i%3];assert.equal((await service.prepare(requirements(key))).status,'ready');assert.equal(service.retention().sceneImages,1);assert.equal(service.retention().retainedKeys.filter(key=>key.startsWith('scene.')).length,1);}
});
test('visible previews are bounded to 6 MiB and recent pages remain reusable',async()=>{
 const service=new StaticArtResources(async path=>image(keyFor(path)),table);await service.prepare(requirements('scene.day',['preview.harbor.set','preview.night.classic','preview.day.card']));assert.ok(service.retention().previewBytes<=STATIC_ART_PREVIEW_LIMIT);assert.equal(service.retention().previewImages,3);
 const next=service.prepare(requirements('scene.day',['preview.day.card']));assert.ok(service.getImage('preview.harbor.set'));assert.ok(service.getImage('preview.night.classic'));await next;assert.equal(service.retention().previewImages,3);assert.ok(service.retention().previewBytes<=STATIC_ART_PREVIEW_LIMIT);
 const huge={...table,'preview.huge.set':resource('preview.huge.set',2000,2000)};const bounded=new StaticArtResources(async()=>{throw Error('should not decode');},huge);const error=await bounded.prepare(requirements('scene.day',['preview.huge.set']));assert.equal(error.status,'error');assert.match(error.error??'',/6 MiB/);assert.equal(bounded.retention().previewBytes,0);
});
test('late preview decode is dropped when the page closes and cannot repopulate retention',async()=>{
 const loader=deferredLoader(),service=new StaticArtResources(loader.load,table);const first=service.prepare(requirements('scene.day',['preview.harbor.set']));loader.resolve('scene.day');await settle();loader.resolve('cargo.core');await settle();const second=service.prepare(requirements());assert.equal((await first).status,'superseded');loader.resolve('preview.harbor.set');assert.equal((await second).status,'ready');await settle();assert.equal(service.getImage('preview.harbor.set'),null);assert.equal(service.retention().previewImages,0);
});
test('non-default local image failure is retried only explicitly without fallback art',async()=>{
 let calls=0;const service=new StaticArtResources(async path=>{if(keyFor(path)==='scene.harbor'&&++calls===1)throw Error('image unavailable');return image(keyFor(path));},table);assert.equal((await service.prepare(requirements('scene.harbor'))).status,'error');assert.equal(calls,1);assert.equal(service.getImage('scene.day'),null);assert.equal((await service.retry(requirements('scene.harbor'))).status,'ready');assert.equal(calls,2);
});
test('dispose drops every retained reference and ignores pending completion',async()=>{
 const loader=deferredLoader(),service=new StaticArtResources(loader.load,table);const pending=service.prepare(requirements());service.dispose();assert.equal((await pending).status,'superseded');loader.resolve('scene.day');await settle();assert.equal(service.getImage('scene.day'),null);assert.deepEqual(service.retention().retainedKeys,[]);
});

test('recent cards and a detail coexist only while they fit the shared preview budget',async()=>{
 const cards=Array.from({length:6},(_,index)=>resource(`preview.card${index}.card`,360,246)),resources={...table,...Object.fromEntries(cards.map(card=>[card.key,card]))};
 const service=new StaticArtResources(async path=>{const r=Object.values(resources).find(value=>value.src===path)!;return {width:r.width,height:r.height} as CanvasImageSource;},resources);await service.prepare(requirements('scene.day',cards.map(card=>card.key)));assert.equal(service.retention().previewImages,6);assert.equal(service.retention().previewBytes,6*360*246*4);assert.ok(service.retention().previewBytes+service.retention().inFlightPreviewBytes<=STATIC_ART_PREVIEW_LIMIT);
 await service.prepare(requirements('scene.day',['preview.harbor.set']));assert.equal(service.retention().previewImages,7);assert.ok(service.retention().previewBytes<=STATIC_ART_PREVIEW_LIMIT);for(const card of cards)assert.ok(service.getImage(card.key));
});

test('an unconfigured shared service reports an explicit initialization error',async()=>{
 assert.equal(staticArtStatus(requirements()).status,'error');assert.equal((await prepareStaticArt(requirements())).status,'error');
});

test('global scene preparation reports initialization errors and delegates preparation, cancellation, and explicit retries',async()=>{
 assert.equal(typeof staticArt.prepareStaticArtScene,'function');assert.equal(typeof staticArt.cancelStaticArtScenePreparation,'function');
 assert.equal((await staticArt.prepareStaticArtScene('scene.night')).status,'error');staticArt.cancelStaticArtScenePreparation();
 let fail=true;const paths:string[]=[],core={scene:'scene.day',shared:[],previews:[]};
 staticArt.configureStaticArt(async path=>{paths.push(path);const resource=Object.values(STATIC_ART_RESOURCES).find(value=>value.src===path)!;if(resource.key==='scene.night'&&fail)throw Error('fixture failed');return {width:resource.width,height:resource.height} as CanvasImageSource;});
 assert.equal((await staticArt.prepareStaticArt(core)).status,'ready');assert.equal((await staticArt.prepareStaticArtScene('scene.night')).status,'error');
 fail=false;assert.equal((await staticArt.prepareStaticArtScene('scene.night')).status,'error');assert.equal(paths.length,2);
 assert.equal((await staticArt.prepareStaticArtScene('scene.night',{retry:true})).status,'ready');assert.ok(staticArt.getStaticArtImage('scene.night'));
 staticArt.cancelStaticArtScenePreparation();assert.equal(staticArt.getStaticArtImage('scene.night'),null);assert.equal(staticArt.staticArtStatus(core).status,'ready');
});
