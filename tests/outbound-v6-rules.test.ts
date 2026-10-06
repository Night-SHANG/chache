import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import type {CargoId,Command,CommandResult,Piece,Point,RunState,Shipment} from '../src/domain/types.ts';
import * as engine from '../src/domain/v6/engine.ts';
import * as content from '../src/domain/v6/content.ts';
import * as board from '../src/domain/v6/board.ts';
function rules(){return {...engine,...content,...board};}
const F:CargoId='cargo.food',M:CargoId='cargo.machine',C:CargoId='cargo.chem';
const difficulties=['easy','normal','hard','expert'] as const;
const thresholds={easy:20,normal:30,hard:40,expert:50};
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const shipments=(result:CommandResult)=>result.events.filter((e):e is Shipment=>e.type==='shipment');
function prepared(shapeId='shape.square',cellCargos:CargoId[]=[F,F,M,M],origin:Point={x:4,y:2}){
 const state=rules().createRunV6(17,'easy');state.candidates=[{id:'fixture.mix',shapeId,cargo:cellCargos[0],cellCargos},{id:'fixture.keep',shapeId:'shape.single',cargo:M},{id:'fixture.third',shapeId:'shape.domino_v',cargo:C}];
 return {state,command:{type:'place',pieceId:'fixture.mix',origin} as const};
}
const target=(state:RunState,cargo:CargoId)=>state.orders.find(order=>order.cargo===cargo)!;
function connected(points:Point[],indices:number[]):boolean {
 const seen=new Set([indices[0]]),queue=[indices[0]];for(const i of queue)for(const j of indices)if(!seen.has(j)&&Math.abs(points[i].x-points[j].x)+Math.abs(points[i].y-points[j].y)===1){seen.add(j);queue.push(j);}return seen.size===indices.length;
}
// Mutation targets: identity/version, nine-wide stride, gate coordinates and frozen old files.
test('v6 creates independent explicit four-difficulty 81-cell runs with fixed gates and three candidates',()=>{
 const r=rules();assert.deepEqual(r.OUTBOUND_DIFFICULTIES,difficulties);assert.deepEqual(r.MIXED_COLOR_PERCENT_V6,thresholds);
 assert.deepEqual(r.OUTBOUND_ENTRY.entry,{x:4,y:8});assert.deepEqual(r.OUTBOUND_DOCKS.map(d=>[d.cargo,d.entry]),[[F,{x:4,y:0}],[C,{x:8,y:4}],[M,{x:0,y:4}]]);
 for(const difficulty of difficulties){const s=r.createRunV6(17,difficulty);assert.equal(s.mode,'color_exit');assert.equal(s.rulesetVersion,6);assert.equal(s.boardSize,9);assert.equal(s.difficultyId,difficulty);assert.equal(s.runConfigId,`run.outbound9_v6.${difficulty}`);assert.ok(!Object.prototype.hasOwnProperty.call(s,'colorTier'));assert.equal(s.board.length,81);assert.equal(s.cellTraits!.length,81);assert.equal(s.generatedPieces,3);assert.equal(s.candidates.length,3);assert.equal(s.shift,1);assert.deepEqual(s,r.createRunV6(17,difficulty));assert.deepEqual(s.orders,r.OUTBOUND_TARGETS);}
 for(const bad of [undefined,null,'entry','',20])assert.throws(()=>r.createRunV6(1,bad as never),/难度|difficulty|版本/i);
});
test('nine-wide graph has no horizontal wrapping and exact reversible coordinates',()=>{
 const r=rules();for(let i=0;i<81;i++){assert.equal(r.toIndexV6(r.toPointV6(i)),i);for(const n of r.neighborsV6(i)){assert.ok(n>=0&&n<81);assert.ok(r.neighborsV6(n).includes(i));const a=r.toPointV6(i),b=r.toPointV6(n);assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y),1);}}
 assert.deepEqual(r.neighborsV6(8),[17,7]);assert.deepEqual(r.neighborsV6(9),[0,10,18]);assert.deepEqual(r.neighborsV6(80),[71,79]);
 const cells:Array<CargoId|null>=Array(81).fill(null);cells[8]=F;cells[9]=F;assert.equal(r.collectGroupsV6(cells).length,2);
});
// Mutation target: omitted/extra partition, disconnected regions, shape weighting by pattern count.
test('eight mixed shapes enumerate exactly all 66 legal canonical two-region patterns',()=>{
 const r=rules();assert.deepEqual(r.MIXED_SHAPES_V6,['shape.square','shape.i4_h','shape.i4_v','shape.l4_e','shape.l4_w','shape.s4_h','shape.z4_h','shape.p5']);
 assert.equal(r.MIXED_COLOR_PATTERNS_V6.length,66);const unique=new Set<string>();
 for(const shapeId of r.MIXED_SHAPES_V6){const points=SHAPES.find(s=>s.id===shapeId)!.cells,canonical:string[]=[];
  for(let mask=0;mask<1<<points.length;mask++){if(mask&1)continue;const a:number[]=[],b:number[]=[];points.forEach((_,i)=>(mask&(1<<i)?b:a).push(i));if(a.length>=2&&b.length>=2&&connected(points,a)&&connected(points,b))canonical.push(points.map((_,i)=>mask&(1<<i)?'B':'A').join(''));}
  assert.deepEqual([...r.MIXED_PARTITIONS_V6[shapeId]].sort(),canonical.sort());
 }
 for(const pattern of r.MIXED_COLOR_PATTERNS_V6){const p:Piece={id:'valid',shapeId:pattern.shapeId,cargo:pattern.cellCargos[0],cellCargos:[...pattern.cellCargos]};assert.equal(r.isValidOutboundPieceV6(p),true);unique.add(`${p.shapeId}:${p.cellCargos}`);const shape=SHAPES.find(s=>s.id===p.shapeId)!;const colors=new Set(p.cellCargos);assert.equal(colors.size,2);for(const color of colors){const indices=p.cellCargos!.flatMap((c,i)=>c===color?[i]:[]);assert.ok(indices.length>=2);assert.ok(connected(shape.cells,indices));}}
 assert.equal(unique.size,66);
});
test('strict v6 validator rejects malformed, unsupported, disconnected and trait-bearing encodings',()=>{
 const r=rules(),base:Piece={id:'mixed',shapeId:'shape.square',cargo:F,cellCargos:[F,F,M,M]};
 for(const bad of [null,[],{}, {...base,id:''}, {...base,shapeId:'unknown'},{...base,cargo:C},{...base,cellCargos:[F,M,M,F]},{...base,cellCargos:[F,F,F,M]},{...base,cellCargos:[F,F,F,F]},{...base,cellCargos:[F,F,M,C]},{...base,cellCargos:[F,F,'cargo.cold','cargo.cold']},{...base,shapeId:'shape.t4_n'},{...base,shapeId:'shape.cross5',cellCargos:[F,F,M,M,M]},{...base,shapeId:'shape.single'},{...base,trait:'pallet'},{...base,rushTurns:2},{...base,cellCargos:null},{...base,cellCargos:[F,F,M]}])assert.equal(r.isValidOutboundPieceV6(bad),false,JSON.stringify(bad));
 for(const shape of SHAPES)assert.equal(r.isValidOutboundPieceV6({id:'solid',shapeId:shape.id,cargo:M}),true);
});
// Mutation targets: draw count/order/range and conditional draws after choosing pure or mixed.
test('generation consumes exactly six fixed-range draws without mutating input',()=>{
 const r=rules();let rng=createRandomState(7721);const values:number[]=[];for(const [min,max] of [[1,100],[0,2147483647],[0,2147483647],[0,7],[0,5],[0,5]]){const d=nextRandom(rng,min,max);rng=d.state;values.push(d.value);}
 const actual=r.drawPieceRollsV6(createRandomState(7721));assert.deepEqual(actual.rolls,{typeRoll:values[0],shapeRaw:values[1],cargoRaw:values[2],mixedShape:values[3],splitRaw:values[4],colorPair:values[5]});assert.deepEqual(actual.rngState,rng);
 const state=freeze(r.createRunV6(1,'easy')),before=JSON.stringify(state),g=r.generatePieceV6(state);assert.equal(JSON.stringify(state),before);assert.deepEqual(g,r.generatePieceV6(state));assert.deepEqual(g.rngState,r.drawPieceRollsV6(state.rngState).rngState);assert.equal(g.piece.id,`piece.${state.nextId}`);
});
test('every type threshold preserves the exact 20/30/40/50 decision even on a completely blocked stage-one board',()=>{
 const r=rules(),seen=new Set<number>(),mixedShapes=new Set<string>();for(let seed=0;seed<10000&&seen.size<100;seed++){
  const base=r.createRunV6(seed,'easy');base.rngState=createRandomState(seed);base.board.fill(M);for(const difficultyId of difficulties){const g=r.generatePieceV6({...base,difficultyId,runConfigId:r.outboundRunConfigId(difficultyId)});seen.add(g.rolls.typeRoll);assert.equal(Boolean(g.piece.cellCargos),g.rolls.typeRoll<=thresholds[difficultyId]);if(g.piece.cellCargos){mixedShapes.add(g.piece.shapeId);assert.equal(g.piece.shapeId,r.MIXED_SHAPES_V6[g.rolls.mixedShape]);const partition=r.MIXED_PARTITIONS_V6[g.piece.shapeId][g.rolls.splitRaw%r.MIXED_PARTITIONS_V6[g.piece.shapeId].length],pair=r.COLOR_PAIRS_V6[g.rolls.colorPair];assert.deepEqual(g.piece.cellCargos,[...partition].map(letter=>pair[letter==='A'?0:1]));}else assert.ok(SHAPES.find(s=>s.id===g.piece.shapeId)!.minShift<=1);}}
 assert.equal(seen.size,100);assert.equal(mixedShapes.size,8);
});
test('raw draws remain aligned across four difficulties after board, candidate and stage divergence',()=>{
 const r=rules(),states=difficulties.map(d=>r.createRunV6(939,d));for(let i=0;i<100;i++){states.forEach((s,j)=>{s.board[(i*(j+1))%81]=[F,M,C,F][j];s.shift=j+1;});const generated=states.map(r.generatePieceV6);for(const g of generated){assert.deepEqual(g.rolls,generated[0].rolls);assert.deepEqual(g.rngState,generated[0].rngState);}states.forEach((s,j)=>{s.rngState=generated[j].rngState;s.candidates=[generated[j].piece];s.nextId++;});}
});
test('pure generation keeps old shape and inventory weights with exactly 81 as the occupancy denominator',()=>{
 const r=rules(),map=<T>(raw:number,pool:T[],weights:number[]):T=>{let n=Math.floor(raw*weights.reduce((a,b)=>a+b,0)/2147483648);for(let i=0;i<pool.length;i++){if(n<weights[i])return pool[i];n-=weights[i];}throw Error('bad fixture');};let checked=0;
 for(let seed=0;seed<200;seed++){const s=r.createRunV6(seed,'easy');s.shift=1+seed%5;s.board=s.board.map((_,i)=>i<seed%80?i%3===0?F:M:null);s.candidates=[{id:'repeat',shapeId:'shape.single',cargo:F}];const g=r.generatePieceV6(s);if(g.piece.cellCargos)continue;const shapes=SHAPES.filter(s2=>s2.minShift<=s.shift),occupied=s.board.filter(Boolean).length,weights=shapes.map(shape=>{let w=shape.weight*100;if(shape.cells.length<=2)w=Math.floor(w*(100+Math.floor(occupied*200/81))/100);if(shape.id==='shape.single')w=Math.floor(w/2);return Math.max(1,w);});assert.equal(g.piece.shapeId,map(g.rolls.shapeRaw,shapes,weights).id);assert.equal(g.piece.cargo,map(g.rolls.cargoRaw,[F,M,C],[F,M,C].map(c=>20+2*s.board.filter(v=>v===c).length)));checked++;}assert.ok(checked>100);
});
test('mixed supply samples all shapes uniformly before partition and ordered colors',()=>{
 const r=rules(),s=r.createRunV6(387,'expert'),counts=Array(8).fill(0),patterns=new Set<string>();let mixed=0;for(let i=0;i<24000;i++){const g=r.generatePieceV6(s);s.rngState=g.rngState;s.nextId++;if(g.piece.cellCargos){mixed++;counts[r.MIXED_SHAPES_V6.indexOf(g.piece.shapeId)]++;patterns.add(`${g.piece.shapeId}:${g.piece.cellCargos}`);}}
 assert.ok(Math.abs(mixed/24000-0.5)<0.02);assert.ok(counts.every(n=>Math.abs(n/(mixed/8)-1)<0.12));assert.equal(patterns.size,66);
});
// Mutation targets: using seven-wide cells, wrong gate/entry, clearing all mixed cells, event paths through other colors.
test('a partial nine-grid shipment preserves the mixed remainder and preview exactly matches application',()=>{
 const r=rules(),{state,command}=prepared();state.board[4]=F;state.board[13]=F;const before=JSON.stringify(freeze(state)),preview=r.previewPlacementV6(state,command.pieceId,command.origin),result=r.applyCommandV6(state,command),events=shipments(result);
 assert.equal(result.error,undefined);assert.equal(events.length,1);assert.deepEqual(events[0].cells,[4,13,22,23]);assert.equal(events[0].boardSize,9);assert.equal(result.state.board[31],M);assert.equal(result.state.board[32],M);assert.equal(result.state.score,40);assert.deepEqual(preview.shipments,events);assert.equal(JSON.stringify(state),before);assert.deepEqual(events[0].path[0],{x:4,y:8});
 for(const {cell,path} of events[0].cargoPaths!){assert.equal(r.toIndexV6(path[0]),cell);assert.equal(r.toIndexV6(path[path.length-1]),4);assert.ok(path.every(p=>events[0].cells.includes(r.toIndexV6(p))));for(let i=1;i<path.length;i++)assert.ok(r.neighborsV6(r.toIndexV6(path[i-1])).includes(r.toIndexV6(path[i])));}
 assert.ok(events[0].path.every(p=>![31,32].includes(r.toIndexV6(p))));assert.deepEqual(result.state.candidates[1],state.candidates[1]);assert.equal(result.state.generatedPieces,state.generatedPieces!+1);assert.equal(result.state.candidates.length,3);
});
test('forked gate-connected cargo ships completely while detached and diagonal cells remain',()=>{
 const r=rules(),{state,command}=prepared();for(const i of [4,13,12,11,14,15,3,72,73])state.board[i]=F;const event=shipments(r.applyCommandV6(state,command))[0];assert.deepEqual(event.cells,[3,4,11,12,13,14,15,22,23]);assert.equal(event.score,90);assert.ok(!event.cells.includes(72));
});
test('new multi-shape mixed pieces are placed cellwise and their own two or three cells do not auto-ship',()=>{
 const r=rules();for(const pattern of r.MIXED_COLOR_PATTERNS_V6){const {state,command}=prepared(pattern.shapeId,[...pattern.cellCargos],{x:3,y:0});const result=r.applyCommandV6(state,command);assert.equal(result.error,undefined);assert.equal(shipments(result).length,0);SHAPES.find(s=>s.id===pattern.shapeId)!.cells.forEach((p,i)=>assert.equal(result.state.board[r.toIndexV6({x:p.x+3,y:p.y})],pattern.cellCargos[i]));}
});
test('gate progress excludes detached groups and differentiates entry versus route blockage',()=>{
 const r=rules(),s=r.createRunV6(1,'easy');for(const i of [20,21,22,23])s.board[i]=F;assert.deepEqual(r.orderStatusV6(s,target(s,F)),{count:0,largestGroupCount:4,exitConnected:false,status:'blocked',path:[],reason:'exit-unconnected'});s.board.fill(null);for(const i of [4,13,22,23])s.board[i]=F;s.board[76]=C;assert.equal(r.orderStatusV6(s,target(s,F)).reason,'entry-blocked');s.board[76]=null;for(let i=27;i<36;i++)s.board[i]=C;assert.equal(r.orderStatusV6(s,target(s,F)).reason,'route-blocked');
});
test('unshipped lower mixed region blocks a route, while its qualifying shipment opens the earlier-priority gate',()=>{
 const r=rules(),{state,command}=prepared('shape.square',[F,F,C,C],{x:4,y:1});state.board[4]=F;state.board[5]=F;for(let i=18;i<27;i++)if(i!==22&&i!==23)state.board[i]=C;
 const blocked=r.applyCommandV6(state,command);assert.equal(shipments(blocked).length,0);assert.equal(r.orderStatusV6(blocked.state,target(blocked.state,F)).reason,'route-blocked');
 state.board[35]=C;state.board[44]=C;const preview=r.previewPlacementV6(state,command.pieceId,command.origin),result=r.applyCommandV6(state,command),events=shipments(result);assert.deepEqual(events.map(e=>[e.cargo,e.chain]),[[C,1],[F,2]]);assert.equal(result.state.score,150);assert.equal(result.state.completedOrders,2);assert.deepEqual(preview.shipments,events);assert.ok(events[1].path.some(p=>events[0].cells.includes(r.toIndexV6(p))));
});
test('placement validates integer actual origins and every occupied cell on the 9 by 9 boundary atomically',()=>{
 const r=rules(),s=r.createRunV6(1,'easy');s.candidates=[{id:'single',shapeId:'shape.single',cargo:F}];assert.equal(r.findLegalMovesV6(s).length,81);const edge=r.applyCommandV6(s,{type:'place',pieceId:'single',origin:{x:8,y:8}});assert.equal(edge.state.board[80],F);
 for(const origin of [{x:-1,y:0},{x:0,y:-1},{x:9,y:0},{x:0,y:9},{x:0.5,y:0},{x:NaN,y:0},null]){const result=r.applyCommandV6(s,{type:'place',pieceId:'single',origin:origin as Point});assert.ok(result.error);assert.equal(result.state,s);assert.deepEqual(result.events,[]);assert.equal(r.previewPlacementV6(s,'single',origin as Point).valid,false);}
 const offset=r.createRunV6(1,'easy');offset.candidates=[{id:'offset',shapeId:'shape.l3_sw',cargo:F}];assert.equal(r.previewPlacementV6(offset,'offset',{x:-1,y:0}).valid,false);assert.ok(r.applyCommandV6(offset,{type:'place',pieceId:'offset',origin:{x:-1,y:0}}).error);
 const {state,command}=prepared('shape.i4_h',[F,F,M,M],{x:6,y:8});assert.equal(r.previewPlacementV6(state,command.pieceId,command.origin).valid,false);assert.equal(r.applyCommandV6(state,command).state,state);
});
test('bad pieces and unsupported commands reject without state mutation',()=>{
 const r=rules();for(const patch of [{cargo:C},{shapeId:'shape.domino_h'},{cellCargos:[F,M,M,F]},{cellCargos:[F,F,M]},{trait:'rush' as const},{rushTurns:2}]){const {state,command}=prepared();Object.assign(state.candidates[0],patch);const result=r.applyCommandV6(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);assert.equal(r.previewPlacementV6(state,command.pieceId,command.origin).valid,false);}
 const {state}=prepared();for(const command of [{type:'upgrade',upgradeId:'x'},{type:'continueOvertime'},{type:'finishOvertime'},{type:'finishEndless'}] as Command[])assert.equal(r.applyCommandV6(state,command).state,state);
});
test('six-batch stages and 30-batch completion preserve score and never draw a final replacement',()=>{
 const r=rules();for(const ready of [1,2,3]){const {state,command}=prepared();state.board[4]=F;state.board[13]=F;state.completedOrders=29;state.shift=5;if(ready>=2)for(const i of [17,26,35,44])state.board[i]=C;if(ready>=3)for(const i of [9,18,27,36])state.board[i]=M;const result=r.applyCommandV6(state,command);assert.equal(result.state.completedOrders,29+ready);assert.equal(shipments(result).length,ready);assert.equal(result.state.phase,'result');assert.equal(result.state.result,'won');assert.equal(result.state.endReason,'completed');assert.equal(result.state.candidates.length,2);assert.deepEqual(result.state.rngState,state.rngState);assert.equal(result.state.generatedPieces,state.generatedPieces);assert.equal(result.state.score,ready*40);}
 const {state,command}=prepared();state.board[4]=F;state.board[13]=F;state.completedOrders=5;const result=r.applyCommandV6(state,command);assert.equal(result.state.shift,2);assert.equal(result.state.phase,'input');assert.deepEqual(result.state.upgradeChoices,[]);
});
test('a mixed candidate cannot rescue or reroll a full-board loss',()=>{
 const r=rules(),s=r.createRunV6(1,'expert');s.board.fill(F);s.board[0]=null;s.candidates=[{id:'last',shapeId:'shape.single',cargo:F},{id:'mix',shapeId:'shape.p5',cargo:F,cellCargos:[F,F,M,M,M]}];assert.deepEqual(r.findLegalMovesV6(s),[{pieceId:'last',origin:{x:0,y:0}}]);const result=r.applyCommandV6(s,{type:'place',pieceId:'last',origin:{x:0,y:0}});assert.equal(result.state.result,'failed');assert.equal(result.state.endReason,'blocked');assert.deepEqual(result.state.candidates[1],s.candidates[1]);assert.deepEqual(r.findLegalMovesV6(result.state),[]);
});
test('deterministic legal command sequences preserve input and match every preview and replay prefix',()=>{
 const r=rules();for(const difficulty of difficulties)for(const seed of [0,17,-8,2147483647]){let s=r.createRunV6(seed,difficulty),replayed=r.createRunV6(seed,difficulty);for(let i=0;i<75&&s.phase!=='result';i++){const moves=r.findLegalMovesV6(s),move=moves[(i*13)%moves.length],before=JSON.stringify(s),preview=r.previewPlacementV6(freeze(s),move.pieceId,move.origin),result=r.applyCommandV6(s,{type:'place',...move});assert.equal(result.error,undefined);assert.deepEqual(preview.shipments,shipments(result));assert.equal(JSON.stringify(s),before);s=result.state;replayed=r.applyCommandV6(replayed,s.commands[s.commands.length-1]).state;assert.deepEqual(s,replayed);}}
});
test('v1 through v5 frozen domain fingerprints remain unchanged',()=>{
 rules();const manifest=JSON.parse(readFileSync('tests/fixtures/outbound-v6-legacy-files.json','utf8')) as Record<string,string>;for(const [file,hash] of Object.entries(manifest))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),hash,file);
});
// Pinned only after independent probability, graph and physics tests validated the implementation.
test('v6 fixed configuration, raw rolls, candidates and every seeded prefix remain pinned',()=>{
 const r=rules(),digest=(state:RunState)=>createHash('sha256').update(JSON.stringify(state)).digest('hex');
 const fixture=JSON.parse(readFileSync('tests/fixtures/outbound-v6-golden.json','utf8')) as {config:typeof r.RULES_V6_CONFIG;percentages:typeof r.MIXED_COLOR_PERCENT_V6;partitions:typeof r.MIXED_PARTITIONS_V6;cases:{seed:number;difficulty:typeof difficulties[number];initial:Pick<RunState,'candidates'|'rngState'>;commands:Command[];trace:string[]}[];rolls:ReturnType<typeof r.drawPieceRollsV6>[]};
 assert.deepEqual(r.RULES_V6_CONFIG,fixture.config);assert.deepEqual(r.MIXED_COLOR_PERCENT_V6,fixture.percentages);assert.deepEqual(r.MIXED_PARTITIONS_V6,fixture.partitions);assert.deepEqual(fixture.cases.map(c=>c.difficulty),difficulties);
 for(const item of fixture.cases){let state=r.createRunV6(item.seed,item.difficulty);assert.deepEqual({candidates:state.candidates,rngState:state.rngState},item.initial);assert.equal(digest(state),item.trace[0]);for(const [i,command] of item.commands.entries()){const result=r.applyCommandV6(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(digest(state),item.trace[i+1]);}}
 let rng=fixture.cases[0].initial.rngState;for(const drawn of fixture.rolls){assert.deepEqual(r.drawPieceRollsV6(rng),drawn);rng=drawn.rngState;}
});
