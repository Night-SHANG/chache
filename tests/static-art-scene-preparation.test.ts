import assert from 'node:assert/strict';
import test from 'node:test';
import {StaticArtResources} from '../src/presentation/static-art-resources.ts';
import type {StaticArtRequirements} from '../src/presentation/static-art-resources.ts';
import type {StaticArtResource} from '../src/presentation/static-art-manifest.ts';

const shared=Array.from({length:8},(_,index)=>`atlas.${index}`);
const resource=(key:string):StaticArtResource=>({key,src:`assets/${key}.png`,sourcePath:`assets/${key}.png`,package:'main',width:10,height:10,bytes:10,sha256:'fixture',pixelSha256:'fixture'});
const table=Object.fromEntries(['scene.day','scene.night','scene.harbor',...shared].map(key=>[key,resource(key)]));
const requirements=(scene='scene.day'):StaticArtRequirements=>({scene,shared,previews:[]});
const image=(key:string)=>({width:10,height:10,key}) as unknown as CanvasImageSource;
const keyFor=(path:string)=>Object.values(table).find(entry=>entry.src===path)!.key;
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
function deferredLoader(){
 const requested:string[]=[],pending=new Map<string,{resolve:(image:CanvasImageSource)=>void;reject:(error:Error)=>void}>();
 return {requested,pending,load:(path:string)=>{const key=keyFor(path);requested.push(key);return new Promise<CanvasImageSource>((resolve,reject)=>pending.set(key,{resolve,reject}));},resolve(key:string){const entry=pending.get(key)!;pending.delete(key);entry.resolve(image(key));},reject(key:string){const entry=pending.get(key)!;pending.delete(key);entry.reject(Error('decode failed'));}};
}
async function prepared(){
 const loader=deferredLoader(),service=new StaticArtResources(loader.load,table),ready=service.prepare(requirements());
 for(const key of ['scene.day',...shared]){loader.resolve(key);await settle();}
 assert.equal((await ready).status,'ready');loader.requested.length=0;
 return {loader,service};
}
const assertBound=(service:StaticArtResources)=>assert.ok(service.retention().sceneImages+service.retention().inFlightScenes<=2,'retain or decode at most current scene plus one target');

test('preparing one target keeps the committed scene and all eight shared atlases ready',async()=>{
 const {loader,service}=await prepared(),day=service.getImage('scene.day'),core=requirements();
 const target=service.prepareScene('scene.night');
 assert.deepEqual(loader.requested,['scene.night']);assert.equal(service.status(core).status,'ready');assert.equal(service.getImage('scene.day'),day);assertBound(service);
 loader.resolve('scene.night');assert.deepEqual(await target,{status:'ready',loaded:1,total:1});
 assert.equal(service.status(core).status,'ready');assert.equal(service.getImage('scene.day'),day);assert.ok(service.getImage('scene.night'));assertBound(service);
 for(const key of shared)assert.ok(service.getImage(key));
 assert.equal((await service.prepare(core)).status,'ready');assert.deepEqual(loader.requested,['scene.night']);assert.ok(service.getImage('scene.night'));
});

test('committing a prepared target promotes it without decoding again and releases the old scene',async()=>{
 const {loader,service}=await prepared(),target=service.prepareScene('scene.night');loader.resolve('scene.night');await target;
 const next=requirements('scene.night');assert.equal((await service.prepare(next)).status,'ready');
 assert.deepEqual(loader.requested,['scene.night']);assert.equal(service.getImage('scene.day'),null);assert.ok(service.getImage('scene.night'));assert.equal(service.retention().sceneImages,1);
 service.cancelScenePreparation();assert.equal(service.status(next).status,'ready');assert.ok(service.getImage('scene.night'));
 const third=service.prepareScene('scene.harbor');assertBound(service);loader.resolve('scene.harbor');await third;
 await service.prepare(requirements('scene.harbor'));assert.equal(service.getImage('scene.night'),null);assert.equal(service.retention().sceneImages,1);
});

