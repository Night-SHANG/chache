import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayableRun,applyPlayableCommand,findPlayableMoves,playableChecksum,previewPlayablePlacement,reservedEntryCells,isRushV19,type RunSpec} from '../src/domain/playable.ts';
import {inboundDocks,inboundGroups,inboundPieceCells} from '../src/presentation/inbound-helpers.ts';
import {toolPreview} from '../src/presentation/tool-preview.ts';
import {getEconomyControls} from '../src/presentation/economy-ui.ts';
for(const tier of ['hard','expert'] as const)test(`rush19 ${tier} enters shared geometry, preview and tool dispatch without changing identity`,()=>{
 let state:ReturnType<typeof createPlayableRun>|undefined;
 assert.doesNotThrow(()=>state=createPlayableRun({family:'inbound',rulesetVersion:19,seed:4,mode:'rush',inboundDifficulty:tier,guided:false,toolCharges:{rotate:1,clear:0,wildcard:1}} as unknown as RunSpec));assert.ok(state);assert.equal(state.rulesetVersion,19);assert.equal(state.mode,'rush');assert.equal(state.phase,'cleanup');assert.deepEqual(reservedEntryCells(state),[3,27,45,21]);
 const cards=getEconomyControls(state,{selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false});assert.match(cards.find(c=>c.action.type==='chooseCleanup'&&c.action.branch==='placements')!.label,/每成功放置6次/);
 state=applyPlayableCommand(state,{type:'chooseCleanup',branch:'placements'}).state;assert.equal(state.rulesetVersion,19);
 const move=findPlayableMoves(state)[0];assert.ok(move);const before=structuredClone(state),preview=previewPlayablePlacement(state,move.pieceId,move.origin),result=applyPlayableCommand(state,{type:'place',...move});assert.equal(result.error,undefined);assert.deepEqual(preview.stateAfter,result.state);assert.deepEqual(state,before);assert.equal(playableChecksum(result.state).length,8);
 if(!isRushV19(state))throw Error('wrong rules');
 assert.equal(inboundDocks(state).length,4);assert.deepEqual(inboundGroups(state,'cargo.food'),[]);assert.ok(inboundPieceCells(state.candidates[0],19).length);
 const change={type:'wildcard' as const,pieceId:state.candidates[0].id};const predicted=toolPreview(state,change),actual=applyPlayableCommand(state,change);assert.equal(actual.error,undefined);assert.deepEqual(predicted,actual);assert.deepEqual(state,before);assert.equal(actual.state.mode,'rush');
});
test('bridge rejects mismatched rush version/mode and legacy tiers',()=>{
 const base={family:'inbound',rulesetVersion:19,seed:4,mode:'rush',inboundDifficulty:'hard',guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}};
 for(const patch of [{rulesetVersion:18},{mode:'daily'},{mode:'standard'},{inboundDifficulty:'normal'},{guided:true}])assert.throws(()=>createPlayableRun({...base,...patch} as unknown as RunSpec));
});
