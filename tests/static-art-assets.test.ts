import test from 'node:test';
import assert from 'node:assert/strict';

const manifestUrl = new URL('../src/presentation/static-art-manifest.ts', import.meta.url).href;
const manifest = await import(manifestUrl).catch(() => null);

test('release static artwork manifest covers all current and retired scene and vehicle IDs', () => {
  assert.ok(manifest, 'production static artwork manifest must exist');
  assert.equal(Object.keys(manifest.STATIC_ART_SCENES).length, 17);
  assert.equal(Object.keys(manifest.STATIC_ART_FORKLIFTS).length, 19);
  assert.ok(manifest.STATIC_ART_SCENES.express_sorting);
  assert.ok(manifest.STATIC_ART_FORKLIFTS.compact);
});

test('release static artwork offers all 53 aspect-specific preview backgrounds', () => {
  assert.ok(manifest, 'production static artwork manifest must exist');
  assert.equal(Object.values(manifest.STATIC_ART_PREVIEWS).reduce((n: number, value) => n + Object.keys(value as object).length, 0), 53);
});

const { readFile, mkdtemp, writeFile, rm } = await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { createCanvas } = await import('@napi-rs/canvas');
const png = await import(new URL('../scripts/static-art-authoring/png.mjs', import.meta.url).href);
const generator = await import(new URL('../scripts/generate-static-art.mjs', import.meta.url).href);
const verifier = await import(new URL('../scripts/static-art-assets.mjs', import.meta.url).href);
const frozenAssets = await import(new URL('../scripts/static-art-authoring/src/presentation/assets.ts', import.meta.url).href);
const frozenBoard = await import(new URL('../scripts/static-art-authoring/src/presentation/board-theme.ts', import.meta.url).href);
const frozenGeometry = await import(new URL('../scripts/static-art-authoring/src/presentation/board-geometry.ts', import.meta.url).href);
const frozenTools = await import(new URL('../scripts/static-art-authoring/src/presentation/tool-art.ts', import.meta.url).href);
const root = new URL('../', import.meta.url).pathname;
interface Pixels { width:number; height:number; pixels:Buffer }
interface Rect { x:number; y:number; w:number; h:number }
interface Sprite { resource:string; source:Rect; destination:Rect; rotated90?:boolean }
interface Resource { key:string; src:string; sourcePath:string; package:string; width:number; height:number; sha256:string; bytes:number }
const resourceList = ():Resource[] => Object.values(manifest.STATIC_ART_RESOURCES);
async function image(key:string):Promise<Pixels> { return png.decodePng(await readFile(join(root, manifest.STATIC_ART_RESOURCES[key].sourcePath))); }
function crop(image:Pixels, rect:Rect):Buffer { const output={width:rect.w,height:rect.h,pixels:Buffer.alloc(rect.w*rect.h*4)};png.copyPixels(image,output,rect,0,0);return output.pixels; }

// A one-byte asset mutation, changed rectangle, missing retired ID, or changed authoring source must break these checks.
test('all production PNGs have verified source/encoded/pixel hashes and valid crop rectangles', async () => {
 assert.ok(manifest);
 const result=await verifier.verifyStaticArtAssets(root);
 assert.equal(result.resources,78);
 assert.equal(result.bytes,result.mainBytes+result.cosmeticsBytes);
 assert.equal(result.sourceCommit,'dd847c3174466f0004111b8667a2ff45c563e889');
});

test('package B keeps defaults in main and optional artwork under the local cosmetics root', () => {
 const main=['scene.day','scene.night','forklift.base','cargo.core','tools.core','frame.classic','material.board'];
 for(const resource of resourceList()) {
  assert.equal(resource.package,main.includes(resource.key)?'main':'cosmetics');
  assert.equal(resource.src,resource.package==='main'?resource.sourcePath:`cosmetics/${resource.sourcePath}`);
  assert.equal(resource.src.includes('://'),false);
 }
 assert.equal(manifest.STATIC_ART_FORKLIFTS.compact.resource,'forklift.styled');
});

