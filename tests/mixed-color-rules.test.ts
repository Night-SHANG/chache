import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRun,applyCommand,previewPlacement,findLegalMoves} from '../src/domain/engine.ts';
import {orderStatus,toIndex,neighbors} from '../src/domain/board.ts';
import * as content from '../src/domain/content.ts';
import {checksum,replay,replayWithTrace} from '../src/domain/replay.ts';
import {nextRandom,createRandomState} from '../src/domain/random.ts';
import type {CargoId,Command,CommandResult,RunState,Shipment,Point,ColorTier,Piece} from '../src/domain/types.ts';
const F:CargoId='cargo.food',M:CargoId='cargo.machine',C:CargoId='cargo.chem';
const tiers:ColorTier[]=['entry','middle','late'];
const create=(seed=17,tier:ColorTier='entry')=>createRun(seed,'color_exit',5,tier);
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
const shipments=(result:CommandResult):Shipment[]=>result.events.filter((event):event is Shipment=>event.type==='shipment');
function prepared(cargos:CargoId[],origin:Point={x:3,y:2}):{state:RunState;command:Command}{
 const state=create();state.candidates=[{id:'fixture.mix',shapeId:'shape.square',cargo:cargos[0],cellCargos:cargos},{id:'fixture.keep',shapeId:'shape.single',cargo:M},{id:'fixture.third',shapeId:'shape.domino_v',cargo:C}];
 return {state,command:{type:'place',pieceId:'fixture.mix',origin}};
}
function target(state:RunState,cargo:CargoId){return state.orders.find(order=>order.cargo===cargo)!;}

// Mutation target: losing explicit v5 identity or tier acceptance must fail before any generated move.
test('v5 creation has explicit three-tier identities while frozen defaults stay v1 and v3',()=>{
 for(const tier of tiers){const state=create(17,tier);assert.equal(state.rulesetVersion,5);assert.equal(state.mode,'color_exit');assert.equal(state.colorTier,tier);assert.equal(state.runConfigId,`run.color_exit_mix_v5.${tier}`);assert.equal(state.generatedPieces,3);assert.equal(state.candidates.length,3);assert.deepEqual(state,create(17,tier));assert.deepEqual(state.orders,content.COLOR_EXIT_TARGETS);assert.deepEqual(state.upgrades,[]);assert.deepEqual(state.upgradeChoices,[]);assert.equal(state.overtime,false);}
 assert.equal(createRun(17).rulesetVersion,1);assert.equal(content.CURRENT_RULESET,3);assert.equal(content.COLOR_EXIT_RULESET,4);assert.equal(content.COLOR_EXIT_MIX_RULESET,5);
});
test('v5 requires a legal tier and v1 to v4 reject an unexpected tier',()=>{
 for(const tier of [undefined,null,'','standard','ENTRY',20])assert.throws(()=>createRun(1,'color_exit',5,tier as ColorTier),/档|tier|版本/i);
 for(const version of [1,2,3,4])assert.throws(()=>createRun(1,version===4?'color_exit':'standard',version,'entry'),/档|tier|版本/i);
 for(const mode of ['standard','daily','tutorial'] as const)assert.throws(()=>createRun(1,mode,5,'entry'),/模式|mode/i);
 for(const run of [()=>replay(1,[],'color_exit',5),()=>replayWithTrace(1,[],'color_exit',5),()=>replay(1,[],'color_exit',4,'entry'),()=>replayWithTrace(1,[],'color_exit',4,'entry')])assert.throws(run,/档|tier|版本/i);
});
test('read and command routing refuse unsupported versions and corrupted tier/config identities',()=>{
 const state=create(),move=findLegalMoves(state)[0];
 for(const patch of [{rulesetVersion:99},{colorTier:undefined},{colorTier:'bad' as ColorTier},{runConfigId:'run.color_exit_mix_v5.middle'},{mode:'standard' as const}]){
  const invalid={...state,...patch};for(const call of [()=>findLegalMoves(invalid),()=>previewPlacement(invalid,move.pieceId,move.origin),()=>applyCommand(invalid,{type:'place',...move}),()=>checksum(invalid),()=>orderStatus(invalid,invalid.orders[0])])assert.throws(call,/模式|档|tier|版本|version/i);
 }
});
test('legacy routing refuses per-cell cargo rather than silently treating mixed cargo as solid',()=>{
 for(const version of [1,2,3,4]){const state=createRun(1,version===4?'color_exit':'standard',version);state.candidates[0].cellCargos=[state.candidates[0].cargo];for(const call of [()=>findLegalMoves(state),()=>previewPlacement(state,state.candidates[0].id,{x:0,y:0}),()=>checksum(state),()=>applyCommand(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:0,y:0}})])assert.throws(call,/双色|逐格|货件|版本/i);}
});

