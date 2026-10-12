import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync} from 'node:fs';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import type {GameRun} from '../src/domain/playable.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {ACCOUNT_KEYS} from '../src/application/account-store.ts';
import type {ResultBucket} from '../src/application/account-types.ts';

function capture(state:GameRun,view:ViewState,name=''){
 const canvas=createCanvas(360,800),ctx=canvas.getContext('2d'),labels:{value:string;left:number;right:number;top:number;bottom:number;size:number}[]=[],fill=ctx.fillText.bind(ctx);ctx.translate(0,80);ctx.scale(1/3,1/3);
 ctx.fillText=(value,x,y)=>{const m=ctx.measureText(value);labels.push({value,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent,size:Number(/([\d.]+)px/.exec(ctx.font)?.[1])});fill(value,x,y);};render(ctx as unknown as CanvasRenderingContext2D,state,view);
 const dir=process.env.WAREHOUSE_COPY_CAPTURE_DIR;if(dir&&name){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}-360x800.png`,canvas.toBuffer('image/png'));}
 return {labels,words:labels.map(x=>x.value).join('\n'),joined:labels.map(x=>x.value).join('')};
}
function help(host:ReturnType<typeof sessionHost>){host.session.togglePause();host.session.action({type:'help'});return capture(host.session.state,host.session.view);}
const bucket=(score:number):ResultBucket=>({runs:1,units:1,maxUnits:score,score,wins:0,retirements:1,maxChain:1,best:{score,units:1,chain:1}});

test('real help entry keeps three basic statements, correct goals in five contexts and reachable rush rules',()=>{
 const h=sessionHost();h.session.action({type:'helpMenu'});h.session.action({type:'selectHelp',topic:'inbound'});
 assert.match(capture(h.session.state,h.session.view).joined,/入库玩法.*五班共30单，完成后可继续无限。/);
 const details=getUiControls(h.session.state,h.session.view).find(c=>c.action.type==='helpDetails');assert.equal(details?.label,'特殊货物与加急');assert.ok(details&&details.rect.w/3>=44&&details.rect.h/3>=44);h.session.action(details.action);
 const out=capture(h.session.state,h.session.view,'special-rush');assert.ok(out.joined.includes('加急数字按后续成功放置次数倒数，不是倒计时'));assert.ok(out.joined.includes('第5班新补充的货件全部加急。'));assert.equal(out.labels.filter(l=>l.value==='加急模式').length,1);for(const l of out.labels)assert.ok(l.left>=0&&l.right<=1080,JSON.stringify(l));
 for(const mode of ['standard','endless','rush'] as const){const host=sessionHost();startInbound(host.session,mode);const out=help(host);const goal=mode==='rush'?'加急共5班、30单，完成后本局结束。':mode==='endless'?'无限持续接单；放不下且道具无法救场时结束。':'五班共30单，完成后可继续无限。';assert.ok(out.joined.includes(goal),out.words);assert.doesNotMatch(out.words,/旋转工具可改朝向/);}
 for(const outboundMode of ['normal','endless'] as const){const host=sessionHost();host.session.action({type:'newRun',mode:'color_exit',difficultyId:'easy',outboundMode});host.session.action({type:'prepareNext'});const out=help(host);assert.ok(out.joined.includes(`${outboundMode==='normal'?'出货30批过关':'无限持续出货'}；放不下且道具无法救场时结束。`));assert.ok(out.joined.includes('货物连到同色出口，并从南入口留一条空路到货物旁。'));}
 const home=sessionHost();home.session.action({type:'helpMenu'});home.session.action({type:'selectHelp',topic:'outbound'});assert.ok(capture(home.session.state,home.session.view,'outbound-home-help').joined.includes('普通30批过关，无限持续；放不下且道具无法救场时结束。'));
});

test('plain/tool records retain full numeric values inside their card and outside real start targets',()=>{
 for(const score of [98586,Number.MAX_SAFE_INTEGER])for(const screen of ['inboundMenu','colorTiers'] as const){const h=sessionHost(),account=structuredClone(h.session.view.account!);for(const tools of ['plain','tools']){for(const mode of ['standard','endless','rush'])account.profile.results[mode==='rush'?`inbound.rush.v20.fixed.${tools}`:`inbound.${mode}.v18.hard.${tools}`]=bucket(score);for(const difficulty of ['easy','normal','hard','expert'])account.profile.results[`outbound.v12.${difficulty}.${tools}`]=bucket(score);}
  const view={...h.session.view,account,screen},out=capture(h.session.state,view,`${screen}-${score}`),starts=getUiControls(h.session.state,view).filter(c=>c.action.type==='newRun'),records=out.labels.filter(l=>/无道具最高分|使用道具最高分|最多完成|^[\d,]+单?$/.test(l.value));assert.equal(out.labels.filter(l=>l.value.startsWith('无道具最高分')).length,screen==='inboundMenu'?3:4);const full=String(score).replace(/\B(?=(\d{3})+(?!\d))/g,',');assert.equal(records.filter(l=>l.value.includes(full)&&!l.value.includes('最多完成')&&!l.value.endsWith('单')).length,screen==='inboundMenu'?6:8);
  for(const l of records){assert.ok(l.size>=25,JSON.stringify(l));assert.ok(l.left>=132&&l.right<=948,JSON.stringify(l));for(const c of starts)if(l.top<c.rect.y+c.rect.h&&l.bottom>c.rect.y)assert.ok(l.right<=c.rect.x-16,JSON.stringify(l));}
  for(let i=0;i<records.length;i++)for(const other of records.slice(i+1)){const l=records[i];assert.ok(l.right<=other.left||other.right<=l.left||l.bottom<=other.top||other.bottom<=l.top,`${JSON.stringify(l)} / ${JSON.stringify(other)}`);}
 }
});

test('pending save explanation has an actual retry control and retry commits only once',()=>{
 const h=sessionHost({wallet:160}),set=h.storage.set.bind(h.storage);let blocked=true;h.storage.set=(key,value)=>{if(blocked&&key===ACCOUNT_KEYS.a)throw Error('mirror');set(key,value);};h.session.action({type:'shop'});h.session.action({type:'purchase',item:'rotate'});h.session.action({type:'confirm'});assert.equal(h.session.view.accountBlocked,true);
 assert.match(capture(h.session.state,h.session.view).joined,/请点“重试”，确认保存后继续游戏。/);const retry=getUiControls(h.session.state,h.session.view).find(c=>c.action.type==='retrySave');assert.equal(retry?.label,'重试');blocked=false;h.session.action(retry!.action);assert.equal(h.session.view.accountBlocked,false);assert.equal(h.session.view.account?.inventory.rotate,1);const generation=h.session.view.account!.generation;h.session.action(retry!.action);assert.equal(h.session.view.account?.generation,generation);
});

test('storage-limit copy only offers ending an active acknowledged run and leaves ambiguous errors neutral',()=>{
 const raw='记录超出496KiB限制，请先结束本局',h=sessionHost();for(const active of [false,true]){if(active)startInbound(h.session);const view={...h.session.view,saveStatus:raw,message:raw};const out=capture(h.session.state,view);assert.ok(out.joined.includes(active?'本局记录已达保存上限，请先结束本局。':'记录已达保存上限，暂时无法保存。'));assert.equal(view.saveStatus,raw);if(active){h.session.togglePause();const home=getUiControls(h.session.state,h.session.view).find(c=>c.action.type==='home');assert.ok(home);h.session.action(home.action);assert.ok(getUiControls(h.session.state,h.session.view).some(c=>c.action.type==='confirm'&&c.label==='结束本局'));h.session.action({type:'cancel'});}}
 for(const message of ['历史段保存尚未确认','历史保存尚未确认','长期记录尚未读回，未写入默认数据']){const view={...h.session.view,screen:'menu' as const,paused:false,saveStatus:message,message:''};assert.ok(capture(h.session.state,view).joined.includes(message));assert.equal(getUiControls(h.session.state,view).some(c=>c.action.type==='retrySave'),false);}
 const pending={...h.session.view,accountBlocked:true,saveStatus:raw,message:raw};assert.doesNotMatch(capture(h.session.state,pending).joined,/请先结束本局/);
});

test('prepare and tool help use actual mode-specific targets and shop explains both wildcard effects',()=>{
 for(const mode of ['standard','rush','color_exit'] as const){const h=sessionHost();h.session.action(mode==='color_exit'?{type:'newRun',mode,difficultyId:'easy'}:{type:'newRun',mode});const controls=getUiControls(h.session.state,h.session.view),next=controls.find(c=>c.action.type==='prepareNext');assert.equal(next?.label,`携带0件 · ${mode==='rush'?'选择清扫':'开始游戏'}`);assert.ok(capture(h.session.state,h.session.view).joined.includes('选择携带道具'));if(mode==='color_exit')assert.ok(capture(h.session.state,h.session.view).joined.includes('单格 · 自选货类'));}
 const h=sessionHost();h.session.action({type:'shop'});assert.ok(capture(h.session.state,h.session.view).joined.includes('入库万能箱；出库自选货类'));h.session.action({type:'back'});h.session.action({type:'helpMenu'});h.session.action({type:'selectHelp',topic:'tools'});const out=capture(h.session.state,h.session.view,'tools-help');assert.ok(!out.joined.includes('入库下次放置时检查出货；出库立即检查出货。'));assert.doesNotMatch(out.joined,/立即结算|红黄绿/);for(const l of out.labels)assert.ok(l.left>=0&&l.right<=1080,JSON.stringify(l));
});

test('reset and abandoning confirmations describe protected assets and invalid abandoned scores',()=>{
 const h=sessionHost();h.session.action({type:'settings'});assert.ok(getUiControls(h.session.state,h.session.view).some(c=>c.label==='重置成绩记录'));h.session.action({type:'resetProfile'});const out=capture(h.session.state,h.session.view);for(const line of ['清空成绩和成就记录。','金币、道具库存、已领奖励、设置和已拥有外观会保留。'])assert.ok(out.joined.includes(line));h.session.action({type:'cancel'});h.session.action({type:'back'});startInbound(h.session);h.session.action({type:'home'});const leave=capture(h.session.state,h.session.view);assert.ok(leave.joined.includes('本局将结束，放弃的进度不计入成绩。'));assert.ok(leave.joined.includes('已获金币保留，未用道具退回。'));
});
