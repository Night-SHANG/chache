import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {assertOwnerBinding,assertManifestPair,assertNaturalPixels,sampleEastGatePatch,waveTimeline,MUSIC_SHA,VIEWPORTS} from '../scripts/material-feedback-host-protocol.mjs';
import type {NaturalPixelRow} from '../scripts/material-feedback-host-protocol.mjs';
const binding={ownerFrozen:true,aggregateChecksPassed:true,expectedCommit:'a'.repeat(40),expectedSourceSha256:'b'.repeat(64),expectedGameJsSha256:'c'.repeat(64),expectedBrowserJsSha256:'d'.repeat(64),expectedPaidGameJsSha256:'e'.repeat(64),freeBuildRoot:'/tmp/free',paidBuildRoot:'/tmp/paid'};
const manifest={version:'0.17.0-dev',developerDiagnostics:false,shopPricingMode:'playtest-free',commit:binding.expectedCommit,sourceSha256:binding.expectedSourceSha256,backgroundMusic:{sha256:MUSIC_SHA,defaultVolume:.18},soundEffects:{browserVolume:.45,wechatVolume:1},cosmetics:{catalogSize:28},modes:{rush:{maxToolTypes:2}}};
test('owner freeze, aggregates, distinct artifacts and exact hashes fail closed',()=>{assertOwnerBinding(binding);for(const patch of [{ownerFrozen:false},{aggregateChecksPassed:false},{freeBuildRoot:'/tmp/paid'},{expectedGameJsSha256:'short'}])assert.throws(()=>assertOwnerBinding({...binding,...patch}));});
test('actual manifest schema keeps both targets and paid policy separate',()=>{assertManifestPair(manifest,structuredClone(manifest),binding);assert.throws(()=>assertManifestPair(manifest,{...manifest,shopPricingMode:'paid'},binding));assert.throws(()=>assertManifestPair({...manifest,shopPricingMode:'paid'},{...manifest,shopPricingMode:'paid'},binding));});
test('a host-only preload affects a subsequently imported oracle but cannot change a compile-time paid stub',async()=>{
 const preload=spawnSync(process.execPath,['--input-type=module','-e',"globalThis.__PLAYTEST_FREE_SHOP__=true;const m=await import('data:text/javascript,export const free=typeof __PLAYTEST_FREE_SHOP__!==%22undefined%22%26%26__PLAYTEST_FREE_SHOP__===true');if(m.free!==true)process.exit(1)"],{encoding:'utf8'});assert.equal(preload.status,0,preload.stderr);
 const compiled=await build({stdin:{contents:'globalThis.observedFree=typeof __PLAYTEST_FREE_SHOP__!=="undefined"&&__PLAYTEST_FREE_SHOP__===true;',loader:'js'},bundle:true,write:false,define:{__PLAYTEST_FREE_SHOP__:'false'},format:'iife'});const sandbox:{__PLAYTEST_FREE_SHOP__:boolean;observedFree?:boolean}={__PLAYTEST_FREE_SHOP__:true};vm.runInNewContext(compiled.outputFiles[0].text,sandbox);assert.equal(sandbox.observedFree,false);
});
test('original one-second wave timing includes 0/.35/.7 and refreshed settlement',()=>{assert.deepEqual(waveTimeline(2).map(v=>v.absoluteMs),[0,350,700,1000,1350,1700,2000]);});
test('independent semantic pixel oracle catches swapped cargo, double highlights and replayed completed card',()=>{
 const row:NaturalPixelRow={wave:1,checksum:'31c7e4cc',cards:[{dock:'北门',cargo:'化工',strong:true,labels:[]},{dock:'东门',cargo:'机械',strong:false,labels:['已出货']}],gates:{north:[239,185,56,255],east:[75,83,91,255]},eastGatePatch:sampleEastGatePatch(()=>[75,83,91,255])};assertNaturalPixels(row);
 for(const mutate of [(r:NaturalPixelRow)=>r.cards[0].cargo='机械',(r:NaturalPixelRow)=>r.cards[1].strong=true,(r:NaturalPixelRow)=>r.cards[1].labels=[],(r:NaturalPixelRow)=>r.gates.east=[118,167,77,255],(r:NaturalPixelRow)=>r.checksum='wrong']){const wrong=structuredClone(row);mutate(wrong);assert.throws(()=>assertNaturalPixels(wrong));}
 for(const counterfeit of [[118,167,77,255],[239,185,56,255]]){const wrong=structuredClone(row);wrong.eastGatePatch=sampleEastGatePatch(()=>counterfeit);assert.throws(()=>assertNaturalPixels(wrong),'A green or yellow patch cannot masquerade as a closed gray gate');}
});

