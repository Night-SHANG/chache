import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,symlink,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';

for(const mode of ['copy','lighter'])for(const script of ['preflight','build'])test(`${script} rejects WeChat unsupported ${mode} composition`,async()=>{
 const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'warehouse-wechat-composition-'));
 try{
  await cp('src',join(dir,'src'),{recursive:true});
  for(const path of ['scripts','assets','tests','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'])await symlink(resolve(root,path),join(dir,path));
  await appendFile(join(dir,'src/wechat-main.ts'),`\nwx.createCanvas().getContext('2d').globalCompositeOperation = '${mode}';\n`);
  const result=spawnSync(process.execPath,[resolve(root,`scripts/${script}.mjs`)],{cwd:dir,encoding:'utf8'});
  assert.equal(result.status,1,result.stdout+result.stderr);
  assert.match(result.stdout+result.stderr,script==='build'?/WeChat forbidden runtime pattern/:/unsupported WeChat Canvas API/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

for(const script of ['preflight','build'])for(const probe of [
 {name:'bracket and template-literal copy assignment',source:"wx.createCanvas().getContext('2d')[`globalCompositeOperation`] = `copy`;",denied:true},
 {name:'harmless comments and strings mentioning copy assignment',source:"// globalCompositeOperation = 'copy'\nconsole.log(\"Example: globalCompositeOperation = 'copy'\");\nlet globalCompositeOperation = 'copyright';console.log(globalCompositeOperation);",denied:false}
])test(`${script} classifies ${probe.name} by syntax`,async()=>{
 const root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'warehouse-wechat-composition-syntax-'));
 try{
  await cp('src',join(dir,'src'),{recursive:true});
  for(const path of ['scripts','assets','tests','node_modules','package.json','package-lock.json','THIRD_PARTY_NOTICES.md'])await symlink(resolve(root,path),join(dir,path));
  await appendFile(join(dir,'src/wechat-main.ts'),'\n'+probe.source+'\n');
  const result=spawnSync(process.execPath,[resolve(root,`scripts/${script}.mjs`)],{cwd:dir,encoding:'utf8'});
  assert.equal(result.status,probe.denied?1:0,result.stdout+result.stderr);
  if(probe.denied)assert.match(result.stdout+result.stderr,script==='build'?/WeChat forbidden runtime pattern/:/unsupported WeChat Canvas API/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
