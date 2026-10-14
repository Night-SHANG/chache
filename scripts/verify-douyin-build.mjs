import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {allFiles,sourceFiles} from './source-files.mjs';
import {verifyStaticArtAssets} from './static-art-assets.mjs';
import {unsupportedDouyinCanvasAPIs} from './douyin-canvas-guard.mjs';
import {douyinPackageReport} from './douyin-package-report.mjs';
import {SOUND_NAMES} from '../src/platform/types.ts';
import {loadSoundAsset} from './sound-assets.ts';
const out=process.argv[2]??'build/douyin',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireCheck=(condition,message)=>{if(!condition)throw Error(message);};
const manifest=JSON.parse(await readFile(join(out,'build-manifest.json'),'utf8'));
const sourceProject=JSON.parse(await readFile('douyin/project.config.json','utf8'));
const project=JSON.parse(await readFile(join(out,'project.config.json'),'utf8'));
const gameConfig=JSON.parse(await readFile(join(out,'game.json'),'utf8'));
requireCheck(project.appid===(process.env.DOUYIN_APP_ID??sourceProject.appid),'Douyin configured AppID mismatch');
requireCheck(project.compileType==='game'&&gameConfig.deviceOrientation==='portrait'&&!gameConfig.subpackages,'Douyin project configuration mismatch');
requireCheck(manifest.platform==='douyin'&&manifest.sourceContentVersion==='1.0.22'&&manifest.developerDiagnostics===false&&manifest.shopPricingMode==='paid','Douyin production-content identity mismatch');
requireCheck(manifest.validation.douyinIDE==='NOT RUN'&&manifest.validation.androidDevice==='NOT RUN'&&manifest.validation.iosDevice==='NOT RUN','Unverified device validation claim');
requireCheck(manifest.audio.source==='common'&&manifest.audio.platformAdditionalGainDb===0&&manifest.audio.effectsPlaybackVolume===1&&manifest.audio.perSoundGain===false&&manifest.audio.musicLevels==='shared'&&manifest.audio.calibratedOnDevice===false,'Douyin audio playback policy mismatch');
const game=await readFile(join(out,'game.js'),'utf8');
requireCheck(hash(game)===manifest.gameSha256,'Douyin game hash mismatch');
requireCheck(unsupportedDouyinCanvasAPIs(game).length===0,'Douyin unsupported Canvas API in package');
const inventory=(await allFiles(out)).map(path=>path.slice(out.length+1)).sort();
const lines=(await readFile(join(out,'SHA256SUMS'),'utf8')).trim().split('\n'),listed=[];
for(const line of lines){
 const match=/^([a-f0-9]{64})  (.+)$/.exec(line);requireCheck(match,'Invalid checksum line');
 const [,sha,path]=match;requireCheck(!path.startsWith('/')&&!path.split('/').includes('..')&&!listed.includes(path),'Invalid checksum path');
 listed.push(path);requireCheck(hash(await readFile(join(out,path)))===sha,`Douyin checksum mismatch: ${path}`);
}
requireCheck(JSON.stringify([...listed,'SHA256SUMS'].sort())===JSON.stringify(inventory),'Douyin package inventory contains missing or unlisted files');
for(const name of SOUND_NAMES)requireCheck((await readFile(join(out,`assets/${name}.wav`))).equals(loadSoundAsset(name)),`Douyin common audio hash mismatch: ${name}`);
await verifyStaticArtAssets(out,{verifySources:false,runtimePaths:true});
const sourceHash=createHash('sha256');
for(const path of [...await sourceFiles('src'),...await sourceFiles('scripts'),...await sourceFiles('assets'),'douyin/project.config.json','package.json','package-lock.json','douyin-tools/package.json','douyin-tools/package-lock.json'].sort()){sourceHash.update(path);sourceHash.update(await readFile(path));}
requireCheck(sourceHash.digest('hex')===manifest.sourceSha256,'Douyin package is stale: source hash mismatch');
const report=douyinPackageReport(await Promise.all(inventory.map(async path=>({path,bytes:(await readFile(join(out,path))).length}))));
requireCheck(!report.overLimit,'Douyin single package exceeds limit');
console.log(`Verified Douyin package: ${report.fileCount} files, ${report.totalBytes} bytes; source, hashes, common audio and static PNGs match. IDE/physical devices NOT RUN.`);
