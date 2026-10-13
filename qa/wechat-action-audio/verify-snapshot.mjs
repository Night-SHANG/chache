import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const baselineDir=process.argv[2];
if(!baselineDir)throw Error('Usage: node qa/wechat-action-audio/verify-snapshot.mjs BASELINE_ASSET_DIRECTORY');
const names=['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail','ui_click'];
const boosted=['place','route_ready','forklift','ship','chain2','chain3','chain4','shift'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const stats=b=>{let p=0,e=0,clipped=0;for(let o=44;o<b.length;o+=2){let x=b.readInt16LE(o);p=Math.max(p,Math.abs(x));e+=x*x;if(x===-32768||x===32767)clipped++;}return {peak:p/32768,peakDb:20*Math.log10(p/32768),rmsDb:10*Math.log10(e/((b.length-44)/2)/32768**2),clipped,bytes:b.length,channels:b.readUInt16LE(22),sampleRate:b.readUInt32LE(24),frames:(b.length-44)/(b.readUInt16LE(22)*2)};};
const rows=[];
for(const name of [...names,'bgm']){
 const ext=name==='bgm'?'mp3':'wav',path=`assets/${name}.${ext}`,old=await readFile(`${baselineDir}/${name}.${ext}`),browser=await readFile(`build/browser/${path}`),android=await readFile(`build/android/${path}`),wechat=await readFile(`build/wechat/${path}`);
 assert.deepEqual(browser,old,`${name} browser baseline`);assert.deepEqual(android,old,`${name} Android baseline`);
 if(!boosted.includes(name))assert.deepEqual(wechat,old,`${name} protected WeChat baseline`);
 const row={name,browserSha256:sha(browser),androidSha256:sha(android),wechatSha256:sha(wechat),bytes:wechat.length,boosted:boosted.includes(name)};
 if(name!=='bgm'){row.before=stats(old);row.after=stats(wechat);row.rmsGainDb=row.after.rmsDb-row.before.rmsDb;assert.equal(row.after.clipped,0);assert.deepEqual(wechat.subarray(0,44),old.subarray(0,44));assert.equal(wechat.length,old.length);if(row.boosted)assert.ok(Math.abs(row.rmsGainDb-2)<.001);}
 rows.push(row);
}
const sizes=JSON.parse(await readFile('build/wechat-package-sizes.json','utf8'));
const result={scope:'WeChat-only +2 dB for eight positive action cues; physical device listening NOT RUN',rows,package:{mainBytes:sizes.mainBytes,cosmeticsBytes:sizes.subpackageBytes.cosmetics,totalBytes:sizes.totalBytes,processedWechatIdeSize:'NOT RUN'}};
await writeFile('qa/wechat-action-audio/asset-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
