import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};const baseline=process.env.BASELINE??arg('--baseline'),out=process.env.OUT??arg('--out');if(!baseline||!out)throw Error('Required BASELINE and OUT');const {gradient}=await import(pathToFileURL(resolve(baseline,'src/presentation/assets.ts')).href);
const {createCanvas}=createRequire(resolve(baseline,'package.json'))('@napi-rs/canvas');
function draw(y){const c=createCanvas(600,1920),ctx=c.getContext('2d');ctx.fillStyle=gradient(ctx,0,y,104,'#ffe184','#e7ae46');ctx.fillRect(0,y,600,104);return ctx.getImageData(0,y,600,104).data;}
const a=draw(1090),b=draw(890),changes=[];let pixels=0,max=0;
for(let y=0;y<104;y++)for(let x=0;x<600;x++)for(let c=0;c<4;c++){const i=(y*600+x)*4+c,d=b[i]-a[i];if(d){pixels++;max=Math.max(max,Math.abs(d));if(x===0)changes.push({y,channel:c,before:a[i],after:b[i],delta:d});}}
assert.equal(max,1);assert.deepEqual(changes,[{y:45,channel:0,before:244,after:245,delta:1}]);
const report={status:'PASS',kind:'Minimal unchanged v109 gradient(ctx,...) repro at identical colors/height, translated y 1090 to 890. No product code modified.',maxChannelDifference:max,totalDifferingChannels:pixels,changes};await writeFile(resolve(out,'gradient-quantization.json'),JSON.stringify(report,null,2));console.log(report);
