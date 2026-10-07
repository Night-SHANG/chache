import test from 'node:test';import assert from 'node:assert/strict';
import {createPlayableRun,applyPlayableCommand,findPlayableMoves,playableChecksum,previewPlayablePlacement,reservedEntryCells,type RunSpec} from '../src/domain/playable.ts';
for(const mode of ['standard','endless','daily'] as const)for(const inboundDifficulty of (mode==='daily'?['hard']:['hard','expert']) as ('hard'|'expert')[])test(`playable routes18 ${mode}/${inboundDifficulty} without legacy identity loss`,()=>{
 let state:ReturnType<typeof createPlayableRun>|undefined;assert.doesNotThrow(()=>state=createPlayableRun({family:'inbound',rulesetVersion:18,seed:7,mode,inboundDifficulty,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}} as unknown as RunSpec));assert.ok(state);assert.equal(state.rulesetVersion,18);assert.deepEqual(reservedEntryCells(state),[3,27,45,21]);
 if(mode==='daily'){const choice=applyPlayableCommand(state,{type:'chooseCleanup',branch:'orders'});assert.equal(choice.error,undefined);state=choice.state;}
 const move=findPlayableMoves(state)[0];assert.ok(move);const before=structuredClone(state),preview=previewPlayablePlacement(state,move.pieceId,move.origin),result=applyPlayableCommand(state,{type:'place',...move});assert.equal(result.error,undefined);assert.deepEqual(preview.stateAfter,result.state);assert.deepEqual(state,before);assert.equal(playableChecksum(result.state).length,8);assert.equal(result.state.rulesetVersion,18);
});
test('playable18 rejects ordinaryA and guided starts without coercion or dailyexpert fallback',()=>{
 const spec={family:'inbound',rulesetVersion:18,seed:7,mode:'standard',inboundDifficulty:'hard',guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}};
 for(const patch of [{inboundDifficulty:'normal'},{inboundDifficulty:null},{guided:true},{mode:'daily',inboundDifficulty:'expert'}])assert.throws(()=>createPlayableRun({...spec,...patch} as unknown as RunSpec));
});