test('all twelve mixed patterns are 2+2 row or column bands and helpers reject every invalid encoding',async()=>{
 create();const {MIXED_COLOR_PATTERNS,MIXED_COLOR_SHAPE_ID}=await import('../src/domain/v5/content.ts');const {isValidColorExitPiece,isMixedColorPiece,pieceCellCargo}=await import('../src/domain/pieces.ts');
 assert.equal(MIXED_COLOR_SHAPE_ID,'shape.square');assert.equal(MIXED_COLOR_PATTERNS.length,12);assert.equal(new Set(MIXED_COLOR_PATTERNS.map(p=>p.join(','))).size,12);
 for(const cargos of MIXED_COLOR_PATTERNS){assert.equal(cargos.length,4);const counts=new Map<CargoId,number>();for(const c of cargos)counts.set(c,(counts.get(c)??0)+1);assert.equal(counts.size,2);assert.deepEqual([...counts.values()],[2,2]);assert.ok(cargos[0]===cargos[1]&&cargos[2]===cargos[3]||cargos[0]===cargos[2]&&cargos[1]===cargos[3]);const piece:Piece={id:'test',shapeId:'shape.square',cargo:cargos[0],cellCargos:[...cargos]};assert.equal(isValidColorExitPiece(piece),true);assert.equal(isMixedColorPiece(piece),true);assert.deepEqual(cargos.map((_,i)=>pieceCellCargo(piece,i)),cargos);}
 const solid:Piece={id:'pure',shapeId:'shape.domino_h',cargo:M};assert.equal(isMixedColorPiece(solid),false);assert.equal(pieceCellCargo(solid,1),M);assert.equal(isValidColorExitPiece(solid),true);
 for(const patch of [{shapeId:'shape.single'},{cargo:C},{cellCargos:[F,M]},{cellCargos:[F,M,M,F]},{cellCargos:[F,F,F,M]},{cellCargos:[F,F,F,F]},{cellCargos:[F,F,M,C]},{cellCargos:[F,F,'cargo.cold','cargo.cold']},{trait:'pallet'},{rushTurns:2}])assert.equal(isValidColorExitPiece({id:'bad',shapeId:'shape.square',cargo:F,cellCargos:[F,F,M,M],...patch}),false,JSON.stringify(patch));
});
test('each generation consumes the four fixed range rolls without mutating owned input',async()=>{
 const state=freeze(create());const {drawPieceRollsV5,generatePieceV5}=await import('../src/domain/v5/engine.ts');const before=JSON.stringify(state);let rng=createRandomState(7721);const values:number[]=[];
 for(const [min,max] of [[1,100],[0,2147483647],[0,2147483647],[0,11]]){const draw=nextRandom(rng,min,max);rng=draw.state;values.push(draw.value);}
 const actual=drawPieceRollsV5(createRandomState(7721));assert.deepEqual(actual.rolls,{typeRoll:values[0],shapeRaw:values[1],cargoRaw:values[2],mixedPattern:values[3]});assert.deepEqual(actual.rngState,rng);
 const generated=generatePieceV5(state);assert.equal(JSON.stringify(state),before);assert.deepEqual(generated,generatePieceV5(state));assert.equal(generated.piece.id,`piece.${state.nextId}`);assert.deepEqual(generated.rngState,drawPieceRollsV5(state.rngState).rngState);assert.equal(state.generatedPieces,3);
});
test('all 100 type thresholds select mixed without fitting fallback, stage gating or rerolls',async()=>{
 create();const {generatePieceV5}=await import('../src/domain/v5/engine.ts');const seen=new Set<number>();const threshold={entry:20,middle:30,late:40};
 for(let seed=0;seen.size<100&&seed<10000;seed++){
  const base=create(seed);base.rngState=createRandomState(seed);base.board.fill(M);base.shift=1;const expectedRng=clone(base.rngState);
  for(const tier of tiers){const state={...base,colorTier:tier,runConfigId:`run.color_exit_mix_v5.${tier}`};const generated=generatePieceV5(freeze(state));seen.add(generated.rolls.typeRoll);assert.equal(Boolean(generated.piece.cellCargos),generated.rolls.typeRoll<=threshold[tier]);if(generated.piece.cellCargos)assert.equal(generated.piece.shapeId,'shape.square');else assert.ok(content.SHAPES.find(s=>s.id===generated.piece.shapeId)!.minShift<=1);assert.deepEqual(state.rngState,expectedRng);}
 }
 assert.equal(seen.size,100);
});
test('same seed and generation ordinal keep raw rolls coupled across all tiers after weighted pools diverge',async()=>{
 const states=tiers.map(t=>create(939,t));const {generatePieceV5}=await import('../src/domain/v5/engine.ts');assert.deepEqual(states[0].rngState,states[1].rngState);assert.deepEqual(states[1].rngState,states[2].rngState);
 for(let i=0;i<100;i++){
  states[0].board[i%49]=F;states[1].board[(i*3)%49]=M;states[2].board[(i*7)%49]=C;states[0].shift=1;states[1].shift=3;states[2].shift=5;
  const generated=states.map(generatePieceV5);assert.deepEqual(generated[0].rolls,generated[1].rolls);assert.deepEqual(generated[1].rolls,generated[2].rolls);assert.deepEqual(generated[0].rngState,generated[2].rngState);
  for(let j=0;j<3;j++){states[j].rngState=generated[j].rngState;states[j].candidates=[generated[j].piece];states[j].nextId++;states[j].generatedPieces!++;}
 }
});
test('v5 pure weighted selection follows frozen shape gating bias suppression and cargo inventory weights',async()=>{
 create();const {generatePieceV5}=await import('../src/domain/v5/engine.ts');const map=<T>(raw:number,pool:T[],weights:number[]):T=>{let n=Math.floor(raw*weights.reduce((a,b)=>a+b,0)/2147483648);for(let i=0;i<pool.length;i++){if(n<weights[i])return pool[i];n-=weights[i];}throw Error('bad independent fixture');};
 let checked=0;for(let seed=0;seed<150;seed++){const state=create(seed);state.shift=1+seed%5;state.board=state.board.map((_,i)=>i<seed%40?i%3===0?F:M:null);state.candidates=[{id:'repeat',shapeId:'shape.single',cargo:F}];const got=generatePieceV5(state);if(got.piece.cellCargos)continue;const shapes=content.SHAPES.filter(s=>s.minShift<=state.shift),occupancy=state.board.filter(Boolean).length;const weights=shapes.map(s=>{let w=s.weight*100;if(s.cells.length<=2)w=Math.floor(w*(100+Math.floor(occupancy*200/49))/100);if(state.candidates.some(p=>p.shapeId===s.id))w=Math.floor(w/2);return Math.max(1,w);});assert.equal(got.piece.shapeId,map(got.rolls.shapeRaw,shapes,weights).id);assert.equal(got.piece.cargo,map(got.rolls.cargoRaw,[F,M,C],[F,M,C].map(c=>20+2*state.board.filter(v=>v===c).length)));assert.equal(Object.prototype.hasOwnProperty.call(got.piece,'cellCargos'),false);checked++;}assert.ok(checked>75);
});
test('seeded generation samples every mixed pattern and stays close to each independent tier probability',async()=>{
 create();const {generatePieceV5}=await import('../src/domain/v5/engine.ts');const {MIXED_COLOR_PATTERNS}=await import('../src/domain/v5/content.ts');const percentages={entry:20,middle:30,late:40};
 for(const tier of tiers){const state=create(387,tier),patterns=Array(12).fill(0);let mixed=0;for(let i=0;i<12000;i++){const g=generatePieceV5(state);state.rngState=g.rngState;state.nextId++;if(g.piece.cellCargos){mixed++;patterns[MIXED_COLOR_PATTERNS.findIndex(p=>p.join(',')===g.piece.cellCargos!.join(','))]++;}}assert.ok(Math.abs(mixed/12000-percentages[tier]/100)<0.02,`${tier}: ${mixed}`);assert.ok(patterns.every(n=>n>mixed/12*0.65&&n<mixed/12*1.35));}
});

