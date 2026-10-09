import './helpers/board-material-atlas-fixture.ts';
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSceneMaterialAtlas } from '../src/presentation/scene-frame-atlas.ts';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createProfile } from '../src/application/profile.ts';
import { createRunV18 } from '../src/domain/v18/engine.ts';
import { render } from '../src/presentation/renderer.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
await loadSceneMaterialAtlas(async path=>await loadImage(new URL('../'+path,import.meta.url).pathname) as unknown as CanvasImageSource);
const baseline=JSON.parse(readFileSync(new URL('./fixtures/v020-initial-scenes.json',import.meta.url),'utf8')) as Record<string,string>;
test('v0.20 initial day and night game scenes preserve all v0.19 pixels including gates and classic cargo',()=>{
 for(const theme of ['day','night'] as const){
  const run=createRunV18({seed:7,mode:'standard',inboundDifficulty:'hard'}),profile=createProfile();profile.cosmetics.theme=theme;
  const view:ViewState={screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile};
  const ctx=createCanvas(1080,1920).getContext('2d');render(ctx as unknown as CanvasRenderingContext2D,run,view);
  assert.equal(createHash('sha256').update(ctx.getImageData(0,0,1080,1920).data).digest('hex'),baseline[theme],theme);
 }
});
