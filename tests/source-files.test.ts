import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceFiles,allFiles} from '../scripts/source-files.mjs';

test('source enumeration ignores machine-local Python bytecode while retaining authored scripts and assets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-source-cache-'));
 try{
  await mkdir(join(root,'nested'));await writeFile(join(root,'compile.py'),'source');await writeFile(join(root,'nested','atlas.json'),'{}');
  const original=(await sourceFiles(root)).sort();
  await mkdir(join(root,'__pycache__'));await writeFile(join(root,'__pycache__','compile.cpython-312.pyc'),'machine-specific');await writeFile(join(root,'nested','cached.pyc'),'cache');
  assert.deepEqual((await sourceFiles(root)).sort(),original);
  assert.equal((await allFiles(root)).length,4,'Package inventory must still count generated files that would ship');
  await writeFile(join(root,'nested','new.py'),'new source');assert.equal((await sourceFiles(root)).length,3);
  for(const script of ['build.mjs','growth-host-support.mjs'])assert.match(await readFile(new URL('../scripts/'+script,import.meta.url),'utf8'),/from ['"]\.\/source-files\.mjs['"]/);
 }finally{await rm(root,{recursive:true,force:true});}
});
