import './helpers/cargo-atlas-fixture.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {COSMETIC_SETS,quoteCosmeticSetPurchase} from '../src/application/cosmetic-sets.ts';
import {getCosmetic,retainAccountCosmetics} from '../src/application/cosmetics.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {cosmeticSetCardStatus} from '../src/presentation/economy-ui.ts';
import {render} from '../src/presentation/renderer.ts';
import type {GameSession} from '../src/application/session.ts';
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','Noto Sans CJK SC');
const kinds=['theme','cargo','forklift'] as const;
const priceByMask=[1440,810,1350,600,1080,300,900,0];
const labelsByMask=['8折','9折','9折','原价','9折','原价','原价',''];
function words(s:GameSession){const ctx=createCanvas(1080,1920).getContext('2d') as unknown as CanvasRenderingContext2D,out:string[]=[];ctx.fillText=value=>out.push(value);render(ctx,s.state,s.view);return out.join('\n');}
for(const set of COSMETIC_SETS)for(let mask=0;mask<8;mask++)test(`v102 ${set.id}/${mask}: missing quantity controls quote, displayed price, cancellation and actual debit`,()=>{
 const members=kinds.map(kind=>`${kind}.${set[kind]}`),owned=members.filter((_,i)=>mask&(1<<i));
 const quote=quoteCosmeticSetPurchase(set.id,{ownedCosmetics:owned})!;
 assert.equal(quote.price,priceByMask[mask]);assert.deepEqual(quote.missingKeys,members.filter(key=>!owned.includes(key)));
 if(quote.missingKeys.length===1){const [kind,id]=quote.missingKeys[0].split('.');assert.equal(quote.price,getCosmetic(kind,id)!.price);}
 const account=retainAccountCosmetics(makeAccountFixture({formatVersion:2,economyVersion:2,dailyRewards:{},wallet:quote.price}));account.profile.ownedCosmetics=[...new Set([...account.profile.ownedCosmetics!,...owned])].sort();
 const h=sessionHost(account),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'previewCosmeticSet',id:set.id});const before=[...h.data];
 if(mask!==7)assert.equal(cosmeticSetCardStatus(set,s.view),`${quote.price}金币 · ${labelsByMask[mask]}`);
 const buy=getUiControls(s.state,s.view).find(c=>c.action.type==='purchaseCosmeticSet');
 if(mask===7){assert.equal(buy,undefined);s.action({type:'purchaseCosmeticSet',id:set.id});assert.deepEqual([...h.data],before);return;}
 assert.equal(buy?.label,`${quote.price}金币 · 购买套装`);assert.equal(buy?.disabled,false);assert.match(words(s),new RegExp(labelsByMask[mask]));if(quote.missingKeys.length!==3)assert.doesNotMatch(words(s),/8折/);
 s.action({type:'purchaseCosmeticSet',id:set.id});assert.deepEqual(s.view.confirmation?.cosmeticSetQuote,quote);assert.match(words(s),new RegExp(`${labelsByMask[mask]} ${quote.price} 金币`));assert.match(words(s),new RegExp(`余额 ${quote.price} → 0`));if(quote.missingKeys.length!==3)assert.doesNotMatch(words(s),/8折/);
 s.action({type:'cancel'});assert.deepEqual([...h.data],before);s.action({type:'purchaseCosmeticSet',id:set.id});s.action({type:'confirm'});assert.equal(s.view.account!.wallet,0);assert.ok(members.every(key=>s.view.account!.profile.ownedCosmetics!.includes(key)));assert.deepEqual(s.view.account!.profile.cosmetics,account.profile.cosmetics);const bought=[...h.data];s.action({type:'confirm'});s.action({type:'purchaseCosmeticSet',id:set.id});assert.deepEqual([...h.data],bought);
});
