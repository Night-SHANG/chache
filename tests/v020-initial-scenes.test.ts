// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import './helpers/board-material-atlas-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSceneMaterialAtlas } from '../scripts/static-art-authoring/src/presentation/scene-frame-atlas.ts';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createProfile } from '../scripts/static-art-authoring/src/application/profile.ts';
import { createRunV18 } from '../scripts/static-art-authoring/src/domain/v18/engine.ts';
import { render } from '../scripts/static-art-authoring/src/presentation/renderer.ts';
import type { ViewState } from '../scripts/static-art-authoring/src/presentation/view-types.ts';
await loadSceneMaterialAtlas(async path=>await loadImage(new URL('../'+path,import.meta.url).pathname) as unknown as CanvasImageSource);
const baseline=JSON.parse(readFileSync(new URL('./fixtures/v020-initial-scenes.json',import.meta.url),'utf8')) as Record<string,string>;
test('v0.20 scenes preserve all historical pixels after normalizing only the approved v1.0.3 title rename',()=>{
 for(const theme of ['day','night'] as const){
  const run=createRunV18({seed:7,mode:'standard',inboundDifficulty:'hard'}),profile=createProfile();profile.cosmetics.theme=theme;
  const view:ViewState={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile};
  const ctx=createCanvas(1080,1920).getContext('2d'),fill=ctx.fillText.bind(ctx),stroke=ctx.strokeText.bind(ctx);
  let titleFills=0,titleStrokes=0;
  // Preserve the original whole-scene fixture. Only this exact title call is normalized;
  // game-title.test.ts separately verifies the real new text, coordinates and font size.
  ctx.fillText=(value,x,y,...rest)=>{if(value==='货箱'&&x===49&&y===112&&ctx.font.includes('115px')){titleFills++;value='爆仓';}return fill(value,x,y,...rest);};
  ctx.strokeText=(value,x,y,...rest)=>{if(value==='货箱'&&((x===49&&y===112)||(x===51&&y===118))&&ctx.font.includes('115px')){titleStrokes++;value='爆仓';}return stroke(value,x,y,...rest);};
  render(ctx as unknown as CanvasRenderingContext2D,run,view);
  assert.equal(titleFills,1);assert.equal(titleStrokes,2);
  assert.equal(createHash('sha256').update(ctx.getImageData(0,0,1080,1920).data).digest('hex'),baseline[theme],theme);
 }
});
