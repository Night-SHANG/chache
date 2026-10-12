import {verifyStaticArtAssets} from './static-art-assets.mjs';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {unsupportedWechatCompositingModes} from './wechat-canvas-guard.mjs';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {CARGO,DOCKS,SHAPES,UPGRADES,P0_CONFIG} from '../src/domain/content.ts';
import {UPGRADES_V9,RULES_V9_CONFIG} from '../src/domain/v9/content.ts';
import {RULES_V11_CONFIG} from '../src/domain/v11/content.ts';
import {RULES_V10_CONFIG} from '../src/domain/v10/content.ts';
import {RULES_V12_CONFIG} from '../src/domain/v12/content.ts';
import {RULES_V13_CONFIG} from '../src/domain/v13/content.ts';
import {RULES_V14_CONFIG} from '../src/domain/v14/content.ts';
import {RULES_V21_CONFIG} from '../src/domain/v21/content.ts';
import {RULES_V20_CONFIG} from '../src/domain/v20/content.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {RULES_V19_CONFIG} from '../src/domain/v19/content.ts';
import {RULES_V18_CONFIG,INBOUND_ORDER_RANGES_V18} from '../src/domain/v18/content.ts';
import {reservedEntryCellsV14} from '../src/domain/v14/board.ts';
const failures=[];const check=(ok,message)=>{if(!ok)failures.push(message);};
check(RULES_V19_CONFIG.rulesetVersion===19,'legacy permanent rush identity');
check(RULES_V21_CONFIG.rulesetVersion===21&&RULES_V21_CONFIG.runConfigId==='run.rush_v21.base','base-reward rush identity');
check(RULES_V20_CONFIG.rulesetVersion===20&&RULES_V20_CONFIG.runConfigId==='run.rush_v20.fixed','fixed rush identity');
check(JSON.stringify(RULES_V20_CONFIG.orderMinByShift)==='[3,3,4,4,5]'&&JSON.stringify(RULES_V20_CONFIG.orderMaxByShift)==='[4,5,5,6,7]','fixed rush baseline orders');
check(COSMETIC_CATALOG.length===50&&new Set(COSMETIC_CATALOG.map(item=>item.key)).size===50,'logistics cosmetic catalog');
check(RULES_V18_CONFIG.rulesetVersion===18&&RULES_V18_CONFIG.candidateCount===3,'v18 identity and candidates');
check(JSON.stringify(INBOUND_ORDER_RANGES_V18)==='{"hard":[[4,4],[4,5],[5,5],[5,6],[6,7]],"expert":[[4,5],[4,6],[5,6],[5,7],[6,8]]}', 'v18 approved two-tier order ranges');
check(UPGRADES_V9.length===10&&UPGRADES_V9.reduce((sum,u)=>sum+u.maxStack,0)===20&&UPGRADES_V9.filter(u=>u.functional).length===7,'v9 upgrade catalogue');
check(new Set(UPGRADES_V9.map(u=>u.id)).size===10,'v9 stable upgrade IDs');
check(JSON.stringify(RULES_V9_CONFIG.upgradeThresholds)==='[4,8,12,16,20,24,26]','v9 reward thresholds');
check(RULES_V9_CONFIG.rulesetVersion===9&&RULES_V10_CONFIG.rulesetVersion===10&&RULES_V11_CONFIG.rulesetVersion===11,'versioned rules identity');
check(RULES_V12_CONFIG.rulesetVersion===12&&RULES_V13_CONFIG.rulesetVersion===13&&RULES_V14_CONFIG.rulesetVersion===14,'reserved-entry rules identities');
check(RULES_V12_CONFIG.boardSize===9&&RULES_V13_CONFIG.boardSize===9&&RULES_V14_CONFIG.boardSize===7,'new board sizes');
check(new Set(reservedEntryCellsV14({boardSize:7})).size===4,'four reserved inbound entries');
check(RULES_V11_CONFIG.boardSize===7&&RULES_V11_CONFIG.candidateCount===3,'v11 fixed board and candidate count');
check(JSON.stringify(RULES_V11_CONFIG.orderMinByShift)==='[3,3,4,4,5]'&&JSON.stringify(RULES_V11_CONFIG.orderMaxByShift)==='[4,5,5,6,7]','v11 restored base orders');
for(const [name,items] of [['cargo',CARGO],['shape',SHAPES],['dock',DOCKS],['upgrade',UPGRADES]])check(new Set(items.map(x=>x.id)).size===items.length,`${name}: duplicate stable ID`);
check(CARGO.length===5&&DOCKS.length===4,'P0 cargo/dock count');
for(const shape of SHAPES){const cells=shape.cells;check(cells.length>0&&cells.length<=5,`${shape.id}: cell count`);check(cells.every(c=>Number.isInteger(c.x)&&Number.isInteger(c.y)&&c.x>=0&&c.y>=0&&c.x<7&&c.y<7),`${shape.id}: coordinates`);check(Math.min(...cells.map(c=>c.x))===0&&Math.min(...cells.map(c=>c.y))===0,`${shape.id}: normalization`);check(new Set(cells.map(c=>`${c.x},${c.y}`)).size===cells.length,`${shape.id}: duplicate cell`);check(shape.weight>0,`${shape.id}: weight`);const seen=new Set([0]);let changed=true;while(changed){changed=false;for(let i=0;i<cells.length;i++)if(!seen.has(i)&&[...seen].some(j=>Math.abs(cells[i].x-cells[j].x)+Math.abs(cells[i].y-cells[j].y)===1)){seen.add(i);changed=true;}}check(seen.size===cells.length,`${shape.id}: disconnected shape`);}
for(const upgrade of UPGRADES){check(upgrade.maxStack>0,`${upgrade.id}: maxStack must be positive`);check(['overfill','deep_route','small_parcels','chain','contract','variety','side_gate','pallet_pass','small_order_first','light_orders','stock_orders','four_choices','pallet_supply','rush_buffer','hazard_clearance','wild_supply','sweep_route','extra_pickup'].includes(upgrade.effect),`${upgrade.id}: unregistered effect`);check(!!upgrade.title&&!!upgrade.description,`${upgrade.id}: missing Chinese copy`);check(!!upgrade.sourceRef,`${upgrade.id}: missing rule provenance`);check((upgrade.prerequisites??[]).every(id=>UPGRADES.some(u=>u.id===id)&&id!==upgrade.id),`${upgrade.id}: invalid prerequisite`);check((upgrade.conflicts??[]).every(id=>UPGRADES.some(u=>u.id===id)&&id!==upgrade.id),`${upgrade.id}: invalid conflict`);check(Object.values(upgrade.params??{}).every(value=>Number.isFinite(value)&&value>=0),`${upgrade.id}: invalid parameter`);}
check(UPGRADES.length>=18&&UPGRADES.length<=24,'v2 content catalogue range');
for(let shift=1;shift<=5;shift++){check(P0_CONFIG.docksByShift[shift-1]<=P0_CONFIG.cargoByShift[shift-1],`shift ${shift}: order cargo pool too small`);check(SHAPES.some(s=>s.minShift<=shift),`shift ${shift}: empty shape pool`);check(UPGRADES.filter(u=>u.behavior&&(u.minShift??1)<=shift).length>=2,`shift ${shift}: insufficient behavior upgrade pool`);}
const pkg=JSON.parse(await readFile('package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const field of ['dependencies','devDependencies'])for(const [name,version] of Object.entries(pkg[field])){check(/^\d+\.\d+\.\d+$/.test(version),`${name}: dependency must be exact`);check(lock.packages[''][field][name]===version,`${name}: lock root mismatch`);}
async function files(dir){let result=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);result=result.concat(item.isDirectory()?await files(p):[p]);}return result;}
for(const path of await files('src')){
 const text=await readFile(path,'utf8');
 check(!/\beval\s*\(|new\s+Function\s*\(/.test(text),`${path}: dynamic code execution`);
 check(!/isPointInPath/.test(text)&&unsupportedWechatCompositingModes(text,path).length===0,`${path}: unsupported WeChat Canvas API`);
 check(!/\bstructuredClone\s*\(|new\s+TextEncoder\s*\(/.test(text),`${path}: unsupported browser data API`);
 check(!/\bMath\.random\s*\(/.test(text),`${path}: unseeded gameplay randomness`);
 if(path.startsWith('src/domain/'))check(!/\b(?:document|window|wx|localStorage|CanvasRenderingContext2D)\b/.test(text),`${path}: platform leak into Domain`);
 check(!/\b(?:ghp_[a-zA-Z0-9]{30,}|sk-proj-[a-zA-Z0-9_-]{30,})/.test(text),`${path}: potential secret`);
 check((await stat(path)).size<80000,`${path}: source file budget`);
}
try{await verifyStaticArtAssets();}catch(error){check(false,`static artwork: ${error.message}`);}
for(const resource of Object.values(STATIC_ART_RESOURCES)){check(resource.src.startsWith('cosmetics/')===(resource.package==='cosmetics'),`static art package path mismatch: ${resource.key}`);check(!/^https?:/.test(resource.src),`remote static art forbidden: ${resource.key}`);}
for(const path of ['src/browser-main.ts','src/wechat-main.ts','src/android-main.ts','src/presentation/warehouse-art.ts','src/presentation/cosmetic-art.ts','src/presentation/static-art-resources.ts']){const text=await readFile(path,'utf8');check(!/from ['"][^'"]*(?:warehouse-cache|cosmetic-preview-cache|static-art-authoring)/.test(text),`${path}: retired static art runtime import`);}
for(const file of ['THIRD_PARTY_NOTICES.md','src/wechat-main.ts','src/browser-main.ts','tests/replay.test.ts','tests/save.test.ts','scripts/build.mjs'])check((await stat(file)).isFile(),`missing ${file}`);
if(failures.length){for(const failure of failures)console.error(`FAIL ${failure}`);process.exitCode=1;}else console.log(`PASS: content IDs/shapes/upgrade effects, 5 shift pools, locked dependencies, core platform isolation, forbidden API/secret checks, packaged static artwork hashes/dimensions/source identity and local package paths.`);
