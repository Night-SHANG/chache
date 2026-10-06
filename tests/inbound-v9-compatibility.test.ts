import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{createRun,applyCommand}from'../src/domain/engine.ts';import{checksum}from'../src/domain/replay.ts';
test('all frozen v1–8 domain source fingerprints match product base',()=>{
 const files=JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-legacy-files.json',import.meta.url),'utf8')) as {base:string;files:Record<string,string>;runs:{seed:number;mode:'standard'|'color_exit'|'endless';rulesetVersion:number;difficultyId?:'easy'|'normal'|'hard'|'expert'|'entry'|'middle'|'late';initial:string;afterFinish?:string}[]};assert.equal(files.base,'5b7c293');
 for(const [path,digest]of Object.entries(files.files))assert.equal(createHash('sha256').update(readFileSync(new URL(`../${path}`,import.meta.url))).digest('hex'),digest,path);
 for(const expected of files.runs){const s=createRun(expected.seed,expected.mode,expected.rulesetVersion,expected.difficultyId);assert.equal(checksum(s),expected.initial);if(expected.afterFinish){const r=applyCommand(s,{type:'finishEndless'});assert.equal(checksum(r.state),expected.afterFinish);}}
 assert.ok([1,2,3,4,5,6,7,8].every(version=>files.runs.some(r=>r.rulesetVersion===version)));assert.equal(files.runs.filter(r=>r.rulesetVersion===8).length,4);
});
