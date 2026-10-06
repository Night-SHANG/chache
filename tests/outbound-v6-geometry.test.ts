import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { cellCenter, pointToCell } from '../src/presentation/layout.ts';
import { colorExitCargoPose, colorExitVehiclePose } from '../src/presentation/color-exit-motion.ts';
import { shipmentFrame, shipmentGate, shipmentPose, shipmentTiming } from '../src/presentation/motion.ts';
import { drawColorExitGates, drawColorExitRoutes, drawColorExitShipment, drawMixedRemainder, drawColorExitHelpDiagram } from '../src/presentation/color-exit-renderer.ts';
import { mixedPiecePreview } from '../src/presentation/mixed-piece-feedback.ts';
import { createProfile } from '../src/application/profile.ts';
import { createRun } from '../src/domain/engine.ts';
import type { Point, RunState, Shipment } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';

const size9 = { boardSize: 9 }, pitch = 840 / 9;
const center9 = (p: Point): Point => ({ x: 120 + (p.x + .5) * pitch, y: 560 + (p.y + .5) * pitch });
const view = (patch: Partial<ViewState> = {}): ViewState => ({ selectedPieceId: null, hoverOrigin: null, preview: null, dragPoint: null, paused: false, message: '', saveStatus: '', elapsed: 0, animation: null, debug: false, needsResume: false, profile: createProfile(), ...patch });
function state9(): RunState & { boardSize: 9 } {
  return { ...createRun(7, 'color_exit', 5, 'entry'), rulesetVersion: 6, runConfigId: 'run.outbound9_v6.easy', boardSize: 9, board: Array(81).fill(null) };
}
function event9(side: 'north' | 'east' | 'west' = 'north'): Shipment & { boardSize: 9; cargoPaths: {cell:number;path:Point[]}[] } {
  const source = [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 7, y: 2 }, { x: 7, y: 3 }];
  const points = source.map(p => side === 'east' ? { x: 8 - p.y, y: p.x } : side === 'west' ? { x: p.y, y: 8 - p.x } : p);
  const access = side === 'north' ? [{ x: 4, y: 8 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 3, y: 6 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 4, y: 3 }, { x: 4, y: 2 }]
    : side === 'east' ? [{ x: 4, y: 8 }, { x: 5, y: 8 }, { x: 6, y: 8 }]
    : [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 3, y: 7 }, { x: 2, y: 7 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 3, y: 5 }, { x: 3, y: 4 }, { x: 2, y: 4 }];
  const cargo = side === 'north' ? 'cargo.food' : side === 'east' ? 'cargo.chem' : 'cargo.machine';
  return { type: 'shipment', boardSize: 9, transport: 'conveyor', dockId: `dock.${side}`, orderId: `exit.${cargo.slice(6)}`, cargo,
    cells: points.map(p => p.y * 9 + p.x), path: access, score: points.length * 10, chain: 1,
    cargoPaths: points.map((p, i) => ({ cell: p.y * 9 + p.x, path: points.slice(0, i + 1).reverse() })) };
}
const onSegment = (p: Point, a: Point, b: Point): boolean => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) < .001
  && p.x >= Math.min(a.x, b.x) - .001 && p.x <= Math.max(a.x, b.x) + .001 && p.y >= Math.min(a.y, b.y) - .001 && p.y <= Math.max(a.y, b.y) + .001;

// A remaining 120px pitch would route the bottom-right hit into the old seventh row.
test('v6 corners and every nine-grid center hit the same logical cell while old default pixels stay fixed', () => {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    assert.deepEqual(cellCenter({ x, y }, size9), center9({ x, y }));
    assert.deepEqual(pointToCell(center9({ x, y }), size9), { x, y });
  }
  for (const p of [{ x: 120, y: 560 }, { x: 959.999, y: 560 }, { x: 120, y: 1399.999 }, { x: 959.999, y: 1399.999 }]) {
    assert.deepEqual(pointToCell(p, size9), { x: p.x === 120 ? 0 : 8, y: p.y === 560 ? 0 : 8 });
  }
  for (const p of [{ x: 960, y: 560 }, { x: 120, y: 1400 }, { x: 119.999, y: 560 }, { x: NaN, y: 600 }]) assert.equal(pointToCell(p, size9), null);
  assert.deepEqual(cellCenter({ x: 6, y: 6 }), { x: 900, y: 1340 });
  assert.deepEqual(pointToCell({ x: 959.999, y: 1399.999 }), { x: 6, y: 6 });
});

