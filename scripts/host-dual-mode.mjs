/** Actual 0.4.0 game.js offline Canvas/wx-host verification.
 * Authored initial states are deliberately labelled; all UI changes use real touch input.
 * No GameSession methods or source render/motion helpers are invoked by this harness.
 * Run npm run build immediately before this script. This is NOT browser/WeChat/device evidence.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHost } from './host-runtime.mjs';
import { createRun, applyCommand, previewPlacement } from '../src/domain/engine.ts';
import { checksum, replay } from '../src/domain/replay.ts';
import { encodeRun, decodeRun, SAVE_KEYS, COLOR_EXIT_SAVE_KEYS } from '../src/application/save.ts';
import { createProfile, encodeProfile, decodeProfile, PROFILE_KEYS } from '../src/application/profile.ts';
import { L, cellCenter, getTrayRects } from '../src/presentation/layout.ts';
import { getUiControls } from '../src/presentation/ui.ts';

const OUT = 'artifacts/dual-mode', ACTIVE = 'warehouse.active-mode.v1';
const START = 32, APRON = { left: 90, top: 530, right: 990, bottom: 1430 };
const viewports = [
  { name: 'phone-safe', width: 360, height: 800, safeTop: 24, dpr: 2 },
  { name: 'portrait', width: 540, height: 960, safeTop: 0, dpr: 1 },
  { name: 'wide', width: 1200, height: 900, safeTop: 0, dpr: 1 },
];
const buttons = { pause: [986,104], resume: [540,1147], home: [540,1297], resultHome: [540,1447],
  orders: [540,844], color: [540,968], restart: [540,1092], daily: [540,1216],
  confirm: [729,1219], cancel: [351,1219], intro: [540,1297], colorHelp: [540,1597] };
const colorInk = { 'cargo.food': '#6b2122', 'cargo.chem': '#684717', 'cargo.machine': '#284425' };
const pictures = [], screenReports = [], routeReports = [], checks = [];
const center = r => ({ x: r.x+r.w/2, y: r.y+r.h/2 });
const tap = (h, name) => h.tap(...buttons[name]);
const words = trace => trace.labels.map(l => l.value).join('\n');
const round = n => Math.round(n*1000)/1000;
const same = (a,b,label,tolerance=.12) => assert.ok(Math.abs(a-b)<=tolerance, `${label}: ${a} != ${b}`);
const disjoint = (a,b,gap=0) => a.right+gap<=b.left || b.right+gap<=a.left || a.bottom+gap<=b.top || b.bottom+gap<=a.top;
const inside = (a,b,gap=0) => a.left>=b.left+gap && a.right<=b.right-gap && a.top>=b.top+gap && a.bottom<=b.bottom-gap;
const bounds = r => ({left:r.x,top:r.y,right:r.x+r.w,bottom:r.y+r.h});
const stableStorage = storage => JSON.stringify([...storage.entries()].sort(([a],[b]) => a.localeCompare(b)));
const profileOf = h => decodeProfile(h.storage.get(PROFILE_KEYS.main));
const slotOf = (h, slot) => decodeRun(h.storage.get(slot==='color_exit'?COLOR_EXIT_SAVE_KEYS.main:SAVE_KEYS.main));
function passed(name, details={}) { checks.push({name,status:'PASS',...details}); console.log(`PASS ${name}`); }
async function sourceHash() {
  async function sources(dir) { let out=[]; for (const item of await readdir(dir,{withFileTypes:true})) { const path=join(dir,item.name); out=out.concat(item.isDirectory()?await sources(path):[path]); } return out; }
  const hash=createHash('sha256'); for(const path of [...await sources('src'),...await sources('scripts'),'package.json','package-lock.json'].sort()) { hash.update(path); hash.update(await readFile(path)); } return hash.digest('hex');
}
const manifest=JSON.parse(await readFile('build/wechat/build-manifest.json','utf8'));
const builtGameSha256=createHash('sha256').update(await readFile('build/wechat/game.js')).digest('hex');
const startingSource=await sourceHash();
if(!process.env.ALLOW_STALE_SOURCE) assert.equal(startingSource,manifest.sourceSha256,'rebuild current source, including this harness, before capture');
await mkdir(OUT,{recursive:true});

/** Observe native drawing without replacing actual renderers, input handlers or application methods. */
function observe(h, viewport=viewports[1]) {
  const ctx=h.canvas.getContext('2d'), {width,height,safeTop,dpr}=viewport;
  const scale=Math.min(width/L.width,(height-safeTop)/L.height), ox=(width-L.width*scale)/2, oy=safeTop+(height-safeTop-L.height*scale)/2;
  let trace, lastRect=null, clips=[], stack=[];
  const reset=()=>{trace={labels:[],forklifts:[],cargo:[],clips:[],lines:[]};}; reset();
  const transform=()=>{const m=ctx.getTransform();return {a:m.a/(scale*dpr),b:m.b/(scale*dpr),c:m.c/(scale*dpr),d:m.d/(scale*dpr),x:(m.e-ox*dpr)/(scale*dpr),y:(m.f-oy*dpr)/(scale*dpr)};};
  const wrap=(name,fn)=>{const original=ctx[name].bind(ctx);ctx[name]=(...args)=>{fn(args);return original(...args);};};
  wrap('save',()=>stack.push(clips.slice())); wrap('restore',()=>{clips=stack.pop()??[];});
  wrap('rect',args=>{lastRect=args.slice(0,4);});
  wrap('clip',()=>{if(lastRect){const r={left:lastRect[0],top:lastRect[1],right:lastRect[0]+lastRect[2],bottom:lastRect[1]+lastRect[3]};clips.push(r);trace.clips.push(r);}});
  wrap('fillText',([value,x,y])=>{
    const metric=ctx.measureText(value),m=ctx.getTransform();
    const pts=[[x-metric.actualBoundingBoxLeft,y-metric.actualBoundingBoxAscent],[x+metric.actualBoundingBoxRight,y-metric.actualBoundingBoxDescent]]
      .map(([px,py])=>({x:m.a*px+m.c*py+m.e,y:m.b*px+m.d*py+m.f}));
    const pixels={left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
    const logical={left:(pixels.left-ox*dpr)/(scale*dpr),right:(pixels.right-ox*dpr)/(scale*dpr),top:(pixels.top-oy*dpr)/(scale*dpr),bottom:(pixels.bottom-oy*dpr)/(scale*dpr)};
    trace.labels.push({value:String(value),logical,pixels,font:ctx.font,alpha:ctx.globalAlpha});
  });
  wrap('strokeRect',args=>{if(args[0]===-13&&args[1]===-27&&args[2]===35&&args[3]===54){const m=transform();trace.forklifts.push({x:m.x,y:m.y,angle:Math.atan2(m.b,m.a),size:Math.hypot(m.a,m.b)*110,alpha:ctx.globalAlpha,clips:clips.slice()});}});
  wrap('fillRect',args=>{if(args[0]===33&&args[1]===98&&args[2]===30&&args[3]===3){const m=transform();trace.cargo.push({x:m.x+m.a*55+m.c*55,y:m.y+m.b*55+m.d*55,size:Math.hypot(m.a,m.b)*110,alpha:ctx.globalAlpha,ink:ctx.fillStyle,clips:clips.slice()});}});
  wrap('stroke',()=>{const dash=ctx.getLineDash();if(dash.length||ctx.lineWidth===5)trace.lines.push({dash,color:ctx.strokeStyle,width:ctx.lineWidth});});
  return {frame(time){reset();h.frame(time);return trace;},viewport,crop:{x:ox*dpr,y:oy*dpr,w:1080*scale*dpr,h:1920*scale*dpr}};
}
function rig(storage=new Map(), viewport=viewports[1]) {
  const h=createHost(viewport.width,viewport.height,storage,viewport.safeTop,viewport.dpr), observer=observe(h,viewport);
  let now=0;
  return {h,observer,frame(delta=16){now+=delta;return observer.frame(now);},at(time){now=time;return observer.frame(now);},get now(){return now;}};
}
function drag(h, command, release=true) {
  const state=h.snapshot(),index=state.candidates.findIndex(p=>p.id===command.pieceId);
  assert.ok(index>=0,`actual candidate ${command.pieceId} exists`);
  const from=center(getTrayRects(state.candidates.length)[index]),to=cellCenter(command.origin);
  h.pointer('down',from.x,from.y);h.pointer('move',to.x,to.y);if(release)h.pointer('up',to.x,to.y);
}
function firstCommand(state) {
  for(const piece of state.candidates) for(let y=0;y<7;y++) for(let x=0;x<7;x++) {
    const command={type:'place',pieceId:piece.id,origin:{x,y}};
    if(previewPlacement(state,piece.id,command.origin).valid)return command;
  }
  throw Error('fixture has no valid command');
}
async function picture(r,name,label) {
  const path=`${OUT}/${name}.png`;await writeFile(path,await r.h.canvas.encode('png'));assert.ok((await stat(path)).size>5000,'nonempty native PNG');
  const item={path,label,crop:r.observer.crop};pictures.push(item);return item;
}
async function sheet(name,items,columns=3,board=false) {
  const width=360,height=board?400:640,heading=52,canvas=createCanvas(columns*width,Math.ceil(items.length/columns)*(height+heading)),ctx=canvas.getContext('2d');
  ctx.fillStyle='#102333';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='16px "Warehouse CJK"';ctx.textBaseline='top';
  for(const [index,item]of items.entries()) {const x=index%columns*width,y=Math.floor(index/columns)*(height+heading),source=await loadImage(item.path);ctx.fillStyle='#fff0cf';ctx.fillText(item.label,x+10,y+8,width-20);ctx.fillStyle='#9fc2d1';ctx.fillText(board?'Authored fixture / actual game.js':'Actual game.js / offline Canvas host',x+10,y+29,width-20);
    const c=item.crop;if(board)ctx.drawImage(source,c.x+c.w*0.04,c.y+c.h*.245,c.w*.92,c.h*.55,x,y+heading,width,height);else ctx.drawImage(source,c.x,c.y,c.w,c.h,x,y+heading,width,height);
  }
  const path=`${OUT}/${name}.png`;await writeFile(path,await canvas.encode('png'));return path;
}
function controls(state,screen,extra={}) {return getUiControls(state,{screen,paused:false,needsResume:false,...extra});}
function measureScreen(trace,state,kind,viewport,screen,extra={}) {
  const actions=controls(state,screen,extra);let labels=trace.labels;
  const title=kind==='color-pause'?'颜色出口 · 暂停':kind==='order-pause'?'休息一下':kind==='switch-confirm'?'保留进度并切换？':kind==='new-confirm'?'开始新的值班？':kind==='color-result'?'颜色出口完成！':null;
  if(title){const index=labels.findIndex(label=>label.value===title);assert.ok(index>=0,`actual ${kind} title`);labels=labels.slice(index);}
  for(const action of actions) {
    const matches=labels.filter(label=>label.value===action.label);assert.equal(matches.length,1,`${kind}: actual button ${action.label}`);
    assert.ok(inside(matches[0].logical,bounds(action.rect),5),`${kind}: button glyphs fit ${action.label}`);
  }
  for(let i=0;i<actions.length;i++)for(let j=i+1;j<actions.length;j++)assert.ok(disjoint(bounds(actions[i].rect),bounds(actions[j].rect),12),`${kind}: separated interactive hit targets`);
  for(const label of labels) {
    assert.ok(inside(label.pixels,{left:0,right:viewport.width*viewport.dpr,top:viewport.safeTop*viewport.dpr,bottom:viewport.height*viewport.dpr}),`${kind}: safe-area glyph fit ${label.value}: ${JSON.stringify(label.logical)}`);
    if(!actions.some(action=>action.label===label.value))for(const action of actions)assert.ok(disjoint(label.logical,bounds(action.rect),3),`${kind}: ${label.value} avoids button ${action.label}`);
  }
  // Compare visible text only; the shaded game layer was removed above.
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(disjoint(labels[i].logical,labels[j].logical,1),`${kind}: actual text collision ${labels[i].value} / ${labels[j].value}`);
  return {kind,viewport,status:'PASS',buttons:actions.map(a=>({label:a.label,rect:a.rect})),labels:labels.map(l=>({value:l.value,font:l.font,bounds:Object.fromEntries(Object.entries(l.logical).map(([k,v])=>[k,round(v)]))}))};
}
function authoredStorage(state,reduced=false,orders) {
  const p=createProfile();p.tutorialComplete=true;p.settings.reducedMotion=reduced;p.nextRunSerial=100;
  const store=new Map([[ACTIVE,'color_exit'],[COLOR_EXIT_SAVE_KEYS.main,encodeRun(state)],[PROFILE_KEYS.main,encodeProfile(p)]]);
  if(orders)store.set(SAVE_KEYS.main,encodeRun(orders));return store;
}
function authoredRoute(name,cargo,cells) {
  const state=createRun(619,'color_exit',4);state.board.fill(null);state.cellTraits.fill(null);
  for(const cell of cells)state.board[cell]=cargo;
  Object.assign(state,{runSerial:40,maxOccupancy:cells.length,elapsedMs:0});
  state.candidates.forEach(piece=>{piece.shapeId='shape.single';piece.cargo=cargo==='cargo.food'?'cargo.chem':'cargo.food';});
  const verified=decodeRun(encodeRun(state));return {name,cargo,cells,state:verified,command:{type:'place',pieceId:state.candidates[0].id,origin:{x:6,y:6}}};
}
const fixtures=[
  authoredRoute('north-food-zigzag','cargo.food',[3,10,11,18,19,26]),
  authoredRoute('east-chem-zigzag','cargo.chem',[27,26,19,18,11,10]),
  authoredRoute('west-machine-zigzag','cargo.machine',[21,22,15,16,9,10]),
];
function pathLength(points) {return points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);}
function onPath(point,points) {return points.slice(1).some((b,i)=>Math.abs(Math.hypot(point.x-points[i].x,point.y-points[i].y)+Math.hypot(point.x-b.x,point.y-b.y)-Math.hypot(b.x-points[i].x,b.y-points[i].y))<.2);}
function progressOnPath(point,points) {
  let covered=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(onPath(point,[a,b]))return covered+Math.hypot(point.x-a.x,point.y-a.y);covered+=length;}return null;
}
function freightLines(shipment) {
  const door=shipment.dockId==='dock.north'?{x:3,y:0}:shipment.dockId==='dock.east'?{x:6,y:3}:{x:0,y:3};
  return shipment.cargoPaths.map(item=>{
    assert.deepEqual(item.path[0],{x:item.cell%7,y:Math.floor(item.cell/7)});assert.deepEqual(item.path.at(-1),door);
    for(let i=0;i<item.path.length;i++){const p=item.path[i];assert.ok(shipment.cells.includes(p.y*7+p.x),'cargo line stays inside connected group');if(i)assert.equal(Math.abs(p.x-item.path[i-1].x)+Math.abs(p.y-item.path[i-1].y),1,'cargo is four-neighbor adjacent');}
    const points=item.path.map(cellCenter),last=points.at(-1);points.push({x:door.x===0?24:door.x===6?1056:last.x,y:door.y===0?464:last.y});
    return {cell:item.cell,points,length:pathLength(points),gridPath:item.path};
  });
}
function expectedFreight(line,index,lines,ms) {
  const sorted=[...lines].sort((a,b)=>a.gridPath.length-b.gridPath.length||a.cell-b.cell),rank=sorted.findIndex(x=>x.cell===line.cell)/(lines.length-1),flow=Math.max(0,Math.min(1,(ms-500)/500));
  const progress=Math.max(0,Math.min(1,(flow-rank*.14)/(.72+rank*.28-rank*.14)));let remaining=line.length*progress;
  for(let i=1;i<line.points.length;i++){const a=line.points[i-1],b=line.points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(remaining<=length)return {x:a.x+(b.x-a.x)*remaining/length,y:a.y+(b.y-a.y)*remaining/length};remaining-=length;}
  return line.points.at(-1);
}
function assertClipped(draw,label) {assert.ok(draw.clips.some(c=>JSON.stringify(c)===JSON.stringify(APRON)),`${label} clipped to apron before HUD`);}

