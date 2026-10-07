import test from 'node:test';
import assert from 'node:assert/strict';
import {createRandomState,nextRandom} from '../src/domain/random.ts';
import {SHAPES} from '../src/domain/rulesets/v1/content.ts';
import {generationDistributionV14} from '../src/domain/v14/generation.ts';
import {createRunV15,applyCommandV15} from '../src/domain/v15/engine.ts';
import {generatePieceV15,generationDistributionV15} from '../src/domain/v15/generation.ts';
import type {InboundRunV15} from '../src/domain/v15/types.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';

function stage(shift:1|2|3|4|5,mode:'standard'|'daily'|'endless'='standard',guided=false):InboundRunV15 {
 const state=createRunV15({seed:1,mode,guided});return {...state,shift,completedOrders:(shift-1)*6};
}

test('final-stage override applies to standard, daily and guided only before overtime',()=>{
 for(const mode of ['standard','daily'] as const)for(const shift of [1,2,3,4,5] as const){
  const actual=generationDistributionV15(stage(shift,mode)).traits;
  const rush=mode==='daily'?.12:.06;
  const expected=shift===5?{normal:0,pallet:0,rush:1,hazard:0,wildcard:0}:shift>=3?{normal:mode==='daily'?.79:.85,pallet:.05,rush,hazard:.03,wildcard:.01}:{normal:1-rush,pallet:0,rush,hazard:0,wildcard:0};
  assert.deepEqual(actual,expected,`${mode} stage ${shift}`);
 }
 for(const shift of [1,2,3,4,5] as const){const traits=generationDistributionV15(stage(shift,'standard',true)).traits;assert.equal(traits.rush,shift===1?0:shift===5?1:.06);}
 assert.deepEqual(generationDistributionV15({...stage(5),overtime:true}).traits,{normal:.85,pallet:.05,rush:.06,hazard:.03,wildcard:.01});
 assert.equal(generationDistributionV14({...createRunV14({seed:1,mode:'daily'}),shift:5,completedOrders:24}).traits.rush,.12);
 assert.equal(generationDistributionV14({...createRunV14({seed:1,mode:'endless'}),shift:5,completedOrders:24}).traits.rush,.06);
 assert.throws(()=>createRunV15({seed:1,mode:'endless'}));
});

test('every final-stage draw uses the ordinary adaptive unlocked shape and cargo distributions, including single cells',()=>{
 const base=stage(5);base.candidates=[{id:'recent',shapeId:'shape.domino_h',cargo:'cargo.food',quarterTurns:0}];
 for(const i of [0,1,2,7,8,9,14,15,16,21])base.board[i]='cargo.food';
 const ordinary=generationDistributionV14({...base,rulesetVersion:14,runConfigId:'run.inbound_v14'}),distribution=generationDistributionV15(base);
 assert.deepEqual(distribution.ordinaryShapes,ordinary.ordinaryShapes);assert.deepEqual(distribution.nonWildcardCargos,ordinary.nonWildcardCargos);
 const shapes=new Set<string>(),cargos=new Set<string>();
 const sample=<T>(draw:number,values:{value:T;probability:number}[]):T=>{let sum=0;for(const entry of values){sum+=entry.probability;if(draw<sum)return entry.value;}return values[values.length-1].value;};
 for(let seed=1;seed<=500;seed++){
  const state={...base,rngState:createRandomState(Math.imul(seed,0x9e3779b9))},before=structuredClone(state),generated=generatePieceV15(state);
  const traitDraw=nextRandom(state.rngState,0,0xffffffff),shapeDraw=nextRandom(traitDraw.state,0,0xffffffff),cargoDraw=nextRandom(shapeDraw.state,0,0xffffffff);
  const expectedShape=sample(shapeDraw.value/0x100000000,distribution.ordinaryShapes.map(entry=>({value:entry.shapeId,probability:entry.probability})));
  const expectedCargo=sample(cargoDraw.value/0x100000000,distribution.nonWildcardCargos.map(entry=>({value:entry.cargo,probability:entry.probability})));
  assert.equal(generated.piece.trait,'rush');assert.equal(generated.piece.rushTurns,3);assert.equal(generated.piece.shapeId,expectedShape);assert.equal(generated.piece.cargo,expectedCargo);
  assert.deepEqual(generated.state.rngState,cargoDraw.state);assert.equal(generated.state.generatedPieces,state.generatedPieces+1);assert.deepEqual(state,before);
  assert.deepEqual(generatePieceV15(structuredClone(state)),generated);shapes.add(generated.piece.shapeId);cargos.add(generated.piece.cargo);
 }
 assert.ok(shapes.has('shape.single'));assert.ok([...shapes].some(id=>SHAPES.find(shape=>shape.id===id)!.cells.length>1));assert.equal(cargos.size,5);
});

test('partial tool removal preserves the common rush deadline and remaining cells expire together',()=>{
 let state=applyCommandV15(createRunV15({seed:1,mode:'standard',toolCharges:{rotate:0,clear:1,wildcard:0}}),{type:'chooseCleanup',branch:'orders'}).state;
 state.candidates[0]={id:state.candidates[0].id,shapeId:'shape.i3_h',cargo:'cargo.machine',quarterTurns:0,trait:'rush',rushTurns:3};
 // Isolated lifecycle fixture avoids shipping the observed cargo.
 state.orders=[];
 const placed=applyCommandV15(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:0,y:0}});assert.equal(placed.error,undefined);state=placed.state;
 assert.deepEqual([0,1,2].map(i=>state.cellTraits[i]),Array(3).fill({kind:'rush',remaining:3,bornAtPlacement:1}));
 const cleared=applyCommandV15(state,{type:'clear',cells:[1]});assert.equal(cleared.error,undefined);state=cleared.state;
 assert.equal(state.cellTraits[1],null);assert.equal(state.cellTraits[0]?.remaining,3);assert.equal(state.cellTraits[2]?.remaining,3);
 for(let index=0;index<3;index++){
  state.orders=[];state.candidates[0]={id:`isolated.${index}`,shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0};
  const next=applyCommandV15(state,{type:'place',pieceId:state.candidates[0].id,origin:{x:5,y:3+index}});assert.equal(next.error,undefined);state=next.state;
  if(index<2){assert.equal(state.cellTraits[0]?.remaining,2-index);assert.equal(state.cellTraits[2]?.remaining,2-index);}
  else assert.deepEqual(next.events.find(event=>event.type==='rushExpired'),{type:'rushExpired',cells:[0,2]});
 }
 assert.deepEqual(state.cellTraits[0],{kind:'waste'});assert.deepEqual(state.cellTraits[2],{kind:'waste'});
});
