import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import * as economyUi from '../src/presentation/economy-ui.ts';
import {shopScrollLimit,shopCardRect} from '../src/presentation/shop-layout.ts';
import * as cosmeticArt from '../src/presentation/cosmetic-art.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {createProfile} from '../src/application/profile.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import type {GameSession} from '../src/application/session.ts';
const digest=(data:Uint8ClampedArray)=>createHash('sha256').update(data).digest('hex');
const state=createRunV14({seed:11,mode:'standard'});
const act=(s:GameSession,a:Record<string,unknown>)=>s.action(a as UiAction);
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),account:makeAccountFixture({wallet:900}),...patch});
const owned=()=>{const a=retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},wallet:900}));a.profile.ownedCosmetics=[...new Set([...a.profile.ownedCosmetics!,'theme.cold_chain','cargo.insulated','forklift.electric'])].sort();return a;};
const controls=(v:ViewState)=>getUiControls(state,v);
const open=(s:GameSession)=>{act(s,{type:'shop'});act(s,{type:'selectShopTab',tab:'cosmetics'});};
const capture=(v:ViewState)=>{const c=createCanvas(1080,1920),ctx=c.getContext('2d'),labels:string[]=[];const fill=ctx.fillText.bind(ctx);ctx.fillText=(v,x,y)=>{labels.push(v);fill(v,x,y);};render(ctx as unknown as CanvasRenderingContext2D,state,v);return {c,labels};};

test('appearance opens coordinated scrolling cards and four peer categories',()=>{
 const c=controls(view());assert.equal(c.filter(c=>c.action.type==='previewCosmeticSet').length,6);
 assert.deepEqual(c.filter(c=>c.action.type==='selectShopSection').map(c=>[c.label,c.selected]),[['套装',true],['场景',false],['货箱',false],['叉车',false]]);
 assert.ok(c.filter(c=>c.action.type==='previewCosmeticSet').every(c=>/金币|已拥有|使用中/.test(c.label)));
 const h=sessionHost();open(h.session);act(h.session,{type:'selectShopSection',section:'theme'});
 assert.equal(controls(h.session.view).filter(c=>c.action.type==='selectShopSection').length,4);
 act(h.session,{type:'selectShopTab',tab:'tools'});assert.equal(controls(h.session.view).filter(c=>c.action.type==='purchase').length,3);
});

test('set scrolling visits every unique visual card without equipping or persisting',()=>{
 const h=sessionHost(),s=h.session;open(s);const before=[...h.data],original=structuredClone(s.view.account!.profile.cosmetics),ids=new Set<string>(),limit=shopScrollLimit(s.view);
 for(let offset=0;offset<=limit+364;offset+=364){
  const cards=controls(s.view).filter(c=>c.action.type==='previewCosmeticSet');
  for(const c of cards){assert.equal(c.action.type,'previewCosmeticSet');if(c.action.type==='previewCosmeticSet')ids.add(c.action.id);s.action(c.action);assert.equal(controls(s.view).some(c=>c.action.type==='selectShopSection'),false);act(s,{type:'closeShopDetail'});}
  act(s,{type:'scrollShop',deltaY:364});
 }
 assert.equal(ids.size,16);assert.deepEqual(s.view.account?.profile.cosmetics,original);assert.deepEqual([...h.data],before);act(s,{type:'back'});assert.equal(s.view.screen,'menu');assert.deepEqual([...h.data],before);
});

test('coherent preview uses all three set members irrespective of worn appearance and never writes on cancel',()=>{
 const h=sessionHost(),s=h.session;open(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});
 assert.equal(s.view.cosmeticSetPreview,'cold_chain');const base=capture(s.view),a=owned();a.profile.cosmetics={theme:'night',cargo:'wood',forklift:'white'};
 const other=capture({...s.view,account:a}),r=economyUi.COSMETIC_SET_PREVIEW_RECT;
 assert.ok(r);assert.ok(r.h/3>=260&&r.h/3<=320);assert.deepEqual(base.c.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data,other.c.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data);
 const before=[...h.data];act(s,{type:'cancel'});act(s,{type:'closeCosmeticSet'});assert.deepEqual([...h.data],before);
});

