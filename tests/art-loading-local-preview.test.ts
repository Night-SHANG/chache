import test from 'node:test';
import assert from 'node:assert/strict';
import {StaticArtResources} from '../src/presentation/static-art-resources.ts';
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

test('recent item preview survives confirmation-shaped requirements and return',async()=>{
 const counts=new Map<string,number>();const resources=new TestStaticArtResources(async path=>{counts.set(path,(counts.get(path)??0)+1);return good(path);});
 const core={scene:'scene.day',shared:['cargo.core'],previews:[]},page={...core,previews:['preview.day.item']};
 await resources.prepare(page);await resources.prepare(core);await resources.prepare(page);
 assert.equal(counts.get(loaderResources['preview.day.item'].src),1);resources.dispose();
});

test('idle warming yields one image per call and respects pause without foreground eviction',async()=>{
 const calls:string[]=[];const resources=new TestStaticArtResources(async path=>{calls.push(path);return good(path);});
 await resources.prepare({scene:'scene.day',shared:['cargo.core'],previews:[]});const initial=calls.length;
 const warm=['preview.day.item','preview.night.item'];resources.warm(warm);await settle();assert.equal(calls.length,initial);
 resources.setWarmPaused(false);resources.warm(warm);await settle();assert.equal(calls.length,initial+1);assert.ok(resources.getImage('scene.day'));assert.ok(resources.getImage('cargo.core'));
 resources.setWarmPaused(true);resources.warm(warm);await settle();assert.equal(calls.length,initial+1);
 resources.setWarmPaused(false);resources.warm(warm);await settle();assert.equal(calls.length,initial+2);resources.warm(warm);await settle();assert.equal(calls.length,initial+2);resources.dispose();
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

test('idle work interrupted by hide can resume rather than permanently skipping its image',async()=>{
 let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let previews=0;const resources=new TestStaticArtResources(async path=>{if(path.includes('preview')){previews++;await wait;}return good(path);});
 await resources.prepare({scene:'scene.day',shared:[],previews:[]});resources.setWarmPaused(false);resources.warm(['preview.day.item']);resources.setWarmPaused(true);release();await settle();assert.equal(resources.getImage('preview.day.item'),null);
 resources.setWarmPaused(false);resources.warm(['preview.day.item']);await settle();assert.equal(previews,2);assert.ok(resources.getImage('preview.day.item'));resources.dispose();
});
