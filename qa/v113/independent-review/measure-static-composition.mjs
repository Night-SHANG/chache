/** Read-only candidate review. Deterministic Canvas method counts, not device frame time. */
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceFiles} from '../../../scripts/source-files.mjs';
import {configureStaticArt,prepareStaticArt} from '../../../src/presentation/static-art-resources.ts';
import {STATIC_ART_RESOURCES} from '../../../src/presentation/static-art-manifest.ts';
import {drawWarehouse} from '../../../src/presentation/warehouse-art.ts';
import {drawThemedBoard} from '../../../src/presentation/board-theme.ts';
import {cargoBox,forklift} from '../../../src/presentation/assets.ts';
import {drawCosmeticSetPreview} from '../../../src/presentation/cosmetic-art.ts';
import {boardGeometry} from '../../../src/presentation/board-geometry.ts';
import {drawWarehouse as aw} from '../../../scripts/static-art-authoring/src/presentation/warehouse-art.ts';
import {drawThemedBoard as ab} from '../../../scripts/static-art-authoring/src/presentation/board-theme.ts';
import {cargoBox as ac,forklift as af} from '../../../scripts/static-art-authoring/src/presentation/assets.ts';
import {drawCosmeticSetPreview as ap} from '../../../scripts/static-art-authoring/src/presentation/cosmetic-art.ts';
import {CARGO_ATLAS,loadCargoAtlas} from '../../../scripts/static-art-authoring/src/presentation/cargo-atlas.ts';
import {loadBoardMaterialAtlas} from '../../../scripts/static-art-authoring/src/presentation/board-material-atlas.ts';
import {loadSceneMaterialAtlas} from '../../../scripts/static-art-authoring/src/presentation/scene-frame-atlas.ts';
process.chdir(fileURLToPath(new URL('../../../',import.meta.url)));
const sourceHash=async()=>{const h=createHash('sha256');for(const path of [...await sourceFiles('src'),...await sourceFiles('scripts'),...await sourceFiles('assets'),'package.json','package-lock.json'].sort()){h.update(path);h.update(await readFile(path));}return h.digest('hex');};
const startHash=await sourceHash();
for(const load of [loadCargoAtlas,loadBoardMaterialAtlas,loadSceneMaterialAtlas])assert.equal(await load(loadImage),true);
configureStaticArt(p=>loadImage(Object.values(STATIC_ART_RESOURCES).find(r=>r.src===p).sourcePath));
const shared=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'];
const ids=['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold'];
const count=draw=>{const raw=createCanvas(1080,1920).getContext('2d'),counts={};const ctx=new Proxy(raw,{get(t,k){const v=Reflect.get(t,k,t);return typeof v==='function'?(...args)=>{counts[k]=(counts[k]??0)+1;return v.apply(t,args);}:v;},set(t,k,v){Reflect.set(t,k,v,t);return true;}});draw(ctx);return {all:Object.values(counts).reduce((a,b)=>a+b,0),paths:['beginPath','moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','fill','stroke'].reduce((n,k)=>n+(counts[k]??0),0),gradients:(counts.createLinearGradient??0)+(counts.createRadialGradient??0),images:counts.drawImage??0};};
const rows=[];
for(const theme of ['day','cold_chain']){
 assert.equal((await prepareStaticArt({scene:`scene.${theme}`,shared,previews:[`preview.${theme}.card`]})).status,'ready');
 for(const n of [7,8,9]){
  const g=boardGeometry({boardSize:n}),view={profile:{cosmetics:{theme,cargo:'classic',forklift:'yellow'}}};
  const draw=(w,b,c,f)=>ctx=>{w(ctx,view);b(ctx,g,theme);for(let i=0;i<n*n;i++)c(ctx,ids[i%5],g.x+i%n*g.cell+(g.cell-g.boxSize)/2,g.y+Math.floor(i/n)*g.cell+(g.cell-g.boxSize)/2,g.boxSize,1,undefined,'classic');f(ctx,672,1295,80,0,'yellow');};
  rows.push({kind:'dense-board',theme,board:n,before:count(draw(aw,ab,ac,af)),after:count(draw(drawWarehouse,drawThemedBoard,cargoBox,forklift))});
 }
 const options={theme,cargoStyle:'classic',forklift:'yellow'},page=f=>ctx=>{for(let i=0;i<4;i++)f(ctx,{x:80+(i%2)*440,y:360+Math.floor(i/2)*330,w:360,h:246},options);};
 rows.push({kind:'four-card-shop',theme,before:count(page(ap)),after:count(page(drawCosmeticSetPreview))});
}
let checked=0;
for(const style of CARGO_ATLAS.styles)for(const cargo of CARGO_ATLAS.cargos){
 const a=createCanvas(150,150),b=createCanvas(150,150);cargoBox(a.getContext('2d'),cargo,12,12,110,1,undefined,style);ac(b.getContext('2d'),cargo,12,12,110,1,undefined,style);
 assert.deepEqual(a.getContext('2d').getImageData(0,0,150,150).data,b.getContext('2d').getImageData(0,0,150,150).data,style+'/'+cargo);checked++;
}
assert.equal(await sourceHash(),startHash,'Source changed during measurement. Rerun this evidence.');
const report={status:'PASS',version:JSON.parse(await readFile('package.json')).version,headCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:startHash,frozenSourceCommit:'dd847c3174466f0004111b8667a2ff45c563e889',completedAt:new Date().toISOString(),engine:'@napi-rs/canvas 1.0.10',method:'One native draw per fixture. Dense board is warehouse + board + all occupied classic cargo cells + one yellow forklift. Shop is four exact 360x246 set previews. Before is frozen authoring vector painters; after is ready PNG composition.',limitations:['Counts include simple retained floor gradients and dynamic semantic markers. No caching configured on either comparison.','Method counts are not CPU timing, GPU memory, phone FPS, or a black-screen diagnosis.'],rows,premiumCargo:{checked,atNativeSize:110,alpha:1,exactPixelMatches:checked,includesRetiredTaped:true}};
await writeFile(new URL('static-composition-measurement.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