test('latest target supersedes the old request and obsolete decode cannot displace committed art',async()=>{
 const {loader,service}=await prepared(),stale=service.prepareScene('scene.night'),latest=service.prepareScene('scene.harbor');
 assert.equal((await stale).status,'superseded');assert.deepEqual(loader.requested,['scene.night']);assertBound(service);
 loader.resolve('scene.night');await settle();assert.equal(service.getImage('scene.night'),null);assert.ok(service.getImage('scene.day'));assert.deepEqual(loader.requested,['scene.night','scene.harbor']);assertBound(service);
 loader.resolve('scene.harbor');assert.equal((await latest).status,'ready');assert.equal(service.status(requirements()).status,'ready');assertBound(service);
});

test('replacing a ready target releases it before the next scene starts decoding',async()=>{
 const {loader,service}=await prepared(),first=service.prepareScene('scene.night');loader.resolve('scene.night');await first;
 const second=service.prepareScene('scene.harbor');assert.equal(service.getImage('scene.night'),null);assert.ok(service.getImage('scene.day'));assertBound(service);
 loader.resolve('scene.harbor');await second;assertBound(service);
});

test('cancel settles every pending target promise and late completion stays discarded',async()=>{
 const {loader,service}=await prepared(),one=service.prepareScene('scene.night'),two=service.prepareScene('scene.night');
 service.cancelScenePreparation();assert.equal((await one).status,'superseded');assert.equal((await two).status,'superseded');assert.equal(service.status(requirements()).status,'ready');
 loader.resolve('scene.night');await settle();assert.equal(service.getImage('scene.night'),null);assert.deepEqual(loader.requested,['scene.night']);assert.equal(service.retention().sceneImages,1);
});

test('cancel releases a ready target but never the committed scene',async()=>{
 const {loader,service}=await prepared(),target=service.prepareScene('scene.night');loader.resolve('scene.night');await target;
 service.cancelScenePreparation();assert.equal(service.getImage('scene.night'),null);assert.ok(service.getImage('scene.day'));assert.equal(service.status(requirements()).status,'ready');
});

test('cancel and restart of the same target cannot adopt the cancelled decode',async()=>{
 const {loader,service}=await prepared(),stale=service.prepareScene('scene.night');service.cancelScenePreparation();
 const latest=service.prepareScene('scene.night');assert.equal((await stale).status,'superseded');loader.resolve('scene.night');await settle();
 assert.equal(service.getImage('scene.night'),null);assert.deepEqual(loader.requested,['scene.night','scene.night']);assertBound(service);
 loader.resolve('scene.night');assert.equal((await latest).status,'ready');
});

for(const failure of ['decode','dimensions'] as const)test(`target ${failure} failure is isolated from core readiness and retries only explicitly`,async()=>{
 const {loader,service}=await prepared(),target=service.prepareScene('scene.night');
 if(failure==='decode')loader.reject('scene.night');else {loader.pending.get('scene.night')!.resolve({width:1,height:1} as CanvasImageSource);loader.pending.delete('scene.night');}
 const failed=await target;assert.equal(failed.status,'error');assert.match(failed.error??'',/scene.night/);assert.equal(service.status(requirements()).status,'ready');assert.ok(service.getImage('scene.day'));
 assert.equal((await service.prepareScene('scene.night')).status,'error');await service.prepare(requirements());await settle();assert.deepEqual(loader.requested,['scene.night']);
 const retry=service.prepareScene('scene.night',{retry:true});assert.deepEqual(loader.requested,['scene.night','scene.night']);loader.resolve('scene.night');assert.equal((await retry).status,'ready');assert.equal(service.status(requirements()).status,'ready');
});

test('unknown and non-scene target keys fail without decoding or changing committed readiness',async()=>{
 const {loader,service}=await prepared();
 for(const key of ['scene.absent','atlas.0']){const result=await service.prepareScene(key);assert.equal(result.status,'error');assert.match(result.error??'',new RegExp(key));assert.equal(service.status(requirements()).status,'ready');}
 assert.deepEqual(loader.requested,[]);assert.equal(service.retention().sceneImages,1);
});

