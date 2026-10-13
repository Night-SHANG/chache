import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {createCanvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import type {UiControl} from '../src/presentation/ui.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {mapClientPoint} from '../src/presentation/layout.ts';
import {isToolRun,playableChecksum,previewPlayablePlacement} from '../src/domain/playable.ts';
import type {GameRun} from '../src/domain/playable.ts';
import {createRunV21,applyCommandV21,findLegalMovesV21} from '../src/domain/v21/engine.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {makeAccountRun} from './helpers/account-fixtures.ts';
import {createRun} from '../src/domain/engine.ts';
import {UPGRADES} from '../src/domain/content.ts';

const viewports=[{w:360,h:800},{w:540,h:960},{w:1200,h:900}];
type API=typeof import('../src/presentation/renderer.ts')&typeof import('../src/presentation/ui.ts')&typeof import('./helpers/session-fixtures.ts');
async function compiled(free:boolean):Promise<API>{
 const result=await build({stdin:{contents:["export * from './src/presentation/renderer.ts';","export * from './src/presentation/ui.ts';","export * from './tests/helpers/session-fixtures.ts';"].join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{__PLAYTEST_FREE_SHOP__:String(free)}});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`) as Promise<API>;
}
const [free,paid]=await Promise.all([compiled(true),compiled(false)]);
function capture(state:GameRun,view:ViewState,name:string,size=viewports[0],draw=render){
 const canvas=createCanvas(size.w,size.h),ctx=canvas.getContext('2d'),scale=Math.min(size.w/1080,size.h/1920),offset={x:(size.w-1080*scale)/2,y:(size.h-1920*scale)/2},labels:{text:string;x:number;y:number;left:number;right:number;size:number}[]=[],fill=ctx.fillText.bind(ctx);
 ctx.translate(offset.x,offset.y);ctx.scale(scale,scale);
 ctx.fillText=(value,x,y)=>{const m=ctx.measureText(value);labels.push({text:value,x,y,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,size:Number(/([\d.]+)px/.exec(ctx.font)?.[1])});fill(value,x,y);};
 draw(ctx as unknown as CanvasRenderingContext2D,state,view);
 const dir=process.env.WAREHOUSE_V018_CAPTURE_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}-${size.w}x${size.h}.png`,canvas.toBuffer('image/png'));}
 return {labels,words:labels.map(l=>l.text).join(''),pixel:(c:UiControl)=>Array.from(ctx.getImageData(Math.round(offset.x+(c.rect.x+30)*scale),Math.round(offset.y+(c.rect.y+30)*scale),1,1).data)};
}
function expectButton(out:ReturnType<typeof capture>,control:UiControl,role:'primary'|'secondary'|'disabled'){
 const [r,g,b]=out.pixel(control);
 assert.ok(role==='primary'?r>b+80&&g>b+50:role==='secondary'?b>r+15:r<100&&Math.abs(r-b)<40,`${control.label}: expected ${role}, pixel=${r},${g},${b}`);
 if(role!=='disabled')assert.equal(control.buttonRole,role);
}
function tap(host:ReturnType<typeof sessionHost>,type:UiAction['type'],api:Pick<API,'getUiControls'>={getUiControls},size=viewports[0]){
 const control=api.getUiControls(host.session.state,host.session.view).find(c=>c.action.type===type);assert.ok(control,type);
 const scale=Math.min(size.w/1080,size.h/1920),point=mapClientPoint({x:(size.w-1080*scale)/2+(control.rect.x+control.rect.w/2)*scale,y:(size.h-1920*scale)/2+(control.rect.y+control.rect.h/2)*scale},{x:0,y:0,...size});assert.ok(point);
 host.session.input.down(point);host.session.input.up(point);return control;
}

// Reversing the button palette or tying emphasis to array position must fail on actual pixels.
for(const [name,api,isFree] of [['free',free,true],['paid',paid,false]] as const)for(const product of ['tool','cosmetic'] as const)test(`${name} ${product} confirms on the right in gold and cancels on the left in blue without rebinding actions`,()=>{
 const h=api.sessionHost({wallet:1000}),s=h.session;s.action({type:'shop'});
 const open=()=>s.action(product==='tool'?{type:'purchase',item:'rotate'}:{type:'purchaseCosmetic',kind:'cargo',id:'insulated'}),before=[...h.data],account=structuredClone(s.view.account);
 open();const controls=api.getUiControls(s.state,s.view).filter(c=>c.action.type==='cancel'||c.action.type==='confirm');assert.deepEqual(controls.map(c=>c.action),[{type:'cancel'},{type:'confirm'}]);assert.deepEqual(controls.map(c=>c.rect),[{x:186,y:1160,w:330,h:150},{x:564,y:1160,w:330,h:150}]);
 for(const size of viewports){const out=capture(s.state,s.view,`${name}-${product}-confirmation`,size,api.render);expectButton(out,controls[0],'secondary');expectButton(out,controls[1],'primary');assert.ok(out.words.includes(isFree?'确认领取':'确认购买'));assert.ok(controls.every(c=>c.rect.w/3>=44&&c.rect.h/3>=44));}
 tap(h,'cancel',api);assert.equal(s.view.confirmation,null);assert.deepEqual([...h.data],before);assert.deepEqual(s.view.account,account);
 open();tap(h,'confirm',api,viewports[2]);assert.equal(s.view.confirmation,null);assert.equal(s.view.account?.wallet,1000-(isFree?0:product==='tool'?80:300));
 if(product==='tool')assert.equal(s.view.account?.inventory.rotate,1);else assert.ok(s.view.account?.profile.ownedCosmetics?.includes('cargo.insulated'));
 const saved=[...h.data];s.action({type:'confirm'});assert.deepEqual([...h.data],saved);
});