for (const side of ['north', 'east', 'west'] as const) test(`v6 ${side} conveyor uses its nine-grid cargo lines and empty turn-aware south return`, () => {
  const event = event9(side), before = JSON.stringify(event);
  assert.ok(event.path.every(p => !event.cells.includes(p.y * 9 + p.x)), 'fixture access path must be empty');
  for (const cargo of event.cargoPaths) {
    const route = cargo.path.map(center9), end = route[route.length - 1];
    route.push(side === 'north' ? { x: end.x, y: 560 - 96 * 7 / 9 } : side === 'east' ? { x: 960 + 96 * 7 / 9, y: end.y } : { x: 120 - 96 * 7 / 9, y: end.y });
    for (let i = 0; i <= 100; i++) {
      const frame = shipmentFrame(i / 100, false), box = colorExitCargoPose(event, cargo.cell, frame), vehicle = colorExitVehiclePose(event, frame);
      assert.ok(box, `cargo ${cargo.cell} at ${i}`); assert.ok(vehicle, `vehicle ${side} at ${i}`); assert.equal(vehicle.loaded, false);
      assert.ok(route.slice(1).some((p, j) => onSegment(box, route[j], p)), 'cargo must stay on the event-owned polyline');
      assert.ok([box.x, box.y, vehicle.x, vehicle.y, vehicle.angle].every(Number.isFinite));
      assert.deepEqual({ x: vehicle.x, y: vehicle.y, angle: vehicle.angle }, ((p) => ({ x: p.x, y: p.y, angle: p.angle }))(shipmentPose(event, frame)!));
    }
    assert.equal(colorExitCargoPose(event, cargo.cell, shipmentFrame(1, false))!.alpha, 0);
    for (const progress of [0, .5, 1]) assert.deepEqual(colorExitCargoPose(event, cargo.cell, shipmentFrame(progress, true)), { ...center9(cargo.path[0]), scale: 1, alpha: 1 });
  }
  const finish = colorExitVehiclePose(event, shipmentFrame(1, false))!;
  assert.equal(finish.x, 540); assert.ok(finish.y > 1400); assert.equal(finish.alpha, 0);
  assert.equal(colorExitVehiclePose(event, shipmentFrame(.5, true)), null);
  assert.equal(JSON.stringify(event), before); assert.equal(shipmentTiming(false).totalMs, 1000); assert.equal(shipmentTiming(true).totalMs, 80);
  const gate = shipmentGate(event)!; assert.equal(gate.x, 540); assert.ok(gate.y > 1400);
});

test('v6 transport refuses missing size metadata, out-of-board paths, shortcuts, wrong exits and foreign cargo cells', () => {
  const valid = event9(), frame = shipmentFrame(.7, false), cell = valid.cells[valid.cells.length - 1];
  assert.equal(shipmentPose({ ...valid, boardSize: undefined }, frame), null);
  assert.equal(colorExitVehiclePose({ ...valid, boardSize: undefined }, frame), null);
  const badPaths = [[{ x: 4, y: 8 }, { x: 4, y: 9 }], [{ x: 4, y: 8 }, { x: 4, y: 2 }], [{ x: 3, y: 6 }, { x: 4, y: 6 }]];
  for (const path of badPaths) assert.equal(colorExitVehiclePose({ ...valid, path }, frame), null);
  for (const event of [{ ...valid, boardSize: undefined }, { ...valid, cargo: 'cargo.machine' }, { ...valid, dockId: 'dock.east' },
    { ...valid, cargoPaths: [{ cell, path: [{ x: 7, y: 3 }, { x: 4, y: 0 }] }] },
    { ...valid, cells: valid.cells.slice(1) }, { ...valid, cargoPaths: [{ cell, path: [{ x: 7, y: 3 }, { x: 9, y: 3 }] }] }]) {
    assert.equal(colorExitCargoPose(event as Shipment, cell, frame), null);
  }
});

