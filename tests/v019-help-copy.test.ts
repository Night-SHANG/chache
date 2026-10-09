import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('outbound wildcard help is the exact short user copy',()=>{
 const source=readFileSync(new URL('../src/presentation/help-renderer.ts',import.meta.url),'utf8');
 assert.ok(source.includes('出库：换成单格，自选货类。'));
 assert.ok(!source.includes('出库：换成单格，自选食品、机械或化工。'));
});
