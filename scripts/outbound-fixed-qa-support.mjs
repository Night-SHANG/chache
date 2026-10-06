/** Independent timing, occupied-grid, and actual Canvas evidence checks for v0.7.4. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleOutboundTransport} from '../src/presentation/outbound-transport.ts';
import {outboundVehicleDisplay} from '../src/presentation/outbound-transport-view.ts';
import {boardGeometry} from '../src/presentation/board-geometry.ts';

export const FIXED_PHASE_BOUNDARIES=[0,100,360,500,860,960.8,1000];
export const LONG_DETOUR_CELLS=[4,5,6,7,8,17,26,25,24,23,22,21,20,19,18,27,36,37,38,39,40,41,42,43,44,53,62,61,60,59,58,67];
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`);
const equalPoint=(a,b,label)=>{near(a.x,b.x,`${label} x`);near(a.y,b.y,`${label} y`);};
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const inside=(p,n)=>p.x>=0&&p.y>=0&&p.x<n&&p.y<n;
const integer=value=>Math.abs(value-Math.round(value))<1e-7;

export async function sourceHash(){
 async function files(dir){let paths=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);paths=paths.concat(item.isDirectory()?await files(path):[path]);}return paths;}
 const hash=createHash('sha256');for(const path of [...await files('src'),...await files('scripts'),'package.json','package-lock.json'].sort()){hash.update(path);hash.update(await readFile(path));}return hash.digest('hex');
}

/** Validate actual sample points against occupied cells, never a fictitious chord between frames. */
export function assertSampleLegal(plan,board,sample,elapsed,label){
 const n=plan.dimension,p=sample.position,loaded=elapsed>=500,cleared=new Set(loaded?plan.cargoCells:[]);
 assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(sample.angle),`${label}: finite pose`);
 assert.ok(integer(p.x)||integer(p.y),`${label}: physical movement never cuts diagonally across cells`);
 assert.equal(sample.loadedCount,loaded?plan.cargoCells.length:0,`${label}: one atomic load at 500 ms`);
 assert.deepEqual(new Set(sample.pickedCells),cleared,`${label}: all and only this shipment is loaded`);
 if(!inside(p,n)){
  const south=integer(p.x)&&Math.round(p.x)===Math.floor(n/2)&&p.y>=n-1&&p.y<=n;
  const outward=plan.exit.y===-1?integer(p.x)&&Math.round(p.x)===plan.exit.x&&p.y>=-1&&p.y<=0
   :integer(p.y)&&Math.round(p.y)===plan.exit.y&&(plan.exit.x===n?p.x>=n-1&&p.x<=n:p.x>=-1&&p.x<=0);
  assert.ok(!loaded&&south||loaded&&outward,`${label}: outside only through entrance or correct exit`);
 }
 const xs=integer(p.x)?[Math.round(p.x)]:[Math.floor(p.x),Math.ceil(p.x)];
 const ys=integer(p.y)?[Math.round(p.y)]:[Math.floor(p.y),Math.ceil(p.y)];
 for(const x of xs)for(const y of ys){if(!inside({x,y},n))continue;const cell=y*n+x;assert.ok(board[cell]===null||cleared.has(cell),`${label}: crossed occupied cell ${cell}`);}
}

/** Structural steps certify every legal segment skipped between two fast video frames. */
export function traversedSegments(plan,fromMs,toMs){
 return plan.steps.filter(step=>step.endMs>fromMs&&step.startMs<toMs).map(step=>({kind:step.kind,from:step.from,to:step.to,startMs:step.startMs,endMs:step.endMs,loadedCount:step.loadedCount}));
}

