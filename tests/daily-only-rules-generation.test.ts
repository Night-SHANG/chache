import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableRun,applyPlayableCommand,type RunSpec} from '../src/domain/playable.ts';
import {createRunV15} from '../src/domain/v15/engine.ts';
import {generationDistributionV15} from '../src/domain/v15/generation.ts';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import type {InboundRunV16} from '../src/domain/v16/types.ts';

function start(mode:'standard'|'daily'|'endless'='standard',guided=false,seed=17):InboundRunV16 {
 return createPlayableRun({family:'inbound',rulesetVersion:16,mode,guided,seed,toolCharges:{rotate:0,clear:0,wildcard:0}} as RunSpec) as InboundRunV16;
}

// Mutation caught: routing new runs to any frozen identity or keeping the old cleanup gate.
test('rules16 standard and direct endless start with three candidates and never offer cleanup',()=>{
 for(const mode of ['standard','endless'] as const)for(const guided of mode==='standard'?[false,true]:[false]){
  const state=start(mode,guided);assert.equal(state.rulesetVersion,16);assert.equal(state.runConfigId,'run.inbound_v16');
  assert.equal(state.phase,'input');assert.equal(state.cleanup,null);assert.equal(state.candidates.length,3);assert.equal(state.generatedPieces,3);
  for(const branch of ['orders','placements'] as const){const rejected=applyPlayableCommand(state,{type:'chooseCleanup',branch});assert.ok(rejected.error);assert.equal(rejected.state,state);assert.deepEqual(rejected.events,[]);}
 }
});

test('every daily start waits for explicit cleanup before drawing any candidate',()=>{
 for(const seed of [1,17,20261007])for(const branch of ['orders','placements'] as const){
  const state=start('daily',false,seed),again=start('daily',false,seed);
  assert.deepEqual(state,again);assert.equal(state.phase,'cleanup');assert.equal(state.cleanup,null);assert.deepEqual(state.candidates,[]);assert.equal(state.generatedPieces,0);
  const before=structuredClone(state),selected=applyPlayableCommand(state,{type:'chooseCleanup',branch});assert.equal(selected.error,undefined);
  const next=selected.state as InboundRunV16;assert.equal(next.phase,'input');assert.deepEqual(next.cleanup,{branch,progress:0});assert.equal(next.candidates.length,3);assert.equal(next.generatedPieces,3);assert.deepEqual(state,before);
  assert.ok(applyPlayableCommand(state,{type:'finish'}).error);assert.ok(applyPlayableCommand(state,{type:'place',pieceId:'piece.3',origin:{x:0,y:0}}).error);
 }
 assert.throws(()=>start('daily',true));assert.throws(()=>start('endless',true));
});

test('standard and endless have zero rush at all stages; daily is 6% then 100%',async()=>{
 start();const {generationDistributionV16}=await import('../src/domain/v16/generation.ts');
 for(const mode of ['standard','daily','endless'] as const)for(const shift of [1,2,3,4,5] as const){
  const state={...start(mode),shift,completedOrders:(shift-1)*6},rush=mode==='daily'?(shift===5?1:.06):0;
  const expected=mode==='daily'&&shift===5?{normal:0,pallet:0,rush:1,hazard:0,wildcard:0}:shift>=3?{normal:mode==='daily'?.85:.91,pallet:.05,rush,hazard:.03,wildcard:.01}:{normal:mode==='daily'?.94:1,pallet:0,rush,hazard:0,wildcard:0};
  assert.deepEqual(generationDistributionV16(state).traits,expected,`${mode}/${shift}`);
 }
 for(const guided of [false,true])assert.deepEqual(generationDistributionV16({...start('standard',guided),shift:5,completedOrders:30,overtime:true}).traits,{normal:.91,pallet:.05,rush:0,hazard:.03,wildcard:.01});
});

test('daily final-stage rush keeps the adaptive ordinary shapes and cargo stream including single cells',async()=>{
 const base={...start('daily'),shift:5 as const,completedOrders:24};
 const {generatePieceV16,generationDistributionV16}=await import('../src/domain/v16/generation.ts');
 base.candidates=[{id:'recent',shapeId:'shape.domino_h',cargo:'cargo.food',quarterTurns:0}];
 for(const cell of [0,1,2,7,8,9,14,15,16,22])base.board[cell]='cargo.food';
 const distribution=generationDistributionV16(base),old=generationDistributionV15({...base,rulesetVersion:15,runConfigId:'run.inbound_v15'});
 assert.deepEqual(distribution.ordinaryShapes,old.ordinaryShapes);assert.deepEqual(distribution.nonWildcardCargos,old.nonWildcardCargos);
 const sample=<T>(draw:number,values:{value:T;probability:number}[]):T=>{let total=0;for(const entry of values){total+=entry.probability;if(draw<total)return entry.value;}return values[values.length-1].value;};
 const shapes=new Set<string>(),cargos=new Set<string>();
 for(let seed=1;seed<=300;seed++){
  const state={...base,rngState:createRandomState(Math.imul(seed,0x9e3779b9))},before=structuredClone(state),draw=generatePieceV16(state);
  const traitDraw=nextRandom(state.rngState,0,0xffffffff),shapeDraw=nextRandom(traitDraw.state,0,0xffffffff),cargoDraw=nextRandom(shapeDraw.state,0,0xffffffff);
  assert.equal(draw.piece.trait,'rush');assert.equal(draw.piece.rushTurns,3);
  assert.equal(draw.piece.shapeId,sample(shapeDraw.value/0x100000000,distribution.ordinaryShapes.map(s=>({value:s.shapeId,probability:s.probability}))));
  assert.equal(draw.piece.cargo,sample(cargoDraw.value/0x100000000,distribution.nonWildcardCargos.map(c=>({value:c.cargo,probability:c.probability}))));
  assert.deepEqual(draw.state.rngState,cargoDraw.state);assert.deepEqual(state,before);shapes.add(draw.piece.shapeId);cargos.add(draw.piece.cargo);
 }
 assert.ok(shapes.has('shape.single'));assert.ok(shapes.size>1);assert.equal(cargos.size,5);
});

test('daily guided omission and false are identical; choosing a cleanup branch does not alter the draw stream',async()=>{
 start('daily');const {createRunV16,applyCommandV16}=await import('../src/domain/v16/engine.ts');
 const omitted=createRunV16({seed:123,mode:'daily'}),explicit=createRunV16({seed:123,mode:'daily',guided:false});assert.deepEqual(omitted,explicit);
 const orders=applyCommandV16(omitted,{type:'chooseCleanup',branch:'orders'}).state,placements=applyCommandV16(explicit,{type:'chooseCleanup',branch:'placements'}).state;
 assert.deepEqual(orders.candidates,placements.candidates);assert.deepEqual(orders.rngState,placements.rngState);assert.deepEqual(orders.orders,placements.orders);
 assert.throws(()=>createRunV16({seed:123,mode:'daily',guided:true}));
});

test('frozen rules15 keeps the old daily 12%, final-stage override and overtime 6%',()=>{
 const old=createRunV15({seed:17,mode:'standard'});assert.equal(old.phase,'cleanup');
 assert.equal(generationDistributionV15({...old,shift:5,completedOrders:24}).traits.rush,1);
 assert.equal(generationDistributionV15({...old,shift:5,completedOrders:30,overtime:true}).traits.rush,.06);
 assert.equal(generationDistributionV15({...old,mode:'daily'}).traits.rush,.12);
 assert.throws(()=>createRunV15({seed:17,mode:'endless'}));
});
