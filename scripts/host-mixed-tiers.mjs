/** v5 actual game.js offline Canvas/wx host QA.
 * All UI mutations use real touch/lifecycle callbacks. Authored fixtures are labelled.
 * No source renderer, motion helper or GameSession method is called.
 * Parent owns compilation: run a current build after this harness is finalized.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHost } from './host-runtime.mjs';
import { createRun, applyCommand, findLegalMoves } from '../src/domain/engine.ts';
import { checksum, replay } from '../src/domain/replay.ts';
import { encodeRun, decodeRun, saveKeysFor } from '../src/application/save.ts';
import { createProfile, encodeProfile, decodeProfile, PROFILE_KEYS } from '../src/application/profile.ts';
import { RUN_SLOTS, slotForRun, slotForTier } from '../src/application/run-slots.ts';
import { L, cellCenter, getTrayRects } from '../src/presentation/layout.ts';
import { getUiControls } from '../src/presentation/ui.ts';

const OUT='artifacts/mixed-tiers', ACTIVE='warehouse.active-mode.v1';
const F='cargo.food',C='cargo.chem',M='cargo.machine',TIERS=['entry','middle','late'];
const cargoNames={[F]:'食品',[C]:'化工',[M]:'机械'},colorInk={[F]:'#6b2122',[C]:'#684717',[M]:'#284425'};
const APRON={left:90,top:530,right:990,bottom:1430};
const viewports=[{name:'phone-safe',width:360,height:800,safeTop:24,dpr:2},{name:'portrait',width:540,height:960,safeTop:0,dpr:1},{name:'wide',width:1200,height:900,safeTop:0,dpr:1}];
const checks=[],pictures=[],screenReports=[],routeReports=[],naturalRuns=[];
const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
const words=trace=>trace.labels.map(label=>label.value).join('\n');
const round=n=>Math.round(n*1000)/1000;
const same=(a,b,label,tolerance=.12)=>assert.ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const disjoint=(a,b,gap=0)=>a.right+gap<=b.left||b.right+gap<=a.left||a.bottom+gap<=b.top||b.bottom+gap<=a.top;
const inside=(a,b,gap=0)=>a.left>=b.left+gap&&a.right<=b.right-gap&&a.top>=b.top+gap&&a.bottom<=b.bottom-gap;
const bounds=r=>({left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h});
const stableStorage=storage=>JSON.stringify([...storage.entries()].sort(([a],[b])=>a.localeCompare(b)));
const slotOf=(h,slot)=>decodeRun(h.storage.get(saveKeysFor(slot).main));
const runBytes=h=>JSON.stringify([...h.storage.entries()].filter(([key])=>RUN_SLOTS.some(slot=>Object.values(saveKeysFor(slot)).some(prefix=>key.startsWith(prefix)))).sort(([a],[b])=>a.localeCompare(b)));
function passed(name,details={}){checks.push({name,status:'PASS',...details});console.log(`PASS ${name}`);}
async function sourceHash(){
 async function sources(dir){let paths=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);paths=paths.concat(item.isDirectory()?await sources(path):[path]);}return paths;}
 const hash=createHash('sha256');for(const path of [...await sources('src'),...await sources('scripts'),'package.json','package-lock.json'].sort()){hash.update(path);hash.update(await readFile(path));}return hash.digest('hex');
}
const manifest=JSON.parse(await readFile('build/wechat/build-manifest.json','utf8'));
const builtGameSha256=createHash('sha256').update(await readFile('build/wechat/game.js')).digest('hex');
const startingSource=await sourceHash();
assert.equal(startingSource,manifest.sourceSha256,'Parent must rebuild current source, including finalized harness, before capture');
await mkdir(OUT,{recursive:true});
for(const name of await readdir(OUT))if(name.endsWith('.png')||name==='report.json'||name==='README.txt')await rm(join(OUT,name));

/** Observe actual native draw calls without changing render or application behavior. */
function observe(h,viewport){
 const ctx=h.canvas.getContext('2d'),{width,height,safeTop,dpr}=viewport;
 const scale=Math.min(width/L.width,(height-safeTop)/L.height),ox=(width-L.width*scale)/2,oy=safeTop+(height-safeTop-L.height*scale)/2;
 let trace,lastRect=null,clips=[],stack=[];
 const reset=()=>{trace={labels:[],forklifts:[],cargo:[],clips:[],lines:[],borders:[]};};reset();
 const transform=()=>{const m=ctx.getTransform();return{a:m.a/(scale*dpr),b:m.b/(scale*dpr),c:m.c/(scale*dpr),d:m.d/(scale*dpr),x:(m.e-ox*dpr)/(scale*dpr),y:(m.f-oy*dpr)/(scale*dpr)};};
 const wrap=(name,fn)=>{const original=ctx[name].bind(ctx);ctx[name]=(...args)=>{fn(args);return original(...args);};};
 wrap('save',()=>stack.push(clips.slice()));wrap('restore',()=>{clips=stack.pop()??[];});wrap('rect',args=>{lastRect=args.slice(0,4);});
 wrap('clip',()=>{if(lastRect){const r={left:lastRect[0],top:lastRect[1],right:lastRect[0]+lastRect[2],bottom:lastRect[1]+lastRect[3]};clips.push(r);trace.clips.push(r);}});
 wrap('fillText',([value,x,y])=>{
  const metric=ctx.measureText(value),m=ctx.getTransform();const pts=[[x-metric.actualBoundingBoxLeft,y-metric.actualBoundingBoxAscent],[x+metric.actualBoundingBoxRight,y-metric.actualBoundingBoxDescent]].map(([px,py])=>({x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f}));
  const pixels={left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
  const logical={left:(pixels.left-ox*dpr)/(scale*dpr),right:(pixels.right-ox*dpr)/(scale*dpr),top:(pixels.top-oy*dpr)/(scale*dpr),bottom:(pixels.bottom-oy*dpr)/(scale*dpr)};
  trace.labels.push({value:String(value),logical,pixels,font:ctx.font,alpha:ctx.globalAlpha});
 });
 wrap('strokeRect',args=>{trace.borders.push({args,dash:ctx.getLineDash(),ink:ctx.strokeStyle});if(args[0]===-13&&args[1]===-27&&args[2]===35&&args[3]===54){const m=transform();trace.forklifts.push({x:m.x,y:m.y,angle:Math.atan2(m.b,m.a),size:Math.hypot(m.a,m.b)*110,alpha:ctx.globalAlpha,clips:clips.slice()});}});
 wrap('fillRect',args=>{if(args[0]===33&&args[1]===98&&args[2]===30&&args[3]===3){const m=transform();trace.cargo.push({x:m.x+m.a*55+m.c*55,y:m.y+m.b*55+m.d*55,size:Math.hypot(m.a,m.b)*110,alpha:ctx.globalAlpha,ink:ctx.fillStyle,clips:clips.slice()});}});
 wrap('stroke',()=>{const dash=ctx.getLineDash();if(dash.length||ctx.lineWidth===5)trace.lines.push({dash,color:ctx.strokeStyle,width:ctx.lineWidth});});
 return{frame(time){reset();h.frame(time);return trace;},crop:{x:ox*dpr,y:oy*dpr,w:1080*scale*dpr,h:1920*scale*dpr}};
}
function rig(storage=new Map(),viewport=viewports[1]){
 const h=createHost(viewport.width,viewport.height,storage,viewport.safeTop,viewport.dpr),observer=observe(h,viewport);let now=0,trace;
 return{h,observer,viewport,frame(delta=16){now+=delta;trace=observer.frame(now);return trace;},at(time){now=time;trace=observer.frame(now);return trace;},get now(){return now;},get trace(){return trace;}};
}
function viewFor(r,screen,extra={}){return{screen,paused:false,needsResume:false,modeSlots:Object.fromEntries(RUN_SLOTS.map(slot=>[slot,r.h.storage.has(saveKeysFor(slot).main)?'saved':'empty'])),...extra};}
function action(r,screen,type,properties={},extra={}){
 const choices=getUiControls(r.h.snapshot(),viewFor(r,screen,extra));
 const control=choices.find(item=>item.action.type===type&&Object.entries(properties).every(([key,value])=>item.action[key]===value));
 assert.ok(control,`real control exists: ${screen} ${type} ${JSON.stringify(properties)}`);
 const p=center(control.rect);r.h.tap(p.x,p.y);return r.frame();
}
function confirm(r,screen='colorTiers',kind='switchMode'){return action(r,screen,'confirm',{}, {confirmation:{kind}});}
function cancel(r,screen='colorTiers',kind='switchMode'){return action(r,screen,'cancel',{}, {confirmation:{kind}});}
function resume(r){const p=center(L.resume);r.h.tap(p.x,p.y);return r.frame();}
function menu(r){const p=center(L.pause);r.h.tap(p.x,p.y);r.frame();return action(r,'game','home',{}, {paused:true});}
function selector(r){menu(r);return action(r,'menu','chooseColorTier');}
function startIntro(r){if(/开始试玩/.test(words(r.trace)))action(r,'colorIntro','introStart');}
function drag(h,command,release=true){
 const state=h.snapshot(),index=state.candidates.findIndex(piece=>piece.id===command.pieceId);assert.ok(index>=0,'actual generated/fixture candidate exists');
 const from=center(getTrayRects(state.candidates.length)[index]),to=cellCenter(command.origin);h.pointer('down',from.x,from.y);h.pointer('move',to.x,to.y);if(release)h.pointer('up',to.x,to.y);
}
function commandFor(state,ordinal=0){const moves=findLegalMoves(state);assert.ok(moves.length);return{type:'place',...moves[ordinal%moves.length]};}
async function picture(r,name,label){const path=`${OUT}/${name}.png`;await writeFile(path,await r.h.canvas.encode('png'));assert.ok((await stat(path)).size>5000,'nonempty actual native PNG');const item={path,label,crop:r.observer.crop};pictures.push(item);return item;}
async function sheet(name,items,columns=3,board=false){
 const width=360,height=board?400:640,heading=52,canvas=createCanvas(columns*width,Math.ceil(items.length/columns)*(height+heading)),ctx=canvas.getContext('2d');
 ctx.fillStyle='#102333';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='16px "Warehouse CJK"';ctx.textBaseline='top';
 for(const[index,item]of items.entries()){const x=index%columns*width,y=Math.floor(index/columns)*(height+heading),source=await loadImage(item.path);ctx.fillStyle='#fff0cf';ctx.fillText(item.label,x+10,y+8,width-20);ctx.fillStyle='#9fc2d1';ctx.fillText('Actual game.js / offline wx Canvas host',x+10,y+29,width-20);const c=item.crop;if(board)ctx.drawImage(source,c.x+c.w*.04,c.y+c.h*.245,c.w*.92,c.h*.55,x,y+heading,width,height);else ctx.drawImage(source,c.x,c.y,c.w,c.h,x,y+heading,width,height);}
 const path=`${OUT}/${name}.png`;await writeFile(path,await canvas.encode('png'));return path;
}
function measureScreen(r,kind,screen,extra={}){
 const actions=getUiControls(r.h.snapshot(),viewFor(r,screen,extra));let labels=r.trace.labels;
 if(extra.title){const index=labels.findIndex(label=>label.value===extra.title);assert.ok(index>=0,`${kind} actual title exists`);labels=labels.slice(index);}
 for(const control of actions){const matches=labels.filter(label=>label.value===control.label&&inside(label.logical,bounds(control.rect)));assert.equal(matches.length,1,`${kind} actual control ${control.label}`);assert.ok(inside(matches[0].logical,bounds(control.rect),5),`${kind} button glyph fit: ${control.label}`);}
 for(let i=0;i<actions.length;i++)for(let j=i+1;j<actions.length;j++)assert.ok(disjoint(bounds(actions[i].rect),bounds(actions[j].rect),8),`${kind} separated interactive targets`);
 for(const label of labels){assert.ok(inside(label.pixels,{left:0,right:r.viewport.width*r.viewport.dpr,top:r.viewport.safeTop*r.viewport.dpr,bottom:r.viewport.height*r.viewport.dpr}),`${kind} safe-area glyph fit ${label.value}: ${JSON.stringify(label.logical)}`);if(!actions.some(control=>control.label===label.value))for(const control of actions)assert.ok(disjoint(label.logical,bounds(control.rect),2),`${kind} ${label.value} avoids ${control.label}`);}
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(disjoint(labels[i].logical,labels[j].logical,.5),`${kind} text collision ${labels[i].value} / ${labels[j].value}`);
 const result={kind,viewport:r.viewport,status:'PASS',buttons:actions.map(control=>({label:control.label,rect:control.rect})),labels:labels.map(label=>({value:label.value,font:label.font,bounds:Object.fromEntries(Object.entries(label.logical).map(([key,value])=>[key,round(value)]))}))};screenReports.push(result);return result;
}
function authoredStorage(state,reduced=false){const profile=createProfile();profile.tutorialComplete=true;profile.settings.reducedMotion=reduced;profile.nextRunSerial=100;return new Map([[ACTIVE,slotForRun(state)],[saveKeysFor(slotForRun(state)).main,encodeRun(state)],[PROFILE_KEYS.main,encodeProfile(profile)]]);}
function authoredFixture(name,cargos,origin,stock){
 const state=createRun(619,'color_exit',5,'middle');state.board.fill(null);state.cellTraits.fill(null);for(const[cargo,cells]of stock)for(const cell of cells)state.board[cell]=cargo;
 state.candidates=[{id:'fixture.mixed',shapeId:'shape.square',cargo:cargos[0],cellCargos:cargos},{id:'fixture.keep',shapeId:'shape.single',cargo:M},{id:'fixture.third',shapeId:'shape.domino_v',cargo:C}];Object.assign(state,{runSerial:40,maxOccupancy:state.board.filter(Boolean).length,elapsedMs:0});
 const verified=decodeRun(encodeRun(state));assert.ok(verified,'fixture passes production save schema');const command={type:'place',pieceId:'fixture.mixed',origin};const resolved=applyCommand(verified,command);assert.equal(resolved.error,undefined);return{name,state:verified,command,resolved,shipments:resolved.events.filter(event=>event.type==='shipment')};
}
const fixtures=[
 authoredFixture('north-food-half',[F,F,C,C],{x:3,y:1},[[F,[3,4]]]),
 authoredFixture('east-chem-half',[F,C,F,C],{x:5,y:2},[[C,[6,13]]]),
 authoredFixture('west-machine-half',[M,F,M,F],{x:0,y:2},[[M,[0,7]]]),
];
const noShip=authoredFixture('honest-two-plus-two',[F,F,M,M],{x:3,y:0},[]);
const chain=authoredFixture('route-opening-two-color-chain',[F,F,C,C],{x:3,y:1},[[F,[3,4]],[C,[14,15,16,19,20,27]]]);
for(const fixture of fixtures)assert.equal(fixture.shipments.length,1);assert.equal(noShip.shipments.length,0);assert.deepEqual(chain.shipments.map(event=>event.cargo),[C,F]);
function pathLength(points){return points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);}
function onPath(point,points){return points.slice(1).some((b,i)=>Math.abs(Math.hypot(point.x-points[i].x,point.y-points[i].y)+Math.hypot(point.x-b.x,point.y-b.y)-Math.hypot(b.x-points[i].x,b.y-points[i].y))<.2);}
function freightLines(shipment){
 const door=shipment.dockId==='dock.north'?{x:3,y:0}:shipment.dockId==='dock.east'?{x:6,y:3}:{x:0,y:3};
 return shipment.cargoPaths.map(item=>{assert.deepEqual(item.path[0],{x:item.cell%7,y:Math.floor(item.cell/7)});assert.deepEqual(item.path.at(-1),door);for(let i=0;i<item.path.length;i++){const p=item.path[i];assert.ok(shipment.cells.includes(p.y*7+p.x),'freight stays in own color group');if(i)assert.equal(Math.abs(p.x-item.path[i-1].x)+Math.abs(p.y-item.path[i-1].y),1);}
  const points=item.path.map(cellCenter),last=points.at(-1);points.push({x:door.x===0?24:door.x===6?1056:last.x,y:door.y===0?464:last.y});return{cell:item.cell,points,length:pathLength(points),gridPath:item.path};});
}
function expectedFreight(line,lines,ms){const sorted=[...lines].sort((a,b)=>a.gridPath.length-b.gridPath.length||a.cell-b.cell),rank=sorted.findIndex(item=>item.cell===line.cell)/(lines.length-1),flow=Math.max(0,Math.min(1,(ms-500)/500));const progress=Math.max(0,Math.min(1,(flow-rank*.14)/(.72+rank*.28-rank*.14)));let remaining=line.length*progress;for(let i=1;i<line.points.length;i++){const a=line.points[i-1],b=line.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(remaining<=length)return{x:a.x+(b.x-a.x)*remaining/length,y:a.y+(b.y-a.y)*remaining/length};remaining-=length;}return line.points.at(-1);}
const apronClipped=draw=>draw.clips.some(clip=>JSON.stringify(clip)===JSON.stringify(APRON));
function assertBoardCargo(trace,cell,cargo,label){const p=cellCenter({x:cell%7,y:Math.floor(cell/7)});assert.ok(trace.cargo.some(box=>box.ink===colorInk[cargo]&&Math.abs(box.x-p.x)<.12&&(Math.abs(box.y-p.y)<.12||Math.abs(box.y-p.y+1)<.12)&&Math.abs(box.size-110)<.12),`${label}: cell ${cell} stays ${cargo}`);}

