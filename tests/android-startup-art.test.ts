import test from 'node:test';
import assert from 'node:assert/strict';
import {staticArtStartupRequirementsForView,staticArtCoreRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {prepareAndroidStartupArt} from '../src/platform/android-startup-art.ts';
import {getStaticArtImage,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
const image=(path:string)=>{const r=Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!;return {width:r.width,height:r.height} as CanvasImageSource;};
const settle=()=>new Promise<void>(r=>setImmediate(r));
test('Android initial menu requests only its committed scene and visible forklift atlas',()=>{
 const {session}=sessionHost();assert.deepEqual(staticArtStartupRequirementsForView(session.view),{scene:'scene.day',shared:['forklift.base'],previews:[]});
 session.view.needsResume=true;assert.deepEqual(staticArtStartupRequirementsForView(session.view),staticArtCoreRequirementsForView(session.view));
});
test('successful startup resolves as soon as its two images finish, without waiting for a delay',async()=>{
 const {session}=sessionHost(),paths:string[]=[];
 const status=await prepareAndroidStartupArt(async path=>{paths.push(path);return image(path);},staticArtStartupRequirementsForView(session.view),10000);
 assert.equal(status.status,'ready');assert.equal(paths.length,2);assert.ok(getStaticArtImage('scene.day'));assert.ok(getStaticArtImage('forklift.base'));
});
test('startup timeout permanently rejects late images and still allows later deliberate scene loading',async()=>{
 const {session}=sessionHost();let late:((value:CanvasImageSource)=>void)|undefined;const calls:string[]=[];
 const status=await prepareAndroidStartupArt(path=>{calls.push(path);return new Promise(resolve=>{late=resolve;});},staticArtStartupRequirementsForView(session.view),10);
 assert.equal(status.status,'error');assert.equal(calls.length,1);assert.equal(getStaticArtImage('scene.day'),null);
 late!(image(calls[0]!));await settle();assert.equal(getStaticArtImage('scene.day'),null,'late native onload cannot populate the settled resource promise');
 await prepareStaticArt(staticArtStartupRequirementsForView(session.view));assert.equal(calls.length,1,'same scene has no implicit retry loop');
 const next=prepareStaticArt({scene:'scene.night',shared:[],previews:[]});await settle();assert.equal(calls.length,2);late!(image(calls[1]!));assert.equal((await next).status,'ready');assert.ok(getStaticArtImage('scene.night'));
});
test('immediate image failure settles to usable fallback without waiting for deadline',async()=>{
 const {session}=sessionHost();const status=await prepareAndroidStartupArt(async()=>{throw Error('decode failed');},staticArtStartupRequirementsForView(session.view),10000);
 assert.equal(status.status,'error');assert.equal(getStaticArtImage('scene.day'),null);
});