// Real first-run teaching, two menu entries, confirmation cancel, two independent slots.
const flow=rig();let trace=flow.frame();assert.equal(flow.h.snapshot().mode,'tutorial');
const lesson={type:'place',pieceId:flow.h.snapshot().candidates[0].id,origin:{x:1,y:1}};drag(flow.h,lesson);flow.frame(120);assert.equal(flow.h.snapshot().commandIndex,1);
tap(flow.h,'pause');flow.frame();tap(flow.h,'home');trace=flow.frame();
assert.match(words(trace),/订单模式 · 继续进度/);assert.match(words(trace),/颜色出口 · 开始/);
const beforeCancel=stableStorage(flow.h.storage),orderProgress=checksum(flow.h.snapshot());
tap(flow.h,'color');trace=flow.frame();assert.match(words(trace),/保留进度并切换？/);assert.equal(stableStorage(flow.h.storage),beforeCancel,'opening confirmation does not write runs or Profile');
tap(flow.h,'cancel');flow.frame();assert.equal(stableStorage(flow.h.storage),beforeCancel,'cancel is byte-identical for all storage');
tap(flow.h,'color');flow.frame();tap(flow.h,'confirm');trace=flow.frame();assert.equal(flow.h.snapshot().mode,'color_exit');assert.match(words(trace),/颜色出口 · 试验模式/);
assert.equal(checksum(slotOf(flow.h,'orders')),orderProgress,'first switch retains existing teaching progress');
const intro=JSON.stringify(flow.h.snapshot()),introBytes=stableStorage(flow.h.storage);tap(flow.h,'intro');trace=flow.frame();assert.equal(JSON.stringify(flow.h.snapshot()),intro,'introStart consumes no RNG, command or candidate');assert.equal(stableStorage(flow.h.storage),introBytes);
const colorCommand=firstCommand(flow.h.snapshot()),expectedColor=applyCommand(flow.h.snapshot(),colorCommand);drag(flow.h,colorCommand);assert.equal(checksum(flow.h.snapshot()),checksum(expectedColor.state));flow.frame(1100);
const colorProgress=checksum(flow.h.snapshot());tap(flow.h,'pause');flow.frame();tap(flow.h,'home');flow.frame();
tap(flow.h,'orders');flow.frame();tap(flow.h,'confirm');trace=flow.frame();assert.equal(flow.h.snapshot().mode,'tutorial');assert.equal(checksum(flow.h.snapshot()),orderProgress);
tap(flow.h,'pause');flow.frame();tap(flow.h,'home');flow.frame();tap(flow.h,'color');flow.frame();tap(flow.h,'confirm');flow.frame();assert.equal(checksum(flow.h.snapshot()),colorProgress);
const restored=rig(flow.h.storage);trace=restored.frame();assert.equal(restored.h.snapshot().mode,'color_exit');assert.equal(checksum(restored.h.snapshot()),colorProgress);tap(restored.h,'resume');restored.frame();assert.equal(checksum(restored.h.snapshot()),colorProgress);
passed('real touch: default order tutorial, two mode entries, confirmation and byte-identical cancellation, color intro without RNG/commands, two saved progresses and active-slot reload',{orderProgress,colorProgress});