// Natural UI journey: generated candidates and unchanged boards throughout, no fixture injection.
const flow=rig();flow.frame();assert.equal(flow.h.snapshot().mode,'tutorial');drag(flow.h,commandFor(flow.h.snapshot()));flow.frame(1100);selector(flow);
assert.match(words(flow.trace),/逐件概率/);assert.match(words(flow.trace),/80%.*20%/);assert.match(words(flow.trace),/70%.*30%/);assert.match(words(flow.trace),/60%.*40%/);
const orderProgress=checksum(slotOf(flow.h,'orders')),selectionStorage=stableStorage(flow.h.storage);
action(flow,'colorTiers','switchMode',{variant:slotForTier('entry')});assert.match(words(flow.trace),/入门/);assert.equal(stableStorage(flow.h.storage),selectionStorage);cancel(flow);assert.equal(stableStorage(flow.h.storage),selectionStorage,'switch cancellation byte-identical');
const progresses={},seed=20261005;
for(const tier of TIERS){
 action(flow,'colorTiers','switchMode',{variant:slotForTier(tier)});confirm(flow);assert.equal(flow.h.snapshot().rulesetVersion,5);assert.equal(flow.h.snapshot().colorTier,tier);assert.equal(flow.h.snapshot().seed,seed);assert.match(words(flow.trace),/2.*\+.*2.*不等于.*同色4件/);
 const introBytes=stableStorage(flow.h.storage);startIntro(flow);assert.equal(stableStorage(flow.h.storage),introBytes,'help dismiss consumes no RNG or writes');
 const commands=[];for(let turn=0;turn<3;turn++){const before=flow.h.snapshot(),command=commandFor(before,turn*13),expected=applyCommand(before,command);drag(flow.h,command);assert.equal(checksum(flow.h.snapshot()),checksum(expected.state));flow.frame(1100);commands.push(command);}
 const final=flow.h.snapshot();assert.equal(checksum(replay(seed,commands,'color_exit',5,tier)),checksum(final));progresses[tier]=checksum(final);naturalRuns.push({tier,seed,commands,checksum:checksum(final),score:final.score,batches:final.completedOrders,origin:'Natural main-menu creation and actual touch moves; no authored board or candidate'});selector(flow);
}
assert.equal(checksum(slotOf(flow.h,'orders')),orderProgress);
for(const tier of TIERS){action(flow,'colorTiers','switchMode',{variant:slotForTier(tier)});confirm(flow);assert.equal(checksum(flow.h.snapshot()),progresses[tier]);selector(flow);}
const beforeSeedRuns=runBytes(flow.h);action(flow,'colorTiers','comparisonSeedNext');assert.equal(runBytes(flow.h),beforeSeedRuns,'changing future seed does not alter any existing run bytes');assert.match(words(flow.trace),new RegExp(String(seed+1)));
action(flow,'colorTiers','switchMode',{variant:slotForTier('middle')});confirm(flow);assert.equal(flow.h.snapshot().seed,seed);selector(flow);
const beforeNew=stableStorage(flow.h.storage);action(flow,'colorTiers','newRun',{mode:'color_exit',colorTier:'entry'});assert.match(words(flow.trace),new RegExp(String(seed+1)));cancel(flow,'colorTiers','newRun');assert.equal(stableStorage(flow.h.storage),beforeNew,'new-run cancellation preserves all bytes');
const otherBefore=Object.fromEntries(['orders',slotForTier('middle'),slotForTier('late')].map(slot=>[slot,flow.h.storage.get(saveKeysFor(slot).main)]));action(flow,'colorTiers','newRun',{mode:'color_exit',colorTier:'entry'});confirm(flow,'colorTiers','newRun');assert.equal(flow.h.snapshot().seed,seed+1);assert.equal(flow.h.snapshot().commandIndex,0);for(const[slot,bytes]of Object.entries(otherBefore))assert.equal(flow.h.storage.get(saveKeysFor(slot).main),bytes);
startIntro(flow);drag(flow.h,commandFor(flow.h.snapshot()));flow.frame(1100);const beforeReboot=checksum(flow.h.snapshot()),reboot=rig(new Map(flow.h.storage));reboot.frame();assert.equal(reboot.h.snapshot().colorTier,'entry');assert.equal(checksum(reboot.h.snapshot()),beforeReboot);resume(reboot);assert.equal(checksum(reboot.h.snapshot()),beforeReboot);
passed('natural actual-touch menu/three-tier journeys: same comparison seed, per-tier progress/replay, independent resume, byte-identical switch/new cancel, seed affects future new only, active-slot reboot',{seed,progresses,naturalCommands:naturalRuns.reduce((sum,run)=>sum+run.commands.length,0)});