test('unaffordable missing set members disable bundle purchase and member link retains single-item purchase',()=>{
 const h=sessionHost({wallet:300}),s=h.session;open(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});const before=[...h.data];
 const buy=controls(s.view).find(c=>c.action.type==='purchaseCosmeticSet');assert.ok(buy?.disabled);assert.equal(buy.label,'购买套装\n1440金币');assert.ok(capture(s.view).labels.some(label=>label.includes('还差1140金币')));assert.equal(controls(s.view).some(c=>c.action.type==='equipCosmeticSet'),false);act(s,{type:'equipCosmeticSet',id:'cold_chain'});assert.deepEqual([...h.data],before);
 act(s,{type:'previewCosmeticSetMember',kind:'cargo'});assert.equal(s.view.cosmeticBrowse,'items');assert.equal(s.view.cosmeticPreview?.cargo,'insulated');assert.equal(controls(s.view).find(c=>c.action.type==='purchaseCosmetic')?.label,'购买\n300金币');
 act(s,{type:'purchaseCosmetic',kind:'cargo',id:'insulated'});assert.equal(s.view.confirmation?.kind,'purchaseCosmetic');act(s,{type:'cancel'});assert.deepEqual([...h.data],before);
});

test('all-owned set applies all slots with one account generation and repeated activation is idempotent',()=>{
 const a=owned(),h=sessionHost(a),s=h.session;open(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});const generation=s.view.account!.generation,balance=s.view.account!.wallet;
 assert.equal(controls(s.view).find(c=>c.action.type==='equipCosmeticSet')?.disabled,false);act(s,{type:'equipCosmeticSet',id:'cold_chain'});
 assert.equal(s.view.account!.generation,generation+1);assert.deepEqual(s.view.account!.profile.cosmetics,{theme:'cold_chain',cargo:'insulated',forklift:'electric'});assert.equal(s.view.account!.wallet,balance);
 const before=[...h.data];act(s,{type:'equipCosmeticSet',id:'cold_chain'});assert.deepEqual([...h.data],before);assert.equal(controls(s.view).find(c=>c.action.type==='equipCosmeticSet')?.label,'使用中');
});

test('uncertain whole-set storage exposes no partial preview equip and retry publishes all three once',()=>{
 const a=owned(),h=sessionHost(a),s=h.session;open(s);act(s,{type:'previewCosmeticSet',id:'cold_chain'});const before=s.view.account,original=h.storage.set.bind(h.storage);let fail=true;
 h.storage.set=(key,value)=>{if(fail&&key===ACCOUNT_KEYS.a)throw Error('mirror');original(key,value);};act(s,{type:'equipCosmeticSet',id:'cold_chain'});
 assert.equal(s.view.account,before);assert.equal(s.view.accountBlocked,true);act(s,{type:'back'});assert.equal(s.view.screen,'shop');fail=false;act(s,{type:'retrySave'});
 assert.deepEqual(s.view.account!.profile.cosmetics,{theme:'cold_chain',cargo:'insulated',forklift:'electric'});const stable=[...h.data];act(s,{type:'retrySave'});assert.deepEqual([...h.data],stable);
});

test('set list detail and independent controls never overlap and retain 44px targets at 360px width',()=>{
 for(const extra of [{},{cosmeticSetPreview:'cold_chain'},{cosmeticBrowse:'items',cosmeticCategory:'cargo'}] as const){const c=controls(view(extra));
  for(const [i,a]of c.entries()){assert.ok(a.rect.w/3>=44&&a.rect.h/3>=44);assert.ok(a.rect.y+a.rect.h<=1856);for(const b of c.slice(i+1))assert.ok(a.rect.x+a.rect.w<=b.rect.x||b.rect.x+b.rect.w<=a.rect.x||a.rect.y+a.rect.h<=b.rect.y||b.rect.y+b.rect.h<=a.rect.y,`${a.action.type}/${b.action.type}`);}
 }
});

