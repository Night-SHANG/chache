import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {createProfile} from '../src/application/profile.ts';
import type {ThemeId} from '../src/application/profile.ts';
import {createRunV18} from '../src/domain/v18/engine.ts';
import {render} from '../src/presentation/renderer.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

const width=1356,height=660,scale=height/1920,ox=(width-1080*scale)/2;
function picture(theme:ThemeId){
 const c=createCanvas(width,height).getContext('2d');c.fillStyle='#0c131c';c.fillRect(0,0,width,height);c.translate(ox,0);c.scale(scale,scale);
 const profile=createProfile();profile.cosmetics.theme=theme;
 const view:ViewState={screen:'menu',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile};
 render(c as unknown as CanvasRenderingContext2D,createRunV18({seed:106,mode:'standard',inboundDifficulty:'hard'}),view,{x:-ox/scale,y:0,w:width/scale,h:1920});return c;
}
function extent(c:ReturnType<typeof picture>){
 const p=c.getImageData(0,0,width,height).data;let left=width,right=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;if(p[i]!==12||p[i+1]!==19||p[i+2]!==28||p[i+3]!==255){left=Math.min(left,x);right=Math.max(right,x);}}
 return {left,right};
}
const classic=extent(picture('day'));
test('classic painted envelope is determined by original rack and shelf geometry',()=>{
 // renderer: origins -56/963, body width185, shelf left offset -1.
 assert.deepEqual(classic,{left:Math.floor(ox-57*scale),right:Math.ceil(ox+1148*scale)-1});
});
for(const item of COSMETIC_CATALOG.filter(item=>item.kind==='theme'&&!['day','night'].includes(item.id)))test(`${item.id}: one finite scene has the same painted width as classic, with deep platform background outside`,()=>{
 const c=picture(item.id as ThemeId);
 assert.deepEqual(extent(c),classic,`${item.id}: background frame must match classic, not fill the window`);
 for(const x of [0,classic.left-2,classic.right+2,width-1])for(const y of [0,34,200,height-1])assert.deepEqual([...c.getImageData(x,y,1,1).data],[12,19,28,255]);
});
