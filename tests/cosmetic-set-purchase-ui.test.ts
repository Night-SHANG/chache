import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createCanvas} from '@napi-rs/canvas';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {createAccountService} from '../src/application/account-service.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import type {GameSession} from '../src/application/session.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';

const setKeys=['theme.cold_chain','cargo.insulated','forklift.electric'];
const act=(s:GameSession,a:Record<string,unknown>)=>s.action(a as UiAction);
function open(s:GameSession){act(s,{type:'shop'});act(s,{type:'selectShopTab',tab:'cosmetics'});act(s,{type:'previewCosmeticSet',id:'cold_chain'});}
function host(owned:string[]=[],wallet=3000){const a=retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},wallet}));a.profile.ownedCosmetics=[...new Set([...a.profile.ownedCosmetics!,...owned])].sort();return sessionHost(a);}
const controls=(s:GameSession)=>getUiControls(s.state,s.view);
const confirmationQuote=(s:GameSession)=>s.view.confirmation?.cosmeticSetQuote;
function words(s:GameSession,renderer=render){const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,out:string[]=[];ctx.fillText=value=>out.push(value);renderer(ctx,s.state,s.view);return out.join('\n');}

test('set details put blue return on the left and yellow purchase on the right',()=>{
 const {session:s}=host();open(s);const back=controls(s).find(c=>c.action.type==='closeShopDetail'),buy=controls(s).find(c=>c.action.type==='purchaseCosmeticSet');
 assert.ok(back);assert.ok(buy);assert.equal(back.label,'返回');assert.equal(back.buttonRole,'secondary');assert.equal(buy.label,'1440金币 · 购买套装');assert.equal(buy.buttonRole,'primary');assert.equal(buy.disabled,false);assert.ok(back.rect.x+back.rect.w<buy.rect.x);
 assert.equal(controls(s).filter(c=>c.action.type==='previewCosmeticSetMember').length,3);
});

for(const [owned,original,price] of [[[],1800,1440],[['cargo.insulated'],1500,1200],[['theme.cold_chain'],900,720],[['forklift.electric'],1200,960]] as const)test(`bundle confirmation quotes only missing members: ${owned.join(',')||'all three'}`,()=>{
 const h=host([...owned]),s=h.session;open(s);const before=[...h.data];act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});
 assert.equal(s.view.confirmation?.kind,'purchaseCosmeticSet');assert.deepEqual(s.view.confirmation?.cosmeticSetQuote,{missingKeys:setKeys.filter(key=>!(owned as readonly string[]).includes(key)),originalPrice:original,price});
 const copy=words(s);assert.match(copy,new RegExp(`补齐 ${3-owned.length} 件`));assert.match(copy,new RegExp(`未拥有原价 ${original} 金币`));assert.match(copy,new RegExp(`8折 ${price} 金币`));assert.match(copy,new RegExp(`余额 3000 → ${3000-price}`));assert.doesNotMatch(copy,/单独搭配|另行装备/);
 assert.equal(controls(s).find(c=>c.action.type==='confirm')?.label,'确认购买');act(s,{type:'cancel'});assert.equal(s.view.confirmation,null);assert.deepEqual([...h.data],before);assert.equal(s.view.cosmeticSetPreview,'cold_chain');
});

test('confirmed bundle buys once without equipping and separate equip remains explicit and mixable',()=>{
 const h=host(['cargo.insulated']),s=h.session;open(s);const before=structuredClone(s.view.account!),checksum=playableChecksum(s.state),sounds=[...h.sounds];
 act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'confirm'});act(s,{type:'confirm'});act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});
 assert.equal(s.view.account!.wallet,1800);assert.equal(s.view.account!.generation,before.generation+1);assert.deepEqual(s.view.account!.profile.cosmetics,before.profile.cosmetics);assert.ok(setKeys.every(key=>s.view.account!.profile.ownedCosmetics!.includes(key)));assert.equal(s.view.confirmation,null);assert.equal(s.view.cosmeticSetPreview,'cold_chain');
 const equip=controls(s).find(c=>c.action.type==='equipCosmeticSet');assert.equal(equip?.label,'装备整套');assert.equal(equip?.disabled,false);assert.equal(controls(s).some(c=>c.action.type==='purchaseCosmeticSet'),false);
 act(s,{type:'equipCosmeticSet',id:'cold_chain'});assert.deepEqual(s.view.account!.profile.cosmetics,{theme:'cold_chain',cargo:'insulated',forklift:'electric'});assert.equal(s.view.account!.wallet,1800);assert.equal(controls(s).find(c=>c.action.type==='equipCosmeticSet')?.label,'使用中');
 act(s,{type:'previewCosmeticSetMember',kind:'cargo'});act(s,{type:'equipCosmetic',kind:'cargo',id:'classic'});assert.deepEqual(s.view.account!.profile.cosmetics,{theme:'cold_chain',cargo:'classic',forklift:'electric'});assert.equal(playableChecksum(s.state),checksum);assert.deepEqual(h.sounds,sounds);
});

