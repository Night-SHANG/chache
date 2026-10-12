import './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {createPlayableRun,isOutboundToolsRun,type GameRun} from '../src/domain/playable.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import {render} from '../src/presentation/renderer.ts';
import {L} from '../src/presentation/layout.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const view=():ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:192000,animation:null,debug:false,needsResume:false});
const sizes=[[360,800],[540,960],[1200,900]] as const;
function result(mode:'standard'|'endless',won=false,overtime=false):GameRun{const state=createRunV18({mode,seed:17,inboundDifficulty:'hard'});return {...state,phase:'result',result:won?'won':'failed',endReason:won?'completed':'blocked',shift:5 as const,completedOrders:won?30:19,overtime};}
function capture(state:GameRun,current:ViewState,name:string,width:number,height:number){
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),scale=Math.min(width/L.width,height/L.height);ctx.translate((width-L.width*scale)/2,(height-L.height*scale)/2);ctx.scale(scale,scale);render(ctx as unknown as CanvasRenderingContext2D,state,current);
 const dir=process.env.WAREHOUSE_LAYOUT_CAPTURE_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}-${width}x${height}.png`,canvas.toBuffer('image/png'));}
}
test('result controls form a uniform stack using only the buttons present, with 44px minimum targets',()=>{
 const outbound=createPlayableRun({family:'outbound',variant:'normal',rulesetVersion:12,seed:17,difficultyId:'hard',toolCharges:{rotate:0,clear:0,wildcard:0}});
 const outboundEndless=createPlayableRun({family:'outbound',variant:'endless',rulesetVersion:13,seed:17,difficultyId:'hard',toolCharges:{rotate:0,clear:0,wildcard:0}});
 assert.ok(isOutboundToolsRun(outbound)&&isOutboundToolsRun(outboundEndless));
 const cases:[string,GameRun][]=[['five-win',result('standard',true)],['five-fail',result('standard')],['infinite',result('endless')],['continued-infinite',result('standard',false,true)],['outbound',{...outbound,phase:'result',result:'won',endReason:'completed'}],['outbound-infinite',{...outboundEndless,phase:'result',result:'failed',endReason:'blocked'}]];
 for(const [name,state] of cases)for(const [width,height] of sizes){const current=view(),controls=getUiControls(state,current),scale=Math.min(width/L.width,height/L.height),sorted=[...controls].sort((a,b)=>a.rect.y-b.rect.y),gaps=sorted.slice(1).map((c,i)=>c.rect.y-sorted[i].rect.y-sorted[i].rect.h);
  assert.ok(controls.length>=2,name);assert.equal(new Set(controls.map(c=>c.rect.h)).size,1,name);assert.ok(controls.every(c=>c.rect.h*scale>=44&&c.rect.w*scale>=44),`${name}: every result target is at least 44 CSS pixels`);assert.ok(gaps.every(gap=>gap>0&&gap===gaps[0]),`${name}: equal positive gaps`);assert.ok(sorted[0].rect.y>1077&&sorted[sorted.length-1].rect.y+sorted[sorted.length-1].rect.h<1780,name);capture(state,current,name,width,height);
 }
});
test('settings controls stay together with and without a recovery row',()=>{
 for(const recovery of [false,true])for(const [width,height] of sizes){const state=result('standard'),current={...view(),screen:'settings' as const,profileNeedsRecovery:recovery},controls=getUiControls(state,current),gaps=controls.slice(1).map((c,i)=>c.rect.y-controls[i].rect.y-controls[i].rect.h);
  assert.deepEqual(controls.map(c=>c.action.type),['toggleMusic','toggleSound','toggleVibration','toggleMotion',...(recovery?['recoverProfile']:[]),'resetProfile','back']);
  assert.ok(controls.every(c=>c.rect.h===144));assert.ok(gaps.every(gap=>gap===36),'settings uses one evenly spaced stack');
  const top=controls[0].rect.y,bottom=controls[controls.length-1].rect.y+controls[controls.length-1].rect.h,scale=Math.min(width/L.width,height/L.height);
  assert.equal((top+bottom)/2,960);assert.equal(top,recovery?348:438);assert.equal(bottom,recovery?1572:1482);assert.ok(controls.every(c=>c.rect.w*scale>=44&&c.rect.h*scale>=44));
  capture(state,current,recovery?'settings-recovery':'settings',width,height);
 }
});
