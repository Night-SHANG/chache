import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,symlink,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('production texture packages are fresh, fully local, verified and explicitly single-package',async t=>{
 const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'warehouse-static-packages-'));
 try{
  for(const path of ['src','scripts','assets','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'])await symlink(resolve(root,path),join(dir,path));
  await mkdir(join(dir,'build/wechat/assets'),{recursive:true});await writeFile(join(dir,'build/wechat/assets/stale.png'),'stale');
  const result=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs'),'--production'],{cwd:dir,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const read=(path:string)=>readFile(join(dir,'build/wechat',path));
  const config=JSON.parse((await read('game.json')).toString());assert.equal(config.subpackages,undefined);assert.equal(config.subPackages,undefined);
  const project=JSON.parse((await read('project.config.json')).toString());assert.equal(project.setting.minified,true);
  assert.equal(project.setting.automaticCompression,undefined,'No undocumented compression field');
  const files=async(path:string):Promise<string[]>=>{const entries=await readdir(join(dir,'build/wechat',path),{withFileTypes:true});return(await Promise.all(entries.map(e=>e.isDirectory()?files(path+e.name+'/'):[path+e.name]))).flat().sort();};
  const inventory=await files('');assert.ok(!inventory.includes('assets/stale.png'));
  assert.ok(inventory.every(path=>!path.startsWith('cosmetics/')));assert.equal(inventory.filter(path=>path.endsWith('.png')).length,17);assert.ok(inventory.every(path=>!/preview-.+-(item|card|set|classic)\.png|(?:scene|preview)-(express_sorting|neon_depot|field_station|harbor|royal_store|ice_vault|forest_depot|lava_forge)(?:-item)?\.png/.test(path)));assert.ok(!inventory.includes('assets/themed-forklifts.png'));assert.ok(!inventory.includes('UI_SOUND_LICENSE.pdf'));
  for(const required of ['UI_SOUND_CC0.txt','UI_SOUND_NOTICE.txt','MUSIC_LICENSE.txt','assets/bgm.mp3'])assert.ok(inventory.includes(required),required);
  const manifest=JSON.parse((await read('build-manifest.json')).toString());assert.equal(manifest.version,'1.0.18');
  const spec=manifest.staticArt;assert.equal(spec.resources.length,17);assert.equal(spec.offlineAuthoring,true);assert.equal(spec.runtimeOffscreenStaticArt,false);
  for(const resource of spec.resources){
   const bytes=await read(resource.src);assert.equal(createHash('sha256').update(bytes).digest('hex'),resource.sha256,resource.key);
   assert.deepEqual(bytes,await readFile(join(dir,'build/browser',resource.src)),resource.src);
   assert.equal(resource.package,'main',resource.key);assert.equal(resource.src,resource.sourcePath,resource.key);assert.ok(resource.src.startsWith('assets/'),resource.key);
  }
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='scene.day').package,'main');
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='scene.night').package,'main');
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='forklift.base').package,'main');
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='scene.harbor'),undefined);
  assert.doesNotMatch((await read('game.js')).toString(),/\bloadSubpackage\b/);
  const sizes=await Promise.all(inventory.map(async path=>({path,bytes:(await read(path)).length})));
  const main=sizes.reduce((sum,f)=>sum+f.bytes,0);
  const overLimit=main>4*1024*1024;assert.ok(main<30*1024*1024);
  if(overLimit)assert.match(result.stderr,/WARNING: single-package raw directory/);else assert.doesNotMatch(result.stderr,/WARNING: single-package raw directory/);
  t.diagnostic(`Verified single-package raw directory: ${main} bytes; 4 MiB limit exceeded: ${overLimit}`);
  const budget=JSON.parse((await readFile(join(dir,'build/wechat-package-sizes.json'))).toString());assert.equal(budget.mainBytes,main);assert.equal(budget.totalBytes,main);assert.equal(budget.packaging,'single');assert.deepEqual(budget.subpackageBytes,{});assert.equal(budget.rawMainPackageOverLimit,overLimit);assert.equal(budget.rawMainPackageOverLimitBytes,Math.max(0,main-4*1024*1024));assert.equal(budget.processedIdeBytes,null);assert.match(budget.processedIdeStatus,/NOT RUN/);assert.deepEqual(budget.inventory,sizes);
 }finally{await rm(dir,{recursive:true,force:true});}
});