// Both destructive/new-run choices only replace their explicitly selected slot.
tap(restored.h,'pause');restored.frame();tap(restored.h,'home');restored.frame();const orderBytes=restored.h.storage.get(SAVE_KEYS.main);tap(restored.h,'restart');trace=restored.frame();assert.match(words(trace),/开始新的值班？/);tap(restored.h,'confirm');restored.frame();assert.equal(restored.h.snapshot().commandIndex,0);assert.equal(restored.h.storage.get(SAVE_KEYS.main),orderBytes);tap(restored.h,'intro');restored.frame();drag(restored.h,firstCommand(restored.h.snapshot()));restored.frame(1100);tap(restored.h,'pause');restored.frame();tap(restored.h,'home');restored.frame();const savedColor=checksum(restored.h.snapshot());tap(restored.h,'daily');trace=restored.frame();assert.match(words(trace),/开始新的值班？/);tap(restored.h,'confirm');restored.frame();assert.equal(restored.h.snapshot().mode,'daily');assert.equal(checksum(slotOf(restored.h,'color_exit')),savedColor);
passed('real touch: color restart preserves orders and order daily preserves color progress');


// Authored storage faults test the real UI's stop-and-preserve boundary.
class FaultStorage extends Map {
  blockedPrefixes=[];
  set(key,value) { if(this.blockedPrefixes?.some(prefix=>key.startsWith(prefix)))throw Error('Authored host storage write failure');return super.set(key,value); }
}
const faultOrder=createRun(710,'standard',3);faultOrder.runSerial=42;
const faultProfile=createProfile();faultProfile.tutorialComplete=true;faultProfile.nextRunSerial=100;
const faultStore=new FaultStorage([[ACTIVE,'orders'],[SAVE_KEYS.main,encodeRun(faultOrder)],[PROFILE_KEYS.main,encodeProfile(faultProfile)]]);
const fault=rig(faultStore);fault.frame();tap(fault.h,'resume');fault.frame();tap(fault.h,'pause');fault.frame();tap(fault.h,'home');fault.frame();
const beforeFault=checksum(fault.h.snapshot()),faultProfileBytes=fault.h.storage.get(PROFILE_KEYS.main);faultStore.blockedPrefixes=['warehouse.run'];
tap(fault.h,'color');fault.frame();tap(fault.h,'confirm');trace=fault.frame();assert.equal(fault.h.storage.get(ACTIVE),'orders');assert.equal(checksum(fault.h.snapshot()),beforeFault);assert.equal(fault.h.storage.has(COLOR_EXIT_SAVE_KEYS.main),false);assert.equal(fault.h.storage.get(PROFILE_KEYS.main),faultProfileBytes);
const failurePicture=await picture(fault,'authored-write-failure','Authored write failure / original slot retained');
const failureHasExplanation=/保存失败|写入失败|存储失败|无法保存|存档失败/.test(words(trace));
assert.equal(failureHasExplanation,true,'failed mode switch explains save failure visibly on menu');
const corruptRaw='AUTHORED_CORRUPT_COLOR_SLOT_DO_NOT_OVERWRITE';
const corruptStore=new Map([[ACTIVE,'orders'],[SAVE_KEYS.main,encodeRun(faultOrder)],[PROFILE_KEYS.main,encodeProfile(faultProfile)],[COLOR_EXIT_SAVE_KEYS.main,corruptRaw]]);
const corrupt=rig(corruptStore);corrupt.frame();tap(corrupt.h,'resume');corrupt.frame();tap(corrupt.h,'pause');corrupt.frame();tap(corrupt.h,'home');trace=corrupt.frame();assert.match(words(trace),/颜色出口 · 存档待处理/);
tap(corrupt.h,'color');corrupt.frame();tap(corrupt.h,'confirm');trace=corrupt.frame();assert.equal(corrupt.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw);assert.equal(checksum(slotOf(corrupt.h,'orders')),checksum(faultOrder));assert.match(words(trace),/存档|旧档/);tap(corrupt.h,'resume');corrupt.frame();assert.equal(corrupt.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw,'corrupt resume does not erase original bytes');
const corruptPicture=await picture(corrupt,'authored-corrupt-target','Authored corrupt target / original bytes protected');
const recoveryMenu=center(L.recoveryMenu);corrupt.h.tap(recoveryMenu.x,recoveryMenu.y);trace=corrupt.frame();assert.match(words(trace),/订单模式 · 继续进度/);assert.equal(corrupt.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw);tap(corrupt.h,'orders');corrupt.frame();tap(corrupt.h,'confirm');corrupt.frame();assert.equal(corrupt.h.storage.get(ACTIVE),'orders');assert.equal(checksum(corrupt.h.snapshot()),checksum(faultOrder));assert.equal(corrupt.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw);
// A valid backup still requires an explicit recovery touch, and cannot leak via menu/hide.
const backupStore=new Map([[ACTIVE,'orders'],[SAVE_KEYS.main,encodeRun(faultOrder)],[PROFILE_KEYS.main,encodeProfile(faultProfile)],[COLOR_EXIT_SAVE_KEYS.main,corruptRaw],[COLOR_EXIT_SAVE_KEYS.backup,encodeRun(fixtures[0].state)]]);
const backup=rig(backupStore);backup.frame();tap(backup.h,'resume');backup.frame();tap(backup.h,'pause');backup.frame();tap(backup.h,'home');backup.frame();tap(backup.h,'color');backup.frame();tap(backup.h,'confirm');trace=backup.frame();assert.match(words(trace),/已找到本机保存的进度/);assert.equal(backup.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw);const preBackup=stableStorage(backup.h.storage);backup.h.callbacks.hide();backup.frame();assert.equal(stableStorage(backup.h.storage),preBackup,'background does not auto-promote backup before recovery');backup.h.callbacks.show();backup.frame();backup.h.tap(recoveryMenu.x,recoveryMenu.y);backup.frame();assert.equal(backup.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw);tap(backup.h,'orders');backup.frame();tap(backup.h,'confirm');backup.frame();assert.equal(backup.h.storage.get(COLOR_EXIT_SAVE_KEYS.main),corruptRaw,'leaving backup recovery does not write target slot');
passed('authored storage faults: failed current-slot save blocks switch and allocation; corrupt/backup targets stay protected through recovery-menu escape and background',{visibleFailureExplanation:failureHasExplanation});

