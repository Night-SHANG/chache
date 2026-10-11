import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {GlobalFonts} from '@napi-rs/canvas';
import {createPaginatedBrowserHost} from '../source/scripts/paginated-cosmetics-browser-host.mjs';
import {cosmeticAccountStorage} from '../source/scripts/cosmetic-stage15-host-support.mjs';
for(const weight of ['Regular','Bold'])GlobalFonts.registerFromPath(`/usr/share/fonts/opentype/noto/NotoSansCJK-${weight}.ttc`,'Noto Sans CJK SC');
const out=resolve('artifacts/v105-background-seamfix'),report=[];
for(const [name,width,height]of [['user-ultrawide',1356,660],['phone',446,694],['phone-tall',390,844],['tablet',768,1024]]){
 const storage=cosmeticAccountStorage({wallet:244,label:'FUNDED: isolated classic-set reference',cosmetics:{theme:'day',cargo:'classic',forklift:'yellow'}});
 const h=await createPaginatedBrowserHost({width,height,dpr:1,safeTop:0,bundlePath:resolve('../v105-review/paid-candidate-seamfix/browser/app.js'),storage,epoch:Date.parse('2026-10-11T00:00:00Z')});
 await h.settleImages();h.frame(0);assert.deepEqual(h.account().account.profile.cosmetics,{theme:'day',cargo:'classic',forklift:'yellow'});
 const bytes=await h.canvas.encode('png'),path=resolve(out,`classic-set-${name}.png`);await writeFile(path,bytes);report.push({name,width,height,path,bundleSha256:h.gameJsSha256,cosmetics:h.account().account.profile.cosmetics,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(resolve(out,'classic-set-reference.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
