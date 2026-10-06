import test from 'node:test';
import assert from 'node:assert/strict';
import type { CargoId, Cell, Point, Shipment } from '../src/domain/types.ts';
import { buildOutboundTransport, sampleOutboundTransport, OUTBOUND_TRANSPORT_TIMING } from '../src/presentation/outbound-transport.ts';
import type { OutboundTransportPlan } from '../src/presentation/outbound-transport.ts';

type Side = 'north' | 'east' | 'west';
const cellAt = (p: Point, dimension: number): number => p.y * dimension + p.x;
const pointAt = (cell: number, dimension: number): Point => ({ x: cell % dimension, y: Math.floor(cell / dimension) });
const distance = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const angleNear = (actual: number, expected: number): void => near(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)), 0);
function neighbors(cell: number, dimension: number): number[] {
  const p = pointAt(cell, dimension);
  return [{ x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y }]
    .filter(p => p.x >= 0 && p.y >= 0 && p.x < dimension && p.y < dimension).map(p => cellAt(p, dimension));
}
function fixture(dimension: 7 | 9, points: Point[], side: Side = 'north', path?: Point[]): { shipment: Shipment; board: Cell[] } {
  const middle = Math.floor(dimension / 2), cargo: CargoId = side === 'north' ? 'cargo.food' : side === 'east' ? 'cargo.chem' : 'cargo.machine';
  const exit = side === 'north' ? { x: middle, y: 0 } : { x: side === 'east' ? dimension - 1 : 0, y: middle };
  const cells = points.map(p => cellAt(p, dimension)), group = new Set(cells), root = cellAt(exit, dimension), board: Cell[] = Array(dimension ** 2).fill(null);
  for (const cell of cells) board[cell] = cargo;
  const queue = [root], parents = new Map<number, number>([[root, -1]]);
  for (let cursor = 0; cursor < queue.length; cursor++) for (const next of neighbors(queue[cursor], dimension)) if (group.has(next) && !parents.has(next)) {
    parents.set(next, queue[cursor]); queue.push(next);
  }
  assert.equal(parents.size, cells.length, 'test group is gate-connected');
  const cargoPaths = cells.map(cell => {
    const route: Point[] = [];
    for (let at = cell; at !== -1; at = parents.get(at)!) route.push(pointAt(at, dimension));
    return { cell, path: route };
  });
  if (!path) {
    const start = cellAt({ x: middle, y: dimension - 1 }, dimension), accessQueue = [start], accessParents = new Map<number, number>([[start, -1]]);
    assert.equal(board[start], null, 'test entrance is empty');
    for (let cursor = 0; cursor < accessQueue.length; cursor++) {
      const current = accessQueue[cursor];
      if (neighbors(current, dimension).some(cell => group.has(cell))) {
        path = [];
        for (let at = current; at !== -1; at = accessParents.get(at)!) path.push(pointAt(at, dimension));
        path.reverse(); break;
      }
      for (const next of neighbors(current, dimension)) if (board[next] === null && !accessParents.has(next)) {
        accessParents.set(next, current); accessQueue.push(next);
      }
    }
  }
  assert.ok(path);
  return { board, shipment: { type: 'shipment', ...(dimension === 9 ? { boardSize: 9 as const } : {}), transport: 'conveyor', cargo, cells,
    path, cargoPaths, dockId: `dock.${side}`, orderId: `exit.${cargo.slice(6)}`, score: cells.length * 10, chain: 1 } };
}
const forkPoints = [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 3 }];
function planFor(event: ReturnType<typeof fixture>): OutboundTransportPlan {
  const plan = buildOutboundTransport(event.shipment, event.board); assert.ok(plan); return plan;
}
function assertSafePlan(event:ReturnType<typeof fixture>,plan:OutboundTransportPlan):void {
 const {shipment,board}=event,group=new Set(shipment.cells);let loaded=false,collects=0;let previous=plan.steps[0];
 for(const step of plan.steps){assert.deepEqual(step.from,previous.to);near(step.startMs,previous===step?0:previous.endMs);assert.ok(step.endMs>step.startMs);assert.equal(step.loadedCount,loaded?group.size:0);
  if(step.kind==='collect'){collects++;assert.deepEqual(step.from,step.to);assert.deepEqual(step.from,shipment.path[shipment.path.length-1]);assert.ok(shipment.cells.some(cell=>distance(step.from,pointAt(cell,plan.dimension))===1));loaded=true;}
  else if(step.kind==='move'||step.kind==='exit'){assert.equal(distance(step.from,step.to),1);angleNear(step.fromAngle,step.toAngle);angleNear(step.fromAngle,Math.atan2(step.to.y-step.from.y,step.to.x-step.from.x));if(step.kind==='exit')assert.ok(loaded);else {const cell=cellAt(step.to,plan.dimension);assert.ok(board[cell]===null||loaded&&group.has(cell),'drive only through empty cells or the already collected group');}}
  else assert.deepEqual(step.from,step.to);previous=step;
 }
 assert.equal(collects,1);assert.deepEqual(new Set(plan.cargoCells),group);near(previous.endMs,plan.durationMs);
}
for(const dimension of [7,9] as const)for(const side of ['north','east','west'] as const)test(`${dimension}×${dimension} ${side} loads once and carries the whole group through the correct exit`,()=>{
 const mid=Math.floor(dimension/2),north=[{x:mid,y:0},{x:mid,y:1},{x:mid+1,y:1},{x:mid+1,y:2}],points=north.map(p=>side==='north'?p:side==='east'?{x:dimension-1-p.y,y:p.x}:{x:p.y,y:dimension-1-p.x}),event=fixture(dimension,points,side),plan=planFor(event);assertSafePlan(event,plan);
 const collect=plan.steps.find(s=>s.kind==='collect')!,before=sampleOutboundTransport(plan,(collect.endMs-.001)/plan.durationMs),after=sampleOutboundTransport(plan,collect.endMs/plan.durationMs);assert.equal(before.loadedCount,0);assert.equal(after.loadedCount,4);const final=sampleOutboundTransport(plan,1);assert.deepEqual(final.position,plan.exit);assert.equal(final.alpha,0);assert.equal(final.loadedCount,4);angleNear(final.angle,side==='north'?-Math.PI/2:side==='east'?0:Math.PI);assert.equal(plan.moveAtMs,OUTBOUND_TRANSPORT_TIMING.routeMs);assert.equal(plan.deliveryAtMs,plan.steps.find(s=>s.kind==='exit')!.endMs);
});
test('branches and rings do not create per-box pickups or collection detours',()=>{for(const points of [forkPoints,[{x:4,y:0},{x:4,y:1},{x:5,y:1},{x:4,y:2},{x:5,y:2}]]){const event=fixture(9,points),plan=planFor(event);assertSafePlan(event,plan);assert.equal(plan.steps.filter(s=>s.kind==='collect').length,1);const q=event.shipment.path[event.shipment.path.length-1];assert.equal(plan.route!.moves,Math.abs(q.x-4)+q.y);assert.ok(plan.durationMs<5000);}});
test('collection is stationary with contact pause and a simultaneous exact load boundary',()=>{const event=fixture(9,forkPoints),plan=planFor(event),i=plan.steps.findIndex(s=>s.kind==='collect'),step=plan.steps[i];assert.equal(plan.steps[i-1].kind,'hold');near(plan.steps[i-1].endMs-plan.steps[i-1].startMs,100);near(step.endMs-step.startMs,140);const middle=sampleOutboundTransport(plan,(step.startMs+70)/plan.durationMs);assert.deepEqual(middle.position,step.from);near(middle.collect!.progress,.5);assert.equal(middle.loadedCount,0);assert.deepEqual(middle.pickedCells,[]);const complete=sampleOutboundTransport(plan,step.endMs/plan.durationMs);assert.equal(complete.loadedCount,event.shipment.cells.length);assert.deepEqual(new Set(complete.pickedCells),new Set(event.shipment.cells));});
test('large load count does not add a pickup tour or capacity limit',()=>{const event=fixture(9,Array.from({length:81},(_,cell)=>pointAt(cell,9)).filter(p=>p.x!==4||p.y!==8)),plan=planFor(event);assertSafePlan(event,plan);assert.equal(plan.cargoCells.length,80);assert.equal(plan.route!.moves,8);assert.ok(plan.durationMs<3000);assert.deepEqual(planFor(event),plan);});
test('residual color stays occupied during the carried path and before the next chain',()=>{const event=fixture(9,forkPoints);event.board[30]='cargo.chem';event.board[32]='cargo.machine';const before=JSON.stringify(event),plan=planFor(event);assertSafePlan(event,plan);assert.ok(plan.steps.filter(s=>s.kind==='move').every(s=>![30,32].includes(cellAt(s.to,9))));assert.equal(JSON.stringify(event),before);});
test('gate dwell stays opaque and the full loaded vehicle fades only after leaving',()=>{const plan=planFor(fixture(9,forkPoints)),gateHold=plan.steps[plan.steps.length-3];assert.equal(gateHold.kind,'hold');const middle=sampleOutboundTransport(plan,(gateHold.startMs+gateHold.endMs)/2/plan.durationMs);assert.equal(middle.alpha,1);const outside=sampleOutboundTransport(plan,(plan.deliveryAtMs+OUTBOUND_TRANSPORT_TIMING.holdMs/2)/plan.durationMs);near(outside.alpha,.5);assert.deepEqual(outside.position,plan.exit);assert.equal(outside.loadedCount,8);});
test('sampling across jumps and reverse scrubbing preserves atomic loading without mutable state',()=>{const plan=planFor(fixture(9,forkPoints)),before=JSON.stringify(plan),end=plan.steps.find(s=>s.kind==='collect')!.endMs;for(const p of [0,.8,.1,1,.3]){const f=sampleOutboundTransport(plan,p);assert.equal(f.loadedCount,p*plan.durationMs>=end?8:0);}assert.deepEqual(sampleOutboundTransport(plan,NaN),sampleOutboundTransport(plan,0));assert.deepEqual(sampleOutboundTransport(plan,-1),sampleOutboundTransport(plan,0));assert.deepEqual(sampleOutboundTransport(plan,2),sampleOutboundTransport(plan,1));assert.equal(JSON.stringify(plan),before);});

