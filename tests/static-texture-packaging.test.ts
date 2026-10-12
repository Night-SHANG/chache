import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,symlink,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

test('production texture packages are fresh, fully local, verified and correctly split',async()=>{
 const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'warehouse-static-packages-'));
 try{
  for(const path of ['src','scripts','assets','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'])await symlink(resolve(root,path),join(dir,path));
  await mkdir(join(dir,'build/wechat/assets'),{recursive:true});await writeFile(join(dir,'build/wechat/assets/stale.png'),'stale');
  const result=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs'),'--production'],{cwd:dir,encoding:'utf8',timeout:120000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const read=(path:string)=>readFile(join(dir,'build/wechat',path));
  const config=JSON.parse((await read('game.json')).toString());assert.deepEqual(config.subpackages,[{name:'cosmetics',root:'cosmetics/'}]);
  const project=JSON.parse((await read('project.config.json')).toString());assert.equal(project.setting.minified,true);
  assert.equal(project.setting.automaticCompression,undefined,'No undocumented compression field');
  const files=async(path:string):Promise<string[]>=>{const entries=await readdir(join(dir,'build/wechat',path),{withFileTypes:true});return(await Promise.all(entries.map(e=>e.isDirectory()?files(path+e.name+'/'):[path+e.name]))).flat().sort();};
  const inventory=await files('');assert.ok(!inventory.includes('assets/stale.png'));
  assert.ok(inventory.includes('cosmetics/game.js'));assert.ok(!inventory.includes('assets/themed-forklifts.png'));assert.ok(!inventory.includes('UI_SOUND_LICENSE.pdf'));
  for(const required of ['UI_SOUND_CC0.txt','UI_SOUND_NOTICE.txt','MUSIC_LICENSE.txt','assets/bgm.mp3'])assert.ok(inventory.includes(required),required);
  const manifest=JSON.parse((await read('build-manifest.json')).toString());assert.equal(manifest.version,'1.0.13');
  const spec=manifest.staticArt;assert.ok(spec.resources.length>=78);assert.equal(spec.offlineAuthoring,true);assert.equal(spec.runtimeOffscreenStaticArt,false);
  for(const resource of spec.resources){
   const bytes=await read(resource.src);assert.equal(createHash('sha256').update(bytes).digest('hex'),resource.sha256,resource.key);
   assert.deepEqual(bytes,await readFile(join(dir,'build/browser',resource.src)),resource.src);
   assert.equal(resource.src.startsWith('cosmetics/'),resource.package==='cosmetics',resource.key);
  }
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='scene.day').package,'main');
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='scene.night').package,'main');
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='forklift.base').package,'main');
  assert.equal(spec.resources.find((r:{key:string})=>r.key==='scene.harbor').package,'cosmetics');
  const sizes=await Promise.all(inventory.map(async path=>({path,bytes:(await read(path)).length})));
  const main=sizes.filter(f=>!f.path.startsWith('cosmetics/')).reduce((sum,f)=>sum+f.bytes,0),sub=sizes.filter(f=>f.path.startsWith('cosmetics/')).reduce((sum,f)=>sum+f.bytes,0);
  assert.ok(main<3.2*1024*1024,`main ${main} exceeds headroom target`);assert.ok(sub<4*1024*1024);assert.ok(main+sub<30*1024*1024);
  const budget=JSON.parse((await readFile(join(dir,'build/wechat-package-sizes.json'))).toString());assert.equal(budget.mainBytes,main);assert.equal(budget.subpackageBytes.cosmetics,sub);assert.equal(budget.processedIdeBytes,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
