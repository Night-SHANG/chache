import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const files=JSON.parse(readFileSync(new URL('./fixtures/v020-frozen-gameplay.json',import.meta.url),'utf8')) as Record<string,string>;
test('v0.20 frozen gameplay and legacy audio remain identical; v107 adds only its UI cue',()=>{
 for(const [file,expected] of Object.entries(files)){
  let bytes=readFileSync(new URL('../'+file,import.meta.url));
  if(file==='scripts/audio.ts'){const source=bytes.toString('utf8');assert.equal((source.match(/^ ui_click:.*$/gm)??[]).length,1);bytes=Buffer.from(source.replace(/^ ui_click:.*\n/m,''));}
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,file);
 }
});