// Three authored polylines, actual game.js multi-frame cargo and vehicle draw calls.
const routePictures=[];
for(const fixture of fixtures) {
  const r=rig(authoredStorage(fixture.state));r.frame();tap(r.h,'resume');r.at(START);
  const resolved=applyCommand(fixture.state,fixture.command),shipments=resolved.events.filter(e=>e.type==='shipment');assert.equal(shipments.length,1);const shipment=shipments[0];assert.equal(shipment.transport,'conveyor');assert.deepEqual(shipment.path[0],{x:3,y:6});
  const lines=freightLines(shipment);assert.ok(lines.some(line=>line.gridPath.length>=6),'authored route contains multi-turn freight polyline');
  const before=checksum(r.h.snapshot());drag(r.h,fixture.command,false);trace=r.frame();assert.equal(checksum(r.h.snapshot()),before);assert.match(words(trace),/此落点预计出货/);assert.ok(trace.lines.some(line=>line.dash.length&&line.color==='#9edfff'),'blue dashed access route in actual preview');assert.ok(trace.lines.some(line=>!line.dash.length&&line.width===5),'solid freight lines in actual preview');
  const preview=await picture(r,`${fixture.name}-preview`,`${fixture.name} / actual preview`);routePictures.push(preview);
  const to=cellCenter(fixture.command.origin);r.h.pointer('up',to.x,to.y);const started=r.now;const settled=checksum(r.h.snapshot());assert.equal(settled,checksum(resolved.state));const perFrame=[];
  let priorVehicleProgress=-1;
  for(const ms of [50,100,180,270,359,360,430,499,500,550,610,680,750,820,859,860,900,960,990,1000]) {
    trace=r.at(started+ms);assert.equal(checksum(r.h.snapshot()),settled,'animation never changes state/RNG/score/commands');
    const vehicles=trace.forklifts.filter(v=>Math.abs(v.size-99)<.1);assert.equal(vehicles.length,ms<100||ms>=1000?0:1,'actual vehicle exists only in its visual journey');
    let freight=[];
    if(ms<1000){
      freight=trace.cargo.filter(box=>box.ink===colorInk[fixture.cargo]&&box.clips.some(c=>JSON.stringify(c)===JSON.stringify(APRON)));
      assert.equal(freight.length,shipment.cells.length,'each shipped box renders individually from event snapshot');
      for(const box of freight)assertClipped(box,'actual freight');
      if(ms>=500)for(const [index,line] of lines.entries()) {
        const expected=expectedFreight(line,index,lines,ms),matches=freight.filter(box=>Math.hypot(box.x-expected.x,box.y-expected.y)<.12);
        assert.ok(matches.length,`actual box ${line.cell} follows its own polyline at ${ms}ms`);assert.ok(matches.some(box=>Math.abs(box.size-63.8)<.12),'flow uses individually scaled 0.58 crates');
      }
      else if(ms===360)for(const cell of shipment.cells){const p=cellCenter({x:cell%7,y:Math.floor(cell/7)});assert.ok(freight.some(box=>Math.hypot(box.x-p.x,box.y-p.y)<.1&&Math.abs(box.size-110)<.1),'load begins on each original group cell');}
    }
    if(vehicles.length){const vehicle=vehicles[0];assertClipped(vehicle,'actual empty forklift');assert.equal(trace.cargo.filter(box=>Math.abs(box.size-64)<.05&&box.clips.some(c=>JSON.stringify(c)===JSON.stringify(APRON))).length,0,'no carried 64px cargo pack at fork');
      if(ms>=500&&ms<860){const points=shipment.path.map(cellCenter).reverse().concat({x:540,y:1415});assert.ok(onPath(vehicle,points),'empty return lies on reversed South BFS path');const progress=progressOnPath(vehicle,points);assert.ok(progress>=priorVehicleProgress-.2,'empty vehicle moves monotonically toward South entry');priorVehicleProgress=progress;}
      if(ms>=860){same(vehicle.x,540,'empty return stays aligned to South gate');assert.ok(vehicle.y>=1415,'empty vehicle departs South');}
    }
    if(ms===1000)assert.doesNotMatch(words(trace),/逐箱出货中/);
    perFrame.push({elapsedMs:ms,forklift:vehicles[0]??null,cargo:freight.map(box=>({x:round(box.x),y:round(box.y),size:round(box.size),alpha:round(box.alpha)})),checksum:settled});
    if([180,360,550,680,820,960].includes(ms))routePictures.push(await picture(r,`${fixture.name}-${ms}ms`,`${fixture.name} / ${ms} ms`));
  }
  routeReports.push({name:fixture.name,fixtureOrigin:'Authored test input, not user progress or natural balance evidence',shipment,settledChecksum:settled,frames:perFrame});
  passed(`authored ${fixture.name}: event-owned continuous box flow, empty South forklift return, apron clip, 20 actual frames`);
}