test('every active confirmation declares its intent while destructive dialogs keep the safe choice gold',()=>{
 const h=sessionHost();
 for(const kind of ['newRun','resetProfile','finishOvertime','finishEndless','leaveRun','switchMode'] as const){
  const view={...h.session.view,confirmation:{kind,variant:'color_exit' as const}},controls=getUiControls(h.session.state,view),safe=kind!=='switchMode';
  assert.deepEqual(controls.map(c=>c.action),[{type:'cancel'},{type:'confirm'}]);assert.deepEqual(controls.map(c=>c.rect),[{x:186,y:1160,w:330,h:118},{x:564,y:1160,w:330,h:118}]);
  for(const size of viewports){const out=capture(h.session.state,view,`dialog-${kind}`,size);expectButton(out,controls[0],safe?'primary':'secondary');expectButton(out,controls[1],safe?'secondary':'primary');}
 }
 const retired=getUiControls(h.session.state,{...h.session.view,confirmation:{kind:'startPractice',practiceKind:'inbound'}});assert.ok(retired.every(c=>c.action.type!=='confirm'));
});

test('tool confirmation is gold only when actionable, and blue cancel preserves reserved tools',()=>{
 for(const item of ['rotate','clear','wildcard'] as const){
  const h=sessionHost({inventory:{rotate:1,clear:1,wildcard:1}}),s=h.session;startInbound(s,'standard',[item]);
  if(item==='clear'){const move=previewPlayablePlacement(s.state,s.state.candidates[0].id,{x:1,y:1});assert.ok(move.valid);s.dispatch({type:'place',pieceId:s.state.candidates[0].id,origin:{x:1,y:1}});h.time(10000);s.tick(10000);}
  s.action({type:'tool',item});const saved=[...h.data],checksum=playableChecksum(s.state),select=()=>{
   if(item==='clear')s.action({type:'toolCell',cell:s.state.board.findIndex(c=>c!==null)});
   else {s.action({type:'toolPiece',pieceId:s.state.candidates.find(p=>item==='wildcard'||!['shape.single','shape.square'].includes(p.shapeId))!.id});if(item==='rotate')s.action({type:'toolRotate'});}
  };
  let controls=getUiControls(s.state,s.view),out=capture(s.state,s.view,`${item}-disabled`);expectButton(out,controls[0],'secondary');expectButton(out,controls[1],'disabled');tap(h,'toolConfirm');assert.deepEqual([...h.data],saved);
  select();assert.ok(s.view.toolSelection?.command);assert.equal(s.view.toolSelection.error,undefined);
  controls=getUiControls(s.state,s.view);assert.deepEqual(controls.slice(0,2).map(c=>c.rect),[{x:48,y:1788,w:280,h:132},{x:752,y:1788,w:280,h:132}]);
  for(const size of viewports){out=capture(s.state,s.view,`${item}-confirmation`,size);expectButton(out,controls[0],'secondary');expectButton(out,controls[1],'primary');}
  tap(h,'toolCancel');assert.equal(s.view.toolSelection,null);assert.equal(playableChecksum(s.state),checksum);assert.deepEqual([...h.data],saved);
  s.action({type:'tool',item});select();tap(h,'toolConfirm');assert.ok(isToolRun(s.state));assert.equal(s.state.toolCharges[item],0);const committed=[...h.data];s.action({type:'toolConfirm'});assert.deepEqual([...h.data],committed);
 }
});

test('preparation uses explicit cancel and next roles without changing tool selection or target geometry',()=>{
 const h=sessionHost({inventory:{rotate:1,clear:0,wildcard:0}});h.session.action({type:'newRun',mode:'standard'});const controls=getUiControls(h.session.state,h.session.view);
 const cancel=controls.find(c=>c.action.type==='back')!,next=controls.find(c=>c.action.type==='prepareNext')!,out=capture(h.session.state,h.session.view,'prepare-tools');
 expectButton(out,cancel,'secondary');expectButton(out,next,'primary');assert.deepEqual([cancel.rect,next.rect],[{x:132,y:1518,w:348,h:132},{x:516,y:1518,w:432,h:132}]);
});

