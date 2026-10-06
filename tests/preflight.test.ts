import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const preflight=(change:string)=>spawnSync(process.execPath,['--input-type=module','-e',`import {UPGRADES,SHAPES} from './src/domain/content.ts';${change};await import('./scripts/preflight.mjs');`],{cwd:process.cwd(),encoding:'utf8'});
test('content preflight rejects unregistered upgrade effects',()=>{const result=preflight("UPGRADES[0].effect='missing_effect'");assert.equal(result.status,1);assert.match(result.stderr,/unregistered effect/);});
test('content preflight rejects self-conflicting upgrades',()=>{const result=preflight('UPGRADES[0].conflicts=[UPGRADES[0].id]');assert.equal(result.status,1);assert.match(result.stderr,/invalid conflict/);});
test('content preflight rejects duplicate shape cells',()=>{const result=preflight('SHAPES[0].cells.push({...SHAPES[0].cells[0]})');assert.equal(result.status,1);assert.match(result.stderr,/duplicate cell/);});