// Reduced motion and background restoration do not replay an already committed shipment.
const reduced=rig(authoredStorage(fixtures[0].state,true));reduced.frame();tap(reduced.h,'resume');reduced.at(START);drag(reduced.h,fixtures[0].command);const reducedHash=checksum(reduced.h.snapshot());const reducedPictures=[];
for(const ms of [0,40,79,80]){trace=reduced.at(START+ms);assert.equal(checksum(reduced.h.snapshot()),reducedHash);assert.equal(trace.forklifts.filter(v=>Math.abs(v.size-99)<.1).length,0,'reduced shows no moving vehicle');assert.equal(/逐箱出货中/.test(words(trace)),ms<80);if(ms<80){for(const cell of fixtures[0].cells){const p=cellCenter({x:cell%7,y:Math.floor(cell/7)});assert.ok(trace.cargo.some(box=>box.ink===colorInk['cargo.food']&&Math.hypot(box.x-p.x,box.y-p.y)<.1&&Math.abs(box.size-110)<.1),'reduced crates stay on source cells');}}reducedPictures.push(await picture(reduced,`reduced-${ms}ms`,`Reduced / ${ms} ms`));}
const lifecycle=rig(authoredStorage(fixtures[1].state));lifecycle.frame();tap(lifecycle.h,'resume');lifecycle.at(START);drag(lifecycle.h,fixtures[1].command);lifecycle.at(START+680);const lifecycleHash=checksum(lifecycle.h.snapshot());lifecycle.h.callbacks.hide();lifecycle.h.callbacks.show();trace=lifecycle.frame();assert.match(words(trace),/颜色出口 · 暂停/);assert.equal(checksum(lifecycle.h.snapshot()),lifecycleHash);tap(lifecycle.h,'resume');trace=lifecycle.frame();assert.doesNotMatch(words(trace),/逐箱出货中/);assert.equal(checksum(lifecycle.h.snapshot()),lifecycleHash);reducedPictures.push(await picture(lifecycle,'background-restored','Background hide/show / committed once'));
passed('reduced motion: static source boxes, no vehicle, completes at 80ms; hide/show retains single committed shipment');