// Removing or wrapping the wrong copy must fail independently of button rendering.
test('help removes only the two requested lines, uses waste crates, and preserves both wildcard explanations',()=>{
 const h=sessionHost(),s=h.session;s.action({type:'helpMenu'});s.action({type:'selectHelp',topic:'inbound'});s.action({type:'helpDetails'});
 for(const size of viewports){const out=capture(s.state,s.view,'special-rush',size);assert.doesNotMatch(out.words,/废物|废弃物|入库五班和无限模式没有加急货/);assert.ok(out.words.includes('归零变为废弃箱'));assert.ok(out.words.includes('清扫1格旧废弃箱'));assert.ok(out.words.includes('整组货物旁1格废弃箱'));assert.ok(out.words.includes('加急数字按后续成功放置次数倒数，不是倒计时'));assert.ok(out.labels.every(l=>l.left>=0&&l.right<=1080));}
 s.action({type:'help'});s.action({type:'helpBack'});s.action({type:'selectHelp',topic:'tools'});
 for(const size of viewports){const out=capture(s.state,s.view,'tools-help',size);assert.ok(out.words.includes('清除棋盘上1至2个有货物或废弃箱的格子。'));assert.doesNotMatch(out.words,/入库下次放置时检查出货；出库立即检查出货。|废物|废弃物/);for(const text of ['入库：将待放货件换成单格万能箱。','出库：换成单格，自选货类。'])assert.ok(out.words.includes(text));assert.ok(out.labels.every(l=>l.left>=0&&l.right<=1080));}
});

test('cleanup choices, preview expiry, actual crate labels and committed status consistently say waste crate',()=>{
 const h=sessionHost(),initial=createRunV21({seed:17,mode:'rush'}),view={...h.session.view,screen:'game' as const};
 for(const size of viewports){const out=capture(initial,view,'cleanup-choice',size);assert.doesNotMatch(out.words,/废物|废弃物/);assert.equal(out.labels.filter(l=>l.text==='清除1格废弃箱').length,2);assert.ok(getUiControls(initial,view).filter(c=>c.action.type==='chooseCleanup').every(c=>c.label.includes('废弃箱')));}
 let state=applyCommandV21(initial,{type:'chooseCleanup',branch:'placements'}).state;for(let i=0;i<3;i++)state=applyCommandV21(state,{type:'place',...findLegalMovesV21(state)[0]}).state;state.board.fill(null);state.cellTraits.fill(null);state.runSerial=1;state.board[8]='cargo.food';state.cellTraits[8]={kind:'rush',remaining:1,bornAtPlacement:1};state.board[9]='cargo.food';state.cellTraits[9]={kind:'waste'};state.cleanup!.progress=5;state.candidates[0]={id:'expiry.trigger',shapeId:'shape.single',cargo:'cargo.machine',quarterTurns:0};
 const preview=previewPlayablePlacement(state,'expiry.trigger',{x:5,y:5});assert.ok(preview.valid);assert.ok(preview.events.some(e=>e.type==='rushExpired'));assert.ok(preview.events.some(e=>e.type==='cleanup'));
 const previewOut=capture(state,{...view,preview},'expiry-preview');assert.doesNotMatch(previewOut.words,/废物|废弃物/);assert.ok(previewOut.words.includes('废弃箱'));
 const run=makeAccountRun({state,identity:{runId:'copy.expiry',serial:1,rulesetVersion:21,runConfigId:state.runConfigId,mode:'rush',inboundDifficulty:'normal',economyVersion:2},history:{seed:state.seed,runConfigId:state.runConfigId,head:null,totalCommands:state.commandIndex,tail:state.commands}}),host=sessionHost({run,nextRunSerial:2,formatVersion:2,economyVersion:2,dailyRewards:{}});host.session.resume();host.session.dispatch({type:'place',pieceId:'expiry.trigger',origin:{x:5,y:5}});
 assert.match(host.session.view.message,/加急归零，变为废弃箱/);assert.match(host.session.view.message,/已清扫1格旧废弃箱/);
 for(const size of viewports){const out=capture(host.session.state,host.session.view,'expiry-feedback',size);assert.doesNotMatch(out.words,/废物|废弃物/);assert.ok(out.words.includes('废弃箱'));}
});

test('reachable legacy upgrade descriptions normalize waste copy without mutating frozen domain content',()=>{
 const h=sessionHost(),state=createRun(17,'standard',2),before=JSON.stringify(UPGRADES);state.phase='upgrade';state.upgradeChoices=['upgrade.hazard_clearance','upgrade.sweep_route'];
 const out=capture(state,{...h.session.view,screen:'game'},'legacy-upgrade-copy');assert.doesNotMatch(out.words,/废物|废弃物/);assert.ok(out.words.includes('废弃箱'));assert.equal(JSON.stringify(UPGRADES),before);
});
