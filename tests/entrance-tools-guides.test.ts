import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableRun,applyPlayableCommand,playableChecksum,reservedEntryCells,type GameRun,type GameCommand} from '../src/domain/playable.ts';
import {advanceGuide,guideOverlay,isGuideComplete,OUTBOUND_GUIDE_V8} from '../src/application/tutorials.ts';
import {INBOUND_GUIDE_V14} from '../src/application/inbound-guide-v14.ts';
import {decodeGameRun,encodeGameRun} from '../src/application/game-codec.ts';
import type {GuideProgress} from '../src/application/account-types.ts';

const charges={rotate:0 as const,clear:0 as const,wildcard:0 as const};
test('v14 authored guide teaches every retained lesson from accepted commands and resumes every checkpoint',()=>{
 for(const commands of Object.values(INBOUND_GUIDE_V14.branches)){
  let state=createPlayableRun({family:'inbound',rulesetVersion:14,mode:'standard',guided:true,seed:1,toolCharges:charges}),progress:GuideProgress={learned:[],skipped:false,authoredStartConsumed:true};
  const checkpoints:{state:GameRun;progress:GuideProgress}[]=[];
  for(const command of commands){
   const overlay=guideOverlay('inbound',progress,state);
   if(command.type==='place'&&!isGuideComplete('inbound',progress,14))assert.deepEqual(overlay?.expectedCommand,command);
   checkpoints.push({state:decodeGameRun(encodeGameRun(state)),progress:structuredClone(progress)});
   const result=applyPlayableCommand(state,command);assert.equal(result.error,undefined);
   progress=advanceGuide('inbound',progress,state,command,result);state=result.state;
   assert.ok(reservedEntryCells(state).every(cell=>state.board[cell]===null));
  }
  assert.equal(isGuideComplete('inbound',progress,14),true);
  assert.equal(progress.learned.includes('upgrade'),false);
  assert.deepEqual([...progress.learned].sort(),['place','order','route','sweepChoice','rushTimer','expired'].sort());
  for(const [cut,checkpoint] of checkpoints.entries()){
   let restored=checkpoint.state,learned=checkpoint.progress;
   for(const command of commands.slice(cut)){const result=applyPlayableCommand(restored,command as GameCommand);assert.equal(result.error,undefined);learned=advanceGuide('inbound',learned,restored,command,result);restored=result.state;}
   assert.equal(playableChecksum(restored),playableChecksum(state));assert.deepEqual(learned,progress);
  }
 }
});

test('v12 authored guide teaches real color groups, paths and mixed residue with the south entry reserved',()=>{
 let state=createPlayableRun({family:'outbound',rulesetVersion:12,variant:'normal',seed:12,difficultyId:'easy',toolCharges:charges}),progress:GuideProgress={learned:[],skipped:false,authoredStartConsumed:true};
 for(const command of OUTBOUND_GUIDE_V8.commands){
  assert.deepEqual(guideOverlay('outbound',progress,state)?.expectedCommand,command);
  const result=applyPlayableCommand(decodeGameRun(encodeGameRun(state)),command);assert.equal(result.error,undefined);
  progress=advanceGuide('outbound',progress,state,command,result);state=result.state;
  assert.deepEqual(reservedEntryCells(state),[76]);assert.equal(state.board[76],null);
 }
 assert.equal(isGuideComplete('outbound',progress,12),true);
 assert.deepEqual([...progress.learned].sort(),['place','colorGroup','colorExit','route','mixedRemainder'].sort());
});