test('requesting the committed scene supersedes a pending target without a new decode',async()=>{
 const {loader,service}=await prepared(),stale=service.prepareScene('scene.night');
 assert.equal((await service.prepareScene('scene.day')).status,'ready');assert.equal((await stale).status,'superseded');loader.resolve('scene.night');await settle();
 assert.equal(service.getImage('scene.night'),null);assert.ok(service.getImage('scene.day'));assert.deepEqual(loader.requested,['scene.night']);
});

test('dispose supersedes a pending target and prevents late image references',async()=>{
 const {loader,service}=await prepared(),target=service.prepareScene('scene.night');service.dispose();assert.equal((await target).status,'superseded');loader.resolve('scene.night');await settle();
 assert.deepEqual(service.retention().retainedKeys,[]);assert.equal((await service.prepareScene('scene.harbor')).status,'superseded');assert.deepEqual(loader.requested,['scene.night']);
});

test('startup core resolves before a queued target and retains sequential atlas decoding',async()=>{
 const loader=deferredLoader(),service=new StaticArtResources(loader.load,table),core=service.prepare(requirements()),target=service.prepareScene('scene.night');
 assert.deepEqual(loader.requested,['scene.day']);assert.equal(service.status(requirements()).status,'loading');
 for(const key of ['scene.day',...shared]){assert.equal(loader.pending.size,1);loader.resolve(key);await settle();assertBound(service);}
 assert.equal((await core).status,'ready');assert.deepEqual(loader.requested,['scene.day',...shared,'scene.night']);assert.equal(service.status(requirements()).status,'ready');
 loader.resolve('scene.night');assert.equal((await target).status,'ready');
});

test('a discarded target failure cannot poison a later target or the committed core',async()=>{
 const {loader,service}=await prepared(),old=service.prepareScene('scene.night'),latest=service.prepareScene('scene.harbor');
 assert.equal((await old).status,'superseded');loader.reject('scene.night');await settle();assert.equal(service.status(requirements()).status,'ready');
 loader.resolve('scene.harbor');assert.equal((await latest).status,'ready');
 const retry=service.prepareScene('scene.night');assert.deepEqual(loader.requested,['scene.night','scene.harbor','scene.night']);loader.resolve('scene.night');assert.equal((await retry).status,'ready');
});

test('a committed scene change cancels a different cached target before decoding',async()=>{
 const {loader,service}=await prepared(),target=service.prepareScene('scene.night');loader.resolve('scene.night');await target;
 const next=service.prepare(requirements('scene.harbor'));assert.equal(service.getImage('scene.night'),null);assert.ok(service.getImage('scene.day'));assertBound(service);
 loader.resolve('scene.harbor');assert.equal((await next).status,'ready');assert.equal(service.retention().sceneImages,1);assert.equal(service.getImage('scene.day'),null);
});

test('a committed scene change waits for an obsolete target decode without retaining its result',async()=>{
 const {loader,service}=await prepared(),target=service.prepareScene('scene.night'),next=service.prepare(requirements('scene.harbor'));
 assert.equal((await target).status,'superseded');assert.deepEqual(loader.requested,['scene.night']);assertBound(service);
 loader.resolve('scene.night');await settle();assert.equal(service.getImage('scene.night'),null);assert.deepEqual(loader.requested,['scene.night','scene.harbor']);assertBound(service);
 loader.resolve('scene.harbor');assert.equal((await next).status,'ready');assert.equal(service.retention().sceneImages,1);
});

test('repeated target switches and commits never accumulate scenes or reload shared atlases',async()=>{
 const {loader,service}=await prepared();
 for(let index=0;index<30;index++){
  const key=['scene.night','scene.harbor','scene.day'][index%3],target=service.prepareScene(key);assertBound(service);loader.resolve(key);assert.equal((await target).status,'ready');assertBound(service);
  assert.equal((await service.prepare(requirements(key))).status,'ready');assert.equal(service.retention().sceneImages,1);for(const atlas of shared)assert.ok(service.getImage(atlas));
 }
 assert.equal(loader.requested.length,30);assert.ok(loader.requested.every(key=>key.startsWith('scene.')));
});
