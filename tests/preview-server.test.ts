import test from 'node:test';
import assert from 'node:assert/strict';
import {posix,win32} from 'node:path';
import {requestFile} from '../scripts/serve.mjs';
for(const [name,path,root] of [['POSIX',posix,'/game/build/browser'],['Win32',win32,'C:\\game\\build\\browser']] as const){
 test(`preview ${name} resolves packaged files without separator assumptions`,()=>{assert.equal(requestFile(root,'/',path),path.join(root,'index.html'));assert.equal(requestFile(root,'/assets/ship.wav',path),path.join(root,'assets','ship.wav'));});
 test(`preview ${name} rejects parent escape`,()=>{assert.throws(()=>requestFile(root,'/../../outside.txt',path),/Denied/);});
}
