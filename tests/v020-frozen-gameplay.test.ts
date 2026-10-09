import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const files=JSON.parse(readFileSync(new URL('./fixtures/v020-frozen-gameplay.json',import.meta.url),'utf8')) as Record<string,string>;
test('v0.20 cosmetic refinement leaves all domain rules, transport timings and audio byte-identical to v0.19',()=>{
 for(const [file,expected] of Object.entries(files))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),expected,file);
});
