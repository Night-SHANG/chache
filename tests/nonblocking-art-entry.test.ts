import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm,cp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {androidBundleOptions} from '../scripts/android-bundle-options.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
// Exact production entry, native PNG/Canvas, controlled image completion.
const hostModule='../scripts/v116-transition-host.mjs';
const {createV116TransitionHost}=await import(hostModule);
for(const target of ['browser','wechat','android'] as const)test(`${target} first frame and every pending or failed image frame remain playable without an art gate`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nonblocking-art-'));
 try {
  const bundlePath=join(dir,'app.js');
  await build({...androidBundleOptions(),entryPoints:[`src/${target}-main.ts`],outfile:bundlePath});
  for(const resource of Object.values(STATIC_ART_RESOURCES)){const destination=join(dir,resource.src);await mkdir(resolve(destination,'..'),{recursive:true});await cp(resource.sourcePath,destination);}
  const host=await createV116TransitionHost({target,bundlePath,rejectImageLoads:()=>true});
  const check=()=>{const frame=host.frame();assert.equal(frame.cover,false,'platform-ready Android must not wait for art');assert.ok(frame.texts.includes('入库模式'),'the actual menu must paint before any PNG resolves');assert.ok(!frame.texts.some((s:string)=>/加载|准备预览/.test(s)));return frame;};
  const first=check();assert.equal(first.draws.length,0,'all PNG completions are deliberately held');
  const before=host.storageSnapshot();
  for(let n=0;host.pendingImages().length&&n<20;n++){await host.decodeNext();check();}
  assert.equal(host.pendingImages().length,0);assert.equal(host.storageSnapshot(),before,'image errors alone must not write a save');
  host.callbacks.hide();host.callbacks.show();check();
  assert.equal(host.canvasCount,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
