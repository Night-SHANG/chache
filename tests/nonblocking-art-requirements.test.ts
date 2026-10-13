import assert from 'node:assert/strict';
import test from 'node:test';
import {configureStaticArt,getStaticArtImage,staticArtStatus} from '../src/presentation/static-art-resources.ts';
import {prepareStaticArtForView,staticArtRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getShopControls} from '../src/presentation/economy-ui.ts';
const settle=()=>new Promise<void>(r=>setImmediate(r));
const image=(path:string)=>{const row=Object.values(STATIC_ART_RESOURCES).find(r=>r.src===path)!;return {width:row.width,height:row.height} as CanvasImageSource;};
function fixture(){const h=sessionHost({wallet:5000});h.session.action({type:'shop'});h.session.action({type:'selectShopTab',tab:'cosmetics'});h.session.action({type:'purchaseCosmetic',kind:'theme',id:'cold_chain'});h.session.action({type:'confirm'});h.session.action({type:'previewCosmetic',kind:'theme',id:'cold_chain'});return h;}
test('equip commits immediately while every PNG is still pending and never changes price or wallet',()=>{
 configureStaticArt(()=>new Promise(()=>{}));const {session}=fixture();prepareStaticArtForView(session.view);const wallet=session.view.account!.wallet;
 session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');assert.equal(session.view.account?.wallet,wallet);assert.ok(getShopControls(session.view).some(c=>c.label==='使用中'));
});
test('late old scene completion cannot replace the newest equipped appearance or write its account',async()=>{
 const pending:{path:string;resolve:(image:CanvasImageSource)=>void}[]=[];configureStaticArt(path=>new Promise(resolve=>pending.push({path,resolve})));
 const {session,data}=fixture();prepareStaticArtForView(session.view);assert.equal(pending.length,1);
 session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});prepareStaticArtForView(session.view);const saved=[...data];
 const old=pending.shift()!;old.resolve(image(old.path));await settle();assert.equal(getStaticArtImage('scene.day'),null);assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');
 for(let n=0;pending.length&&n<20;n++){const next=pending.shift()!;next.resolve(image(next.path));await settle();}
 assert.ok(getStaticArtImage('scene.cold_chain'));assert.deepEqual([...data],saved);assert.equal(staticArtStatus(staticArtRequirementsForView(session.view)).status,'ready');
});
test('permanent image failure does not block equip and repeated frames never retry or write',async()=>{
 let loads=0;configureStaticArt(async()=>{loads++;throw Error('missing');});const {session,data}=fixture();prepareStaticArtForView(session.view);await settle();assert.equal(loads,9);const before=[...data];for(let n=0;n<100;n++)prepareStaticArtForView(session.view);assert.equal(loads,9);assert.deepEqual([...data],before);
 session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');prepareStaticArtForView(session.view);await settle();assert.equal(loads,10);
});
test('existing writer and uncertain-save rules still own immediate equip',()=>{
 const {session,data,platform}=fixture();Object.assign(platform.writerLease!,{status:'busy'});const saved=[...data];session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});assert.deepEqual([...data],saved);assert.equal(session.view.account?.profile.cosmetics.theme,'day');
});
test('uncertain equip save retains the old visible identity until existing exact retry confirms it',async()=>{
 const {ACCOUNT_KEYS}=await import('../src/application/account-store.ts');const {session,storage}=fixture(),set=storage.set.bind(storage),wallet=session.view.account!.wallet,generation=session.view.account!.generation;
 storage.set=(key,value)=>{if(key===ACCOUNT_KEYS.a)throw Error('mirror unavailable');set(key,value);};session.action({type:'equipCosmetic',kind:'theme',id:'cold_chain'});assert.equal(session.view.accountBlocked,true);assert.equal(session.view.account?.profile.cosmetics.theme,'day');session.hide();
 storage.set=set;session.action({type:'retrySave'});assert.equal(session.view.accountBlocked,false);assert.equal(session.view.account?.profile.cosmetics.theme,'cold_chain');assert.equal(session.view.account?.generation,generation+1);assert.equal(session.view.account?.wallet,wallet);
});