// Recorded natural 54-command sequence: no modified board or generated-candidate fixture.
const natural=JSON.parse(await readFile('tests/fixtures/color-exit-natural-win.json','utf8')),initial=createRun(natural.seed,'color_exit',4);initial.runSerial=41;initial.maxOccupancy=0;
const ordinary=createRun(12,'standard',3);ordinary.runSerial=40;
const win=rig(authoredStorage(initial,false,ordinary));win.frame();tap(win.h,'resume');win.frame();const orderBeforeWin=win.h.storage.get(SAVE_KEYS.main),orderStatsBefore=profileOf(win.h),naturalTrace=[];const winPictures=[];
for(const [index,command]of natural.commands.entries()) {
  const before=win.h.snapshot(),resolved=applyCommand(before,command);assert.equal(resolved.error,undefined);drag(win.h,command);assert.equal(checksum(win.h.snapshot()),checksum(resolved.state),`actual natural input ${index+1} exactly matches replay`);
  const count=resolved.events.filter(e=>e.type==='shipment').length;for(let i=0;i<Math.max(1,count);i++)win.frame(1000);win.frame(700);
  naturalTrace.push({commandIndex:index+1,checksum:checksum(win.h.snapshot()),batches:win.h.snapshot().completedOrders,score:win.h.snapshot().score});
  if([0,17,35,natural.commands.length-1].includes(index))winPictures.push(await picture(win,`natural-command-${index+1}`,`Natural seed 1 / command ${index+1}`));
}
const final=win.h.snapshot(),reference=replay(natural.seed,natural.commands,'color_exit',4);assert.equal(final.result,'won');assert.equal(final.completedOrders,natural.expected.batches);assert.equal(final.score,natural.expected.score);assert.equal(checksum(final),checksum(reference));assert.equal(checksum(decodeRun(encodeRun(final))),checksum(reference));
trace=win.frame();assert.match(words(trace),/颜色出口完成！/);assert.match(words(trace),/累计出货 149件/);assert.doesNotMatch(words(trace),/继续加班|完成订单|五班完成|再试今日/);assert.equal(win.h.storage.get(SAVE_KEYS.main),orderBeforeWin);
const finalProfile=profileOf(win.h);for(const key of ['stats','bestScores','dailyHistory','achievements','lastRecordedRun'])assert.deepEqual(finalProfile[key],orderStatsBefore[key],`color result does not mutate order ${key}`);
assert.equal(finalProfile.colorExit.stats.runs,1);assert.equal(finalProfile.colorExit.stats.wins,1);assert.equal(finalProfile.colorExit.stats.batches,30);assert.equal(finalProfile.colorExit.bestScores.v4.score,1490);
const finalProfileBytes=JSON.stringify(finalProfile);const reloadedWin=rig(win.h.storage);trace=reloadedWin.frame();assert.match(words(trace),/颜色出口完成！/);assert.equal(JSON.stringify(profileOf(reloadedWin.h)),finalProfileBytes,'reload does not double count color result');
tap(reloadedWin.h,'resultHome');reloadedWin.frame();tap(reloadedWin.h,'orders');reloadedWin.frame();tap(reloadedWin.h,'confirm');reloadedWin.frame();tap(reloadedWin.h,'pause');reloadedWin.frame();tap(reloadedWin.h,'home');reloadedWin.frame();tap(reloadedWin.h,'color');reloadedWin.frame();tap(reloadedWin.h,'confirm');reloadedWin.frame();assert.equal(JSON.stringify(profileOf(reloadedWin.h)),finalProfileBytes,'round trip does not double count color result');
passed('natural seed 1: actual 54 touch commands, 30 batches, 1490 points, save/replay parity, result without overtime, isolated Profile and result reload idempotence',{commands:natural.commands.length,checksum:checksum(final)});

