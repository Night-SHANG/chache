import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRunV9} from '../src/domain/v9/engine.ts';
import {checksumV9,replayV9} from '../src/domain/v9/replay.ts';
import {encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import type {InboundRunV9,InboundCommandV9,StartV9} from '../src/domain/v9/types.ts';
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const golden=JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json',import.meta.url),'utf8')) as {options:StartV9;commands:InboundCommandV9[];checksums:string[];state:InboundRunV9;checkpoints:{state:InboundRunV9}[]}[];
const frozen=JSON.parse(readFileSync(new URL('./fixtures/inbound-v11-legacy-files.json',import.meta.url),'utf8')) as {base:string;files:Record<string,string>;saves:{golden:number;kind:'initial'|'final'|'checkpoint';checkpoint?:number;sha256:string}[]};

test('all frozen nine and ten domain files retain exact approved baseline bytes',()=>{
 assert.equal(frozen.base,'ff6e6d7ce78cb0b8f58810de7d2d4536490d2ef7');
 for(const [path,digest]of Object.entries(frozen.files))assert.equal(sha(readFileSync(new URL(`../${path}`,import.meta.url))),digest,path);
 assert.ok(Object.keys(frozen.files).some(path=>path.includes('/v9/')));assert.ok(Object.keys(frozen.files).some(path=>path.includes('/v10/')));
});

test('old-nine initial, pending reward, resumed and terminal save envelopes remain byte compatible',()=>{
 for(const saved of frozen.saves){const g=golden[saved.golden],state=saved.kind==='initial'?createRunV9(g.options):saved.kind==='final'?g.state:g.checkpoints[saved.checkpoint!].state,encoded=encodeGameRun(state);
  assert.equal(sha(encoded),saved.sha256,JSON.stringify(saved));assert.deepEqual(decodeGameRun(encoded),state);
 }
 assert.ok(frozen.saves.some(saved=>saved.kind==='checkpoint'));
});

test('all fixed-seed nine command checksums replay unchanged through the new facade and codec release',()=>{
 for(const g of golden){const replayed=replayV9(g.options,g.commands);assert.deepEqual(replayed.trace.map(entry=>entry.checksum),g.checksums);assert.equal(checksumV9(replayed.state),checksumV9(g.state));}
});