test('large coordinated preview is a bounded deterministic real 9x9 board and all three IDs affect pixels',()=>{
 assert.equal(typeof cosmeticArt.drawCosmeticSetPreview,'function');const r={x:20,y:20,w:816,h:840},pixels=(theme='cold_chain',cargo='insulated',forklift='electric')=>{const c=createCanvas(856,880),ctx=c.getContext('2d');cosmeticArt.drawCosmeticSetPreview(ctx as unknown as CanvasRenderingContext2D,r,{theme,cargoStyle:cargo,forklift} as Parameters<typeof cosmeticArt.drawCosmeticSetPreview>[2]);assert.equal(ctx.getImageData(0,0,1,1).data[3],0);return ctx.getImageData(0,0,856,880).data;};
 const original=pixels();assert.deepEqual(pixels(),original);assert.notDeepEqual(pixels('night'),original);assert.notDeepEqual(pixels('cold_chain','classic'),original);assert.notDeepEqual(pixels('cold_chain','insulated','yellow'),original);
});

test('standalone outline preview always shows classic outline after ice selection',()=>{
 const a=owned(),plain=capture(view({account:a,shopSection:'cargo',shopItemDetail:{kind:'cargo',id:'outline'}}));
 a.profile.cosmetics.cargo='ice_crystal';const ice=capture(view({account:a,shopSection:'cargo',shopItemDetail:{kind:'cargo',id:'outline'}})),r=economyUi.COSMETIC_PREVIEW_RECT;
 assert.equal(digest(ice.c.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data),digest(plain.c.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data));
});

test('each partial ownership count selects purchase or equip from a read-only derived badge',()=>{
 for(let count=0;count<=3;count++){
  const account=owned();account.wallet=3000;account.profile.ownedCosmetics=account.profile.ownedCosmetics!.filter(key=>!['theme.cold_chain','cargo.insulated','forklift.electric'].slice(count).includes(key));
  const before=JSON.stringify(account),v=view({account,cosmeticSetPreview:'cold_chain'}),button=controls(v).find(c=>c.action.type===(count===3?'equipCosmeticSet':'purchaseCosmeticSet'));assert.ok(button);assert.equal(button.disabled,false);assert.equal(button.label,count===3?'装备整套':`购买套装\n${[1440,720,480][count]}金币`);assert.ok(capture(v).labels.includes(`已拥有 ${count}/3`));assert.equal(JSON.stringify(account),before);
 }
});

test('choosing classic outline after ice is explicit, free and durable; disabling stays classic',()=>{
 const a=owned();a.profile.ownedCosmetics!.push('cargo.ice_crystal');a.profile.ownedCosmetics!.sort();a.profile.cosmetics.cargo='ice_crystal';const h=sessionHost(a),s=h.session;open(s);act(s,{type:'selectCosmeticCategory',kind:'cargo'});const before=[...h.data],wallet=s.view.account!.wallet;act(s,{type:'previewCosmetic',kind:'cargo',id:'outline'});assert.deepEqual([...h.data],before);act(s,{type:'setCargoOutline',enabled:true});assert.equal(s.view.account!.profile.cosmetics.cargo,'classic');assert.equal(s.view.account!.profile.cargoOutline,true);assert.equal(s.view.account!.wallet,wallet);act(s,{type:'setCargoOutline',enabled:false});assert.equal(s.view.account!.profile.cosmetics.cargo,'classic');assert.equal(s.view.account!.profile.cargoOutline,false);assert.equal(s.view.account!.wallet,wallet);
});