// Three viewport sets: actual complete glyph bounds, noncolliding buttons, PNGs.
const screenSheets=[];
for(const viewport of viewports) {
  const images=[],r=rig(new Map(),viewport);r.frame();tap(r.h,'pause');trace=r.frame();
  async function capture(kind,trace,screen,extra={}) {const modeSlots=Object.fromEntries(['orders','color_exit'].map(slot=>[slot,r.h.storage.has(slot==='orders'?SAVE_KEYS.main:COLOR_EXIT_SAVE_KEYS.main)?'saved':'empty']));const measured=measureScreen(trace,r.h.snapshot(),kind,viewport,screen,{modeSlots,...extra}),item=await picture(r,`${viewport.name}-${kind}`,`${viewport.name} / ${kind}`);images.push(item);screenReports.push({...measured,path:item.path});}
  await capture('order-pause',trace,'game',{paused:true});tap(r.h,'home');trace=r.frame();await capture('menu-orders',trace,'menu');
  tap(r.h,'color');trace=r.frame();await capture('switch-confirm',trace,'menu',{confirmation:{kind:'switchMode',variant:'color_exit'}});tap(r.h,'confirm');trace=r.frame();await capture('color-intro',trace,'colorIntro');
  tap(r.h,'intro');trace=r.frame();await capture('color-game',trace,'game');
  tap(r.h,'pause');trace=r.frame();await capture('color-pause',trace,'game',{paused:true});tap(r.h,'colorHelp');trace=r.frame();await capture('color-help',trace,'colorIntro',{paused:true});tap(r.h,'intro');r.frame();tap(r.h,'pause');r.frame();tap(r.h,'home');trace=r.frame();await capture('menu-color',trace,'menu');tap(r.h,'restart');trace=r.frame();await capture('new-confirm',trace,'menu',{confirmation:{kind:'newRun',mode:'color_exit'}});
  const rr=rig(new Map(win.h.storage),viewport);trace=rr.frame();const measured=measureScreen(trace,rr.h.snapshot(),'color-result',viewport,'game');const item=await picture(rr,`${viewport.name}-color-result`,`${viewport.name} / natural result`);images.push(item);screenReports.push({...measured,path:item.path});
  screenSheets.push(await sheet(`contact-sheet-${viewport.name}`,images,3));passed(`native glyph bounds and action-hitbox separation: ${viewport.name} ${viewport.width}x${viewport.height} safeTop ${viewport.safeTop} DPR ${viewport.dpr}`);
}

