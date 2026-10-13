import {prepareViewArt} from './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync} from 'node:fs';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {L,hitTestPoint,mapClientPoint} from '../src/presentation/layout.ts';
import type {GameRun} from '../src/domain/playable.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import type {ResultBucket} from '../src/application/account-types.ts';
import {GameSession} from '../src/application/session.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {scaledScoreV18} from '../src/domain/v18/content.ts';
import {CARGO} from '../src/domain/rulesets/v1/content.ts';
import {findPlayableMoves,previewPlayablePlacement} from '../src/domain/playable.ts';
import {makeAccountRun,makeAccountFixture} from './helpers/account-fixtures.ts';
import {COSMETIC_CATALOG,accountCosmeticState} from '../src/application/cosmetics.ts';
import {COSMETIC_PREVIEW_RECT,selectedShopCosmetic,cosmeticShopPage} from '../src/presentation/economy-ui.ts';
import {playableChecksum} from '../src/domain/playable.ts';

const act=(h:ReturnType<typeof sessionHost>,a:Record<string,unknown>)=>h.session.action(a as UiAction);
const writes=(h:ReturnType<typeof sessionHost>)=>h.storage.operations.filter(op=>op.kind==='set'||op.kind==='remove').length;
const bucket=(score:number,maxUnits:number):ResultBucket=>({runs:1,units:maxUnits,maxUnits,score,wins:0,retirements:1,maxChain:1,best:{score,units:1,chain:1}});
const sizes=[[360,800],[540,960],[1200,900]] as const;
function capture(state:GameRun,view:ViewState,name='',width=1080,height=1920){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),labels:{value:string;left:number;right:number;top:number;bottom:number}[]=[],fill=ctx.fillText.bind(ctx),scale=Math.min(width/L.width,height/L.height),ox=(width-L.width*scale)/2,oy=(height-L.height*scale)/2;ctx.translate(ox,oy);ctx.scale(scale,scale);
 ctx.fillText=(value,x,y)=>{const m=ctx.measureText(value),t=ctx.getTransform();labels.push({value,left:t.a*(x-m.actualBoundingBoxLeft)+t.e,right:t.a*(x+m.actualBoundingBoxRight)+t.e,top:t.d*(y-m.actualBoundingBoxAscent)+t.f,bottom:t.d*(y+m.actualBoundingBoxDescent)+t.f});fill(value,x,y);};render(ctx as unknown as CanvasRenderingContext2D,state,view);
 const dir=process.env.WAREHOUSE_FIXED_CAPTURE_DIR;if(dir&&name){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}-${width}x${height}.png`,canvas.toBuffer('image/png'));}return {words:labels.map(l=>l.value).join('\n'),labels,scale,ox,oy};
}

test('home tools help is a third static topic and returns without changing account or storage',()=>{
 const h=sessionHost({wallet:777,inventory:{rotate:1,clear:1,wildcard:1}},false),before=[...h.data],state=h.session.state,account=structuredClone(h.session.view.account);h.storage.resetFault();h.session.action({type:'helpMenu'});
 assert.deepEqual(getUiControls(state,h.session.view).filter(c=>c.action.type==='selectHelp').map(c=>c.label),['入库玩法','出库玩法','道具说明']);act(h,{type:'selectHelp',topic:'tools'});assert.equal(h.session.view.screen,'toolsHelp');
 const words=capture(state,h.session.view).words;for(const text of ['道具说明','旋转','清障','万能','最多携带2种','每种1件','取消不扣','入库','出库','换成单格，自选货类'])assert.ok(words.includes(text),text);
 h.session.hide();h.session.show();assert.equal(h.session.view.screen,'toolsHelp');h.session.action({type:'helpBack'});assert.equal(h.session.view.screen,'helpMenu');h.session.action({type:'back'});assert.equal(h.session.view.screen,'menu');assert.equal(h.session.state,state);assert.deepEqual(h.session.view.account,account);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});

test('paused tools help returns through the original explanation to the same paused board',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:1,wildcard:0}});startInbound(h.session,'standard',['rotate','clear']);h.time(2500);h.session.tick(2500);h.session.togglePause();const before=[...h.data],state=h.session.state,account=structuredClone(h.session.view.account),elapsed=h.session.view.elapsed;h.storage.resetFault();h.session.action({type:'help'});act(h,{type:'toolsHelp'});assert.equal(h.session.view.screen,'toolsHelp');h.time(120000);h.session.tick(120000);h.session.action({type:'helpBack'});assert.equal(h.session.view.screen,'colorIntro');h.session.action({type:'helpBack'});assert.equal(h.session.view.screen,'game');assert.equal(h.session.view.paused,true);assert.equal(h.session.view.elapsed,elapsed);assert.equal(h.session.state,state);assert.deepEqual(h.session.view.account,account);assert.deepEqual([...h.data],before);assert.equal(writes(h),0);
});

test('inbound explanation puts special cargo above return and removes shared tools from cargo details',()=>{
 const h=sessionHost();h.session.action({type:'helpMenu'});h.session.action({type:'selectHelp',topic:'inbound'});const controls=getUiControls(h.session.state,h.session.view);assert.equal(controls[0].label,'特殊货物与加急');assert.equal(controls[controls.length-1]?.label,'返回');assert.ok(controls[0].rect.y<controls[controls.length-1]!.rect.y);h.session.action({type:'helpDetails'});const words=capture(h.session.state,h.session.view).words;assert.match(words,/特殊货物/);assert.doesNotMatch(words,/特殊货物与工具|旋转改朝向|清障选|万能工具|最多带2种/);assert.ok(words.includes('加急数字按后续成功放置次数倒数，不是倒计时'));assert.match(words,/危险品|双倍箱|旧废弃箱/);
});

test('both menu positions show one fixed rush bucket and independent plain and tool maximum orders',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const account=structuredClone(h.session.view.account!);account.profile.results['inbound.rush.v20.fixed.plain']=bucket(111,3);account.profile.results['inbound.rush.v20.fixed.tools']=bucket(222,4);account.profile.results['inbound.rush.v19.expert.plain']=bucket(999,5);
 account.profile.results['inbound.endless.v18.hard.plain']=bucket(333,91);account.profile.results['inbound.endless.v18.hard.tools']=bucket(444,103);account.profile.results['inbound.endless.v18.expert.plain']=bucket(555,0);
 for(const tier of ['hard','expert'] as const){const words=capture(h.session.state,{...h.session.view,account,inboundDifficulty:tier}).words;assert.match(words,/加急模式/);assert.doesNotMatch(words,/困难加急|专业加急|最高分 999/);assert.match(words,/最高分 111/);assert.match(words,/使用道具最高分 222/);assert.ok(words.includes(tier==='hard'?'最多完成 91单':'最多完成 0单'));assert.ok(words.includes(tier==='hard'?'道具最多完成 103单':'道具最多完成 暂无'));}
});

for(const tier of ['hard','expert'] as const)test(`${tier} settlement preserves the larger order maximum when a shorter run scores more, through restore and reset`,()=>{
 const state=createRunV18({seed:17,mode:'endless',inboundDifficulty:tier});state.completedOrders=5;state.rawScore=2000;state.score=scaledScoreV18(2000,tier);state.runSerial=1;
 const key=`inbound.endless.v18.${tier}.plain`,toolKey=`inbound.endless.v18.${tier}.tools`,profile=makeAccountFixture().profile;profile.results[key]=bucket(100,91);profile.results[toolKey]=bucket(222,103);
 const run=makeAccountRun({state,identity:{runId:`max.${tier}`,serial:1,rulesetVersion:18,inboundDifficulty:tier,runConfigId:state.runConfigId,mode:'endless',economyVersion:2},history:{seed:17,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({run,profile,nextRunSerial:2,formatVersion:2,economyVersion:2,dailyRewards:{}});h.session.resume();h.session.action({type:'finishEndless'});h.session.action({type:'confirm'});assert.equal(h.session.state.phase,'result');const record=h.session.view.account?.profile.results[key];assert.equal(record?.best?.score,state.score);assert.equal(record?.best?.units,5);assert.equal(record?.maxUnits,91);
 h.session.action({type:'home'});h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:tier});assert.match(capture(h.session.state,h.session.view).words,/最多完成 91单/);assert.match(capture(h.session.state,h.session.view).words,/道具最多完成 103单/);
 const restored=new GameSession(h.platform,{seed:900,mode:'standard'});restored.action({type:'chooseInbound'});restored.action({type:'selectInboundDifficulty',inboundDifficulty:tier});assert.match(capture(restored.state,restored.view).words,/最多完成 91单/);restored.action({type:'resetProfile'});restored.action({type:'confirm'});restored.action({type:'chooseInbound'});assert.match(capture(restored.state,restored.view).words,/最多完成 暂无/);assert.equal(restored.view.account?.profile.results[key],undefined);
});

for(const tier of ['hard','expert'] as const)test(`${tier} five-shift continuation settles total orders into the visible endless maximum`,()=>{
 const state=createRunV18({seed:17,mode:'standard',inboundDifficulty:tier});state.completedOrders=29;state.shift=5;state.runSerial=1;state.rawScore=101;state.score=scaledScoreV18(101,tier);state.candidates[0]={id:'last.food',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};state.orders=['dock.north','dock.east','dock.south','dock.west'].map((dockId,index)=>({id:`last.order.${index}`,dockId,cargo:CARGO[index].id,amount:index===0?4:6,baseScore:200}));for(const cell of [8,9,10])state.board[cell]='cargo.food';
 const run=makeAccountRun({state,identity:{runId:`continued.${tier}`,serial:1,rulesetVersion:18,inboundDifficulty:tier,runConfigId:state.runConfigId,mode:'standard',economyVersion:2},history:{seed:17,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]}}),h=sessionHost({run,nextRunSerial:2,formatVersion:2,economyVersion:2,dailyRewards:{}}),settle=()=>{h.time(h.platform.now()+10000);h.session.tick(h.platform.now());h.time(h.platform.now()+10000);h.session.tick(h.platform.now());};h.session.resume();h.session.dispatch({type:'place',pieceId:'last.food',origin:{x:4,y:1}});settle();assert.equal(h.session.state.result,'won');h.session.action({type:'continueOvertime'});
 for(let n=0;h.session.state.completedOrders===30&&n<50;n++){const moves=findPlayableMoves(h.session.state).map(move=>({move,score:previewPlayablePlacement(h.session.state,move.pieceId,move.origin).stateAfter?.score??0})).sort((a,b)=>b.score-a.score);assert.ok(moves.length);h.session.dispatch({type:'place',...moves[0].move});settle();}
 const units=h.session.state.completedOrders;assert.ok(units>30);h.session.action({type:'finishOvertime'});h.session.action({type:'confirm'});settle();assert.equal(h.session.view.account?.profile.results[`inbound.endless.v18.${tier}.plain`]?.maxUnits,units);h.session.action({type:'home'});h.session.action({type:'chooseInbound'});h.session.action({type:'selectInboundDifficulty',inboundDifficulty:tier});assert.ok(capture(h.session.state,h.session.view).words.includes(`最多完成 ${units}单`));
});

test('mode controls and help remain readable, disjoint and touchable at all three target sizes',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const account=structuredClone(h.session.view.account!);account.profile.results['inbound.endless.v18.hard.plain']=bucket(98586,109);account.profile.results['inbound.endless.v18.hard.tools']=bucket(99586,123);
 for(const [width,height] of sizes)for(const screen of ['inboundMenu','colorTiers','helpMenu','colorIntro','helpDetails','toolsHelp'] as const){const view={...h.session.view,account,screen,helpTopic:'inbound' as const,helpFromHome:true} as ViewState,out=capture(h.session.state,view,screen,width,height),controls=getUiControls(h.session.state,view);
  for(const label of out.labels)assert.ok(label.left>=-1&&label.right<=width+1&&label.top>=-1&&label.bottom<=height+1,`${screen}: ${JSON.stringify(label)}`);
  for(const [i,c] of controls.entries()){assert.ok(c.rect.h*out.scale>=44,c.label);assert.ok(c.rect.w*out.scale>=44,c.label);for(const other of controls.slice(i+1))assert.equal(c.rect.x<other.rect.x+other.rect.w&&c.rect.x+c.rect.w>other.rect.x&&c.rect.y<other.rect.y+other.rect.h&&c.rect.y+c.rect.h>other.rect.y,false,`${c.label}/${other.label}`);const point=mapClientPoint({x:out.ox+(c.rect.x+c.rect.w/2)*out.scale,y:out.oy+(c.rect.y+c.rect.h/2)*out.scale},{x:0,y:0,w:width,h:height});assert.ok(point&&hitTestPoint(point,c.rect));}
  const starts=controls.filter(c=>c.action.type==='newRun');assert.ok(starts.every(c=>c.label==='开始'));if(screen==='inboundMenu')for(const label of out.labels.filter(l=>/^(?:最多完成|道具最多完成)/.test(l.value)))for(const c of starts)if(label.top<out.oy+(c.rect.y+c.rect.h)*out.scale&&label.bottom>out.oy+c.rect.y*out.scale)assert.ok(label.right<=out.ox+(c.rect.x-16)*out.scale,JSON.stringify(label));
 }
});

test('large score and maximum-order records retain all digits without colliding with start controls',()=>{
 const h=sessionHost();h.session.action({type:'chooseInbound'});const account=structuredClone(h.session.view.account!);for(const mode of ['standard','endless','rush'])for(const tools of ['plain','tools'])account.profile.results[mode==='rush'?`inbound.rush.v20.fixed.${tools}`:`inbound.${mode}.v18.hard.${tools}`]=bucket(Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
 const view={...h.session.view,account},out=capture(h.session.state,view),starts=getUiControls(h.session.state,view).filter(c=>c.action.type==='newRun');for(const label of out.labels.filter(l=>/^(?:无道具最高分|使用道具最高分|最多完成|道具最多完成)/.test(l.value))){assert.ok(label.value.includes('9,007,199,254,740,991'));for(const c of starts)if(label.top<c.rect.y+c.rect.h&&label.bottom>c.rect.y)assert.ok(label.right<=c.rect.x-16,JSON.stringify(label));}
});

test('fixed rush board and settlement keep the unprefixed mode label at three sizes',()=>{
 const h=sessionHost();h.session.action({type:'newRun',mode:'rush',inboundDifficulty:'expert'});h.session.action({type:'prepareNext'});h.session.action({type:'chooseCleanup',branch:'orders'});
 for(const [width,height] of sizes){const out=capture(h.session.state,h.session.view,'fixed-rush-board',width,height);assert.match(out.words,/加急模式/);assert.doesNotMatch(out.words,/普通加急|困难加急|专业加急/);}
 h.session.dispatch({type:'finish'});const out=capture(h.session.state,{...h.session.view,animation:null,noticeFx:null});assert.match(out.words,/加急模式/);assert.doesNotMatch(out.words,/普通加急|困难加急|专业加急/);assert.match(out.words,/本局金币/);
});

test('cosmetic shop has three categories, four tiles per page and inline previews without set routes',()=>{
 const h=sessionHost({wallet:900});h.session.action({type:'shop'});h.session.action({type:'selectShopTab',tab:'cosmetics'});
 assert.deepEqual(COSMETIC_PREVIEW_RECT,{x:132,y:750,w:816,h:232});
 for(const section of ['theme','cargo','forklift'] as const){
  h.session.action({type:'selectShopSection',section});const controls=getUiControls(h.session.state,h.session.view),cards=controls.filter(c=>c.action.type==='previewCosmetic');
  assert.deepEqual(controls.filter(c=>c.action.type==='selectShopSection').map(c=>c.label),['场景','货箱','叉车']);
  assert.equal(controls.filter(c=>c.action.type==='selectCosmeticPage').length,2);
  assert.equal(controls.some(c=>['selectCosmeticBrowse','previewCosmeticSet','selectCosmeticSetPage','previewCosmeticSetMember','closeShopDetail'].includes(c.action.type)),false);
  assert.equal(cards.length,4);assert.deepEqual(cards.map(c=>[c.rect.x,c.rect.y,c.rect.w,c.rect.h]),Array.from({length:4},(_,index)=>[132+index%2*420,1110+Math.floor(index/2)*170,396,150]));
  const card=cards[0],point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2};h.session.input.down(point);h.session.input.up(point);
  assert.equal(h.session.view.shopItemDetail,undefined);assert.equal(h.session.view.cosmeticSetPreview,undefined);assert.equal(selectedShopCosmetic(h.session.view).id,COSMETIC_CATALOG.find(c=>c.kind===section)!.id);
  assert.equal(getUiControls(h.session.state,h.session.view).filter(c=>c.action.type==='selectShopSection').length,3);assert.equal(getUiControls(h.session.state,h.session.view).filter(c=>c.action.type==='previewCosmetic').length,4);
  assert.equal(h.session.view.shopSection,section);
 }
});

test('every cosmetic is reachable by paging while selections stay ephemeral and confirmation blocks navigation',()=>{
 const h=sessionHost({wallet:10000}),state=playableChecksum(h.session.state);h.session.action({type:'shop'});h.session.action({type:'selectShopTab',tab:'cosmetics'});const before=[...h.data],appearance=accountCosmeticState(h.session.view.account??null);h.storage.resetFault();
 const selected:Record<string,string>={};
 for(const kind of ['theme','cargo','forklift'] as const){
  h.session.action({type:'selectShopSection',section:kind});const options=COSMETIC_CATALOG.filter(item=>item.kind===kind),seen=new Set<string>();
  for(let page=0;page<Math.ceil(options.length/4);page++){
   h.session.action({type:'selectCosmeticPage',page});assert.equal(cosmeticShopPage(h.session.view).page,page);const view=structuredClone(h.session.view);assert.equal(h.session.input.wheel({x:330,y:800},100),false);assert.deepEqual(h.session.view,view);
   for(const c of getUiControls(h.session.state,h.session.view))if(c.action.type==='previewCosmetic')seen.add(c.action.id);
  }
  assert.deepEqual([...seen].sort(),options.map(item=>item.id).sort());const lastPage=cosmeticShopPage(h.session.view).page;
  h.session.action({type:'selectShopTab',tab:'tools'});h.session.action({type:'selectShopTab',tab:'cosmetics'});assert.equal(h.session.view.shopSection,kind);assert.equal(cosmeticShopPage(h.session.view).page,lastPage);
  const paid=options.filter(item=>item.price>0&&!item.achievementId),target=paid[paid.length-1];selected[kind]=target.id;h.session.action({type:'previewCosmetic',kind,id:target.id});h.session.action({type:'purchaseCosmetic',kind,id:target.id});const pending=structuredClone(h.session.view.confirmation),preview=structuredClone(h.session.view.cosmeticPreview),page=cosmeticShopPage(h.session.view).page;assert.ok(pending);
  for(const action of [{type:'scrollShop',deltaY:-10000},{type:'selectCosmeticPage',page:0},{type:'selectShopSection',section:kind==='cargo'?'theme':'cargo'},{type:'closeShopDetail'},{type:'back'}])act(h,action);
  assert.deepEqual(h.session.view.confirmation,pending);assert.equal(selectedShopCosmetic(h.session.view).id,target.id);assert.deepEqual(h.session.view.cosmeticPreview,preview);assert.equal(cosmeticShopPage(h.session.view).page,page);h.session.action({type:'cancel'});
 }
 for(const kind of ['theme','cargo','forklift'] as const){h.session.action({type:'selectShopSection',section:kind});assert.equal(selectedShopCosmetic(h.session.view).id,selected[kind]);}
 assert.deepEqual([...h.data],before);assert.equal(writes(h),0);assert.equal(playableChecksum(h.session.state),state);assert.deepEqual(accountCosmeticState(h.session.view.account??null),appearance);
});

test('a paged purchase retains same-screen selection, equips separately and reopening resets ephemeral browsing',()=>{
 const h=sessionHost({wallet:10000});h.session.action({type:'shop'});h.session.action({type:'selectShopTab',tab:'cosmetics'});let wallet=10000;
 for(const kind of ['theme','cargo','forklift'] as const){
  h.session.action({type:'selectShopSection',section:kind});const target=COSMETIC_CATALOG.filter(item=>item.kind===kind)[4];h.session.action({type:'selectCosmeticPage',page:1});assert.equal(cosmeticShopPage(h.session.view).page,1);
  const card=getUiControls(h.session.state,h.session.view).find(c=>c.action.type==='previewCosmetic'&&c.action.id===target.id);assert.ok(card);const point={x:card.rect.x+card.rect.w/2,y:card.rect.y+card.rect.h/2};h.session.input.down(point);h.session.input.up(point);assert.equal(selectedShopCosmetic(h.session.view).id,target.id);
  h.session.action({type:'purchaseCosmetic',kind,id:target.id});h.session.action({type:'selectCosmeticPage',page:0});h.session.action({type:'confirm'});h.session.action({type:'confirm'});wallet-=target.price;assert.equal(h.session.view.account?.wallet,wallet);assert.ok(h.session.view.account?.profile.ownedCosmetics?.includes(target.key));assert.notEqual(h.session.view.account?.profile.cosmetics[kind],target.id);assert.equal(h.session.view.shopItemDetail,undefined);assert.equal(selectedShopCosmetic(h.session.view).id,target.id);assert.equal(cosmeticShopPage(h.session.view).page,1);
  h.session.action({type:'equipCosmetic',kind,id:target.id});assert.equal(h.session.view.account?.profile.cosmetics[kind],target.id);assert.equal(h.session.view.account?.wallet,wallet);assert.equal(cosmeticShopPage(h.session.view).page,1);
 }
 const restored=new GameSession(h.platform,{seed:123,mode:'standard'});restored.action({type:'shop'});assert.equal(restored.view.shopTab,'tools');assert.equal(restored.view.cosmeticPreview,undefined);assert.equal(restored.view.cosmeticSetPage,0);restored.action({type:'selectShopTab',tab:'cosmetics'});assert.equal(restored.view.shopSection,'theme');
 for(const kind of ['theme','cargo','forklift'] as const){restored.action({type:'selectShopSection',section:kind});assert.equal(restored.view.shopScroll?.[kind],0);assert.equal(restored.view.shopItemDetail,undefined);assert.equal(selectedShopCosmetic(restored.view).id,COSMETIC_CATALOG.find(item=>item.kind===kind)!.id);assert.equal(cosmeticShopPage(restored.view).page,0);}
 restored.action({type:'resetProfile'});restored.action({type:'confirm'});assert.equal(restored.view.account?.wallet,wallet);for(const kind of ['theme','cargo','forklift'] as const)assert.ok(restored.view.account?.profile.ownedCosmetics?.includes(COSMETIC_CATALOG.filter(item=>item.kind===kind)[4].key));
 restored.action({type:'selectShopSection',section:'cargo'});restored.action({type:'previewCosmetic',kind:'cargo',id:'outline'});assert.equal(restored.view.shopItemDetail,undefined);assert.equal((restored.view as ViewState).cosmeticPreview?.cargo,'outline');assert.equal(getUiControls(restored.state,restored.view).find(c=>c.action.type==='setCargoOutline')?.label,'装备');
});

test('every shop category page fits three viewports with 44 CSS targets and no overlap',()=>{
 const h=sessionHost({wallet:10000});h.session.action({type:'shop'});h.session.action({type:'selectShopTab',tab:'cosmetics'});
 for(const section of ['theme','cargo','forklift'] as const){h.session.action({type:'selectShopSection',section});const pages=Math.ceil(COSMETIC_CATALOG.filter(item=>item.kind===section).length/4);
  for(let page=0;page<pages;page++){h.session.action({type:'selectCosmeticPage',page});
   for(const [width,height] of sizes){const out=capture(h.session.state,h.session.view,`shop-${section}-page${page+1}`,width,height),controls=getUiControls(h.session.state,h.session.view);
    for(const label of out.labels)assert.ok(label.left>=-1&&label.right<=width+1&&label.top>=-1&&label.bottom<=height+1,JSON.stringify(label));
    for(const [index,c] of controls.entries()){
     assert.ok(c.rect.w*out.scale>=44&&c.rect.h*out.scale>=44,c.label);for(const other of controls.slice(index+1))assert.ok(c.rect.x+c.rect.w<=other.rect.x||other.rect.x+other.rect.w<=c.rect.x||c.rect.y+c.rect.h<=other.rect.y||other.rect.y+other.rect.h<=c.rect.y,`${c.label}/${other.label}`);
     if(c.action.type==='previewCosmetic')assert.ok(c.rect.y>=1110&&c.rect.y+c.rect.h<=1430);
     const point=mapClientPoint({x:out.ox+(c.rect.x+c.rect.w/2)*out.scale,y:out.oy+(c.rect.y+c.rect.h/2)*out.scale},{x:0,y:0,w:width,h:height});assert.ok(point&&hitTestPoint(point,c.rect));
    }
   }
  }
 }
});

test('equipped logistics themes reach the actual renderer without mutating the background game',async()=>{
 const h=sessionHost(),state=playableChecksum(h.session.state),pixels=async(view:ViewState)=>{await prepareViewArt(view);const canvas=createCanvas(360,640),ctx=canvas.getContext('2d');ctx.scale(1/3,1/3);render(ctx as unknown as CanvasRenderingContext2D,h.session.state,view);return canvas.toBuffer('image/png');},base=await pixels(h.session.view),seen:Buffer[]=[];
 for(const theme of ['cold_chain','rail_freight','toy_workshop'] as const){const account=structuredClone(h.session.view.account!);account.profile.cosmetics.theme=theme;account.profile.ownedCosmetics=[...(account.profile.ownedCosmetics??[]),`theme.${theme}`];const output=await pixels({...h.session.view,account});assert.notDeepEqual(output,base,theme);for(const previous of seen)assert.notDeepEqual(output,previous);seen.push(output);assert.equal(playableChecksum(h.session.state),state);}
});

test('retired logistics scene projects to the base renderer without rewriting account or game',async()=>{
 await prepareViewArt(sessionHost().session.view);
 const h=sessionHost(),account=structuredClone(h.session.view.account!),snapshot=playableChecksum(h.session.state);account.profile.cosmetics.theme='express_sorting';account.profile.ownedCosmetics=[...(account.profile.ownedCosmetics??[]),'theme.express_sorting'];
 const stored=structuredClone(account),pixels=(view:ViewState)=>{const canvas=createCanvas(360,640),ctx=canvas.getContext('2d');ctx.scale(1/3,1/3);render(ctx as unknown as CanvasRenderingContext2D,h.session.state,view);return canvas.toBuffer('image/png');};
 assert.deepEqual(pixels({...h.session.view,account}),pixels({...h.session.view,account:{...account,profile:{...account.profile,cosmetics:{...account.profile.cosmetics,theme:'day'}}}}));assert.deepEqual(account,stored);assert.equal(playableChecksum(h.session.state),snapshot);
});