export function validateFixedOutboundPlan(plan,event,board,label){
 assert.ok(plan,`${label}: route plan exists`);
 near(plan.durationMs,1000,`${label}: fixed duration`);near(plan.moveAtMs,100,`${label}: approach starts`);near(plan.deliveryAtMs,960.8,`${label}: delivery boundary`);
 const collect=plan.steps.filter(step=>step.kind==='collect'),exit=plan.steps.filter(step=>step.kind==='exit');assert.equal(collect.length,1);assert.equal(exit.length,1);
 near(collect[0].startMs,360,`${label}: contact`);near(collect[0].endMs,500,`${label}: whole load`);near(exit[0].startMs,860,`${label}: exit starts`);near(exit[0].endMs,960.8,`${label}: fade starts`);
 assert.deepEqual(new Set(plan.cargoCells),new Set(event.cells));
 let previousTime=0,previousPoint=plan.steps[0].from,previousAngle=plan.steps[0].fromAngle;
 for(const [index,step]of plan.steps.entries()){
  near(step.startMs,previousTime,`${label}: step ${index} time continuity`);assert.ok(step.endMs>step.startMs);equalPoint(step.from,previousPoint,`${label}: step ${index} path continuity`);near(step.fromAngle,previousAngle,`${label}: step ${index} heading continuity`);
  for(const p of [step.from,step.to])assert.ok(Number.isInteger(p.x)&&Number.isInteger(p.y),`${label}: grid endpoints`);
  if(step.kind==='move'||step.kind==='exit'){
   assert.equal(distance(step.from,step.to),1,`${label}: one cardinal edge per physical move`);near(step.fromAngle,step.toAngle,`${label}: turns are stationary`);
   near(Math.sin(step.toAngle),step.to.y-step.from.y,`${label}: movement follows heading y`);near(Math.cos(step.toAngle),step.to.x-step.from.x,`${label}: movement follows heading x`);
  }else equalPoint(step.from,step.to,`${label}: nonmovement position`);
  assert.equal(step.loadedCount,step.startMs>=500?event.cells.length:0);
  previousTime=step.endMs;previousPoint=step.to;previousAngle=step.toAngle;
 }
 near(previousTime,1000,`${label}: last step`);equalPoint(previousPoint,plan.exit,`${label}: correct exit`);
 // Distance and turn weights determine speed within a budget; there is no minimum ms-per-cell cap.
 const weighted=[];
 for(const [start,end]of [[100,360],[500,860]]){
  const steps=plan.steps.filter(step=>step.startMs>=start-1e-7&&step.endMs<=end+1e-7),moving=steps.filter(step=>step.kind==='move'||step.kind==='turn');
  if(!moving.length){assert.equal(steps.length,1);assert.equal(steps[0].kind,'hold');continue;}
  const weights=moving.map(step=>step.kind==='move'?distance(step.from,step.to):Math.abs(step.toAngle-step.fromAngle)*.22),sum=weights.reduce((a,b)=>a+b,0);
  moving.forEach((step,index)=>near(step.endMs-step.startMs,(end-start)*weights[index]/sum,`${label}: weighted ${step.kind}`));
  weighted.push({startMs:start,endMs:end,moves:moving.filter(step=>step.kind==='move').length,turns:moving.filter(step=>step.kind==='turn').length,totalWeight:sum});
 }
 const exactBoundarySamples=FIXED_PHASE_BOUNDARIES.map(elapsed=>{const sample=sampleOutboundTransport(plan,elapsed/1000);assertSampleLegal(plan,board,sample,elapsed,`${label}/${elapsed}ms`);return{elapsed,...sample};});
 assert.equal(exactBoundarySamples[0].stage,'route');assert.notEqual(exactBoundarySamples[1].stage,'route');assert.equal(exactBoundarySamples[2].stage,'collect');assert.notEqual(exactBoundarySamples[3].stage,'collect');assert.equal(exactBoundarySamples[4].stage,'exit');assert.equal(exactBoundarySamples[5].stage,'hold');assert.equal(exactBoundarySamples[6].finished,true);near(exactBoundarySamples[6].alpha,0,`${label}: fully faded`);
 const samples=new Set([...Array.from({length:1001},(_,i)=>i),...plan.steps.flatMap(step=>[Math.max(0,step.startMs-.001),step.startMs,Math.min(1000,step.startMs+.001),Math.max(0,step.endMs-.001),step.endMs])]);
 for(const elapsed of samples)assertSampleLegal(plan,board,sampleOutboundTransport(plan,elapsed/1000),elapsed,`${label}/${elapsed}ms`);
 const minMoveMs=Math.min(...plan.steps.filter(step=>step.kind==='move').map(step=>step.endMs-step.startMs));
 return{phaseBoundariesMs:FIXED_PHASE_BOUNDARIES,exactBoundarySamples,weighted,legalPoseChecks:samples.size,minMoveMs,steps:plan.steps};
}

/** Capture the unique forklift shadow primitive after the real renderer's transforms. */
export function traceForklifts(ctx){
 const ellipse=ctx.ellipse.bind(ctx),trace={forklifts:[],clear(){trace.forklifts=[];}};
 ctx.ellipse=(x,y,rx,ry,rotation,start,end,...args)=>{
  if(x===0&&y===7&&rx===57&&ry===39&&rotation===0&&start===0&&Math.abs(end-Math.PI*2)<1e-8){const m=ctx.getTransform();trace.forklifts.push({a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f,alpha:ctx.globalAlpha});}
  return ellipse(x,y,rx,ry,rotation,start,end,...args);
 };
 return trace;
}

export function assertActualTransportFrame({trace,labels,plan,event,elapsed,viewport,label}){
 const {w,h,safe=0,dpr=1}=viewport,scale=Math.min(w/1080,(h-safe)/1920),ox=(w-1080*scale)/2,oy=safe+(h-safe-1920*scale)/2,canvasScale=scale*dpr;
 const sample=sampleOutboundTransport(plan,Math.min(1,elapsed/1000)),pose=outboundVehicleDisplay(event,sample),geometry=boardGeometry(event),vehicleScale=pose.vehicleSize/110*canvasScale;
 const vehicles=trace.forklifts.filter(m=>Math.abs(Math.hypot(m.a,m.b)-vehicleScale)<1e-7);
 if(elapsed<100||elapsed>=1000){assert.equal(vehicles.length,0,`${label}: vehicle absent before movement/after settlement`);return{vehicleChecks:0,badgeChecks:0};}
 assert.equal(vehicles.length,1,`${label}: one actual outbound forklift`);const actual=vehicles[0];
 const expected={a:Math.cos(pose.angle)*vehicleScale,b:Math.sin(pose.angle)*vehicleScale,c:-Math.sin(pose.angle)*vehicleScale,d:Math.cos(pose.angle)*vehicleScale,e:(ox+pose.x*scale)*dpr,f:(oy+pose.y*scale)*dpr,alpha:pose.alpha};
 // Native Canvas stores globalAlpha in eight bits; transforms retain the tighter pixel tolerance.
 for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<(key==='alpha'?1/255+1e-7:1e-4),`${label}: actual Canvas forklift ${key}: ${actual[key]} != ${expected[key]}`);
 const badge=labels.filter(item=>item.text===`${sample.loadedCount}件`&&Math.abs(item.x-(ox+pose.cargo.x*scale)*dpr)<1e-4&&Math.abs(item.y-(oy+(pose.cargo.y+16*geometry.scale)*scale)*dpr)<1e-4);
 if(sample.loadedCount>0)assert.equal(badge.length,1,`${label}: actual whole-load badge`);
 return{vehicleChecks:1,badgeChecks:sample.loadedCount>0?1:0,actualForklift:actual};
}