// Legacy compatibility is explicitly authored existing v4 progress, then used through current selector.
const pure=createRun(34,'color_exit',4);pure.runSerial=80;const legacyStore=new Map(reboot.h.storage);legacyStore.set(saveKeysFor('color_exit').main,encodeRun(pure));const legacy=rig(legacyStore);legacy.frame();resume(legacy);selector(legacy);assert.match(words(legacy.trace),/旧纯色/);const mixedBytes=Object.fromEntries(TIERS.map(tier=>[tier,legacy.h.storage.get(saveKeysFor(slotForTier(tier)).main)]));action(legacy,'colorTiers','switchMode',{variant:'color_exit'});confirm(legacy);assert.equal(legacy.h.snapshot().rulesetVersion,4);assert.equal(checksum(legacy.h.snapshot()),checksum(pure));for(const[tier,bytes]of Object.entries(mixedBytes))assert.equal(legacy.h.storage.get(saveKeysFor(slotForTier(tier)).main),bytes);startIntro(legacy);selector(legacy);
passed('authored existing v4 save: selector compatibility entry resumes pure rules without conversion or touching the three v5 slots');

// Honest preview: an isolated 2+2 touching a gate cannot be advertised as a 4-box shipment.
const honest=rig(authoredStorage(noShip.state));honest.frame();resume(honest);const honestHash=checksum(honest.h.snapshot());drag(honest.h,noShip.command,false);honest.frame();assert.equal(checksum(honest.h.snapshot()),honestHash);assert.match(words(honest.trace),/暂不出货.*食品2件.*机械2件/);assert.doesNotMatch(words(honest.trace),/此落点预计出货/);assert.match(words(honest.trace),/双色·食品\/机械/);const honestPicture=await picture(honest,'authored-honest-two-plus-two','Authored 2+2 / honest zero shipment');honest.h.callbacks.cancel({changedTouches:[{identifier:1,clientX:0,clientY:0}]});honest.frame();assert.equal(checksum(honest.h.snapshot()),honestHash);assert.doesNotMatch(words(honest.trace),/本件留下/);drag(honest.h,noShip.command);honest.frame(1100);assert.equal(checksum(honest.h.snapshot()),checksum(noShip.resolved.state));
passed('authored 2+2 hover: zero shipment, both 2-box colors identified, candidate stays two-color, touch cancel commits nothing');

