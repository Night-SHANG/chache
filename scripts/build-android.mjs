import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {androidBundleOptions} from './android-bundle-options.ts';
import {AUDIO_LEVELS} from '../src/shared/audio-levels.ts';
import {ANDROID_UI_CLICK_BOOST_DB,ANDROID_UI_CLICK_GAIN,UI_CLICK_GAIN} from '../src/shared/ui-click-level.ts';

// Verify the unmodified formal build first; Android consumes those exact media bytes.
execFileSync(process.execPath,['scripts/build.mjs','--production'],{stdio:'inherit'});
const out='build/android';
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const path of ['assets','THIRD_PARTY_NOTICES.md','MUSIC_NOTICE.txt','MUSIC_LICENSE.txt','UI_SOUND_NOTICE.txt','UI_SOUND_CC0.txt'])await cp(`build/browser/${path}`,`${out}/${path}`,{recursive:true});
await cp('android-shell/node_modules/@capacitor/android/LICENSE',`${out}/CAPACITOR_LICENSE.txt`);
await build({...androidBundleOptions(),entryPoints:['src/android-main.ts'],outfile:`${out}/app.js`});
// Native WindowInsets will own geometry. CSS never consumes another safe-area inset.
await writeFile(`${out}/index.html`,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>货箱最后一格</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c131c;color:#e9edf2;touch-action:none}main{position:fixed;inset:0}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}#startup-status[hidden]{display:none!important}#startup-status{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:24px;font-family:system-ui,sans-serif;pointer-events:none}</style></head><body><main><canvas id="game" aria-label="货箱最后一格" tabindex="0"></canvas><div id="startup-status" role="status" hidden></div></main><script src="app.js"></script></body></html>`);
const formal=JSON.parse(await readFile('build/browser/build-manifest.json','utf8'));
if(formal.version!=='1.0.19'||formal.shopPricingMode!=='paid'||formal.developerDiagnostics!==false)throw Error('Android requires verified v1.0.19 paid production assets');
const androidShellLockSha256=createHash('sha256').update(await readFile('android-shell/package-lock.json')).digest('hex');
const uiClick={...formal.uiClick,playbackGain:ANDROID_UI_CLICK_GAIN,androidBoostDb:ANDROID_UI_CLICK_BOOST_DB,playbackVolume:AUDIO_LEVELS.browserEffects*ANDROID_UI_CLICK_GAIN,effectiveTargetPeak:formal.uiClick.effectiveTargetPeak*(ANDROID_UI_CLICK_GAIN/UI_CLICK_GAIN)};
await writeFile(`${out}/build-manifest.json`,JSON.stringify({...formal,uiClick,soundEffects:{...formal.soundEffects,androidVolume:AUDIO_LEVELS.browserEffects},version:'1.0.19',sourceContentVersion:formal.version,platform:'android',androidShellLockSha256,runtimeStatus:'Android native adapters and device acceptance NOT RUN'},null,2)+'\n');
async function files(path){
 const entries=await readdir(path,{withFileTypes:true});
 return (await Promise.all(entries.map(entry=>entry.isDirectory()?files(`${path}/${entry.name}`):[`${path}/${entry.name}`]))).flat().sort();
}
const sums=[];
for(const path of await files(out))sums.push(`${createHash('sha256').update(await readFile(path)).digest('hex')}  ${path.slice(out.length+1)}`);
await writeFile(`${out}/SHA256SUMS`,sums.join('\n')+'\n');
console.log('Staged isolated Android production assets. Native adapters/device acceptance remain required.');
