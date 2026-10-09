/** Source-session driver tests only. This is deliberately not native package acceptance. */
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {sessionHost} from './session-fixtures.ts';
import {ShopNavigationDriver,shopNavigationFixtureStorage} from '../../scripts/shop-navigation-host-runtime.mjs';
import {GameSession} from '../../src/application/session.ts';
import {render} from '../../src/presentation/renderer.ts';
import {attachPixelWitness} from '../../scripts/refinement-host-support.mjs';
import {authoritativeAccount} from '../../scripts/growth-host-support.mjs';
import {COSMETIC_CATALOG} from '../../src/application/cosmetics.ts';
import {COSMETIC_SETS} from '../../src/application/cosmetic-sets.ts';

export function fixture(storage){
 const f=sessionHost(authoritativeAccount(shopNavigationFixtureStorage(50000)).account),canvas=createCanvas(360,640),context=canvas.getContext('2d'),labels=[];let now=0;
 if(storage){f.data.clear();for(const [key,value]of storage)f.data.set(key,value);f.session=new GameSession(f.platform,{seed:71,mode:'standard'});}
 const fill=context.fillText.bind(context);context.fillText=(text,x,y,...args)=>{labels.push({text:String(text),logicalX:x,logicalY:y});return fill(text,x,y,...args);};
 const callbacks=Object.fromEntries(['down','move','up','cancel'].map(type=>[type,(x,y,id=1)=>type==='cancel'?f.session.input.cancel(id):f.session.input[type]({x,y},id)]));callbacks.hide=()=>f.session.hide();callbacks.show=()=>f.session.show();
 const h=attachPixelWitness({canvas,context,labels,viewport:{w:360,h:640,safe:0,dpr:1},storage:f.data,operations:f.storage.operations,callbacks,get time(){return now;},account:()=>authoritativeAccount(f.data),frame(time){now=time;f.time(time);f.session.tick(time);labels.length=0;context.setTransform(1/3,0,0,1/3,0,0);render(context,f.session.state,f.session.view);},pointer:(type,x,y,id)=>callbacks[type](x,y,id),tap(x,y){callbacks.down(x,y);callbacks.up(x,y);},drag(from,to){callbacks.down(from.x,from.y);callbacks.move(to.x,to.y);callbacks.up(to.x,to.y);}});
 const d=new ShopNavigationDriver(h,'/tmp',[],0);d.mode='paid';
 const check=()=>{const actual=f.session.view,expected=d.view();assert.equal(actual.screen,expected.screen);if(expected.screen==='shop'){assert.equal(actual.shopTab,expected.shopTab);assert.equal(actual.shopSection,expected.shopSection);assert.deepEqual(actual.shopItemDetail,expected.shopItemDetail);assert.equal(actual.cosmeticSetPreview,expected.cosmeticSetPreview);for(const section of ['sets','theme','cargo','forklift'])assert.equal(actual.shopScroll?.[section]??0,expected.shopScroll?.[section]??0);}else if(expected.screen==='inboundMenu')assert.equal(actual.inboundDifficulty,expected.inboundDifficulty);else if(expected.screen==='colorTiers')assert.equal(actual.outboundSelectionMode,expected.outboundSelectionMode);};
 return {d,f,check};
}
export function exerciseShopDriver(scenario){
 const {d,f,check}=fixture();
 if(scenario==='root'){
  d.action({type:'chooseInbound'});check();d.action({type:'selectInboundDifficulty',inboundDifficulty:'expert'});check();d.action({type:'newRun',mode:'standard',inboundDifficulty:'expert'});check();d.action({type:'back'});check();d.action({type:'home'});d.action({type:'chooseInbound'});check();d.action({type:'home'});d.action({type:'chooseColorTier'});d.action({type:'selectOutboundMode',mode:'endless'});d.action({type:'newRun',mode:'color_exit',difficultyId:'easy',outboundMode:'endless'});check();d.action({type:'back'});check();d.action({type:'home'});d.action({type:'chooseColorTier'});check();
 }else if(scenario==='items'){
  for(const item of COSMETIC_CATALOG.filter((item,index,all)=>{const category=all.filter(row=>row.kind===item.kind);return [category[0].id,category[Math.floor(category.length/2)].id,category.at(-1).id].includes(item.id);})){ d.preview(item.kind,item.id);check();assert.ok(d.h.labels.some(row=>row.text===item.name));d.action({type:'closeShopDetail'});check();}assert.equal(f.session.view.account.wallet,50000);
 }else if(scenario==='sets'){
  for(const set of [COSMETIC_SETS[0],COSMETIC_SETS[7],COSMETIC_SETS.at(-1)]){d.previewSet(set.id);check();assert.ok(d.h.labels.some(row=>row.text===set.name));for(const kind of ['theme','cargo','forklift']){d.action({type:'previewCosmeticSetMember',kind});check();d.action({type:'closeShopDetail'});check();}d.action({type:'closeShopDetail'});check();}
 }else if(scenario==='scroll'){
  d.appearance('cargo');for(const delta of [500,250,-75,10000,-10000]){d.scroll(delta);check();}d.scroll(300,{cancel:true});check();d.action({type:'selectShopSection',section:'theme'});d.scroll(650);check();d.action({type:'selectShopSection',section:'cargo'});check();d.action({type:'selectShopTab',tab:'tools'});d.action({type:'selectShopTab',tab:'cosmetics'});check();d.action({type:'back'});d.shop();check();
 }else if(scenario==='transactions'){
  d.previewSet('harbor');d.purchase({type:'purchaseCosmeticSet',id:'harbor'});assert.equal(f.session.view.confirmation.kind,'purchaseCosmeticSet');d.cancel();check();d.purchase({type:'purchaseCosmeticSet',id:'harbor'});d.confirm();check();assert.equal(f.session.view.account.wallet,48560);d.action({type:'equipCosmeticSet',id:'harbor'});check();assert.equal(f.session.view.account.profile.cosmetics.theme,'harbor');
 }else if(scenario==='classic'){
  d.previewSet('classic');check();for(const [kind,id]of Object.entries({theme:'night',cargo:'outline',forklift:'white'})){d.action({type:'selectClassicSetVariant',kind,id});check();assert.deepEqual(f.session.view.classicSetSelection,d.view().classicSetSelection);}d.purchase({type:'purchaseCosmetic',kind:'forklift',id:'white'});d.cancel();check();d.purchase({type:'purchaseCosmetic',kind:'forklift',id:'white'});d.confirm();check();d.action({type:'equipClassicSet'});check();assert.deepEqual(f.session.view.account.profile.cosmetics,{theme:'night',cargo:'classic',forklift:'white'});assert.equal(f.session.view.account.profile.cargoOutline,true);d.action({type:'closeShopDetail'});d.action({type:'back'});d.shop();d.appearance();d.action({type:'previewCosmeticSet',id:'classic'});check();assert.deepEqual(f.session.view.classicSetSelection,{theme:'day',cargo:'classic',forklift:'yellow'});
 }else throw Error(`Unknown driver test ${scenario}`);
 return {scenario,status:'PASS',nativeAcceptance:false};
}
