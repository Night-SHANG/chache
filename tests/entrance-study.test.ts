import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRunV11,applyCommandV11} from '../src/domain/v11/engine.ts';
import {createRunV14,applyCommandV14} from '../src/domain/v14/engine.ts';

test('entrance study preserves old visible policy and excludes reserved new cells',async()=>{
 assert.ok(existsSync(new URL('../scripts/simulate-entrance.mjs',import.meta.url)),'new comparison driver is present');
 const {chooseEntranceMove}=await import('../scripts/simulate-entrance.mjs');
 const {chooseRefinementMove}=await import('../scripts/simulate-refinement.mjs');
 for(const strategy of ['route','greedy'])for(const seed of [1,7]){
  let old=applyCommandV11(createRunV11({seed,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
  let next=applyCommandV14(createRunV14({seed,mode:'standard'}),{type:'chooseCleanup',branch:'orders'}).state;
  for(let step=0;step<12;step++){
   if(old.phase==='input'){const move=chooseEntranceMove(old,strategy);assert.deepEqual(move,chooseRefinementMove(old,strategy));old=applyCommandV11(old,{type:'place',...move!}).state;}
   if(next.phase==='input'){const move=chooseEntranceMove(next,strategy);assert.ok(move);const result=applyCommandV14(next,{type:'place',...move});assert.equal(result.error,undefined);next=result.state;for(const cell of [3,21,27,45])assert.equal(next.board[cell],null);}
  }
 }
});