// Each gate ships one band while the other stays in the same cells, at every sampled frame.
const routePictures=[];
for(const fixture of fixtures){
 const r=rig(authoredStorage(fixture.state));r.frame();resume(r);const beforeHash=checksum(r.h.snapshot()),shipment=fixture.shipments[0],lines=freightLines(shipment),remaining=fixture.resolved.state.board.map((cargo,cell)=>({cargo,cell})).filter(item=>item.cargo);
 assert.equal(remaining.length,2);assert.ok(remaining.every(item=>item.cargo!==shipment.cargo));drag(r.h,fixture.command,false);r.frame();assert.equal(checksum(r.h.snapshot()),beforeHash);assert.match(words(r.trace),new RegExp(`预计出货：${cargoNames[shipment.cargo]}4件.*本件留下：${cargoNames[remaining[0].cargo]}2件`));assert.equal(r.trace.borders.filter(border=>border.dash.join(',')==='8,6').length,2);assert.ok(r.trace.lines.some(line=>line.dash.length&&line.color==='#9edfff'));assert.ok(r.trace.lines.some(line=>!line.dash.length&&line.width===5));routePictures.push(await picture(r,`${fixture.name}-preview`,`${fixture.name} / preview`));
 const to=cellCenter(fixture.command.origin);r.h.pointer('up',to.x,to.y);const started=r.now,committed=checksum(r.h.snapshot());assert.equal(committed,checksum(fixture.resolved.state));const frames=[];
 for(const ms of [0,100,360,550,680,820,960,1000]){
  const trace=r.at(started+ms);assert.equal(checksum(r.h.snapshot()),committed);for(const item of remaining)assertBoardCargo(trace,item.cell,item.cargo,`${fixture.name} ${ms}ms retained half`);
  const freight=trace.cargo.filter(box=>box.ink===colorInk[shipment.cargo]&&apronClipped(box));if(ms<1000){assert.equal(freight.length,4,'all shipped crates have their own drawing');if(ms>=550)for(const line of lines){const expected=expectedFreight(line,lines,ms);assert.ok(freight.some(box=>Math.hypot(box.x-expected.x,box.y-expected.y)<.12&&Math.abs(box.size-63.8)<.12),`${fixture.name} own path ${line.cell} at ${ms}`);}else for(const cell of shipment.cells){const p=cellCenter({x:cell%7,y:Math.floor(cell/7)});assert.ok(freight.some(box=>Math.hypot(box.x-p.x,box.y-p.y)<.12),'pre-flow cargo stays source color at source position');}}
  const vehicles=trace.forklifts.filter(vehicle=>Math.abs(vehicle.size-99)<.1);assert.equal(vehicles.length,ms<100||ms>=1000?0:1);if(vehicles.length){assert.ok(apronClipped(vehicles[0]));assert.equal(trace.cargo.filter(box=>Math.abs(box.size-64)<.05&&apronClipped(box)).length,0,'empty forklift carries no cargo pack');if(ms>=550&&ms<860)assert.ok(onPath(vehicles[0],shipment.path.map(cellCenter).reverse().concat({x:540,y:1415})),'forklift takes empty South return');if(ms>=860){same(vehicles[0].x,540,'South alignment');assert.ok(vehicles[0].y>=1415);}}
  frames.push({elapsedMs:ms,retained:remaining,freight:freight.map(box=>({x:round(box.x),y:round(box.y),size:round(box.size),ink:box.ink})),forklift:vehicles[0]??null,checksum:committed});if([360,680,1000].includes(ms))routePictures.push(await picture(r,`${fixture.name}-${ms}ms`,`${fixture.name} / ${ms} ms`));
 }
 const reload=rig(new Map(r.h.storage));reload.frame();resume(reload);for(const item of remaining)assertBoardCargo(reload.trace,item.cell,item.cargo,`${fixture.name} reload`);assert.equal(checksum(reload.h.snapshot()),committed);assert.equal(reload.h.snapshot().completedOrders,1);routeReports.push({name:fixture.name,origin:'Authored validated save fixture; actual game.js pointer events and observed native draw calls',initialState:fixture.state,command:fixture.command,shipment,retained:remaining,frames,checksum:committed});
 passed(`authored ${fixture.name}: 8 actual frames, only qualifying color ships along own port path, other two boxes retain color/position after save and reboot`);
}

