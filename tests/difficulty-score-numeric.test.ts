import test from 'node:test';
import assert from 'node:assert/strict';
import type {OutboundDifficulty} from '../src/domain/types.ts';
import * as score from '../src/domain/v12/score.ts';
import {applyCommandV12,createRunV12} from '../src/domain/v12/engine.ts';
import {applyCommandV13,createRunV13} from '../src/domain/v13/engine.ts';
import {checksumCore} from '../src/domain/v12/core.ts';

const tiers=[['easy',1,1],['normal',5,4],['hard',3,2],['expert',2,1]] as const;
const max=Number.MAX_SAFE_INTEGER;
// Test-only BigInt oracle verifies exact arithmetic beyond the range of raw*n intermediates.
function expected(raw:number,numerator:number,denominator:number):bigint {return BigInt(raw)*BigInt(numerator)/BigInt(denominator);}
function limit(numerator:number,denominator:number):number {return Number(((BigInt(max)+1n)*BigInt(denominator)-1n)/BigInt(numerator));}

// Mutation target: a direct raw*n intermediate silently corrupts high but representable totals.
test('difficulty helpers return exact rational scores through the safe integer boundary',()=>{
 for(const [difficulty,numerator,denominator] of tiers){
  assert.deepEqual(score.difficultyScoreMultiplierV12(difficulty),{numerator,denominator});
  const maximum=limit(numerator,denominator);
  const cases=[0,1,2,3,4,49,50,51,99,100,101,1_000_000_000];
  for(let offset=0;offset<64;offset++)cases.push(maximum-offset);
  for(const raw of cases)assert.equal(score.displayScoreV12(raw,difficulty),Number(expected(raw,numerator,denominator)),`${difficulty}: ${raw}`);
 }
});

// Mutation target: accepting unsafe input or overflowing displayed scores can lose cumulative points.
test('score calculation rejects invalid raw points and unrepresentable displayed totals',()=>{
 for(const [difficulty,numerator,denominator] of tiers){
  for(const raw of [-1,.5,NaN,Infinity,-Infinity,max+1,undefined,null,'50'])assert.throws(()=>score.displayScoreV12(raw as number,difficulty),RangeError);
  const maximum=limit(numerator,denominator);
  assert.throws(()=>score.displayScoreV12(maximum+1,difficulty),RangeError);
 }
 for(const difficulty of ['unknown','toString','__proto__',undefined,null])assert.throws(()=>score.difficultyScoreMultiplierV12(difficulty as OutboundDifficulty),RangeError);
});

// Mutation target: decoding one stored total without checking its paired cumulative value permits double scaling.
test('score state validator accepts only safe cumulative raw and displayed pairs',()=>{
 assert.equal(typeof score.validScoreStateV12,'function');
 for(const [difficulty,numerator,denominator] of tiers){
  for(const raw of [0,50,100,limit(numerator,denominator)]){
   const displayed=Number(expected(raw,numerator,denominator));
   assert.equal(score.validScoreStateV12(raw,displayed,difficulty),true);
   assert.equal(score.validScoreStateV12(raw,displayed+1,difficulty),false);
   if(displayed<Number.MAX_SAFE_INTEGER/2)assert.equal(score.validScoreStateV12(raw,displayed-.5,difficulty),false);
  }
  for(const value of [undefined,null,'50',NaN,-1,max+1]){
   assert.equal(score.validScoreStateV12(value,0,difficulty),false);
   assert.equal(score.validScoreStateV12(0,value,difficulty),false);
  }
  assert.equal(score.validScoreStateV12(limit(numerator,denominator)+1,max,difficulty),false);
 }
 assert.equal(score.validScoreStateV12(0,0,'unknown' as OutboundDifficulty),false);
});

// Mutation target: forgetting rawScore in the gameplay checksum permits raw-score tampering.
test('gameplay checksums include cumulative raw points independently of displayed score',()=>{
 for(const state of [createRunV12(17,'normal'),createRunV13(17,'normal')]){
  assert.notEqual(checksumCore(state),checksumCore({...state,rawScore:50}));
 }
});

// Mutation target: accepting malformed score state or rounding overflow mutates a still-valid run.
test('commands reject inconsistent score pairs and fail safely before score overflow',()=>{
 for(const version of [12,13] as const)for(const [difficulty,numerator,denominator] of tiers){
  const run=version===12?createRunV12(17,difficulty):createRunV13(17,difficulty);
  run.candidates[0]={id:'fixture',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0};
  for(const cell of [4,13,22,31])run.board[cell]='cargo.food';
  const command={type:'place',pieceId:'fixture',origin:{x:4,y:4}} as const;
  const apply=()=>run.rulesetVersion===12?applyCommandV12(run,command):applyCommandV13(run,command);
  run.rawScore=50;run.score=0;assert.throws(apply,/score|分数/i);
  const maximum=limit(numerator,denominator);run.rawScore=maximum-(maximum%10);run.score=Number(expected(run.rawScore,numerator,denominator));
  const before=structuredClone(run);assert.throws(apply,RangeError);assert.deepEqual(run,before);
 }
});
