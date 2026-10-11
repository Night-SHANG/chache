import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const source=resolve(process.argv[2]??'.'),build=resolve(process.argv[3]??`${source}/build`),out=resolve(process.argv[4]??'.');
const base='7e187152d47ecbf35cccfafe4a6fede88999323b',product='c454dce197c8ba2ebc3a7e8ed54ed5aaf565c255',sourceExpected='c5b84f0fbd7439ce3778b7ee1d290f87040d10280de6e837cb2e4b59a269f347';
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){if(item.name==='__pycache__'||item.name.endsWith('.pyc'))continue;const path=join(dir,item.name);result.push(...(item.isDirectory()?await files(path):[relative(source,path)]));}return result;}
const paths=[...await files(join(source,'src')),...await files(join(source,'scripts')),...await files(join(source,'assets')),'package.json','package-lock.json'].sort(),hash=createHash('sha256');
for(const path of paths){hash.update(path);hash.update(await readFile(join(source,path)));}const sourceSha256=hash.digest('hex');assert.equal(sourceSha256,sourceExpected);
const changed=git('diff','--name-only',base,product,'--','src','assets').split('\n');assert.deepEqual(changed,['assets/audio/ui-click/NOTICE.txt','assets/audio/ui-click/provenance.json','assets/audio/ui-click/ui_click.wav','src/platform/browser.ts','src/platform/wechat.ts','src/shared/ui-click-level.ts']);
const original12CueGeneratorByteIdentical=git('diff',base,product,'--','scripts/audio.ts')==='';assert.ok(original12CueGeneratorByteIdentical);
const protectedPaths=git('ls-tree','-r','--name-only',base,'--','src','assets').split('\n').filter(p=>!changed.includes(p));
for(const path of protectedPaths){assert.equal(sha(await readFile(join(source,path))),sha(execFileSync('git',['-C',source,'show',`${base}:${path}`],{maxBuffer:32*1024*1024})));}
const builds={};for(const target of ['browser','wechat']){const dir=join(build,target),manifestBytes=await readFile(join(dir,'build-manifest.json')),manifest=JSON.parse(manifestBytes);assert.equal(manifest.commit,product);assert.equal(manifest.sourceSha256,sourceSha256);assert.equal(manifest.version,'1.0.9');assert.equal(manifest.developerDiagnostics,false);assert.equal(manifest.shopPricingMode,'paid');builds[target]={manifestCommit:manifest.commit,manifestSha256:sha(manifestBytes),sourceSha256,bundleSha256:sha(await readFile(join(dir,target==='browser'?'app.js':'game.js'))),uiClickSha256:sha(await readFile(join(dir,'assets/ui_click.wav'))),uiClick:manifest.uiClick,soundEffects:manifest.soundEffects};}
assert.equal(builds.browser.bundleSha256,'927aa753e29bd9dd6001de51e44d0bc9b2506d84e987a20e8ddf4fbd950797c5');assert.equal(builds.wechat.bundleSha256,'857ec06c984b6364d863b26b63798c2f14c63d3b49198beb736e843ff6e2c79e');
const report={status:'PASS',productGitSha:product,productTree:git('rev-parse',`${product}^{tree}`),sourceSha256,baseGitSha:base,builds,unchangedProtectedSourceAndAssetFiles:protectedPaths.length,changedRuntimeSources:['src/platform/browser.ts','src/platform/wechat.ts'],addedRuntimeSources:['src/shared/ui-click-level.ts'],original12CueGeneratorByteIdentical,musicControllerSessionUiFeedbackUiLayoutGameRulesAccountStorageAndMasterLevelsUnchanged:true};
await writeFile(join(out,'independent-binding.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',product,sourceSha256,protectedFiles:protectedPaths.length}));
