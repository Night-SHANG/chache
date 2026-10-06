import assert from 'node:assert/strict';
import test from 'node:test';
import {createRun, applyCommand, findLegalMoves} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import {createPlayableRun, applyPlayableCommand, previewPlayablePlacement, playableChecksum} from '../src/domain/playable.ts';
import type {RunSpec} from '../src/domain/playable.ts';

test('playable bridge preserves ordinary outbound state, placement and checksum',()=>{
 const legacy=createRun(47,'color_exit',8,'expert');
 const run=createPlayableRun({family:'outbound',variant:'normal',rulesetVersion:8,seed:47,difficultyId:'expert'});
 assert.deepEqual(run,legacy);assert.equal(playableChecksum(run),checksum(legacy));
 const move=findLegalMoves(legacy)[0];
 const command={type:'place' as const,...move};
 const before=JSON.stringify(run),preview=previewPlayablePlacement(run,move.pieceId,move.origin);
 const actual=applyPlayableCommand(run,command),expected=applyCommand(legacy,command);
 assert.deepEqual(actual,expected);assert.equal(JSON.stringify(run),before);
 assert.equal(preview.valid,true);assert.deepEqual(preview.shipments,expected.events.filter(e=>e.type==='shipment'));
});

test('playable bridge constructs separate inbound modes and outbound endless identities',()=>{
 for(const mode of ['standard','daily','endless'] as const){
  const run=createPlayableRun({family:'inbound',mode,rulesetVersion:9,seed:17,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}});
  assert.equal(run.rulesetVersion,9);assert.equal(run.mode,mode);assert.equal(run.board.length,49);
  assert.equal(run.phase,'cleanup');
  const chosen=applyPlayableCommand(run,{type:'chooseCleanup',branch:'orders'});
  assert.equal(chosen.error,undefined);assert.equal(chosen.state.phase,'input');assert.equal(chosen.state.candidates.length,3);
 }
 for(const difficultyId of ['easy','normal','hard','expert'] as const){
  const run=createPlayableRun({family:'outbound',variant:'endless',rulesetVersion:10,seed:47,difficultyId});
  assert.equal(run.rulesetVersion,10);assert.equal(run.mode,'color_exit');assert.equal(run.board.length,81);
  const done=applyPlayableCommand(run,{type:'finishOutboundEndless'});
  assert.equal(done.error,undefined);assert.equal(done.state.phase,'result');assert.equal(done.state.endReason,'retired');
 }
});

test('playable bridge rejects mismatched start and command identities without mutation',()=>{
 for(const spec of [
  {family:'outbound',variant:'normal',rulesetVersion:10,seed:1,difficultyId:'easy'},
  {family:'outbound',variant:'endless',rulesetVersion:8,seed:1,difficultyId:'easy'},
  {family:'inbound',mode:'standard',rulesetVersion:8,seed:1,guided:false,toolCharges:{rotate:0,clear:0,wildcard:0}},
  {family:'outbound',variant:'normal',rulesetVersion:8,seed:1,difficultyId:'unknown'},
 ])assert.throws(()=>createPlayableRun(spec as RunSpec));
 const old=createRun(1,'color_exit',8,'easy'),before=JSON.stringify(old);
 const invalid=applyPlayableCommand(old,{type:'chooseCleanup',branch:'orders'});
 assert.equal(invalid.state,old);assert.ok(invalid.error);assert.deepEqual(invalid.events,[]);assert.equal(JSON.stringify(old),before);
 assert.throws(()=>playableChecksum({...old,rulesetVersion:99}));
});
