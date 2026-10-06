import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {CARGO,DOCKS,SHAPES,UPGRADES,P0_CONFIG} from '../src/domain/content.ts';
const failures=[];const check=(ok,message)=>{if(!ok)failures.push(message);};
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
 check(!/isPointInPath|globalCompositeOperation\s*=\s*["']lighter/.test(text),`${path}: unsupported WeChat Canvas API`);
 check(!/\bMath\.random\s*\(/.test(text),`${path}: unseeded gameplay randomness`);
 if(path.startsWith('src/domain/'))check(!/\b(?:document|window|wx|localStorage|CanvasRenderingContext2D)\b/.test(text),`${path}: platform leak into Domain`);
 check(!/\b(?:ghp_[a-zA-Z0-9]{30,}|sk-proj-[a-zA-Z0-9_-]{30,})/.test(text),`${path}: potential secret`);
 check((await stat(path)).size<80000,`${path}: source file budget`);
}
for(const file of ['THIRD_PARTY_NOTICES.md','src/wechat-main.ts','src/browser-main.ts','tests/replay.test.ts','tests/save.test.ts','scripts/build.mjs'])check((await stat(file)).isFile(),`missing ${file}`);
if(failures.length){for(const failure of failures)console.error(`FAIL ${failure}`);process.exitCode=1;}else console.log(`PASS: content IDs/shapes/upgrade effects, 5 shift pools, locked dependencies, core platform isolation, forbidden API/secret checks.`);
