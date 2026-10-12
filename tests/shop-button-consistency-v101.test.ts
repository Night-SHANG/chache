import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {getShopControls,cosmeticStatus} from '../src/presentation/economy-ui.ts';
import {COSMETIC_CATALOG,getCosmetic,retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {COSMETIC_SETS,quoteCosmeticSetPurchase} from '../src/application/cosmetic-sets.ts';
import {createProfile} from '../src/application/profile.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import {render} from '../src/presentation/renderer.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {GameSession} from '../src/application/session.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
const view=(patch:Partial<ViewState>={}):ViewState=>({screen:'shop',shopTab:'cosmetics',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});
const account=(wallet=0)=>retainAccountCosmetics(makeAccountFixture({wallet}));
const primary=(v:ViewState)=>getShopControls(v).find(c=>c.buttonRole==='primary')!;
function paints(v:ViewState){const ctx=createCanvas(1080,1920).getContext('2d'),rows:{text:string;font:string;x:number;y:number;width:number}[]=[];const fill=ctx.fillText.bind(ctx);ctx.fillText=(text,x,y,...rest)=>{rows.push({text,font:ctx.font,x,y,width:ctx.measureText(text).width});fill(text,x,y,...rest);};render(ctx as unknown as CanvasRenderingContext2D,createRunV14({seed:11,mode:'standard'}),v);return rows;}
test('v101 all ordinary and set-member paid prices stay single-line whether affordable or disabled',()=>{
 for(const item of COSMETIC_CATALOG.filter(i=>i.price>0))for(const wallet of [0,item.price-1,item.price,9000])for(const member of [false,true]){
  const v=view({account:account(wallet),shopSection:item.kind,cosmeticPreview:{[item.kind]:item.id},...(member?{cosmeticReturnSet:'harbor'}:{})}),c=primary(v);
  assert.equal(c.label,`${item.price}金币 · 购买`,item.key);assert.equal(!!c.disabled,wallet<item.price);assert.equal(getShopControls(v).find(c=>c.action.type==='back')!.label,'返回');
 }
});
test('v101 partial bundle quote keeps purchase-set wording and exactly reuses ordinary footer proportions',()=>{
 for(const set of COSMETIC_SETS)for(let mask=0;mask<7;mask++)for(const wallet of [0,9000]){
  const a=account(wallet),members=['theme','cargo','forklift'].map(kind=>`${kind}.${set[kind as 'theme'|'cargo'|'forklift']}`);a.profile.ownedCosmetics=[...new Set([...a.profile.ownedCosmetics!,...members.filter((_,i)=>mask&(1<<i))])].sort();
  const v=view({account:a,shopSection:'sets',cosmeticSetPreview:set.id}),controls=getShopControls(v),c=primary(v),quote=quoteCosmeticSetPurchase(set.id,{ownedCosmetics:a.profile.ownedCosmetics!})!;
  assert.equal(c.label,`${quote.price}金币 · 购买套装`);assert.equal(!!c.disabled,wallet<quote.price);assert.deepEqual(c.rect,{x:420,y:1692,w:528,h:150});
  const back=controls.find(c=>c.action.type==='closeShopDetail')!;assert.equal(back.label,'返回');assert.deepEqual(back.rect,{x:132,y:1692,w:264,h:150});
 }
});
test('v101 classic white purchase uses the same price-first single line and narrow Back',()=>{
 const v=view({account:account(599),shopSection:'sets',cosmeticSetPreview:'classic',classicSetSelection:{theme:'day',cargo:'classic',forklift:'white'}});assert.equal(primary(v).label,'600金币 · 购买');assert.equal(primary(v).disabled,true);assert.deepEqual(primary(v).rect,{x:420,y:1692,w:528,h:150});
 assert.ok(paints(v).every(p=>!p.text.includes('还差')));
});
test('v101 insufficient bundles show original price and discount without a deficit annotation',()=>{
 const set=COSMETIC_SETS.find(s=>s.theme==='harbor')!,a=account(684);a.profile.ownedCosmetics!.push('theme.harbor');a.profile.ownedCosmetics!.sort();const v=view({account:a,shopSection:'sets',cosmeticSetPreview:set.id});
 assert.equal(primary(v).label,'810金币 · 购买套装');const rows=paints(v);assert.ok(rows.some(p=>p.text==='原价900 · 9折'));assert.ok(rows.every(p=>!p.text.includes('还差')));
});
test('v101 actual loaded-font paint shares family size weight and one baseline across all purchase footers',()=>{
 assert.ok(GlobalFonts.families.some(f=>f.family==='Noto Sans CJK SC'),'Chinese font must really be available');
 const set=COSMETIC_SETS.find(s=>s.theme==='harbor')!;const views=[...['theme','cargo','forklift'].map(kind=>view({account:account(9000),shopSection:kind as 'theme'|'cargo'|'forklift',cosmeticPreview:{[kind]:kind==='theme'?'harbor':kind==='cargo'?'wood':'white'}})),view({account:account(0),shopSection:'sets',cosmeticSetPreview:set.id}),view({account:account(599),shopSection:'sets',cosmeticSetPreview:'classic',classicSetSelection:{theme:'day',cargo:'classic',forklift:'white'}})];
 let expected:string|undefined;for(const v of views){const c=primary(v),rows=paints(v).filter(p=>p.y>c.rect.y&&p.y<c.rect.y+c.rect.h&&p.x>c.rect.x);assert.equal(rows.length,1,c.label);assert.equal(rows[0].text,c.label);assert.equal(rows[0].y,c.rect.y+c.rect.h/2);assert.ok(rows[0].width<=c.rect.w-48);assert.match(rows[0].font,/^800 42px /);expected??=rows[0].font;assert.equal(rows[0].font,expected);}
});
test('v101 outline equipment is labeled consistently and classic is available to remove it',()=>{
 for(const enabled of [false,true]){const a=account();a.profile.cargoOutline=enabled;const v=view({account:a,shopSection:'cargo',cosmeticPreview:{cargo:'outline'}}),c=primary(v);assert.equal(c.label,enabled?'使用中':'装备');assert.equal(!!c.disabled,enabled);assert.deepEqual(c.action,{type:'setCargoOutline',enabled:true});
 const classic=primary({...v,cosmeticPreview:{cargo:'classic'}});assert.equal(classic.label,enabled?'装备':'使用中');assert.equal(!!classic.disabled,!enabled);assert.equal(cosmeticStatus(getCosmetic('cargo','classic')!,v),enabled?'已拥有':'使用中');}
});
test('v101 outline to classic through actual input is one durable transaction and survives restart',()=>{
 const h=sessionHost({wallet:684}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectShopSection',section:'cargo'});s.action({type:'previewCosmetic',kind:'cargo',id:'outline'});
 const click=()=>{const c=getUiControls(s.state,s.view).find(c=>c.buttonRole==='primary')!;const point={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};s.input.down(point);s.input.up(point);return c;};
 assert.equal(click().label,'装备');assert.equal(s.view.account!.profile.cargoOutline,true);s.action({type:'previewCosmetic',kind:'cargo',id:'classic'});const before=structuredClone(s.view.account!);assert.equal(click().label,'装备');const after=s.view.account!;assert.equal(after.generation,before.generation+1);assert.equal(after.profile.cargoOutline,false);assert.equal(after.profile.cosmetics.cargo,'classic');assert.equal(after.wallet,before.wallet);assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.profile.ownedCosmetics,before.profile.ownedCosmetics);const raw=[...h.data];assert.equal(click().label,'使用中');assert.deepEqual([...h.data],raw);
 const restored=new GameSession(h.platform,{seed:71,mode:'standard'});assert.equal(restored.view.account!.profile.cargoOutline,false);assert.equal(restored.view.account!.wallet,684);
});
test('v101 tools keep the required price and purchase word when wallet is insufficient',()=>{for(const wallet of [0,9000]){const controls=getShopControls(view({shopTab:'tools',account:account(wallet)}));for(const c of controls.filter(c=>c.action.type==='purchase'))assert.match(c.label,/^\d+金币 · 购买$/);}});
test('v101 rejected set intent keeps a useful insufficient-wallet error without a deficit amount',()=>{
 const h=sessionHost({wallet:684}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'previewCosmeticSet',id:'harbor'});s.action({type:'purchaseCosmeticSet',id:'harbor'});assert.equal(s.view.confirmation,null);assert.equal(s.view.cosmeticSetNotice,'金币不足');
});