const endingSource=await sourceHash();assert.equal(endingSource,startingSource,'source must not change during same-build evidence capture');
if(!process.env.ALLOW_STALE_SOURCE)assert.equal(endingSource,manifest.sourceSha256);
const contactSheets=[...screenSheets,await sheet('contact-sheet-storage-faults',[failurePicture,corruptPicture],2),await sheet('contact-sheet-three-exit-flow',routePictures,3,true),await sheet('contact-sheet-reduced-background',reducedPictures,3),await sheet('contact-sheet-natural-run',winPictures,2)];
const report={status:process.env.ALLOW_STALE_SOURCE?'DEVELOPMENT-ONLY-STALE-SOURCE':'PASS',evidenceKind:'Actual built WeChat game.js executed with offline native Canvas/wx host and real touch callbacks',exclusions:['Not browser execution','Not WeChat developer tools or device testing','Not human listening or playtest/balance evidence'],builtGameSha256,manifest,sourceSha256:endingSource,sameSourceManifestVerified:endingSource===manifest.sourceSha256,checks,routeFixtures:routeReports,naturalRun:{seed:natural.seed,fixtureOrigin:'Authored recorded command sequence on unmodified createRun seed 1; actual package applies all commands',commands:natural.commands.length,score:final.score,batches:final.completedOrders,checksum:checksum(final),trace:naturalTrace,profile:finalProfile},screens:screenReports,individualPngCount:pictures.length,contactSheets};
await writeFile(`${OUT}/report.json`,JSON.stringify(report,null,2)+'\n');
await writeFile(`${OUT}/README.txt`,['Dual-mode 0.4.0 offline-host evidence',`Status: ${report.status}`,`Actual game.js SHA-256: ${builtGameSha256}`,`Source SHA-256: ${endingSource}`,'','All mode/menu/intro/restart/help/result operations use actual package touch callbacks.','Canvas native draw calls are measured without replacing renderer/motion implementations.','Three directional polyline initial states are authored test inputs, not recovered user saves.','The natural seed-1 result is reached by all 54 real touch commands, without patching the game board or generated candidates.','Freight boxes are independently matched against event-owned four-neighbor polylines across 20 frames per exit.','Forklift return is empty and follows reversed South access path; freight/vehicle draw layers carry apron clip.','Reduced motion remains static through 79ms and completes at 80ms.','Each viewport includes order pause, both menus, switch/new confirmation, color intro/help/pause/result.','Screen measurements record actual native glyph extents, safe-area fit, text separation and button-hitbox separation.','Contact sheets crop the composed game area; individual PNGs retain full safe-area/wide letterboxing.','This is offline Canvas/wx-host simulation. No browser, WeChat developer tools, physical device, audio listening or human gameplay comparison is claimed.','',...checks.map(check=>`PASS: ${check.name}`)].join('\n')+'\n');
console.log(`PASS dual-mode: ${checks.length} groups, ${routeReports.length*20} shipment frames, ${screenReports.length} screens, ${pictures.length} PNGs. Source ${endingSource.slice(0,12)}; game ${builtGameSha256.slice(0,12)}.`);