test('fresh-account set previews and invalid selectors create no account or durable writes',()=>{
 const h=sessionHost({},false),s=h.session;open(s);h.storage.resetFault();const before=[...h.data];
 for(const action of [{type:'previewCosmeticSet',id:'cold_chain'},{type:'equipCosmeticSet',id:'cold_chain'},{type:'previewCosmeticSet',id:'unknown'},{type:'selectCosmeticSetPage',page:NaN},{type:'selectCosmeticSetPage',page:99},{type:'closeCosmeticSet'},{type:'back'}])act(s,action);
 assert.equal(s.view.account,null);assert.equal(s.view.screen,'menu');assert.deepEqual([...h.data],before);assert.equal(h.storage.operations.some(op=>op.kind==='set'||op.kind==='remove'),false);
});

test('set cards show the same real-board floor and frame instead of unrelated product compositions',()=>{
 const v=view(),actual=capture(v),reference=createCanvas(1080,1920),ctx=reference.getContext('2d'),card=shopCardRect(v,1),r={x:card.x+16,y:card.y+16,w:card.w-32,h:230};
 cosmeticArt.drawCosmeticSetPreview(ctx as unknown as CanvasRenderingContext2D,r,{theme:'cold_chain',cargoStyle:'insulated',forklift:'electric',cargoOutline:false});
 assert.equal(digest(actual.c.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data),digest(ctx.getImageData(r.x,r.y,r.w,r.h).data));
});

test('each set member shows its exact cosmetic name and independent equipped ownership state',()=>{
 const a=owned();a.profile.cosmetics.theme='cold_chain';a.profile.ownedCosmetics=a.profile.ownedCosmetics!.filter(key=>key!=='forklift.electric');const members=controls(view({account:a,cosmeticSetPreview:'cold_chain'})).filter(c=>c.action.type==='previewCosmeticSetMember');
 assert.deepEqual(members.map(c=>c.label),['场景 · 已装备\n冷链仓库','货箱 · 已拥有\n保温周转箱','叉车 · 未拥有\n电驱叉车']);
});

test('every shop route keeps 44 CSS pixel targets and nonoverlapping footer at 320px width',()=>{
 const variants:Partial<ViewState>[]=[{shopTab:'tools'},{cosmeticSetPreview:'cold_chain'},{confirmation:{kind:'purchase',item:'rotate'}},{confirmation:{kind:'purchaseCosmetic',cosmeticKind:'cargo',cosmeticId:'insulated'}},{accountBlocked:true},...Array.from({length:4},(_,cosmeticSetPage)=>({cosmeticSetPage})),...(['theme','cargo','forklift'] as const).map(cosmeticCategory=>({cosmeticBrowse:'items' as const,cosmeticCategory}))];
 for(const patch of variants){const all=controls(view(patch));for(const [i,a]of all.entries()){
  assert.ok(a.rect.w*320/1080>=44&&a.rect.h*320/1080>=44,`${a.action.type} at 320px: ${a.rect.w*320/1080}×${a.rect.h*320/1080}`);assert.ok(a.rect.y+a.rect.h<=1856,`${a.action.type} crowds persistence footer`);
  for(const b of all.slice(i+1))assert.ok(a.rect.x+a.rect.w<=b.rect.x||b.rect.x+b.rect.w<=a.rect.x||a.rect.y+a.rect.h<=b.rect.y||b.rect.y+b.rect.h<=a.rect.y,`${a.action.type}/${b.action.type}`);
 }}
});

test('small-screen set member names use at least 32 logical pixels with intact text',()=>{
 const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),fonts:{value:string;font:string}[]=[],fill=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>{fonts.push({value,font:ctx.font});fill(value,x,y);};
 render(ctx as unknown as CanvasRenderingContext2D,state,view({cosmeticSetPreview:'cold_chain'}));
 for(const name of ['冷链仓库','保温周转箱','电驱叉车']){const item=fonts.find(f=>f.value===name);assert.ok(item,name);assert.ok(Number(item.font.match(/(\d+(?:\.\d+)?)px/)?.[1])>=32,item.font);}
});