test('lossless PNG optimization preserves every RGBA byte including transparent pixel color', () => {
 const pixels=Buffer.alloc(19*13*4);for(let i=0;i<pixels.length;i++)pixels[i]=(i*67+11)%256;
 const original={width:19,height:13,pixels};
 const first=png.encodePng(original),second=png.optimizePng(first);
 assert.deepEqual(png.decodePng(second),original);
 assert.deepEqual(png.encodePng(original),first);
 const corrupt=Buffer.from(first);corrupt[corrupt.length-5]^=1;
 assert.throws(()=>png.decodePng(corrupt),/CRC mismatch/);
});

test('repeat generation reproduces every committed PNG byte in the pinned authoring environment', async () => {
 const generated=await generator.generateStaticArt({write:false});
 for(const resource of resourceList()) {
  assert.equal(generated.resources[resource.key].sha256,resource.sha256,resource.key);
  assert.deepEqual(generated.buffers.get(resource.key),await readFile(join(root,resource.sourcePath)),resource.key);
 }
});

test('forklift atlas cells are exact frozen painter renders with transparent safety gutters', async () => {
 for(const [paint,value] of Object.entries(manifest.STATIC_ART_FORKLIFTS)) {
  const sprite=value as Sprite,atlas=await image(sprite.resource),canvas=createCanvas(256,192),ctx=canvas.getContext('2d');
  frozenAssets.forklift(ctx,120,88,220,0,paint);
  const expected=png.decodePng(canvas.toBuffer('image/png'));
  assert.deepEqual(crop(atlas,sprite.source),expected.pixels,paint);
  for(let x=0;x<256;x++){assert.equal(expected.pixels[x*4+3],0,`${paint} top gutter`);assert.equal(expected.pixels[((191*256)+x)*4+3],0,`${paint} bottom gutter`);}
  for(let y=0;y<192;y++){assert.equal(expected.pixels[y*256*4+3],0,`${paint} left gutter`);assert.equal(expected.pixels[(y*256+255)*4+3],0,`${paint} right gutter`);}
 }
});

test('core cargo and tool cells retain exact original shapes with dynamic waste text excluded', async () => {
 const cargoAtlas=await image('cargo.core');
 for(const [id,value] of Object.entries(manifest.STATIC_ART_CARGO)) {
  const sprite=value as Sprite,canvas=createCanvas(256,256),ctx=canvas.getContext('2d');ctx.scale(2,2);
  if(id==='outline'){ctx.translate(6,6);frozenAssets.roundedPath(ctx,3,3,104,104,8);ctx.strokeStyle='#172635';ctx.lineWidth=11;ctx.stroke();ctx.strokeStyle='#fff6d6';ctx.lineWidth=5;ctx.stroke();}
  else if(id==='waste'){ctx.fillText=()=>{};frozenAssets.cargoBox(ctx,'cargo.food',6,6,110,1,{kind:'waste'});}
  else frozenAssets.cargoBox(ctx,id,6,6,110);
  assert.deepEqual(crop(cargoAtlas,sprite.source),png.decodePng(canvas.toBuffer('image/png')).pixels,id);
 }
 const toolsAtlas=await image('tools.core');
 for(const [id,value] of Object.entries(manifest.STATIC_ART_TOOLS)) {
  const canvas=createCanvas(256,256),ctx=canvas.getContext('2d');
  if(id==='toolbox')frozenTools.drawToolboxIcon(ctx,0,0,256);else frozenTools.drawToolIcon(ctx,id,0,0,256);
  assert.deepEqual(crop(toolsAtlas,(value as Sprite).source),png.decodePng(canvas.toBuffer('image/png')).pixels,id);
 }
});