test('independent natural75 oracle accepts actual source Canvas gate and old-card pixels across both1-second waves',async()=>{
 const [{createCanvas},{createRunV18,findLegalMovesV18},{checksumV18},{sessionHost},{makeAccountRun},{render}]=await Promise.all([
  import('@napi-rs/canvas'),import('../src/domain/v18/engine.ts'),import('../src/domain/v18/replay.ts'),import('./helpers/session-fixtures.ts'),import('./helpers/account-fixtures.ts'),import('../src/presentation/renderer.ts')]);
 const state=createRunV18({seed:75,mode:'standard',inboundDifficulty:'hard'});state.runSerial=1;
 const run=makeAccountRun({state,identity:{runId:'protocol.natural75',serial:1,rulesetVersion:18,inboundDifficulty:'hard',runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:75,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});h.session.resume();let time=0;
 for(let step=1;step<=17;step++){h.session.dispatch({type:'place',...findLegalMovesV18(h.session.state as typeof state)[0]});if(step<17)while(h.session.view.animation){time+=1000;h.time(time);h.session.tick(time);}}
 const start=time;
 for(const sample of waveTimeline(2)){
  time=start+sample.absoluteMs;h.time(time);h.session.tick(time);
  for(const viewport of VIEWPORTS){const {width,height,safeTop,dpr}=viewport,k=Math.min(width/1080,(height-safeTop)/1920),ox=(width-1080*k)/2,oy=safeTop+(height-safeTop-1920*k)/2;
  const canvas=createCanvas(width*dpr,height*dpr),context=canvas.getContext('2d'),labels:{text:string;x:number;y:number}[]=[],fill=context.fillText.bind(context);
  context.setTransform(k*dpr,0,0,k*dpr,ox*dpr,oy*dpr);
  context.fillText=(text,x,y)=>{labels.push({text,x,y});fill(text,x,y);};render(context as unknown as CanvasRenderingContext2D,h.session.state,h.session.view);
  const pixel=(x:number,y:number)=>[...context.getImageData(Math.round((ox+x*k)*dpr),Math.round((oy+y*k)*dpr),1,1).data];
  const cards=[0,1].map(index=>{const words=labels.filter(g=>g.y>=357&&g.y<=492&&g.x>=(index?548:54)&&g.x<(index?1030:548)).map(g=>g.text),fill=pixel(index?554:60,400);return {dock:words.find(t=>['北门','东门'].includes(t)),cargo:words.find(t=>['机械','化工'].includes(t)),labels:words,fill,strong:fill[1]-fill[0]>20&&fill[2]<fill[1]};});
  const eastGatePatch=sampleEastGatePatch(pixel);assertNaturalPixels({wave:sample.wave,checksum:checksumV18(h.session.state as typeof state),cards,eastGatePatch,gates:{north:pixel(560,537),east:eastGatePatch[0].rgba}});
  }
 }
});

test('source real input gates animation pause, then permits ordinary pause and hide cancellation without replay',async()=>{
 const [{createRunV18,findLegalMovesV18},{checksumV18},{sessionHost},{makeAccountRun},{L}]=await Promise.all([import('../src/domain/v18/engine.ts'),import('../src/domain/v18/replay.ts'),import('./helpers/session-fixtures.ts'),import('./helpers/account-fixtures.ts'),import('../src/presentation/layout.ts')]);
 const createNatural=()=>{const state=createRunV18({seed:75,mode:'standard',inboundDifficulty:'hard'});state.runSerial=1;const run=makeAccountRun({state,identity:{runId:'protocol.input75',serial:1,rulesetVersion:18,inboundDifficulty:'hard',runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:75,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({formatVersion:2,economyVersion:2,dailyRewards:{},nextRunSerial:2,run});h.session.resume();let time=0;for(let step=1;step<=17;step++){h.session.dispatch({type:'place',...findLegalMovesV18(h.session.state as typeof state)[0]});if(step<17)while(h.session.view.animation){time+=1000;h.time(time);h.session.tick(time);}}return {h,time,state};};
 const tap=(h:ReturnType<typeof sessionHost>,rect:{x:number;y:number;w:number;h:number})=>{const point={x:rect.x+rect.w/2,y:rect.y+rect.h/2};h.session.input.down(point,1);h.session.input.up(point,1);};
 const {h,time}=createNatural();h.time(time+350);h.session.tick(time+350);const before=[...h.data],soundCount=h.sounds.length,animation=h.session.view.animation;
 tap(h,L.pause);assert.equal(h.session.view.paused,false);assert.equal(h.session.view.animation,animation);assert.deepEqual([...h.data],before);assert.equal(h.sounds.length,soundCount);
 for(const offset of [1000,2000]){h.time(time+offset);h.session.tick(time+offset);}assert.equal(h.session.view.animation,null);tap(h,L.pause);assert.equal(h.session.view.paused,true);tap(h,L.resume);assert.equal(h.session.view.paused,false);assert.equal(checksumV18(h.session.state as ReturnType<typeof createRunV18>),'31c7e4cc');
 const second=createNatural();second.h.time(second.time+350);second.h.session.tick(second.time+350);const wallet=second.h.session.view.account!.wallet,orders=second.h.session.state.completedOrders;second.h.session.hide();second.h.session.show();assert.equal(second.h.session.view.paused,true);assert.equal(second.h.session.view.animation,null);const sounds=second.h.sounds.length;tap(second.h,L.resume);assert.equal(second.h.session.view.paused,false);second.h.time(second.time+3000);second.h.session.tick(second.time+3000);assert.equal(second.h.session.view.animation,null);assert.equal(second.h.sounds.length,sounds);assert.equal(second.h.session.view.account!.wallet,wallet);assert.equal(second.h.session.state.completedOrders,orders);assert.equal(checksumV18(second.h.session.state as ReturnType<typeof createRunV18>),'31c7e4cc');
});
