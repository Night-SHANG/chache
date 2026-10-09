import {AUDIO_LEVELS} from '../src/shared/audio-levels.ts';
import { build } from 'esbuild';
import {CURRENT_RULESET} from '../src/domain/content.ts';
import {RULES_V21_CONFIG} from '../src/domain/v21/content.ts';
import {SHOP_COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {SCENE_MATERIAL_ATLAS} from '../src/presentation/scene-frame-atlas.ts';
import {BOARD_MATERIAL_ATLAS} from '../src/presentation/board-material-atlas.ts';
import {CARGO_ATLAS} from '../src/presentation/cargo-atlas.ts';
import {THEMED_FORKLIFT_ATLAS} from '../src/presentation/themed-forklift-art.ts';
import {generateCargoAtlas} from './generate-cargo-atlas.mjs';
import {INBOUND_ORDER_RANGES_V18} from '../src/domain/v18/content.ts';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {sourceFiles as sources,allFiles as packageFiles} from './source-files.mjs';
import { SOUND_NAMES } from '../src/platform/types.ts';
import { generateSound } from './audio.ts';
const developerDiagnostics=process.argv.includes('--diagnostics'),playtestFreeShop=process.argv.includes('--playtest-free-shop'),production=process.argv.includes('--production');
if(production&&(playtestFreeShop||developerDiagnostics))throw Error('Production builds cannot enable playtest free shop or diagnostics');
const out='build';
const cargoAtlasBytes=await readFile(CARGO_ATLAS.src);
if(!cargoAtlasBytes.equals(generateCargoAtlas()))throw Error('Cargo atlas is stale; run node scripts/generate-cargo-atlas.mjs');
const forkliftBytes=await readFile(THEMED_FORKLIFT_ATLAS.src);
const forkliftManifest=JSON.parse(await readFile('assets/themed-forklifts.manifest.json','utf8'));
if(createHash('sha256').update(forkliftBytes).digest('hex')!==forkliftManifest.sha256)throw Error('Unverified themed forklift atlas');
const boardBytes=await readFile(BOARD_MATERIAL_ATLAS.src);
const boardManifest=JSON.parse(await readFile('assets/board-materials.manifest.json','utf8'));
if(createHash('sha256').update(boardBytes).digest('hex')!==boardManifest.sha256)throw Error('Unverified board material atlas');
const sceneBytes=await readFile(SCENE_MATERIAL_ATLAS.src);
const sceneManifest=JSON.parse(await readFile('assets/scene-materials.manifest.json','utf8'));
if(createHash('sha256').update(sceneBytes).digest('hex')!==sceneManifest.sha256)throw Error('Unverified scene material atlas');
const cargoAtlas={...CARGO_ATLAS,bytes:cargoAtlasBytes.length,sha256:createHash('sha256').update(cargoAtlasBytes).digest('hex')};
const app=JSON.parse(await readFile('package.json','utf8'));
await mkdir(`${out}/browser/assets`,{recursive:true});await mkdir(`${out}/wechat/assets`,{recursive:true});
const common={define:{__PLAYTEST_FREE_SHOP__:String(playtestFreeShop),__DEV_DIAGNOSTICS__:String(developerDiagnostics),__APP_VERSION__:JSON.stringify(app.version+'-dev')},bundle:true,target:'es2018',logLevel:'warning',minify:false,minifyWhitespace:true,sourcemap:false,legalComments:'eof'};
await Promise.all([build({...common,entryPoints:['src/browser-main.ts'],outfile:`${out}/browser/app.js`,format:'iife'}),build({...common,entryPoints:['src/wechat-main.ts'],outfile:`${out}/wechat/game.js`,format:'iife',platform:'neutral'})]);
await writeFile(`${out}/browser/index.html`,'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>爆仓：最后一格'+(developerDiagnostics?' · v'+app.version+' 开发版':'')+'</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c131c;touch-action:none}main{position:fixed;top:env(safe-area-inset-top,0);right:env(safe-area-inset-right,0);bottom:env(safe-area-inset-bottom,0);left:env(safe-area-inset-left,0)}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}</style></head><body><main><canvas id="game" aria-label="爆仓：最后一格。选择底部货物后点棋盘，或拖动货物。" tabindex="0"></canvas></main><script src="app.js"></script></body></html>');
await writeFile(`${out}/wechat/game.json`,JSON.stringify({deviceOrientation:'portrait',showStatusBar:false},null,2)+'\n');
await writeFile(`${out}/wechat/project.config.json`,JSON.stringify({description:'本地开发版。导入微信开发者工具后填写自己的小游戏AppID，尚未真机验证。',projectname:'warehouse-last-slot-dev',compileType:'game',appid:'',setting:{es6:true,minified:false}},null,2)+'\n');
// Original local PCM cues; exactly the same deterministic bytes on both targets.
for(const name of SOUND_NAMES){
 const audio=generateSound(name);await writeFile(`${out}/browser/assets/${name}.wav`,audio);await writeFile(`${out}/wechat/assets/${name}.wav`,audio);
}
const hash=createHash('sha256');for(const path of [...await sources('src'),...await sources('scripts'),...await sources('assets'),'package.json','package-lock.json'].sort()){hash.update(path);hash.update(await readFile(path));}
let commit='uncommitted';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Initial local build is explicitly traceable by source hash. */}
const music=await readFile('assets/audio/bgm.mp3'),musicSha256=createHash('sha256').update(music).digest('hex');
if(musicSha256!=='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da')throw Error('Unverified background music asset');
const manifest={cargoAtlas,sceneMaterialAtlas:{...SCENE_MATERIAL_ATLAS,bytes:sceneBytes.length,sha256:sceneManifest.sha256},boardMaterialAtlas:{...BOARD_MATERIAL_ATLAS,bytes:boardBytes.length,sha256:boardManifest.sha256},themedForkliftAtlas:{...THEMED_FORKLIFT_ATLAS,bytes:forkliftBytes.length,sha256:forkliftManifest.sha256},developerDiagnostics,shopPricingMode:playtestFreeShop?'playtest-free':'paid',soundEffects:{browserVolume:AUDIO_LEVELS.browserEffects,wechatVolume:AUDIO_LEVELS.wechatEffects},version:app.version+'-dev',rulesetVersion:21,backgroundMusic:{src:'assets/bgm.mp3',sha256:musicSha256,bytes:music.length,loop:true,defaultVolume:AUDIO_LEVELS.music,license:'CC0 1.0 Universal'},accountFormatVersion:4,economyVersion:2,interactiveTutorials:false,help:{entry:'home_and_pause',topics:['inbound','outbound','tools'],rushDetails:true,specialCargoOnly:true,automatic:false},cosmetics:{catalogSize:COSMETIC_CATALOG.length,setCount:SHOP_COSMETIC_SETS.length,navigation:'sections-scroll-detail',sections:['sets','theme','cargo','forklift'],columns:2},supportedRulesets:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,20,21],modes:{orders:{rulesetVersion:18,boardSizes:[7],candidates:[3],reservedEntries:4,upgradePool:false,economyVersion:2,finalStageRush:false,rushPercent:0,cleanup:false,orderRanges:INBOUND_ORDER_RANGES_V18,difficulties:['hard','expert'],scoreMultipliers:{hard:[3,2],expert:[2,1]},overtimeDifficulties:['hard','expert'],continuedRecordScope:'endless'},legacy_daily:{rulesetVersion:18,initialRushPercent:6,finalStageRushPercent:100,cleanupAtStart:true,inboundDifficulty:'hard',scoreMultiplier:[3,2]},rush:{rulesetVersion:21,runConfigId:RULES_V21_CONFIG.runConfigId,boardSize:7,reservedEntries:4,targetOrders:30,inboundDifficulty:'normal',orderRanges:RULES_V21_CONFIG.orderMinByShift.map((minimum,index)=>[minimum,RULES_V21_CONFIG.orderMaxByShift[index]]),scoreMultiplier:[1,1],tools:true,maxToolTypes:2,initialRushPercent:6,finalStageRushPercent:100,cleanupAtStart:true,repeatable:true,dated:false,seedPerRun:true,winCoinMultiplier:1},legacy_fixed_rush:{rulesetVersion:20,winCoinMultiplier:3},legacy_rush:{rulesetVersion:19,difficulties:['hard','expert'],scoreMultipliers:{hard:[3,2],expert:[2,1]}},legacy_inbound_tiers:{rulesetVersion:16},legacy_final_stage:{rulesetVersion:15},legacy_multishape:{rulesetVersion:14},legacy_refinement:{rulesetVersion:11},legacy_growth:{rulesetVersion:9,boardSizes:[7,8],candidates:[3,4,5]},legacy_orders:{rulesetVersion:CURRENT_RULESET},color_exit:{rulesetVersion:4,balanced:false},color_exit_mixed:{rulesetVersion:5,tiers:{entry:20,middle:30,late:40},balanced:false},outbound:{rulesetVersion:12,boardSize:9,reservedEntries:1,tools:true,difficulties:{easy:20,normal:30,hard:40,expert:50},balanced:false},inbound_endless:{rulesetVersion:18,boardSizes:[7],stageCap:5,reservedEntries:4,upgradePool:false,rushPercent:0,cleanup:false,difficulties:['hard','expert'],scoreMultipliers:{hard:[3,2],expert:[2,1]}},legacy_inbound_endless:{rulesetVersion:7},outbound_endless:{rulesetVersion:13,boardSize:9,reservedEntries:1,tools:true,difficulties:{easy:20,normal:30,hard:40,expert:50},stageCap:5,balanced:false}},sourceSha256:hash.digest('hex'),commit,builtAt:new Date().toISOString(),runtimeStatus:'WeChat developer tools and physical devices NOT RUN',referenceCommit:'ad99e35a0200d4548cd879aa218ce845fd1e9fa2'};
for(const target of ['browser','wechat']){await writeFile(`${out}/${target}/build-manifest.json`,JSON.stringify(manifest,null,2)+'\n');await cp('THIRD_PARTY_NOTICES.md',`${out}/${target}/THIRD_PARTY_NOTICES.md`);await writeFile(`${out}/${target}/assets/bgm.mp3`,music);await writeFile(`${out}/${target}/${CARGO_ATLAS.src}`,cargoAtlasBytes);await writeFile(`${out}/${target}/${THEMED_FORKLIFT_ATLAS.src}`,forkliftBytes);await writeFile(`${out}/${target}/${BOARD_MATERIAL_ATLAS.src}`,boardBytes);await writeFile(`${out}/${target}/${SCENE_MATERIAL_ATLAS.src}`,sceneBytes);await cp('assets/audio/NOTICE.txt',`${out}/${target}/MUSIC_NOTICE.txt`);await cp('assets/audio/CC0-1.0.txt',`${out}/${target}/MUSIC_LICENSE.txt`);}
const game=await readFile(`${out}/wechat/game.js`,'utf8');
for(const pattern of [/\beval\s*\(/,/\bstructuredClone\s*\(/,/new\s+TextEncoder\s*\(/,/new\s+Function\s*\(/,/\bdocument\b/,/\blocalStorage\b/,/isPointInPath/,/globalCompositeOperation\s*=\s*["']lighter/])if(pattern.test(game))throw Error(`WeChat forbidden runtime pattern: ${pattern}`);
if(Buffer.byteLength(game)>1024*1024)throw Error('P0 JavaScript exceeds 1 MiB budget');
const packageBytes=(await Promise.all((await packageFiles(`${out}/wechat`)).map(async path=>(await readFile(path)).length))).reduce((a,b)=>a+b,0);if(packageBytes>4*1024*1024)throw Error('Local initial-package budget exceeds4MiB');
const checksums=[];for(const file of (await packageFiles(out)).filter(path=>path!==`${out}/SHA256SUMS`)){const bytes=await readFile(file);checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);}
await writeFile(`${out}/SHA256SUMS`,checksums.join('\n')+'\n');
console.log(`Built browser + real WeChat game.js/game.json (${Buffer.byteLength(game)} B JS). Source ${manifest.sourceSha256.slice(0,12)}. WeChat runtime NOT RUN.`);
