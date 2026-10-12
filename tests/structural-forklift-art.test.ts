// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { forklift } from '../scripts/static-art-authoring/src/presentation/assets.ts';
import { loadThemedForkliftAtlas } from '../scripts/static-art-authoring/src/presentation/themed-forklift-art.ts';
import type { ForkliftId } from '../scripts/static-art-authoring/src/application/profile.ts';

const active: ForkliftId[] = ['electric','heavy','toy','paper','space','steam','neon','lava','diving','royal','field','timber','ice','harbor'];
const retained = {
 yellow: '1d03099b9b1f2520d49f83083c272630e8b3b87e00071aefe3c2cd62d54a08f9',
 blue: '9714724682937d794f2096836bfcb5965beea96583e6e2dd320f1064d75fc09a',
 red: 'a16cd30992db4fff25138774167493d1773aabda3f3519bd0819ca8005cb7caf',
 white: '8d57103db1bf9a10424a87f3c6f8c71d02a389fd1eaef68127d3c3aec454c4c0',
 electric: '326fd80275069f15f43e1d19e33ab8d9bc334a217926ba727d34a18ec52c6b31',
 toy: '50abcd26ba4833f42c2f08234b30f6213e1aaf5132aa7a60b5302101d5a808a1',
 paper: 'fae51304767b2baf0f62724ddc08c658a057bf5e45948032cbd9764a8fada8a3',
 space: 'eac8d38a9d84f293a0398fc4febbd0c15ac0758a81a5d32731adc630933fc8f1',
};
const hash = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
function render(paint: ForkliftId, size = 110, angle = 0) {
 const ctx = createCanvas(180, 180).getContext('2d');
 forklift(ctx as unknown as CanvasRenderingContext2D, 90, 90, size, angle, paint);
 return ctx.getImageData(0, 0, 180, 180).data;
}
test('v024 four basic models and four arrow-selected old vector designs retain exact pixels with the atlas loaded', async () => {
 await loadThemedForkliftAtlas(async path => await loadImage(new URL(`../${path}`, import.meta.url).pathname) as unknown as CanvasImageSource);
 for (const [paint, expected] of Object.entries(retained)) {
  const ctx = createCanvas(384, 384).getContext('2d');
  for (let i = 0; i < 16; i++) forklift(ctx as unknown as CanvasRenderingContext2D, 48 + i % 4 * 96, 48 + Math.floor(i / 4) * 96, [29,37,44,80][i % 4], Math.floor(i / 4) * Math.PI / 2, paint as ForkliftId);
  assert.equal(hash(ctx.getImageData(0,0,384,384).data), expected, `${paint}: immutable baseline pixels`);
 }
});
test('all fourteen active styled vehicles are native vector designs independent of optional raster loading', async () => {
 await loadThemedForkliftAtlas(async () => { throw Error('offline'); });
 const before = active.map(paint => hash(render(paint)));
 await loadThemedForkliftAtlas(async () => createCanvas(2048,128) as unknown as CanvasImageSource);
 for (const [i, paint] of active.entries()) assert.equal(hash(render(paint)), before[i], `${paint}: loading an empty atlas cannot replace the vehicle`);
});
test('all fourteen active styles have distinct opaque silhouettes even without color or small surface details', () => {
 for (const size of [29,37,44,80]) {
  const masks = active.map(paint => {
   const rgba = render(paint, size), alpha = new Uint8ClampedArray(rgba.length / 4);
   for (let i=0;i<alpha.length;i++) alpha[i] = rgba[i*4+3] >= 240 ? 255 : 0;
   return hash(alpha);
  });
  assert.equal(new Set(masks).size, active.length, `${size}px: silhouettes must differ independently of paint`);
 }
});
test('all eighteen active v024 bodies preserve envelope, forward forks and load space at five sizes and 32 headings', () => {
 for (const size of [29,37,44,80,110]) for (let heading=0;heading<32;heading++) {
  const angle=heading*Math.PI/16;
  const original = render('yellow',size,angle);
  const bounds=(data:Uint8ClampedArray)=>{const b=[180,180,-1,-1];for(let i=0;i<180*180;i++)if(data[i*4+3]){const x=i%180,y=Math.floor(i/180);b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b;};
  const limit=bounds(original);
  for (const paint of ['yellow','blue','red','white',...active] as ForkliftId[]) {
   const next = render(paint,size,angle),extent=bounds(next);
   assert.ok(extent[0]>=limit[0]&&extent[1]>=limit[1]&&extent[2]<=limit[2]&&extent[3]<=limit[3],`${paint}/${size}/${heading}: unchanged rotated envelope`);
   for (let y=0;y<180;y++) for(let x=0;x<180;x++) {
    const localX=((x+.5-90)*Math.cos(angle)+(y+.5-90)*Math.sin(angle))*110/size;
    if(localX<39)continue;
    const p=(y*180+x)*4;
    for(let c=0;c<4;c++)assert.equal(next[p+c],original[p+c],`${paint}/${size}/${angle}: fork pixel ${x},${y}/${c}`);
   }
  }
 }
});