test('insufficient balance retains the required price and cannot open a purchase confirmation',()=>{
 const h=host(['cargo.insulated'],1199),s=h.session;open(s);const before=[...h.data],buy=controls(s).find(c=>c.action.type==='purchaseCosmeticSet');assert.ok(buy?.disabled);assert.equal(buy.label,'1200金币 · 购买套装');assert.doesNotMatch(words(s),/还差/);
 act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'confirm'});assert.equal(s.view.confirmation,null);assert.deepEqual([...h.data],before);
});

test('active runs guard entry and forged set purchase actions without touching gameplay',()=>{
 const h=host(),s=h.session;startInbound(s,'rush');const before=[...h.data],checksum=playableChecksum(s.state);open(s);act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'confirm'});
 assert.equal(s.view.screen,'game');assert.equal(s.view.confirmation,null);assert.deepEqual([...h.data],before);assert.equal(playableChecksum(s.state),checksum);
});

test('stale bundle ownership refreshes detail and requires a new explicit confirmation',()=>{
 const h=host(),s=h.session;open(s);act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});assert.equal(s.view.confirmation?.kind,'purchaseCosmeticSet');
 const service=createAccountService(h.storage,{status:'held',release(){}},()=>Date.parse('2026-10-06T12:01:00Z'));
 const change=service.transact({type:'purchaseCosmetic',kind:'cargo',id:'insulated',operationId:'external.single'},service.getSnapshot()!.generation);assert.equal(change.status,'acknowledged',change.message);const afterSingle=[...h.data];
 act(s,{type:'confirm'});assert.equal(s.view.confirmation,null);assert.equal(s.view.account!.wallet,2700);assert.ok(s.view.account!.profile.ownedCosmetics!.includes('cargo.insulated'));assert.equal(s.view.account!.profile.ownedCosmetics!.includes('theme.cold_chain'),false);assert.deepEqual([...h.data],afterSingle);assert.match(words(s),/报价已变化，请重新确认/);
 act(s,{type:'confirm'});assert.deepEqual([...h.data],afterSingle);act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});assert.equal(confirmationQuote(s)?.price,1200);assert.equal(confirmationQuote(s)?.originalPrice,1500);act(s,{type:'confirm'});assert.equal(s.view.account!.wallet,1500);
});

test('unconfirmed bundle storage retries one original transaction without exposing partial ownership',()=>{
 const h=host(),s=h.session;open(s);const before=s.view.account,original=h.storage.set.bind(h.storage);let failed=true;
 h.storage.set=(key,value)=>{if(failed&&key===ACCOUNT_KEYS.a)throw Error('mirror');original(key,value);};act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'confirm'});
 assert.equal(s.view.account,before);assert.equal(s.view.accountBlocked,true);assert.ok(setKeys.every(key=>!s.view.account!.profile.ownedCosmetics!.includes(key)));act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'back'});assert.equal(s.view.screen,'shop');
 failed=false;act(s,{type:'retrySave'});assert.equal(s.view.account!.wallet,1560);assert.equal(s.view.account!.generation,before!.generation+1);assert.ok(setKeys.every(key=>s.view.account!.profile.ownedCosmetics!.includes(key)));assert.deepEqual(s.view.account!.profile.cosmetics,before!.profile.cosmetics);const stable=[...h.data];act(s,{type:'retrySave'});act(s,{type:'confirm'});assert.deepEqual([...h.data],stable);
});

test('set purchase details confirmation and retry retain disjoint 44px controls at 320px width',()=>{
 const {session:s}=host();open(s);const check=()=>{const all=controls(s);for(const [index,a]of all.entries()){assert.ok(a.rect.w*320/1080>=44&&a.rect.h*320/1080>=44,a.action.type);assert.ok(a.rect.y+a.rect.h<=1856);for(const b of all.slice(index+1))assert.ok(a.rect.x+a.rect.w<=b.rect.x||b.rect.x+b.rect.w<=a.rect.x||a.rect.y+a.rect.h<=b.rect.y||b.rect.y+b.rect.h<=a.rect.y,`${a.action.type}/${b.action.type}`);}};
 check();act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});assert.equal(s.view.confirmation?.kind,'purchaseCosmeticSet');check();s.view.accountBlocked=true;check();
});

