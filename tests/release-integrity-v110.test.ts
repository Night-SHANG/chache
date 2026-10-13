import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
// A patch release may update the two project version fields, never a transitive dependency by text substitution.
test('current project version leaves the complete v109 dependency graph and resolved identities unchanged',()=>{
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 assert.equal(lock.version,'1.0.19');assert.equal(lock.packages[''].version,'1.0.19');
 delete lock.version;delete lock.packages[''].version;
 assert.equal(createHash('sha256').update(JSON.stringify(lock)).digest('hex'),'dab9cb97684bd5bfd3a0537ffbc2a85f4eeff2213f50d69c734ca6967e7fa7fe');
});
test('shared renderer remains within the unchanged strict source budget',()=>{
 assert.ok(statSync('src/presentation/renderer.ts').size<80000,'renderer.ts must remain below the existing 80,000-byte preflight limit');
});
