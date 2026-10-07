import test from 'node:test';
import assert from 'node:assert/strict';
import { INBOUND_GUIDE_V14 } from '../src/application/inbound-guide-v14.ts';
import { advanceGuide, guideOverlay, isGuideComplete } from '../src/application/tutorials.ts';
import { createRunV14, applyCommandV14 } from '../src/domain/v14/engine.ts';
import { encodeGameRun, decodeGameRun } from '../src/application/game-codec.ts';
import type { GuideProgress } from '../src/application/account-types.ts';
import type { InboundRunV14 } from '../src/domain/v14/types.ts';

test('authored14 guide uses current real multi-rush generation and teaches both cleanup branches through later sweep',()=>{
 for(const branch of ['orders','placements'] as const){
  let state=createRunV14({seed:INBOUND_GUIDE_V14.seed,mode:'standard',guided:true});
  let progress:GuideProgress={learned:[],skipped:false,authoredStartConsumed:true};
  let multiRush=false,expired=false,swept=false;
  const clocks=new Set<number>();
  for(const command of INBOUND_GUIDE_V14.branches[branch]){
   const overlay=guideOverlay('inbound',progress,state);
   if(command.type==='place'&&!isGuideComplete('inbound',progress,14))assert.deepEqual(overlay?.expectedCommand,command);
   const before=state,result=applyCommandV14(before,command);assert.equal(result.error,undefined,`${branch} ${JSON.stringify(command)}`);
   if(command.type==='place'&&before.candidates.find(piece=>piece.id===command.pieceId)?.trait==='rush'){
    const placed=result.events.find(event=>event.type==='placed');multiRush ||= placed?.type==='placed'&&placed.cells.length>1;
   }
   for(const trait of result.state.cellTraits)if(trait?.kind==='rush')clocks.add(trait.remaining!);
   expired ||= result.events.some(event=>event.type==='rushExpired');
   swept ||= expired&&result.events.some(event=>event.type==='cleanup');
   progress=advanceGuide('inbound',progress,before,command,result);state=decodeGameRun(encodeGameRun(result.state)) as InboundRunV14;
  }
  assert.equal(multiRush,true,`${branch}: no multi-cell rush placed`);
  assert.deepEqual([...clocks].sort(),[1,2,3]);assert.equal(expired,true);assert.equal(swept,true);
  assert.equal(isGuideComplete('inbound',progress,14),true);assert.notEqual(state.phase,'result');
 }
});
