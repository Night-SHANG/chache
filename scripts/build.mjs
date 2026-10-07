import { build } from 'esbuild';
import {CURRENT_RULESET} from '../src/domain/content.ts';
import {INBOUND_ORDER_RANGES_V18} from '../src/domain/v18/content.ts';
import { mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { SOUND_NAMES } from '../src/platform/types.ts';
import { generateSound } from './audio.ts';
const out='build';
const app=JSON.parse(await readFile('package.json','utf8'));
await mkdir(`${out}/browser/assets`,{recursive:true});await mkdir(`${out}/wechat/assets`,{recursive:true});
const developerDiagnostics=process.argv.includes('--diagnostics');
const common={define:{__DEV_DIAGNOSTICS__:String(developerDiagnostics),__APP_VERSION__:JSON.stringify(app.version+'-dev')},bundle:true,target:'es2018',logLevel:'warning',minify:false,sourcemap:false,legalComments:'eof'};
await Promise.all([build({...common,entryPoints:['src/browser-main.ts'],outfile:`${out}/browser/app.js`,format:'iife'}),build({...common,entryPoints:['src/wechat-main.ts'],outfile:`${out}/wechat/game.js`,format:'iife',platform:'neutral'})]);
await writeFile(`${out}/browser/index.html`,'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>爆仓：最后一格'+(developerDiagnostics?' · v'+app.version+' 开发版':'')+'</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c131c;touch-action:none}main{position:fixed;top:env(safe-area-inset-top,0);right:env(safe-area-inset-right,0);bottom:env(safe-area-inset-bottom,0);left:env(safe-area-inset-left,0)}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}</style></head><body><main><canvas id="game" aria-label="爆仓：最后一格。选择底部货物后点棋盘，或拖动货物。" tabindex="0"></canvas></main><script src="app.js"></script></body></html>');
await writeFile(`${out}/wechat/game.json`,JSON.stringify({deviceOrientation:'portrait',showStatusBar:false},null,2)+'\n');
await writeFile(`${out}/wechat/project.config.json`,JSON.stringify({description:'本地开发版。导入微信开发者工具后填写自己的小游戏AppID，尚未真机验证。',projectname:'warehouse-last-slot-dev',compileType:'game',appid:'',setting:{es6:true,minified:false}},null,2)+'\n');
// Original local PCM cues; exactly the same deterministic bytes on both targets.
for(const name of SOUND_NAMES){
 const audio=generateSound(name);await writeFile(`${out}/browser/assets/${name}.wav`,audio);await writeFile(`${out}/wechat/assets/${name}.wav`,audio);
}
async function sources(dir){let files=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);files=files.concat(item.isDirectory()?await sources(path):[path]);}return files;}
const hash=createHash('sha256');for(const path of [...await sources('src'),...await sources('scripts'),'package.json','package-lock.json'].sort()){hash.update(path);hash.update(await readFile(path));}
let commit='uncommitted';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Initial local build is explicitly traceable by source hash. */}
const manifest={developerDiagnostics,version:app.version+'-dev',rulesetVersion:18,accountFormatVersion:4,economyVersion:2,interactiveTutorials:false,help:{entry:'home_and_pause',topics:['inbound','outbound'],dailyDetails:true,automatic:false},supportedRulesets:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18],modes:{orders:{rulesetVersion:18,boardSizes:[7],candidates:[3],reservedEntries:4,upgradePool:false,economyVersion:2,finalStageRush:false,rushPercent:0,cleanup:false,orderRanges:INBOUND_ORDER_RANGES_V18,difficulties:['hard','expert'],scoreMultipliers:{hard:[3,2],expert:[2,1]},overtimeDifficulties:['hard','expert']},daily:{rulesetVersion:18,initialRushPercent:6,finalStageRushPercent:100,cleanupAtStart:true,inboundDifficulty:'hard',scoreMultiplier:[3,2]},legacy_inbound_tiers:{rulesetVersion:16},legacy_final_stage:{rulesetVersion:15},legacy_multishape:{rulesetVersion:14},legacy_refinement:{rulesetVersion:11},legacy_growth:{rulesetVersion:9,boardSizes:[7,8],candidates:[3,4,5]},legacy_orders:{rulesetVersion:CURRENT_RULESET},color_exit:{rulesetVersion:4,balanced:false},color_exit_mixed:{rulesetVersion:5,tiers:{entry:20,middle:30,late:40},balanced:false},outbound:{rulesetVersion:12,boardSize:9,reservedEntries:1,tools:true,difficulties:{easy:20,normal:30,hard:40,expert:50},balanced:false},inbound_endless:{rulesetVersion:18,boardSizes:[7],stageCap:5,reservedEntries:4,upgradePool:false,rushPercent:0,cleanup:false,difficulties:['hard','expert'],scoreMultipliers:{hard:[3,2],expert:[2,1]}},legacy_inbound_endless:{rulesetVersion:7},outbound_endless:{rulesetVersion:13,boardSize:9,reservedEntries:1,tools:true,difficulties:{easy:20,normal:30,hard:40,expert:50},stageCap:5,balanced:false}},sourceSha256:hash.digest('hex'),commit,builtAt:new Date().toISOString(),runtimeStatus:'WeChat developer tools and physical devices NOT RUN',referenceCommit:'ad99e35a0200d4548cd879aa218ce845fd1e9fa2'};
for(const target of ['browser','wechat']){await writeFile(`${out}/${target}/build-manifest.json`,JSON.stringify(manifest,null,2)+'\n');await cp('THIRD_PARTY_NOTICES.md',`${out}/${target}/THIRD_PARTY_NOTICES.md`);}
const game=await readFile(`${out}/wechat/game.js`,'utf8');
for(const pattern of [/\beval\s*\(/,/\bstructuredClone\s*\(/,/new\s+TextEncoder\s*\(/,/new\s+Function\s*\(/,/\bdocument\b/,/\blocalStorage\b/,/isPointInPath/,/globalCompositeOperation\s*=\s*["']lighter/])if(pattern.test(game))throw Error(`WeChat forbidden runtime pattern: ${pattern}`);
if(Buffer.byteLength(game)>1024*1024)throw Error('P0 JavaScript exceeds 1 MiB budget');
const checksums=[];for(const file of (await sources(out)).filter(path=>path!==`${out}/SHA256SUMS`)){const bytes=await readFile(file);checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);}
await writeFile(`${out}/SHA256SUMS`,checksums.join('\n')+'\n');
console.log(`Built browser + real WeChat game.js/game.json (${Buffer.byteLength(game)} B JS). Source ${manifest.sourceSha256.slice(0,12)}. WeChat runtime NOT RUN.`);
