import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const EXECUTION_FILES=['provenance.mjs','run-core.mjs','worker.mjs','observe.ts','supervisor.mjs','supervisor-io.mjs','worker-launcher.py','create-manifest.mjs'].map(name=>'qa/large-scan/'+name);
export const GAME_COMMIT='2f069901b69ecec8fcfbc0383c15fcf1ab7b7fc7';
export const GAME_JS_SHA256='c5774c8f3b434390d1f463c1136dc4f5ceeb4bd9efb68b5b23437bde8470abd0';
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):[join(dir,entry.name)]);}
function digest(paths){const hash=createHash('sha256');for(const path of [...new Set(paths)].sort()){hash.update(path);hash.update(readFileSync(path));}return hash.digest('hex');}
export function sourceProvenance(){
 const domain=files('src/domain');
 return {sourceSha256:digest([...EXECUTION_FILES,...domain,'src/application/save.ts','scripts/simulate.mjs','package.json','package-lock.json',...files('node_modules/pure-rand')]),rulesSha256:digest(domain),gameCommit:GAME_COMMIT,gameJsSha256:GAME_JS_SHA256,nodeVersion:process.version};
}
export function verifyProvenance(manifest){
 const actual=sourceProvenance();for(const key of ['sourceSha256','rulesSha256','gameCommit','gameJsSha256','nodeVersion'])if(manifest[key]!==actual[key])throw Error(`Campaign provenance mismatch: ${key}`);
 const bytes=readFileSync('build/wechat/game.js');if(createHash('sha256').update(bytes).digest('hex')!==GAME_JS_SHA256)throw Error('Frozen game.js changed');return actual;
}
