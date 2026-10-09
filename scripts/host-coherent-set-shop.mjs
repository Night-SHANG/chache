/** The shop entry point shares strict original-package v0.21 acceptance; it never rebuilds. */
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runRasterArtHost} from './host-raster-art.mjs';

export async function runCoherentSetShopHost({bindingPath,out='artifacts/v0210-set-shop',mode}={}){
 assert.ok(bindingPath,'Owner-frozen binding is required; a rebuilt source oracle is not native package acceptance');
 return runRasterArtHost(bindingPath,{out,mode});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
 try{const report=await runCoherentSetShopHost({bindingPath:arg('--binding'),out:arg('--out'),mode:arg('--mode')});console.log(`${report.status}: owner-bound original game.js set shop acceptance; separate visual and device review required`);if(report.status!=='PASS')process.exitCode=1;}
 catch(error){console.error(error);process.exitCode=1;}
}
