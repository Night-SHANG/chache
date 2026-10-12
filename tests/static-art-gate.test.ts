import assert from 'node:assert/strict';
import test from 'node:test';
import {StaticArtGate,STATIC_ART_RETRY_RECT,STATIC_ART_BACK_RECT} from '../src/presentation/static-art-gate.ts';
import {StaticArtResources} from '../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {PointerEvent} from '../src/platform/types.ts';

const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
const goodImage=(path:string)=>{const r=Object.values(STATIC_ART_RESOURCES).find(value=>value.src===path)!;return {width:r.width,height:r.height} as CanvasImageSource;};
const center=(rect:{x:number;y:number;w:number;h:number})=>({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
function fixture(load:(path:string)=>Promise<CanvasImageSource>){const host=sessionHost(),resources=new StaticArtResources(load),gate=new StaticArtGate(host.session,resources),events:PointerEvent[]=[];for(const type of ['down','move','up','cancel'] as const){const original=host.session.input[type].bind(host.session.input);if(type==='cancel')host.session.input.cancel=id=>{events.push({type,point:{x:0,y:0},id:id??0});original(id as never);};else host.session.input[type]=(point,id=0)=>{events.push({type,point,id});};}return {...host,resources,gate,events};}
const pointer=(type:PointerEvent['type'],point={x:540,y:600},id=1):PointerEvent=>({type,point,id,pointerType:'touch'});

test('loading is visible, blocks unseen controls and never forwards a gesture started before ready',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;}),f=fixture(async path=>{await wait;return goodImage(path);});assert.equal(f.gate.refresh().status,'loading');f.gate.pointer(pointer('down'));f.gate.pointer(pointer('move'));assert.equal(f.events.filter(value=>value.type!=='cancel').length,0);
 const texts:string[]=[],context={save(){},restore(){},fillRect(){},fillText:(value:string)=>texts.push(value)} as unknown as CanvasRenderingContext2D;assert.equal(f.gate.paint(context),false);assert.ok(texts.some(value=>value.includes('加载')));release();await settle();assert.equal(f.gate.refresh().status,'ready');f.gate.pointer(pointer('up'));assert.equal(f.events.filter(value=>value.type!=='cancel').length,0);f.gate.pointer(pointer('down'));f.gate.pointer(pointer('up'));assert.deepEqual(f.events.filter(value=>value.type!=='cancel').map(value=>value.type),['down','up']);
});
test('failure keeps exact selection and retries only a complete visible button gesture',async()=>{
 let fail=true,attempts=0;const f=fixture(async path=>{attempts++;if(fail)throw Error('injected decode error');return goodImage(path);});const before=JSON.stringify(f.session.view.profile?.cosmetics);f.gate.refresh();await settle();assert.equal(f.gate.refresh().status,'error');const failed=attempts;
 f.gate.pointer(pointer('up',center(STATIC_ART_RETRY_RECT)));await settle();assert.equal(attempts,failed);f.gate.pointer(pointer('down',center(STATIC_ART_RETRY_RECT)));f.gate.pointer(pointer('cancel'));f.gate.pointer(pointer('up',center(STATIC_ART_RETRY_RECT)));assert.equal(attempts,failed);
 fail=false;f.gate.pointer(pointer('down',center(STATIC_ART_RETRY_RECT)));f.gate.pointer(pointer('up',center(STATIC_ART_RETRY_RECT)));await settle();assert.equal(f.gate.refresh().status,'ready');assert.equal(JSON.stringify(f.session.view.profile?.cosmetics),before);
});
test('shop preview failure exposes back without allowing hidden purchases',async()=>{
 const f=fixture(async path=>{if(path.includes('preview'))throw Error('preview unavailable');return goodImage(path);});f.session.action({type:'shop'});f.session.action({type:'selectShopTab',tab:'cosmetics'});f.gate.refresh();await settle();assert.equal(f.gate.refresh().status,'error');assert.equal(f.gate.canGoBack(),true);
 f.gate.pointer(pointer('down',center(STATIC_ART_BACK_RECT)));f.gate.pointer(pointer('up',center(STATIC_ART_BACK_RECT)));await settle();assert.notEqual(f.session.view.screen,'shop');assert.equal(f.gate.refresh().status,'ready');assert.equal(f.events.filter(value=>value.type!=='cancel').length,0);
});
test('hide/show cancels touches without allocating, decoding again, or retaining previews for a closed page',async()=>{
 let loads=0;const f=fixture(async path=>{loads++;return goodImage(path);});f.gate.refresh();await settle();f.gate.pointer(pointer('down'));f.gate.hide();f.gate.pointer(pointer('up'));const before=loads;assert.equal(f.gate.isReady(),false);f.gate.show();assert.equal(f.gate.isReady(),true);assert.equal(loads,before);f.gate.pointer(pointer('up'));assert.deepEqual(f.events.filter(value=>value.type!=='cancel').map(value=>value.type),['down']);
});

test('a saved non-default decode failure retains exact selected identity and all saved bytes',async()=>{
 const requested:string[]=[],f=fixture(async path=>{requested.push(path);throw Error('saved art unavailable');});const account=structuredClone(f.session.view.account!);account.profile.cosmetics={theme:'harbor',cargo:'wood',forklift:'heavy'};f.session.view.account=account;const before=JSON.stringify(account),saved=[...f.data];f.gate.refresh();await settle();assert.equal(f.gate.refresh().status,'error');assert.deepEqual(requested,[STATIC_ART_RESOURCES['scene.harbor'].src]);assert.equal(JSON.stringify(f.session.view.account),before);assert.deepEqual([...f.data],saved);assert.equal(f.resources.getImage('scene.day'),null);assert.equal(f.resources.getImage('scene.harbor'),null);
});

test('native Canvas paints visible Chinese loading/error explanations and retry labels with the shared CJK font stack',async()=>{
 const {createCanvas}=await import('@napi-rs/canvas'),canvas=createCanvas(1080,1920),context=canvas.getContext('2d'),f=fixture(async()=>{throw Error('fixture decode failure');});
 const changedPixels=(x:number,y:number,w:number,h:number,background:readonly number[])=>{const pixels=context.getImageData(x,y,w,h).data;let changed=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==background[0]||pixels[i+1]!==background[1]||pixels[i+2]!==background[2])changed++;return changed;};
 f.gate.refresh();f.gate.paint(context as unknown as CanvasRenderingContext2D);assert.ok(changedPixels(96,690,888,90,[38,61,80])>1500,'loading heading must contain actual painted CJK glyph pixels');
 await settle();assert.equal(f.gate.refresh().status,'error');f.gate.paint(context as unknown as CanvasRenderingContext2D);
 assert.ok(changedPixels(96,690,888,90,[38,61,80])>1500,'failure heading must contain actual painted CJK glyph pixels');
 assert.ok(changedPixels(96,800,888,70,[38,61,80])>500,'failure explanation must contain actual painted CJK glyph pixels');
 assert.ok(changedPixels(240,1120,600,80,[224,191,103])>500,'retry button must contain actual painted CJK glyph pixels');
});