test('compiled free set claim at zero wallet confirms missing count and never autoequips',async()=>{
 const bundle=await build({stdin:{contents:"export * from './tests/helpers/session-fixtures.ts';export * from './src/presentation/ui.ts';export * from './src/presentation/renderer.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{__PLAYTEST_FREE_SHOP__:'true'}});
 const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles![0].text).toString('base64')}`) as typeof import('./helpers/session-fixtures.ts') & typeof import('../src/presentation/ui.ts') & typeof import('../src/presentation/renderer.ts');
 const h=api.sessionHost({wallet:0}),s=h.session;open(s);const before=[...h.data],appearance=structuredClone(s.view.account!.profile.cosmetics),buy=api.getUiControls(s.state,s.view).find(c=>c.action.type==='purchaseCosmeticSet');assert.equal(buy?.label,'领取套装');assert.equal(buy?.disabled,false);
 act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});assert.equal(s.view.confirmation?.cosmeticSetQuote?.price,0);assert.equal(api.getUiControls(s.state,s.view).find(c=>c.action.type==='confirm')?.label,'确认领取');const copy=words(s,api.render);assert.match(copy,/领取冷链仓库套装/);assert.match(copy,/补齐 3 件未拥有外观。/);assert.equal(copy.match(/永久拥有/g)?.length,1);assert.match(copy,/免费领取/);assert.doesNotMatch(copy,/花费|8折|还差/);act(s,{type:'cancel'});assert.deepEqual([...h.data],before);
 act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'confirm'});act(s,{type:'confirm'});assert.equal(s.view.account!.wallet,0);assert.ok(setKeys.every(key=>s.view.account!.profile.ownedCosmetics!.includes(key)));assert.deepEqual(s.view.account!.profile.cosmetics,appearance);assert.equal(api.getUiControls(s.state,s.view).find(c=>c.action.type==='equipCosmeticSet')?.label,'装备整套');
});

test('set quote rejection notices stay on set details and do not leak into tools or individual items',()=>{
 const {session:s}=host();open(s);s.view.cosmeticSetNotice='套装报价已变化，请重新确认';assert.match(words(s),/报价已变化，请重新确认/);
 act(s,{type:'selectShopTab',tab:'tools'});assert.doesNotMatch(words(s),/报价已变化，请重新确认/);
 act(s,{type:'selectShopTab',tab:'cosmetics'});act(s,{type:'previewCosmeticSetMember',kind:'cargo'});assert.doesNotMatch(words(s),/报价已变化，请重新确认/);
});


test('paid bundle price uses one readable button line at 320px and concise supporting copy',()=>{
 const {session:s}=host();open(s);const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,painted:{value:string;font:string}[]=[];ctx.fillText=value=>painted.push({value,font:ctx.font});render(ctx,s.state,s.view);
 for(const value of ['1440金币 · 购买套装']){const line=painted.find(item=>item.value===value);assert.ok(line,value);assert.ok(Number(line.font.match(/(\d+(?:\.\d+)?)px/)?.[1])*320/1080>=12,line.font);}
 assert.ok(painted.some(item=>item.value==='原价1800 · 8折'));assert.equal(painted.some(item=>/未拥有3件/.test(item.value)),false);
});

test('wallet-only changes invalidate an old bundle confirmation and fresh confirmation charges once',()=>{
 const h=host(),s=h.session;open(s);act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});assert.equal(s.view.confirmation?.kind,'purchaseCosmeticSet');const appearance=structuredClone(s.view.account!.profile.cosmetics);
 const service=createAccountService(h.storage,{status:'held',release(){}},()=>Date.parse('2026-10-06T12:01:00Z'));
 const change=service.transact({type:'purchase',item:'rotate',operationId:'external.wallet'},service.getSnapshot()!.generation);assert.equal(change.status,'acknowledged',change.message);const afterWallet=[...h.data],generation=change.account!.generation;
 act(s,{type:'confirm'});assert.equal(s.view.confirmation,null);assert.equal(s.view.account!.wallet,2920);assert.equal(s.view.account!.inventory.rotate,1);assert.ok(setKeys.every(key=>!s.view.account!.profile.ownedCosmetics!.includes(key)));assert.deepEqual([...h.data],afterWallet);assert.match(words(s),/报价已变化，请重新确认/);
 act(s,{type:'confirm'});act(s,{type:'cancel'});act(s,{type:'confirm'});assert.deepEqual([...h.data],afterWallet);
 act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});act(s,{type:'cancel'});act(s,{type:'confirm'});assert.deepEqual([...h.data],afterWallet);
 act(s,{type:'purchaseCosmeticSet',id:'cold_chain'});assert.match(words(s),/余额 2920 → 1480/);act(s,{type:'confirm'});act(s,{type:'confirm'});assert.equal(s.view.account!.wallet,1480);assert.equal(s.view.account!.generation,generation+1);assert.equal(s.view.account!.inventory.rotate,1);assert.ok(setKeys.every(key=>s.view.account!.profile.ownedCosmetics!.includes(key)));assert.deepEqual(s.view.account!.profile.cosmetics,appearance);
});
