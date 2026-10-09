import test from 'node:test';
import assert from 'node:assert/strict';
import {posix,win32} from 'node:path';
import {requestFile} from '../scripts/serve.mjs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
for(const [name,path,root] of [['POSIX',posix,'/game/build/browser'],['Win32',win32,'C:\\game\\build\\browser']] as const){
 test(`preview ${name} resolves packaged files without separator assumptions`,()=>{assert.equal(requestFile(root,'/',path),path.join(root,'index.html'));assert.equal(requestFile(root,'/assets/ship.wav',path),path.join(root,'assets','ship.wav'));});
 test(`preview ${name} rejects parent escape`,()=>{assert.throws(()=>requestFile(root,'/../../outside.txt',path),/Denied/);});
}

test('preview serves the bundled cargo atlas with PNG media type and unchanged bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'warehouse-preview-atlas-'));
 const bytes=await readFile(new URL('../assets/cargo-materials.png',import.meta.url));
 await mkdir(join(root,'build/browser/assets'),{recursive:true});
 await writeFile(join(root,'build/browser/assets/cargo-materials.png'),bytes);
 const server=spawn(process.execPath,[fileURLToPath(new URL('../scripts/serve.mjs',import.meta.url))],{cwd:root,stdio:['ignore','pipe','pipe']});
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  await new Promise<void>((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Preview startup timeout')),10000);server.stdout.on('data',data=>{if(String(data).includes('Local-only browser preview'))resolve();});server.once('error',reject);server.once('exit',code=>reject(Error(`Preview exited ${code}`)));});
  const response=await fetch('http://127.0.0.1:4173/assets/cargo-materials.png');
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
 }finally{
  if(timer)clearTimeout(timer);
  if(server.exitCode===null){server.kill('SIGTERM');await once(server,'exit').catch(()=>{});}
  await rm(root,{recursive:true,force:true});
 }
});
