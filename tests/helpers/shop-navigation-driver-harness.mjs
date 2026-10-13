/** Source-session driver tests only. This is deliberately not native package acceptance. */
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {sessionHost} from './session-fixtures.ts';
import {shopNavigationFixtureStorage} from '../../scripts/shop-navigation-host-runtime.mjs';
import {PaginatedCosmeticsDriver} from '../../scripts/paginated-cosmetics-host-runtime.mjs';
import {GameSession} from '../../src/application/session.ts';
import {render} from '../../src/presentation/renderer.ts';
import {attachPixelWitness} from '../../scripts/refinement-host-support.mjs';
import {authoritativeAccount} from '../../scripts/growth-host-support.mjs';
import {COSMETIC_CATALOG} from '../../src/application/cosmetics.ts';

export function fixture(storage){
 const f=sessionHost(authoritativeAccount(shopNavigationFixtureStorage(50000)).account),canvas=createCanvas(360,640),context=canvas.getContext('2d'),labels=[];let now=0;
 if(storage){f.data.clear();for(const [key,value]of storage)f.data.set(key,value);f.session=new GameSession(f.platform,{seed:71,mode:'standard'});}
 const fill=context.fillText.bind(context);context.fillText=(text,x,y,...args)=>{labels.push({text:String(text),logicalX:x,logicalY:y});return fill(text,x,y,...args);};
 const callbacks=Object.fromEntries(['down','move','up','cancel'].map(type=>[type,(x,y,id=1)=>type==='cancel'?f.session.input.cancel(id):f.session.input[type]({x,y},id)]));callbacks.hide=()=>f.session.hide();callbacks.show=()=>f.session.show();
 const h=attachPixelWitness({canvas,context,labels,viewport:{w:360,h:640,safe:0,dpr:1},storage:f.data,operations:f.storage.operations,callbacks,get time(){return now;},account:()=>authoritativeAccount(f.data),frame(time){now=time;f.time(time);f.session.tick(time);labels.length=0;context.setTransform(1/3,0,0,1/3,0,0);render(context,f.session.state,f.session.view);},pointer:(type,x,y,id)=>callbacks[type](x,y,id),tap(x,y){callbacks.down(x,y);callbacks.up(x,y);},drag(from,to){callbacks.down(from.x,from.y);callbacks.move(to.x,to.y);callbacks.up(to.x,to.y);}});
 const d=new PaginatedCosmeticsDriver(h,'/tmp',[],0);d.mode='paid';
 const check=()=>{const actual=f.session.view,expected=d.view();assert.equal(actual.screen,expected.screen);if(expected.screen==='shop'){assert.equal(actual.shopTab,expected.shopTab);assert.equal(actual.shopSection,expected.shopSection);assert.deepEqual(actual.shopItemDetail,expected.shopItemDetail);assert.equal(actual.cosmeticSetPreview,expected.cosmeticSetPreview);assert.equal(actual.cosmeticReturnSet,expected.cosmeticReturnSet);assert.equal(actual.cosmeticSetPage??0,expected.cosmeticSetPage??0);assert.deepEqual(actual.cosmeticPreview??{},expected.cosmeticPreview??{});for(const section of ['sets','theme','cargo','forklift'])assert.equal(actual.shopScroll?.[section]??0,expected.shopScroll?.[section]??0);}else if(expected.screen==='inboundMenu')assert.equal(actual.inboundDifficulty,expected.inboundDifficulty);else if(expected.screen==='colorTiers')assert.equal(actual.outboundSelectionMode,expected.outboundSelectionMode);};
 return {d,f,check};
}
export function exerciseShopDriver(scenario){
 const {d,f,check}=fixture();
 if(scenario==='root'){
  d.action({type:'chooseInbound'});check();d.action({type:'selectInboundDifficulty',inboundDifficulty:'expert'});check();d.action({type:'newRun',mode:'standard',inboundDifficulty:'expert'});check();d.action({type:'back'});check();d.action({type:'home'});d.action({type:'chooseInbound'});check();d.action({type:'home'});d.action({type:'chooseColorTier'});d.action({type:'selectOutboundMode',mode:'endless'});d.action({type:'newRun',mode:'color_exit',difficultyId:'easy',outboundMode:'endless'});check();d.action({type:'back'});check();d.action({type:'home'});d.action({type:'chooseColorTier'});check();
 }else if(scenario==='items'){
  for(const item of COSMETIC_CATALOG.filter((item,index,all)=>{const category=all.filter(row=>row.kind===item.kind);return [category[0].id,category[Math.floor(category.length/2)].id,category.at(-1).id].includes(item.id);})){ d.preview(item.kind,item.id);check();assert.ok(d.h.labels.some(row=>row.text===item.name));assert.equal(d.controls().filter(c=>c.action.type==='previewCosmetic').length,COSMETIC_CATALOG.filter(row=>row.kind===item.kind).slice(d.page()*4,d.page()*4+4).length);}assert.equal(f.session.view.account.wallet,50000);
 }else if(scenario==='retired-sets'){
  d.appearance('cargo');d.itemPage(1);check();const before=structuredClone(f.session.view),stored=[...f.data];f.storage.resetFault();
  const retired=[{type:'selectShopSection',section:'sets'},{type:'previewCosmeticSet',id:'classic'},{type:'previewCosmeticSet',id:'cold_chain'},{type:'selectCosmeticSetPage',page:1},{type:'previewCosmeticSetMember',kind:'cargo'},{type:'selectClassicSetVariant',kind:'forklift',id:'white'},{type:'purchaseCosmeticSet',id:'cold_chain'},{type:'equipCosmeticSet',id:'cold_chain'},{type:'equipClassicSet'}];
  for(const action of retired){assert.ok(!d.controls().some(c=>Object.entries(action).every(([key,value])=>c.action[key]===value)));f.session.action(action);assert.deepEqual(f.session.view,before);assert.deepEqual([...f.data],stored);check();}
  assert.ok(!f.storage.operations.some(op=>['set','remove'].includes(op.kind)));assert.throws(()=>d.previewSet('classic'),/retired/);assert.throws(()=>d.setPage(0),/retired/);
 }else if(scenario==='scroll'){
  d.appearance('cargo');d.itemPage(2);check();const chosen=d.selected().id;for(const end of ['up','cancel']){d.h.pointer('down',330,1160);d.h.pointer('move',330,950);d.h.pointer(end,330,950);d.frame(0);check();assert.equal(d.selected().id,chosen);}d.action({type:'selectShopSection',section:'theme'});d.itemPage(2);check();d.action({type:'selectShopSection',section:'cargo'});check();assert.equal(d.page(),2);d.action({type:'selectShopTab',tab:'tools'});d.action({type:'selectShopTab',tab:'cosmetics'});check();d.action({type:'back'});d.shop();check();
 }else if(scenario==='transactions'){
  for(const [kind,id]of [['cargo','wood'],['theme','paper_warehouse'],['forklift','white']]){
   const item=COSMETIC_CATALOG.find(item=>item.kind===kind&&item.id===id);d.preview(kind,id);check();const before=structuredClone(f.session.view.account),stored=[...f.data];
   d.purchase({type:'purchaseCosmetic',kind,id});assert.equal(f.session.view.confirmation.kind,'purchaseCosmetic');d.cancel();check();assert.deepEqual([...f.data],stored);
   d.purchase({type:'purchaseCosmetic',kind,id});d.confirm();check();assert.equal(f.session.view.account.wallet,before.wallet-item.price);assert.deepEqual(f.session.view.account.profile.cosmetics,before.profile.cosmetics);
   d.action({type:'equipCosmetic',kind,id});check();assert.equal(f.session.view.account.profile.cosmetics[kind],id);
  }
 }else if(scenario==='root-reset'){
  d.preview('forklift','ice');check();assert.ok(d.page()>0);d.action({type:'back'});check();d.shop();check();assert.equal(d.shopTab,'tools');d.appearance();check();assert.equal(d.shopSection,'theme');assert.equal(d.page(),0);assert.equal(f.session.view.classicSetSelection,undefined);
 }else throw Error(`Unknown driver test ${scenario}`);
 return {scenario,status:'PASS',nativeAcceptance:false};
}