function surface() {
  const ctx = createCanvas(1080, 1920).getContext('2d') as unknown as CanvasRenderingContext2D;
  const borders: { x:number;y:number;w:number;h:number }[] = [], labels:string[] = [], vertices:Point[] = [], clips:number[][] = [], scales:number[][] = [];
  const strokeRect = ctx.strokeRect.bind(ctx), fillText = ctx.fillText.bind(ctx), moveTo = ctx.moveTo.bind(ctx), lineTo = ctx.lineTo.bind(ctx), rect = ctx.rect.bind(ctx), scale = ctx.scale.bind(ctx);
  ctx.strokeRect = (x,y,w,h) => { borders.push({x,y,w,h}); strokeRect(x,y,w,h); };
  ctx.fillText = (text,x,y) => { labels.push(text); fillText(text,x,y); };
  ctx.moveTo = (x,y) => { vertices.push({x,y}); moveTo(x,y); }; ctx.lineTo = (x,y) => { vertices.push({x,y}); lineTo(x,y); };
  ctx.rect = (x,y,w,h) => { clips.push([x,y,w,h]); rect(x,y,w,h); }; ctx.scale = (x,y) => { scales.push([x,y]); scale(x,y); };
  return {ctx,borders,labels,vertices,clips,scales};
}

test('v6 mixed p5 remainder uses actual cell colors and nine-wide indices above legacy range', () => {
  const state = state9(); state.candidates = [{ id:'mixed',shapeId:'shape.p5',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem','cargo.chem'] }];
  const cells = [58,59,67,68,76], event = { ...event9(), cells:[4,13,58,59] };
  const current = view({ selectedPieceId:'mixed', preview:{ valid:true,events:[],cells,shipments:[event] } });
  assert.deepEqual(mixedPiecePreview(state,current)?.remaining.map(item => item.cell),[67,68,76]);
  const drawn = surface(); drawMixedRemainder(drawn.ctx,state,current); assert.equal(drawn.borders.length,3);
  for (const [i,border] of drawn.borders.entries()) {
    const origin = center9({x:[67,68,76][i]%9,y:Math.floor([67,68,76][i]/9)});
    assert.ok(border.x > origin.x-pitch/2 && border.x+border.w < origin.x+pitch/2);
    assert.ok(border.y > origin.y-pitch/2 && border.y+border.h < origin.y+pitch/2);
  }
});

test('v6 gate blocking, freight preview outlines, and vehicle clipping all use scaled geometry', () => {
  const state=state9(), current=view(), event=event9(); state.board[76]='cargo.machine';
  const gates=surface(); drawColorExitGates(gates.ctx,state,current); assert.match(gates.labels.join(' '),/入口堵塞/);
  state.board[76]=null; state.board[45]='cargo.machine'; const open=surface(); drawColorExitGates(open.ctx,state,current); assert.doesNotMatch(open.labels.join(' '),/入口堵塞/);
  const routes=surface(); drawColorExitRoutes(routes.ctx,view({preview:{valid:true,events:[],cells:[],shipments:[event]}}));
  assert.ok(routes.vertices.some(p => Math.abs(p.x-center9({x:4,y:0}).x)<.001 && Math.abs(p.y-center9({x:4,y:0}).y)<.001));
  assert.equal(routes.borders.length,event.cells.length); assert.ok(routes.borders.every(b => Math.abs(b.w-110*7/9)<.001));
  const vehicle=surface(),board=Array(81).fill(null);for(const cell of event.cells)board[cell]=event.cargo;drawColorExitShipment(vehicle.ctx,event,.4,view({animation:{shipment:event,progress:.4,board}})); assert.ok(vehicle.clips.some(c => Math.abs(c[0]-(120-30*7/9))<.001));
  assert.ok(vehicle.scales.some(s => Math.abs(s[0]-pitch*.6/110)<.001));
});

// A seven-wide help board would teach new outbound users the wrong landing coordinates.
test('v6 help uses two nine-square illustrative boards while legacy help remains seven-square', () => {
  for (const mixed of [false, true]) for (const source of [undefined, size9]) {
    const drawn=surface(), fill=drawn.ctx.fillRect.bind(drawn.ctx); let tiles=0;
    drawn.ctx.fillRect=(x,y,w,h)=>{if(drawn.ctx.fillStyle==='#56636a')tiles++;fill(x,y,w,h);};
    drawColorExitHelpDiagram(drawn.ctx,{x:0,y:0,w:800,h:430},mixed,source);
    assert.equal(tiles,(source?81:49)*(mixed?2:1));
  }
});

test('unknown explicit shipment dimensions never silently fall back to a legacy seven-grid route', () => {
  const points=[{x:3,y:0},{x:3,y:1},{x:4,y:1},{x:4,y:2}], frame=shipmentFrame(.7,false);
  const event:Shipment={type:'shipment',transport:'conveyor',dockId:'dock.north',orderId:'exit.food',cargo:'cargo.food',score:40,chain:1,
    cells:points.map(p=>p.y*7+p.x),path:[6,5,4,3,2].map(y=>({x:3,y})),
    cargoPaths:points.map((p,i)=>({cell:p.y*7+p.x,path:points.slice(0,i+1).reverse()}))};
  assert.ok(shipmentPose(event,frame)); assert.ok(colorExitCargoPose(event,18,frame));
  for(const boardSize of [0,7,8,10,NaN,'9']) {
    const forged={...event,boardSize} as unknown as Shipment;
    assert.equal(shipmentPose(forged,frame),null); assert.equal(colorExitCargoPose(forged,18,frame),null);
  }
});

test('v6 cargo traverses a sixty-cell bent conveyor without shortcuts, overflow, mutation or incomplete exit', () => {
  const points:Point[]=[{x:4,y:0},...Array.from({length:5},(_,i)=>({x:4+i,y:1}))];
  for(let y=2;y<=7;y++)for(let x=0;x<9;x++)points.push({x:y%2===0?8-x:x,y});
  const event={...event9(),cells:points.map(p=>p.y*9+p.x),path:[{x:4,y:8}],cargoPaths:points.map((p,i)=>({cell:p.y*9+p.x,path:points.slice(0,i+1).reverse()}))};
  const before=JSON.stringify(event), cargo=event.cargoPaths[event.cargoPaths.length-1], line=cargo.path.map(center9);
  line.push({x:540,y:560-96*7/9}); assert.ok(cargo.path.length>=60);
  for(let i=0;i<=500;i++){
    const pose=colorExitCargoPose(event,cargo.cell,shipmentFrame(i/500,false));assert.ok(pose);
    assert.ok(line.slice(1).some((p,j)=>onSegment(pose,line[j],p)));assert.ok(pose.alpha>=0&&pose.alpha<=1);
  }
  assert.equal(colorExitCargoPose(event,cargo.cell,shipmentFrame(1,false))!.alpha,0);
  assert.equal(JSON.stringify(event),before);
});

test('malformed conveyor metadata is rejected without dereferencing null, sparse, or non-array waypoints', () => {
  const event=event9(), frame=shipmentFrame(.7,false), cell=event.cells[0];
  const sparse:Point[]=[]; sparse.length=2;sparse[0]={x:4,y:0};
  for(const cargoPaths of [null,[null],[{cell,path:null}],[{cell,path:'bad'}],[{cell,path:[null]}],[{cell,path:sparse}],
    [event.cargoPaths[0],{cell:event.cells[1],path:null}],new Array(2)]) {
    assert.equal(colorExitCargoPose({...event,cargoPaths} as unknown as Shipment,cell,frame),null);
  }
  for(const cells of [null,[cell,81],[cell,-1],[cell,NaN],[cell,1.5]]) {
    assert.equal(colorExitCargoPose({...event,cells} as unknown as Shipment,cell,frame),null);
  }
});