test('partial shipment clears only the qualifying food band and leaves mechanical half in original cells',()=>{
 const {state,command}=prepared([F,F,M,M]);state.board[3]=F;state.board[10]=F;const before=JSON.stringify(freeze(state)),preview=previewPlacement(state,command.type==='place'?command.pieceId:'', {x:3,y:2}),result=applyCommand(state,command),events=shipments(result);
 assert.equal(result.error,undefined);assert.equal(events.length,1);assert.equal(events[0].cargo,F);assert.deepEqual(events[0].cells,[3,10,17,18]);assert.equal(result.state.board[24],M);assert.equal(result.state.board[25],M);assert.equal(result.state.score,40);assert.equal(JSON.stringify(state),before);assert.deepEqual(preview.shipments,events);
 assert.deepEqual(events[0].cargoPaths!.map(p=>p.cell),[3,10,17,18]);assert.ok(events[0].cargoPaths!.every(p=>p.path.every(point=>events[0].cells.includes(toIndex(point)))));assert.ok(events[0].path.every(point=>![24,25].includes(toIndex(point))));
 const kept=result.state.candidates.find(p=>p.id==='fixture.keep')!;assert.deepEqual(kept,state.candidates[1]);assert.equal(result.state.candidates.length,3);assert.equal(result.state.generatedPieces,state.generatedPieces!+1);
});
test('mixed cargo alone never reaches four of one color or automatically clears at a gate',()=>{
 for(const origin of [{x:3,y:0},{x:5,y:3},{x:0,y:3},{x:2,y:3}]){const {state,command}=prepared([F,F,M,M],origin);const result=applyCommand(state,command);assert.equal(shipments(result).length,0);for(const [i,p] of content.SHAPES.find(s=>s.id==='shape.square')!.cells.entries())assert.equal(result.state.board[toIndex({x:origin.x+p.x,y:origin.y+p.y})],state.candidates[0].cellCargos![i]);}
});
test('mixed band joins the whole forked same-color group but excludes diagonals and detached inventory',()=>{
 const {state,command}=prepared([F,F,M,M]);for(const cell of [3,10,9,8,11,12,2,42,43])state.board[cell]=F;const event=shipments(applyCommand(state,command))[0];assert.deepEqual(event.cells,[2,3,8,9,10,11,12,17,18]);assert.equal(event.score,90);assert.ok(!event.cells.includes(24));assert.ok(!event.cells.includes(42));
 for(const {cell,path} of event.cargoPaths!){assert.equal(toIndex(path[0]),cell);assert.equal(toIndex(path[path.length-1]),3);for(let i=1;i<path.length;i++)assert.ok(neighbors(toIndex(path[i-1])).includes(toIndex(path[i])));}
});
test('mixed bands at wrong gates and an occupied south entrance never ship',()=>{
 const wrong=prepared([F,F,C,C],{x:0,y:3});wrong.state.board[23]=F;wrong.state.board[24]=F;assert.equal(shipments(applyCommand(wrong.state,wrong.command)).length,0);
 const blocked=prepared([F,F,M,M]);blocked.state.board[3]=F;blocked.state.board[10]=F;blocked.state.board[45]=C;const result=applyCommand(blocked.state,blocked.command);assert.equal(shipments(result).length,0);assert.equal(orderStatus(result.state,target(result.state,F)).reason,'entry-blocked');
});
test('an unshipped mixed half remains an obstacle and can keep another otherwise qualified band unreachable',()=>{
 const {state,command}=prepared([F,F,M,M],{x:3,y:1});state.board[3]=F;state.board[4]=F;for(const i of [14,15,16,19,20])state.board[i]=C;const result=applyCommand(state,command);assert.equal(shipments(result).length,0);assert.equal(orderStatus(result.state,target(result.state,F)).reason,'route-blocked');assert.equal(result.state.board[17],M);assert.equal(result.state.board[18],M);
});
test('clearing the lower mixed band opens a route and then ships its other color as a second chain',()=>{
 const {state,command}=prepared([F,F,C,C],{x:3,y:1});for(const i of [3,4])state.board[i]=F;for(const i of [14,15,16,19,20,27])state.board[i]=C;
 const preview=previewPlacement(state,'fixture.mix',{x:3,y:1}),result=applyCommand(state,command),events=shipments(result);assert.deepEqual(events.map(e=>[e.cargo,e.chain]),[[C,1],[F,2]]);assert.deepEqual(preview.shipments,events);assert.equal(result.state.completedOrders,2);assert.equal(result.state.score,120);assert.ok(events[1].path.some(p=>events[0].cells.includes(toIndex(p))));for(const i of [10,11,17,18])assert.equal(result.state.board[i],null);
});
test('invalid mixed encodings and non-place actions reject atomically',()=>{
 for(const patch of [{cargo:C},{shapeId:'shape.domino_h'},{cellCargos:[F,M,M,F]},{cellCargos:[F,F,M]},{trait:'rush' as const},{rushTurns:2}]){const {state,command}=prepared([F,F,M,M]);Object.assign(state.candidates[0],patch);const result=applyCommand(state,command);assert.ok(result.error);assert.equal(result.state,state);assert.deepEqual(result.events,[]);}
 const {state}=prepared([F,F,M,M]);for(const command of [{type:'upgrade',upgradeId:'x'},{type:'continueOvertime'},{type:'finishOvertime'}] as Command[]){const result=applyCommand(state,command);assert.ok(result.error);assert.equal(result.state,state);}
});
test('batch stages and final 30 to 32 resolution preserve v4 score and skip final replacement RNG',()=>{
 for(const ready of [1,2,3]){const {state,command}=prepared([F,F,M,M]);state.board[3]=F;state.board[10]=F;state.completedOrders=29;state.shift=5;if(ready>=2)for(const i of [27,20,13,6])state.board[i]=C;if(ready>=3)for(const i of [21,14,7,0])state.board[i]=M;const result=applyCommand(state,command);assert.equal(result.state.completedOrders,29+ready);assert.equal(shipments(result).length,ready);assert.equal(result.state.phase,'result');assert.equal(result.state.result,'won');assert.equal(result.state.candidates.length,2);assert.deepEqual(result.state.rngState,state.rngState);assert.equal(result.state.generatedPieces,state.generatedPieces);assert.equal(result.state.score,ready*40);assert.equal(result.state.board[24],M);}
 const {state,command}=prepared([F,F,M,M]);state.board[3]=F;state.board[10]=F;state.completedOrders=5;const result=applyCommand(state,command);assert.equal(result.state.shift,2);assert.equal(result.state.phase,'input');assert.deepEqual(result.state.upgradeChoices,[]);assert.ok(!result.events.some(e=>e.type==='upgrade'));
});
test('unplaceable mixed candidates participate normally in no-legal-move defeat',()=>{
 const {state}=prepared([F,F,M,M]);state.board.fill(F);state.board[0]=null;state.candidates=[{id:'last',shapeId:'shape.single',cargo:F},{id:'mix2',shapeId:'shape.square',cargo:F,cellCargos:[F,F,M,M]},{id:'mix3',shapeId:'shape.square',cargo:C,cellCargos:[C,M,C,M]}];assert.deepEqual(findLegalMoves(state),[{pieceId:'last',origin:{x:0,y:0}}]);const result=applyCommand(state,{type:'place',pieceId:'last',origin:{x:0,y:0}});assert.equal(result.state.result,'failed');assert.equal(result.state.endReason,'blocked');assert.equal(findLegalMoves(result.state).length,0);assert.deepEqual(result.state.candidates.slice(1),state.candidates.slice(1));
});
test('v5 checksum hashes tier and per-cell candidate colors but ignores presentation metadata',()=>{
 const {state}=prepared([F,F,M,M]);const baseline=checksum(state);const recolored=clone(state);recolored.candidates[0].cellCargos=[F,F,C,C];assert.notEqual(checksum(recolored),baseline);assert.notEqual(checksum({...state,colorTier:'middle',runConfigId:'run.color_exit_mix_v5.middle'}),baseline);assert.equal(checksum({...state,runSerial:99,elapsedMs:300,maxOccupancy:30}),baseline);
});
test('all tiers replay real legal seeded commands and each prefix checksum exactly',()=>{
 for(const tier of tiers)for(const seed of [0,17,-8,2147483647]){let state=create(seed,tier);const trace:{commandIndex:number;checksum:string}[]=[];for(let turn=0;turn<75&&state.phase!=='result';turn++){const moves=findLegalMoves(state),move=moves[(turn*13)%moves.length],before=JSON.stringify(state);const preview=previewPlacement(freeze(state),move.pieceId,move.origin),result=applyCommand(state,{type:'place',...move});assert.equal(result.error,undefined);assert.deepEqual(preview.shipments,shipments(result));assert.equal(JSON.stringify(state),before);state=result.state;trace.push({commandIndex:state.commandIndex,checksum:checksum(state)});}assert.deepEqual(replay(seed,state.commands,'color_exit',5,tier),state);assert.deepEqual(replayWithTrace(seed,state.commands,'color_exit',5,tier),{state,trace});}
});
test('all four previous generations retain exact implementation bytes and golden command traces',()=>{
 const manifest=JSON.parse(readFileSync('tests/fixtures/mixed-color-legacy-golden.json','utf8')) as {files:Record<string,string>;cases:{version:number;seed:number;mode:RunState['mode'];commands:Command[];trace:string[]}[]};
 for(const [file,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),sha,file);
 assert.deepEqual([...new Set(manifest.cases.map(c=>c.version))].sort(),[1,2,3,4]);for(const item of manifest.cases){let state=createRun(item.seed,item.mode,item.version);assert.equal(checksum(state),item.trace[0]);for(const [i,command] of item.commands.entries()){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(checksum(state),item.trace[i+1]);}}
});
// Regression pin after the independent probability, mapping and physics tests validated this v5 implementation.
test('v5 fixed configuration patterns candidate RNG and every recorded prefix stay pinned per tier',async()=>{
 const {RULES_V5_CONFIG,MIXED_COLOR_PERCENT,MIXED_COLOR_PATTERNS}=await import('../src/domain/v5/content.ts');
 const fixture=JSON.parse(readFileSync('tests/fixtures/mixed-color-v5-golden.json','utf8')) as {config:typeof RULES_V5_CONFIG;percentages:typeof MIXED_COLOR_PERCENT;patterns:typeof MIXED_COLOR_PATTERNS;cases:{seed:number;colorTier:ColorTier;initial:Pick<RunState,'candidates'|'rngState'>;commands:Command[];trace:string[]}[]};
 assert.deepEqual(RULES_V5_CONFIG,fixture.config);assert.deepEqual(MIXED_COLOR_PERCENT,fixture.percentages);assert.deepEqual(MIXED_COLOR_PATTERNS,fixture.patterns);assert.deepEqual([...new Set(fixture.cases.map(c=>c.colorTier))],tiers);
 for(const item of fixture.cases){let state=create(item.seed,item.colorTier);assert.deepEqual({candidates:state.candidates,rngState:state.rngState},item.initial);assert.equal(checksum(state),item.trace[0]);for(const [i,command] of item.commands.entries()){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(checksum(state),item.trace[i+1]);}}
});