test('frozen input events and board snapshots remain unchanged', () => {
  const event = fixture(9, forkPoints), before = JSON.stringify(event);
  const freeze = (value: unknown): void => { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } };
  freeze(event); const plan = planFor(event); for (const progress of [0, .1, .6, 1]) sampleOutboundTransport(plan, progress);
  assert.equal(JSON.stringify(event), before);
});

test('invalid shipment, board, route, cargo and inconsistent tree metadata are rejected safely', () => {
  const base = fixture(9, forkPoints), copy = (): ReturnType<typeof fixture> => structuredClone(base), invalid: ReturnType<typeof fixture>[] = [];
  const mutate = (change: (event: ReturnType<typeof fixture>) => void): void => { const event = copy(); change(event); invalid.push(event); };
  mutate(e => { e.shipment.transport = undefined; }); mutate(e => { e.shipment.boardSize = 7 as 9; });
  mutate(e => { e.shipment.cells = []; }); mutate(e => { e.shipment.cells.push(e.shipment.cells[0]); });
  mutate(e => { e.shipment.cells[0] = NaN; }); mutate(e => { e.shipment.cells[0] = 81; });
  mutate(e => { e.shipment.path = []; }); mutate(e => { e.shipment.path[0] = { x: 3, y: 8 }; });
  mutate(e => { e.shipment.path[1] = { x: NaN, y: 7 }; }); mutate(e => { delete e.shipment.path[1]; });
  mutate(e => { e.shipment.path[1] = { x: 8, y: 0 }; }); mutate(e => { e.shipment.path.push(e.shipment.path[e.shipment.path.length - 1]); });
  mutate(e => { e.shipment.path = [{ x: 4, y: 8 }]; });
  mutate(e => { e.board[cellAt(e.shipment.path[1], 9)] = 'cargo.chem'; });
  mutate(e => { e.board[e.shipment.cells[1]] = 'cargo.machine'; }); mutate(e => { e.board.pop(); });
  mutate(e => { e.shipment.cargo = 'cargo.chem'; }); mutate(e => { e.shipment.dockId = 'dock.west'; });
  mutate(e => { e.shipment.cargoPaths = undefined; }); mutate(e => { e.shipment.cargoPaths!.pop(); });
  mutate(e => { e.shipment.cargoPaths!.push(e.shipment.cargoPaths![0]); });
  mutate(e => { e.shipment.cargoPaths![1].path.reverse(); });
  mutate(e => { e.shipment.cargoPaths![1].path.push({ x: 4, y: 1 }); });
  mutate(e => { e.shipment.cargoPaths![1].path[0] = { x: 5, y: 1 }; });
  mutate(e => { e.shipment.cargoPaths![3].path.splice(1, 1); });
  mutate(e => { delete e.shipment.cargoPaths![1].path[0]; });
  mutate(e => { e.shipment = null as unknown as Shipment; }); mutate(e => { e.board = null as unknown as Cell[]; });
  for (const event of invalid) assert.doesNotThrow(() => assert.equal(buildOutboundTransport(event.shipment, event.board), null));
  const loop = fixture(9, [{ x: 4, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 2 }]);
  loop.shipment.cargoPaths!.find(cargo => cargo.cell === 23)!.path = [{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 }];
  loop.shipment.cargoPaths!.find(cargo => cargo.cell === 22)!.path = [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 0 }];
  assert.equal(buildOutboundTransport(loop.shipment, loop.board), null, 'individually valid paths cannot certify contradictory parents');
});
