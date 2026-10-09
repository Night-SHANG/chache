/** Deliberately inert without an owner-provided frozen binding. This file never builds. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {assertOwnerBinding,assertManifestPair,sha256} from './material-feedback-host-protocol.mjs';
export async function runFromBinding(bindingPath,{out='artifacts/v0170-host/final',only}={}){
 assert.ok(bindingPath,'--binding owner-frozen.json is required; preparation is not acceptance');
 const binding=JSON.parse(await readFile(bindingPath,'utf8'));assertOwnerBinding(binding);
 const root=resolve(binding.root??process.cwd());process.chdir(root);out=resolve(out);
 const manifests=await Promise.all(['browser','wechat'].map(target=>readFile(resolve(binding.freeBuildRoot,target,'build-manifest.json'),'utf8').then(JSON.parse)));
 assertManifestPair(...manifests,binding);
 const game=await readFile(resolve(binding.freeBuildRoot,'wechat/game.js')),browser=await readFile(resolve(binding.freeBuildRoot,'browser/app.js'));
 assert.equal(sha256(game),binding.expectedGameJsSha256);assert.equal(sha256(browser),binding.expectedBrowserJsSha256);
 // Only this fresh Node oracle receives the compile flag. createGrowthHost creates a separate VM.
 // The product game.js bytes are neither transformed nor given compatibility/debug globals.
 assert.equal(globalThis.__PLAYTEST_FREE_SHOP__,undefined,'Use a fresh host process');
 Object.defineProperty(globalThis,'__PLAYTEST_FREE_SHOP__',{value:true,writable:false,configurable:false});
 const policy=await import(pathToFileURL(resolve(root,'src/shared/build-policy.ts')));assert.equal(policy.PLAYTEST_FREE_SHOP,true);
 const {runV0170Host}=await import('./material-feedback-host-runtime.mjs');
 await mkdir(out,{recursive:true});
 return runV0170Host({root,out,binding,manifest:manifests[1],only});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
 try{const report=await runFromBinding(arg('--binding'),{out:arg('--out'),only:arg('--only')});console.log(`${report.status}: ${report.cases.filter(c=>c.status==='PASS').length} native-host cases; ${report.images.length} images; human inspection remains separate`);if(report.status==='FAIL')process.exitCode=1;}
 catch(error){console.error(error);process.exitCode=1;const out=arg('--out');if(out){await mkdir(out,{recursive:true});await writeFile(resolve(out,'initialization-failure.json'),JSON.stringify({status:'FAIL',kind:'Host initialization never counts as acceptance',error:String(error),stack:error.stack},null,2));}}
}