// The later event must use the intermediate colored board after the first clear.
const cr=rig(authoredStorage(chain.state));cr.frame();resume(cr);drag(cr.h,chain.command,false);cr.frame();assert.match(words(cr.trace),/化工8件、食品4件.*本件4格全部出货/);assert.equal(cr.trace.borders.filter(border=>border.dash.join(',')==='8,6').length,0);const chainPictures=[await picture(cr,'authored-chain-preview','Authored chain / both colors qualified')];const chainPoint=cellCenter(chain.command.origin);cr.h.pointer('up',chainPoint.x,chainPoint.y);const chainStart=cr.now,chainHash=checksum(cr.h.snapshot());assert.equal(chainHash,checksum(chain.resolved.state));const chainFrames=[];
for(const elapsed of [0,360,680,1000,1360,1680,2000]){
 const trace=cr.at(chainStart+elapsed),active=elapsed<1000?chain.shipments[0]:elapsed<2000?chain.shipments[1]:null;assert.equal(checksum(cr.h.snapshot()),chainHash);
 if(active){const boxes=trace.cargo.filter(box=>box.ink===colorInk[active.cargo]&&apronClipped(box));assert.equal(boxes.length,active.cells.length);if(elapsed<1000)for(const cell of chain.shipments[1].cells)assertBoardCargo(trace,cell,F,'food waits unchanged through chemical first event');if(elapsed>=1000)assert.equal(trace.cargo.filter(box=>box.ink===colorInk[C]&&box.y>560&&box.y<1400&&box.x>120&&box.x<960&&box.size>100).length,0,'first color absent from intermediate second event board');}
 chainFrames.push({elapsedMs:elapsed,activeCargo:active?.cargo??null,checksum:chainHash});if([680,1680,2000].includes(elapsed))chainPictures.push(await picture(cr,`authored-chain-${elapsed}ms`,`Authored chain / ${elapsed} ms`));
}
assert.equal(cr.h.snapshot().completedOrders,2);assert.equal(cr.h.snapshot().score,120);assert.ok(cr.h.snapshot().board.every(cell=>cell===null));passed('authored route-opening two-color chain: chemical first opens South path to food, actual intermediate snapshots retain food color, both events commit once',{frames:chainFrames});

