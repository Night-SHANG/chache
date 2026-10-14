import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOUND_NAMES} from '../src/platform/types.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {loadSoundAsset} from './sound-assets.ts';
import {verifyStaticArtAssets} from './static-art-assets.mjs';
import {sourceFiles,allFiles} from './source-files.mjs';
import {douyinPackageReport} from './douyin-package-report.mjs';
import {unsupportedDouyinCanvasAPIs} from './douyin-canvas-guard.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
export async function buildDouyin({appId,release=false,diagnostics=false}={}){
 const project=JSON.parse(await readFile('douyin/project.config.json','utf8'));
 appId=appId??project.appid;
 if(release&&!/^tt[0-9a-z]+$/i.test(appId))throw Error('DOUYIN_APP_ID is required for --release. Supply your real Douyin game AppID; no test ID is invented.');
 if(release&&diagnostics)throw Error('Release cannot enable diagnostics');
 const {douyinRendererPlugin}=await import('./douyin-renderer-plugin.mjs');
 const app=JSON.parse(await readFile('package.json','utf8'));
 await verifyStaticArtAssets();
 await mkdir('build',{recursive:true});
 const staging=await mkdtemp('build/.douyin-');
 try{
  const {metafile}=await build({entryPoints:['src/douyin-main.ts'],outfile:join(staging,'game.js'),plugins:[douyinRendererPlugin()],bundle:true,target:'es2018',format:'iife',platform:'neutral',logLevel:'warning',minify:true,sourcemap:false,legalComments:'eof',metafile:true,define:{__PLAYTEST_FREE_SHOP__:'false',__DEV_DIAGNOSTICS__:String(diagnostics),__APP_VERSION__:JSON.stringify(app.version+'-douyin-dev')}});
  const inputs=Object.keys(metafile.inputs);
  if(inputs.some(path=>/static-art-authoring|@napi-rs\/canvas|platform\/(wechat|browser|android)|@capacitor/.test(path)))throw Error('Non-Douyin host or build-time dependency entered Douyin runtime');
  const game=await readFile(join(staging,'game.js'),'utf8');
  const unsupported=unsupportedDouyinCanvasAPIs(game);
  if(unsupported.length)throw Error(`Douyin forbidden Canvas API: ${unsupported.join(', ')}`);
  for(const pattern of [/\bwx\b/,/\bdocument\b/,/\blocalStorage\b/,/\beval\s*\(/,/new\s+Function\s*\(/,/\bloadSubpackage\b/,/\bstructuredClone\s*\(/,/new\s+TextEncoder\s*\(/])if(pattern.test(game))throw Error(`Douyin forbidden runtime pattern: ${pattern}`);
  if(Buffer.byteLength(game)>1024*1024)throw Error('Douyin JavaScript exceeds project 1 MiB budget');
  await writeFile(join(staging,'game.json'),json({deviceOrientation:'portrait'}));
  await writeFile(join(staging,'project.config.json'),json({...project,appid:appId}));
  await writeFile(join(staging,'README-DOUYIN.txt'),'爆仓：最后一格 / 抖音独立适配开发包\n\n本目录可作为抖音小游戏项目导入目录。已填入用户提供的真实小游戏 AppID；无需 AppSecret。\n\n当前验证范围：本地构建、模拟 tt 宿主契约与 Canvas 像素回归。抖音 IDE、Android/iOS 真机均未运行。不能据此认定已上架可用。\n\n游戏规则、存档格式与已验收 v1.0.22 保持一致。新端存档位于抖音自己的本地存储，不会自动继承其他端。\n\n主页左上侧边栏入口已按确认样板接入，仅点击触发，失败/超时可在按钮内重试。已跟踪启动与返回来源，没有增加奖励。平台真实复访验收仍待抖音工具/手机验证。\n\n单包资源位于 assets/。13 种音效均直接使用 common 原 WAV，播放 volume=1，不设按钮专用系数。BGM 保留公共音乐设置。新端音量待手机试听后再独立校准。未注册、上传、提审或发布。\n');
  await mkdir(join(staging,'assets'),{recursive:true});
  for(const name of SOUND_NAMES)await writeFile(join(staging,`assets/${name}.wav`),loadSoundAsset(name));
  for(const resource of Object.values(STATIC_ART_RESOURCES)){const target=join(staging,resource.src);await mkdir(dirname(target),{recursive:true});await cp(resource.sourcePath,target);}
  const music=await readFile('assets/audio/bgm.mp3');
  if(sha256(music)!=='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da')throw Error('Unverified background music');
  await writeFile(join(staging,'assets/bgm.mp3'),music);
  for(const [from,to] of [['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md'],['assets/audio/NOTICE.txt','MUSIC_NOTICE.txt'],['assets/audio/CC0-1.0.txt','MUSIC_LICENSE.txt'],['assets/audio/ui-click/NOTICE.txt','UI_SOUND_NOTICE.txt'],['assets/audio/ui-click/CC0-1.0.txt','UI_SOUND_CC0.txt']])await cp(from,join(staging,to));
  await verifyStaticArtAssets(staging,{verifySources:false,runtimePaths:true});
  const sourceHash=createHash('sha256');
  for(const path of [...await sourceFiles('src'),...await sourceFiles('scripts'),...await sourceFiles('assets'),'douyin/project.config.json','package.json','package-lock.json','douyin-tools/package.json','douyin-tools/package-lock.json'].sort()){sourceHash.update(path);sourceHash.update(await readFile(path));}
  let commit='uncommitted';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{/* Source hash remains authoritative. */}
  const manifest={platform:'douyin',version:app.version+'-douyin-dev',sourceContentVersion:app.version,branch:'dev/douyin-minigame',baseCommit:'70d835196ccc012284bc7df28e54692f6e7d5360',commit,sourceSha256:sourceHash.digest('hex'),gameSha256:sha256(game),builtAt:new Date().toISOString(),developerDiagnostics:diagnostics,shopPricingMode:'paid',accountFormatVersion:4,rulesetVersion:21,economyVersion:2,package:{subpackages:false,limitBytes:20_000_000},audio:{source:'common',platformAdditionalGainDb:0,effectsPlaybackVolume:1,perSoundGain:false,musicLevels:'shared',calibratedOnDevice:false},staticArt:{resources:Object.values(STATIC_ART_RESOURCES).length,backgroundCache:false},validation:{douyinIDE:'NOT RUN',androidDevice:'NOT RUN',iosDevice:'NOT RUN'},sidebar:{api:'integrated',visibleEntry:'approved left home button implemented',automaticNavigation:false,rewards:false,acceptance:'Douyin IDE/device NOT RUN'},runtimeInputs:inputs.sort()};
  await writeFile(join(staging,'build-manifest.json'),json(manifest));
  const sums=[];for(const path of (await allFiles(staging)).sort())sums.push(`${sha256(await readFile(path))}  ${path.slice(staging.length+1)}`);
  await writeFile(join(staging,'SHA256SUMS'),sums.join('\n')+'\n');
  const inventory=await Promise.all((await allFiles(staging)).sort().map(async path=>({path:path.slice(staging.length+1),bytes:(await readFile(path)).length})));
  const report=douyinPackageReport(inventory);if(report.overLimit)throw Error(`Douyin single package exceeds 20 MB: ${report.totalBytes}`);
  // Only the independent target is replaced, after all validation has succeeded.
  await rm('build/douyin',{recursive:true,force:true});await rename(staging,'build/douyin');
  await writeFile('build/douyin-package-sizes.json',json(report));
  console.log(`Built independent Douyin single package: ${report.totalBytes} B, ${Buffer.byteLength(game)} B JavaScript. AppID ${appId?'provided':'not provided'}; IDE/Android/iOS NOT RUN.`);
  return {manifest,report};
 }catch(error){await rm(staging,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildDouyin({appId:process.env.DOUYIN_APP_ID,release:process.argv.includes('--release'),diagnostics:process.argv.includes('--diagnostics')});
