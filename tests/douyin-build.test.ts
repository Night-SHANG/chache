import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access,mkdtemp,cp,symlink,appendFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {SOUND_NAMES} from '../src/platform/types.ts';
import {loadSoundAsset} from '../scripts/sound-assets.ts';

test('Douyin standalone build preserves the existing three targets, common audio and static PNGs',async()=>{
 const protectedFiles=['build/browser/app.js','build/wechat/game.js'];
 const before=await Promise.all(protectedFiles.map(path=>readFile(path)));
 const built=spawnSync(process.execPath,['scripts/build-douyin.mjs'],{encoding:'utf8'});
 assert.equal(built.status,0,built.stdout+built.stderr);
 for(const [index,path] of protectedFiles.entries())assert.deepEqual(await readFile(path),before[index],path);
 const config=JSON.parse(await readFile('build/douyin/game.json','utf8'));
 assert.equal(config.deviceOrientation,'portrait');assert.equal(config.subpackages,undefined);
 const project=JSON.parse(await readFile('build/douyin/project.config.json','utf8'));
 assert.equal(project.appid,'ttfa0f8cb26476311702');assert.equal(project.compileType,'game');
 for(const name of SOUND_NAMES)assert.deepEqual(await readFile(`build/douyin/assets/${name}.wav`),loadSoundAsset(name),name);
 const manifest=JSON.parse(await readFile('build/douyin/build-manifest.json','utf8'));
 assert.deepEqual(manifest.audio,{source:'common',platformAdditionalGainDb:0,effectsPlaybackVolume:1,perSoundGain:false,musicLevels:'shared',calibratedOnDevice:false});
 assert.equal(manifest.platform,'douyin');assert.equal(manifest.sourceContentVersion,'1.0.22');
 assert.equal(manifest.developerDiagnostics,false);assert.equal(manifest.shopPricingMode,'paid');
 assert.equal(manifest.validation.douyinIDE,'NOT RUN');assert.equal(manifest.validation.androidDevice,'NOT RUN');
 assert.equal(manifest.validation.iosDevice,'NOT RUN');assert.equal(manifest.package.subpackages,false);
 const game=await readFile('build/douyin/game.js','utf8');
 assert.equal(manifest.gameSha256,createHash('sha256').update(game).digest('hex'));
 assert.doesNotMatch(game,/\bwx\b|\bdocument\b|\blocalStorage\b|\.clip\s*\(|lineDashOffset|isPointInPath|loadSubpackage/);
 await access('build/douyin/SHA256SUMS');
 const verified=spawnSync(process.execPath,['scripts/verify-douyin-build.mjs'],{encoding:'utf8'});
 assert.equal(verified.status,0,verified.stdout+verified.stderr);
});

test('Douyin verifier rejects an altered audio policy, tampered media and extra unlisted files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'douyin-package-tamper-'));
 try{
  await cp('build/douyin',dir,{recursive:true});
  const manifest=JSON.parse(await readFile(join(dir,'build-manifest.json'),'utf8'));manifest.audio.effectsPlaybackVolume=0.45;
  await writeFile(join(dir,'build-manifest.json'),JSON.stringify(manifest));
  let result=spawnSync(process.execPath,['scripts/verify-douyin-build.mjs',dir],{encoding:'utf8'});
  assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stdout+result.stderr,/audio playback policy/i);
  await cp('build/douyin/build-manifest.json',join(dir,'build-manifest.json'));
  await appendFile(join(dir,'assets/place.wav'),'tampered');
  result=spawnSync(process.execPath,['scripts/verify-douyin-build.mjs',dir],{encoding:'utf8'});
  assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stdout+result.stderr,/checksum|audio|hash/i);
  await cp('build/douyin/assets/place.wav',join(dir,'assets/place.wav'));
  await writeFile(join(dir,'unlisted.js'),'console.log("unexpected")');
  result=spawnSync(process.execPath,['scripts/verify-douyin-build.mjs',dir],{encoding:'utf8'});
  assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stdout+result.stderr,/inventory|unlisted/i);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Douyin release packaging requires a real AppID instead of inventing one',()=>{
 const result=spawnSync(process.execPath,['scripts/build-douyin.mjs','--release'],{encoding:'utf8',env:{...process.env,DOUYIN_APP_ID:''}});
 assert.notEqual(result.status,0);assert.match(result.stdout+result.stderr,/DOUYIN_APP_ID/);
});

test('Douyin build fails closed on unsupported Canvas calls and preserves the previous independent package',async()=>{
 const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'douyin-forbidden-api-'));
 try{
  await cp('src',join(dir,'src'),{recursive:true});
  for(const path of ['scripts','assets','douyin','douyin-tools','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'])await symlink(resolve(root,path),join(dir,path));
  await mkdir(join(dir,'build/douyin'),{recursive:true});
  await writeFile(join(dir,'build/douyin/previous.txt'),'previous verified local package');
  await appendFile(join(dir,'src/douyin-main.ts'),'\ntt.createCanvas().getContext("2d").clip();\n');
  const result=spawnSync(process.execPath,[join(root,'scripts/build-douyin.mjs')],{cwd:dir,encoding:'utf8'});
  assert.equal(result.status,1,result.stdout+result.stderr);
  assert.match(result.stdout+result.stderr,/Douyin forbidden Canvas API: clip/);
  assert.equal(await readFile(join(dir,'build/douyin/previous.txt'),'utf8'),'previous verified local package');
 }finally{await rm(dir,{recursive:true,force:true});}
});