test('clockwise-packed classic frame strips restore exactly with all corner rivets', async () => {
 const atlas=await image('frame.classic');
 for(const theme of ['day','night']) {
  const restored={width:1080,height:1920,pixels:Buffer.alloc(1080*1920*4)};
  for(const value of manifest.STATIC_ART_FRAMES[theme]) {
   const sprite=value as Sprite,{source:s,destination:d}=sprite;
   for(let y=0;y<d.h;y++)for(let x=0;x<d.w;x++) {
    const sx=s.x+(sprite.rotated90?d.h-1-y:x),sy=s.y+(sprite.rotated90?x:y),from=(sy*atlas.width+sx)*4,to=((d.y+y)*1080+d.x+x)*4;
    atlas.pixels.copy(restored.pixels,to,from,from+4);
   }
  }
  const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d');frozenBoard.drawThemedBoard(ctx,frozenGeometry.boardGeometry(),theme);ctx.clearRect(120,560,840,840);
  assert.equal(png.sha256(restored.pixels),png.sha256(png.decodePng(canvas.toBuffer('image/png')).pixels),theme);
 }
});

test('classic scenes retain transparent rack gaps while every preview background is opaque', async () => {
 for(const theme of ['day','night']) {
  const scene=await image(`scene.${theme}`);
  assert.equal(scene.pixels[3],0,`${theme} outer gap`);
  assert.equal(scene.pixels[(540*4)+3],255,`${theme} center backdrop`);
 }
 for(const resource of resourceList().filter(item=>item.key.startsWith('preview.'))) {
  const decoded=await image(resource.key);for(let i=3;i<decoded.pixels.length;i+=4)assert.equal(decoded.pixels[i],255,`${resource.key} unexpected transparent hole`);
 }
});

test('verification rejects a corrupt packaged image before runtime', async () => {
 const temp=await mkdtemp(join(tmpdir(),'static-art-corrupt-'));
 try {
  // The first resource exists at its runtime path but its bytes cannot match the manifest.
  const {mkdir}=await import('node:fs/promises');await mkdir(join(temp,'assets/static-art'),{recursive:true});
  await writeFile(join(temp,'assets/static-art/scene-day.png'),Buffer.from('corrupt'));
  await assert.rejects(()=>verifier.verifyStaticArtAssets(temp,{verifySources:false,runtimePaths:true}),/Static art hash mismatch: scene.day/);
 } finally { await rm(temp,{recursive:true,force:true}); }
});

test('verification binds the runtime manifest and crop mappings to the generation manifest at its requested source root', async () => {
 const temp=await mkdtemp(join(tmpdir(),'static-art-manifest-'));
 try {
  const {mkdir}=await import('node:fs/promises');
  await mkdir(join(temp,'scripts/static-art-authoring'),{recursive:true});await mkdir(join(temp,'src/presentation'),{recursive:true});
  const sourceManifest=await readFile(join(root,'scripts/static-art-authoring/resources.json'),'utf8');
  const runtimeManifest=await readFile(join(root,'src/presentation/static-art-manifest.ts'),'utf8');
  await writeFile(join(temp,'scripts/static-art-authoring/resources.json'),sourceManifest);
  await writeFile(join(temp,'src/presentation/static-art-manifest.ts'),runtimeManifest.replace('"w": 1205','"w": 1204'));
  await assert.rejects(()=>verifier.verifyStaticArtAssets(temp,{verifySources:false}),/Static art runtime manifest mismatch/);
  await writeFile(join(temp,'src/presentation/static-art-manifest.ts'),runtimeManifest);
  await writeFile(join(temp,'scripts/static-art-authoring/resources.json'),sourceManifest.replace('"w": 1205','"w": 1204'));
  await assert.rejects(()=>verifier.verifyStaticArtAssets(temp,{verifySources:false}),/Static art runtime manifest mismatch/);
 } finally {await rm(temp,{recursive:true,force:true});}
});

test('lossless generated PNGs retain the original explicit sRGB color interpretation', () => {
 const encoded=png.encodePng({width:1,height:1,pixels:Buffer.from([12,34,56,128])});
 let intent:Buffer|undefined;for(let offset=8;offset<encoded.length;){const length=encoded.readUInt32BE(offset);if(encoded.toString('ascii',offset+4,offset+8)==='sRGB')intent=encoded.subarray(offset+8,offset+8+length);offset+=length+12;}
 assert.deepEqual(intent,Buffer.from([0]));
});
