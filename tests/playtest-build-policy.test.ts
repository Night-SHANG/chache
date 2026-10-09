import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const workspace=await mkdtemp(join(tmpdir(),'warehouse-policy-'));
await Promise.all(['src','scripts','assets','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'].map(path=>cp(path,join(workspace,path),{recursive:true})));
await symlink(join(process.cwd(),'node_modules'),join(workspace,'node_modules'),'dir');
after(()=>rm(workspace,{recursive:true,force:true}));
const run=(...flags:string[])=>spawnSync(process.execPath,['scripts/build.mjs',...flags],{cwd:workspace,encoding:'utf8',timeout:120000});
test('production build rejects explicit free-shop before writing an artifact',()=>{const result=run('--production','--playtest-free-shop');assert.notEqual(result.status,0);assert.match(result.stderr,/production|生产|正式/i);});
test('production build rejects diagnostics before writing an artifact',()=>{const result=run('--production','--diagnostics');assert.notEqual(result.status,0);assert.match(result.stderr,/production|生产|正式/i);});
for(const [name,flags,pricingMode,diagnostics] of [['default',[],'paid',false],['production',['--production'],'paid',false],['free playtest',['--playtest-free-shop'],'playtest-free',false],['diagnostic playtest',['--playtest-free-shop','--diagnostics'],'playtest-free',true]] as const)test(`${name} builds both actual targets with explicit matching shop and audio policy`,async()=>{
 const result=run(...flags);assert.equal(result.status,0,result.stderr);
 const manifests=await Promise.all(['browser','wechat'].map(async target=>JSON.parse(await readFile(join(workspace,'build',target,'build-manifest.json'),'utf8'))));
 for(const manifest of manifests){assert.equal(manifest.shopPricingMode,pricingMode);assert.equal(manifest.developerDiagnostics,diagnostics);assert.equal(manifest.backgroundMusic.defaultVolume,0.18);assert.deepEqual(manifest.soundEffects,{browserVolume:0.45,wechatVolume:1});}
 assert.deepEqual(manifests[0],manifests[1]);
});
