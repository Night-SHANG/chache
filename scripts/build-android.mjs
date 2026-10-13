import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {androidBundleOptions} from './android-bundle-options.ts';

// Verify the unmodified formal build first; Android consumes those exact media bytes.
execFileSync(process.execPath,['scripts/build.mjs','--production'],{stdio:'inherit'});
const out='build/android';
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const path of ['assets','cosmetics','THIRD_PARTY_NOTICES.md','MUSIC_NOTICE.txt','MUSIC_LICENSE.txt','UI_SOUND_NOTICE.txt','UI_SOUND_CC0.txt'])await cp(`build/browser/${path}`,`${out}/${path}`,{recursive:true});
await cp('android-shell/node_modules/@capacitor/android/LICENSE',`${out}/CAPACITOR_LICENSE.txt`);
await build({...androidBundleOptions(),entryPoints:['src/android-main.ts'],outfile:`${out}/app.js`});
// Native WindowInsets will own geometry. CSS never consumes another safe-area inset.
await writeFile(`${out}/index.html`,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>货箱最后一格</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c131c;color:#e9edf2;touch-action:none}main{position:fixed;inset:0}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}#startup-status{position:absolute;inset:0;display:grid;place-content:center;gap:16px;text-align:center;padding:24px;background:#0c131c;color:#e9edf2;font-family:system-ui,sans-serif;white-space:pre-line;pointer-events:none}#startup-status[hidden]{display:none!important}#startup-status strong{font-size:26px;color:#ffe8b4}#startup-status span{font-size:16px}.startup-help{visibility:hidden;animation:startup-help 0s 12s forwards;position:absolute;top:calc(50% + 76px);left:24px;right:24px;font-size:14px;line-height:1.6;color:#bbc6d1}@keyframes startup-help{to{visibility:visible}}</style></head><body><main><canvas id="game" aria-label="货箱最后一格" tabindex="0"></canvas><div id="startup-status" role="status"><strong>货箱最后一格</strong><span>正在启动…</span><small class="startup-help">启动时间较长，请尝试重新打开。若仍停留在此，请更新 Android 系统 WebView；已有存档未被清空。</small></div></main><script src="app.js"></script></body></html>`);
const formal=JSON.parse(await readFile('build/browser/build-manifest.json','utf8'));
if(formal.version!=='1.0.14'||formal.shopPricingMode!=='paid'||formal.developerDiagnostics!==false)throw Error('Android requires verified v1.0.14 paid production assets');
const androidShellLockSha256=createHash('sha256').update(await readFile('android-shell/package-lock.json')).digest('hex');
await writeFile(`${out}/build-manifest.json`,JSON.stringify({...formal,version:'1.0.14',sourceContentVersion:formal.version,platform:'android',androidShellLockSha256,runtimeStatus:'Android native adapters and device acceptance NOT RUN'},null,2)+'\n');
async function files(path){
 const entries=await readdir(path,{withFileTypes:true});
 return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(`${path}/${entry.name}`):[`${path}/${entry.name}`]))).flat().sort();
}
const sums=[];
for(const path of await files(out))sums.push(`${createHash('sha256').update(await readFile(path)).digest('hex')}  ${path.slice(out.length+1)}`);
await writeFile(`${out}/SHA256SUMS`,sums.join('\n')+'\n');
console.log('Staged isolated Android production assets. Native adapters/device acceptance remain required.');
