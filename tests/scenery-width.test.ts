import {prepareArt} from './helpers/static-art-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import {render} from '../src/presentation/renderer.ts';
import type {Rect} from '../src/presentation/layout.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import {drawCosmeticPreview} from '../src/presentation/cosmetic-art.ts';

const renderWithBounds=render as (ctx:CanvasRenderingContext2D,state:ReturnType<typeof createRunV18>,view:ViewState,bounds?:Rect)=>void;
const run=createRunV18({seed:104,mode:'standard',inboundDifficulty:'hard'});
const base=[12,19,28,255];
async function picture(theme:ThemeId,bounds?:Rect,screen:ViewState['screen']='menu'){
 await prepareArt(theme);
 const context=createCanvas(512,768).getContext('2d');context.fillStyle='#0c131c';context.fillRect(0,0,512,768);context.translate(40,0);context.scale(.4,.4);
 const profile=createProfile();profile.cosmetics.theme=theme;
 const view:ViewState={screen,selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile};
 renderWithBounds(context as unknown as CanvasRenderingContext2D,run,view,bounds);return context;
}
const bounds={x:-100,y:0,w:1280,h:1920};
for(const item of COSMETIC_CATALOG.filter(item=>item.kind==='theme'&&!['day','night'].includes(item.id)))test(`${item.id}: available viewport does not stretch the finite classic-sized background frame`,async()=>{
 const theme=item.id as ThemeId,before=await picture(theme),after=await picture(theme,bounds);
 for(const [x,y]of [[0,20],[10,200],[511,600],[505,750]])assert.deepEqual([...after.getImageData(x,y,1,1).data],base,`${item.id}: deep outside stays visible at ${x},${y}`);
 for(const [x,y]of [[20,200],[490,750]])assert.notDeepEqual([...after.getImageData(x,y,1,1).data],base);
 assert.deepEqual(after.getImageData(40,0,432,768).data,before.getImageData(40,0,432,768).data,`${item.id}: original scene and controls must be pixel-identical`);
});
test('classic day and night preserve every pixel including their original outside racks',async()=>{
 for(const theme of ['day','night'] as const)assert.deepEqual((await picture(theme,bounds)).getImageData(0,0,512,768).data,(await picture(theme)).getImageData(0,0,512,768).data);
});
test('game board remains identical and scenery never mutates the run',async()=>{
 const checksum=playableChecksum(run),before=await picture('cold_chain',undefined,'game'),after=await picture('cold_chain',bounds,'game');
 assert.deepEqual(after.getImageData(40,0,432,768).data,before.getImageData(40,0,432,768).data);assert.equal(playableChecksum(run),checksum);
 assert.deepEqual([...after.getImageData(0,400,1,1).data],base);
});
test('bounded shop previews never paint beyond their own rectangle',async()=>{
 await prepareArt('cold_chain');
 const context=createCanvas(400,300).getContext('2d');context.fillStyle='#0c131c';context.fillRect(0,0,400,300);
 drawCosmeticPreview(context as unknown as CanvasRenderingContext2D,{x:40,y:20,w:320,h:232*320/816},{theme:'cold_chain',category:'theme'});
 for(const [x,y]of [[0,100],[39,100],[360,100],[399,100]])assert.deepEqual([...context.getImageData(x,y,1,1).data],base);
});
test('missing or invalid viewport hints preserve the finite frame',async()=>{
 const expected=(await picture('cold_chain')).getImageData(0,0,512,768).data;
 for(const rect of [{x:20,y:0,w:1000,h:1920},{x:NaN,y:0,w:1280,h:1920},{x:-100,y:0,w:Infinity,h:1920}])assert.deepEqual((await picture('cold_chain',rect)).getImageData(0,0,512,768).data,expected);
});