// Touch cancellation, reduced animation and background lifecycle never change committed semantics.
const lifecyclePictures=[];
for(const reduced of [false,true]){
 const r=rig(authoredStorage(fixtures[0].state,reduced));r.frame();resume(r);const before=checksum(r.h.snapshot());drag(r.h,fixtures[0].command,false);r.frame();r.h.callbacks.hide();r.h.callbacks.show();r.frame();assert.equal(checksum(r.h.snapshot()),before,'hide cancels held placement');resume(r);assert.doesNotMatch(words(r.trace),/本件留下/);
 drag(r.h,fixtures[0].command);const started=r.now,hash=checksum(r.h.snapshot());for(const ms of reduced?[0,40,79,80]:[0,680]){r.at(started+ms);assert.equal(checksum(r.h.snapshot()),hash);for(const cell of [17,18])assertBoardCargo(r.trace,cell,C,'surviving chemical during reduced/lifecycle');if(reduced){assert.equal(r.trace.forklifts.filter(vehicle=>Math.abs(vehicle.size-99)<.1).length,0);assert.equal(/逐箱出货中/.test(words(r.trace)),ms<80);if(ms<80)for(const cell of fixtures[0].shipments[0].cells)assertBoardCargo(r.trace,cell,F,'reduced shipment stays source position');}}
 r.h.callbacks.hide();r.h.callbacks.show();r.frame();assert.equal(checksum(r.h.snapshot()),hash);resume(r);assert.doesNotMatch(words(r.trace),/逐箱出货中/);assert.equal(r.h.snapshot().completedOrders,1);lifecyclePictures.push(await picture(r,`authored-${reduced?'reduced':'normal'}-hide-restore`,`Authored ${reduced?'reduced':'normal'} / restored once`));
}
passed('authored reduced/hide/touch cancellation: held drag never commits, remaining half is stable, reduced ends at 80ms with no forklift, hide/show never replays shipment');

