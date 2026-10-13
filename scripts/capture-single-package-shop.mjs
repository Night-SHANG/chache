/** Actual current production renderer and PNG bytes, isolated account; not a physical phone/browser. */
import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {render} from '../src/presentation/renderer.ts';
import {configureStaticArt,prepareStaticArt} from '../src/presentation/static-art-resources.ts';
import {staticArtRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {sessionHost} from '../tests/helpers/session-fixtures.ts';
const out=resolve('artifacts/single-package-shop');await mkdir(out,{recursive:true});
GlobalFonts.loadSystemFonts();
configureStaticArt(async path=>{const resource=Object.values(STATIC_ART_RESOURCES).find(value=>value.src===path);if(!resource)throw Error(path);return loadImage(resolve(resource.sourcePath));});
const {session}=sessionHost({wallet:3000});session.action({type:'shop'});session.action({type:'selectShopTab',tab:'cosmetics'});
const report={kind:'Actual production renderer with native Canvas, current working source and real packaged image bytes',limitations:['Not physical phone or browser/WeChat DevTools evidence.','Isolated test account, not player data.'],screens:[]};
for(const [section,title,selected] of [['theme','场景','cold_chain'],['cargo','货箱','reinforced'],['forklift','叉车','white']]){
 session.action({type:'selectShopSection',section});session.action({type:'previewCosmetic',kind:section,id:selected});
 const ready=await prepareStaticArt(staticArtRequirementsForView(session.view));if(ready.status!=='ready')throw Error(JSON.stringify(ready));
 const canvas=createCanvas(1080,1920),context=canvas.getContext('2d');render(context,session.state,session.view);
 const bytes=canvas.toBuffer('image/png'),path=resolve(out,`${section}.png`);await writeFile(path,bytes);
 report.screens.push({section,title,selected,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(resolve(out,'capture-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
