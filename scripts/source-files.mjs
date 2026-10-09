import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
/** Python compiler caches are machine-local output, never source identity. */
async function walk(dir,excludePythonCache){
 const files=[];
 for(const item of await readdir(dir,{withFileTypes:true})){
  if(excludePythonCache&&(item.name==='__pycache__'||item.name.endsWith('.pyc')))continue;
  const path=join(dir,item.name);files.push(...(item.isDirectory()?await walk(path,excludePythonCache):[path]));
 }
 return files;
}
export const sourceFiles=dir=>walk(dir,true);
/** Package inventories count every file actually present, without source exclusions. */
export const allFiles=dir=>walk(dir,false);
