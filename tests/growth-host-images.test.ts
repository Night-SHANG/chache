import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,Image} from '@napi-rs/canvas';
import {createPackagedImageLoader} from '../scripts/growth-host-support.mjs';

test('native image loader decodes packaged PNG bytes and nine-argument drawing preserves transparent pixels',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-native-image-'));
 try{await mkdir(join(root,'assets'));const source=createCanvas(4,2),ctx=source.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,2,2);ctx.fillStyle='rgba(0,0,255,.5)';ctx.fillRect(2,0,1,2);const bytes=source.toBuffer('image/png');await writeFile(join(root,'assets/cargo-materials.png'),bytes);
  const loader=createPackagedImageLoader(root),image=loader.create();let ready=0;image.onload=()=>{ready++;};image.src='assets/cargo-materials.png';await loader.settle();assert.equal(ready,1);assert.ok(image instanceof Image);assert.equal(image.width,4);assert.equal(image.height,2);
  const target=createCanvas(8,4),draw=target.getContext('2d');draw.imageSmoothingEnabled=false;draw.drawImage(image,2,0,2,2,0,0,8,4);const pixel=(x:number)=>Array.from(draw.getImageData(x,1,1,1).data);assert.deepEqual(pixel(1),[0,0,255,127]);assert.deepEqual(pixel(6),[0,0,0,0]);
  assert.equal(loader.trace[0].sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(loader.trace[0].status,'loaded');assert.equal(loader.trace[0].width,4);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('deferred image loading exposes a genuine not-ready phase then fires onload once for the same native object',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-native-deferred-'));
 try{const bytes=createCanvas(2,3).toBuffer('image/png');await writeFile(join(root,'atlas.png'),bytes);const loader=createPackagedImageLoader(root,{defer:true}),image=loader.create();let loaded=0;image.onload=()=>{loaded++;};image.src='atlas.png';await Promise.resolve();assert.equal(loaded,0);assert.equal(image.width,0);assert.equal(loader.trace[0].status,'pending');await loader.settle();await loader.settle();assert.equal(loaded,1);assert.equal(image.height,3);}
 finally{await rm(root,{recursive:true,force:true});}
});
test('missing, invalid, external and escaping images deliver onerror without pretending the atlas loaded',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-native-failure-'));
 try{await writeFile(join(root,'invalid.png'),'invalid png');const loader=createPackagedImageLoader(root);let errors=0,loads=0;
  for(const path of ['missing.png','invalid.png','https://example.test/atlas.png','../escape.png']){const image=loader.create();image.onload=()=>{loads++;};image.onerror=()=>{errors++;};image.src=path;}
  await loader.settle();assert.equal(errors,4);assert.equal(loads,0);assert.equal(loader.trace.length,4);assert.ok(loader.trace.every(row=>row.status==='error'));assert.equal(loader.trace.filter(row=>row.sha256).length,1,'Only local invalid bytes were read; no external/escaping read');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('labelled load-failure injection reads and hashes the real local asset but emits only onerror',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-native-injected-'));
 try{const bytes=createCanvas(2,2).toBuffer('image/png');await writeFile(join(root,'atlas.png'),bytes);const loader=createPackagedImageLoader(root,{rejectLoads:true}),image=loader.create();let failed=0,loaded=0;image.onload=()=>{loaded++;};image.onerror=()=>{failed++;};image.src='atlas.png';await loader.settle();assert.equal(failed,1);assert.equal(loaded,0);assert.equal(loader.trace[0].status,'error');assert.equal(loader.trace[0].injectedFailure,true);assert.equal(loader.trace[0].sha256,createHash('sha256').update(bytes).digest('hex'));}
 finally{await rm(root,{recursive:true,force:true});}
});
