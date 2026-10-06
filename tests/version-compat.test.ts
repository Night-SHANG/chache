import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, applyCommand, findLegalMoves } from '../src/domain/engine.ts';
import { createRun as createLegacy } from '../src/domain/rulesets/v1/engine.ts';
import { checksum, replay } from '../src/domain/replay.ts';
import { encodeRun, decodeRun } from '../src/application/save.ts';
import type { Command } from '../src/domain/types.ts';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('v1 golden replay survives rules expansion unchanged',()=>{
 const commands:Command[]=[{type:'place',pieceId:'piece.3',origin:{x:1,y:1}},{type:'place',pieceId:'piece.4',origin:{x:3,y:1}}];
 const state=replay(123,commands,'tutorial',1);assert.equal(state.rulesetVersion,1);assert.equal(checksum(state),'b13abf7f');
 assert.equal(JSON.parse(encodeRun(state)).schemaVersion,1);assert.deepEqual(decodeRun(encodeRun(state)),state);
});
test('new v2 run has independent config, metadata and schema',()=>{
 const state=createRun(1,'standard',2);assert.equal(state.rulesetVersion,2);assert.equal(state.runConfigId,'run.standard_v2');assert.equal(state.cellTraits?.length,49);assert.ok(Number.isInteger(state.generatedPieces));
 assert.equal(JSON.parse(encodeRun(state)).schemaVersion,2);assert.deepEqual(decodeRun(encodeRun(state)),state);
});
test('v1 snapshot continues under old rules instead of silently migrating',()=>{
 const legacy=createLegacy(91);const restored=decodeRun(encodeRun(legacy));const command:Command={type:'place',...findLegalMoves(restored)[0]};const next=applyCommand(restored,command).state;
 assert.equal(next.rulesetVersion,1);assert.equal(next.cellTraits,undefined);assert.equal(checksum(next),checksum(replay(91,[command],'standard',1)));
});
test('v2 replay and snapshot restore all future-affecting trait state',()=>{
 let state=createRun(14,'standard',2);
 for(let i=0;i<60&&state.phase!=='result';i++){
  const command:Command=state.phase==='upgrade'?{type:'upgrade',upgradeId:state.upgradeChoices[0]}:{type:'place',...findLegalMoves(state)[i%findLegalMoves(state).length]};
  const result=applyCommand(state,command);assert.equal(result.error,undefined);assert.deepEqual(applyCommand(decodeRun(encodeRun(state)),command),result);state=result.state;
 }
 assert.equal(checksum(replay(14,state.commands,'standard',2)),checksum(state));
});
test('future rulesets are refused rather than replayed under current rules',()=>{
 assert.throws(()=>createRun(1,'standard',99),/版本|version/i);assert.throws(()=>replay(1,[],'standard',99),/版本|version/i);
});
test('v1 implementation bytes remain pinned to the validated P0 checkpoint',()=>{
 const root='src/domain/rulesets/v1/';const manifest=JSON.parse(readFileSync(root+'source-manifest.json','utf8')) as {files:Record<string,string>};
 for(const [file,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(root+file)).digest('hex'),sha,file);
});
test('v2 core remains frozen and golden replay survives tutorial and overtime additions',()=>{
 const manifest=JSON.parse(readFileSync('src/domain/rulesets/v2/source-manifest.json','utf8')) as {files:Record<string,string>};for(const [file,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),sha,file);
 const commands:Command[]=[{type:'place',pieceId:'piece.3',origin:{x:1,y:1}},{type:'place',pieceId:'piece.4',origin:{x:3,y:1}}];assert.equal(checksum(replay(123,commands,'tutorial',2)),'b656e05c');
});
test('v3 tutorial and overtime state serialize with independent application metadata',()=>{
 let state=createRun(123,'tutorial',3);state.runSerial=5;
 for(const origin of [{x:1,y:1},{x:3,y:1},{x:3,y:4}]){const command:Command={type:'place',pieceId:state.candidates[0].id,origin};const result=applyCommand(state,command);assert.deepEqual(applyCommand(decodeRun(encodeRun(state)),command),result);state=result.state;}
 assert.equal(state.phase,'result');assert.equal(JSON.parse(encodeRun(state)).schemaVersion,3);assert.deepEqual(decodeRun(encodeRun(state)),state);assert.equal(checksum(state),checksum(replay(123,state.commands,'tutorial',3)));
 const before=checksum(state);state.runSerial=99;state.challengeDay='2026-10-05';state.maxOccupancy=35;state.elapsedMs=19000;assert.equal(checksum(state),before);
});
