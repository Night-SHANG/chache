import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const files=JSON.parse(readFileSync(new URL('./fixtures/v020-frozen-gameplay.json',import.meta.url),'utf8')) as Record<string,string>;
test('v0.20 frozen gameplay and 12 legacy cue synthesis remain byte-identical after type-only narrowing',()=>{
 for(const [file,expected] of Object.entries(files)){
  let bytes=readFileSync(new URL('../'+file,import.meta.url));
  if(file==='scripts/audio.ts'){const source=bytes.toString('utf8');assert.equal((source.match(/Exclude<SoundName,'ui_click'>/g)??[]).length,2);bytes=Buffer.from(source.replace(/Exclude<SoundName,'ui_click'>/g,'SoundName'));}
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,file);
 }
});