// Three viewport selector/help and partial-shipment states; native CJK bounds are measured.
const screenSheets=[];
for(const viewport of viewports){
 const images=[],r=rig(new Map(legacy.h.storage),viewport);r.frame();resume(r);selector(r);measureScreen(r,'tier-selector','colorTiers');images.push(await picture(r,`${viewport.name}-selector`,`${viewport.name} / selector`));
 action(r,'colorTiers','switchMode',{variant:slotForTier('middle')});confirm(r);startIntro(r);const p=center(L.pause);r.h.tap(p.x,p.y);r.frame();action(r,'game','colorHelp',{}, {paused:true});measureScreen(r,'mixed-help','colorIntro',{paused:true});images.push(await picture(r,`${viewport.name}-help`,`${viewport.name} / mixed help`));
 const half=rig(authoredStorage(fixtures[0].state),viewport);half.frame();resume(half);drag(half.h,fixtures[0].command,false);half.frame();measureScreen(half,'partial-preview','game');images.push(await picture(half,`${viewport.name}-partial-preview`,`${viewport.name} / authored preview`));const point=cellCenter(fixtures[0].command.origin);half.h.pointer('up',point.x,point.y);const begin=half.now;half.at(begin+680);measureScreen(half,'partial-animation','game');images.push(await picture(half,`${viewport.name}-partial-animation`,`${viewport.name} / authored 680ms`));half.at(begin+1000);measureScreen(half,'partial-after','game');images.push(await picture(half,`${viewport.name}-partial-after`,`${viewport.name} / authored retained half`));
 screenSheets.push(await sheet(`contact-sheet-${viewport.name}`,images,3));passed(`actual CJK glyph bounds and control separation: ${viewport.name} ${viewport.width}x${viewport.height}, safeTop ${viewport.safeTop}, DPR ${viewport.dpr}`);
}
const endingSource=await sourceHash();assert.equal(endingSource,startingSource,'source must not change during same-build evidence capture');assert.equal(endingSource,manifest.sourceSha256);assert.equal(createHash('sha256').update(await readFile('build/wechat/game.js')).digest('hex'),builtGameSha256,'actual bundle must not change during capture');
const contactSheets=[...screenSheets,await sheet('contact-sheet-partial-directions',routePictures,3,true),await sheet('contact-sheet-chain',chainPictures,2,true),await sheet('contact-sheet-honest-lifecycle',[honestPicture,...lifecyclePictures],3)];
const report={status:'PASS',evidenceKind:'Actual built game.js executed in offline native Canvas/wx host using real touch and lifecycle callbacks',exclusions:['Not a browser','Not WeChat developer tools or physical device','Not human listening','Not balance or leisure-difficulty evidence'],builtGameSha256,sourceSha256:endingSource,manifest,sameSourceManifestVerified:true,checks,naturalRuns,routeFixtures:routeReports,chainFixture:{origin:'Authored validated save fixture',initialState:chain.state,command:chain.command,shipments:chain.shipments,frames:chainFrames},screens:screenReports,individualPngCount:pictures.length,contactSheets,profileAfterNatural:decodeProfile(flow.h.storage.get(PROFILE_KEYS.main))};
await writeFile(`${OUT}/report.json`,JSON.stringify(report,null,2)+'\n');await writeFile(`${OUT}/README.txt`,['Mixed-color v5 offline-host evidence','Status: PASS',`Actual game.js SHA-256: ${builtGameSha256}`,`Source SHA-256: ${endingSource}`,'','All menu/selector/tier/seed/help/new-run/recovery interactions use the actual bundle touch callbacks.','Natural runs use unmodified generated candidates and actual moves; authored board/save fixtures are labelled separately.','Three directional half shipments preserve the other two boxes in the same cells during all sampled frames, after save and reboot.','A route-opening two-color chain verifies the intermediate board and one-time commit.','Three viewport sets measure actual native CJK glyph extents and control separation.','Source and bundle hashes are checked before and after capture; old images are removed on a verified rerun.','No browser, WeChat developer tool, device, listening or human balance result is claimed.','',...checks.map(check=>`PASS: ${check.name}`)].join('\n')+'\n');
console.log(`PASS mixed tiers: ${checks.length} groups, ${screenReports.length} measured screens, ${pictures.length} PNGs. Source ${endingSource.slice(0,12)}; game ${builtGameSha256.slice(0,12)}.`);
