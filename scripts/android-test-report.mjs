import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const baseline=[
 {file:'tests/cargo-atlas.test.ts',name:'committed raster artwork verifies every generated source and exact encoded atlas',path:'artifacts/v0200-art-source/cargo-wood-generated.png'},
 {file:'tests/v021-cargo-forklift-art.test.ts',name:'new generated atlas rows obey their incremental byte budgets and preserve source evidence',path:'artifacts/v0210-art-source/cargo-harbor_container-generated.png'}
];
export function classifyNodeEvents(events,exitCode,root=process.cwd()) {
 const failures=events.filter(event=>event.type==='test:fail').map(event=>event.data);
 const terminals=events.filter(event=>event.type==='test:pass'||event.type==='test:fail');
 const summaries=events.filter(event=>event.type==='test:summary'&&!event.data.file);
 const summary=summaries.length===1?summaries[0].data:null;
 const identities=new Map();
 let invalidTerminal=false;
 const identity=data=>JSON.stringify([data.file,data.testId]);
 for(const event of terminals){
  const data=event.data;
  const shape=data&&typeof data.file==='string'&&isAbsolute(data.file)&&typeof data.name==='string'&&data.name.length>0&&Number.isSafeInteger(data.testId)&&data.testId>0&&Number.isSafeInteger(data.parentId)&&data.parentId>=0&&data.parentId!==data.testId&&Number.isSafeInteger(data.nesting)&&data.nesting>=0&&Number.isSafeInteger(data.testNumber)&&data.testNumber>0&&['test','suite'].includes(data.details?.type)&&!data.skip&&!data.todo;
  if(!shape){invalidTerminal=true;continue;}
  const key=identity(data);
  if(identities.has(key))invalidTerminal=true;
  identities.set(key,data);
 }
 for(const data of identities.values()){
  if(data.parentId===0){if(data.nesting!==0)invalidTerminal=true;}
  else{const parent=identities.get(JSON.stringify([data.file,data.parentId]));if(!parent||parent.nesting!==data.nesting-1)invalidTerminal=true;}
 }
 const seen=new Set();
 const knownBaseline=[],unexpectedFailures=[];
 for(const failure of failures){
  const error=failure.details?.error,cause=error?.cause;
  const index=baseline.findIndex(item=>failure.file===resolve(root,item.file)&&failure.name===item.name&&failure.details?.type==='test'&&error.code==='ERR_TEST_FAILURE'&&error.failureType==='testCodeFailure'&&cause?.code==='ENOENT'&&cause.errno===-2&&cause.syscall==='open'&&cause.path===resolve(root,item.path)&&cause.message===`ENOENT: no such file or directory, open '${resolve(root,item.path)}'`);
  if(index>=0&&!seen.has(index)){seen.add(index);knownBaseline.push({...baseline[index],failure});}else unexpectedFailures.push(failure);
 }
 const counts=summary?.counts;
 const testRecords=terminals.filter(event=>event.data?.details?.type==='test');
 const passed=testRecords.filter(event=>event.type==='test:pass').length;
 const failed=testRecords.filter(event=>event.type==='test:fail').length;
 const suiteCount=terminals.filter(event=>event.data?.details?.type==='suite').length;
 const topLevel=terminals.filter(event=>event.data?.nesting===0).length;
 const invalidSummary=!counts||!Number.isSafeInteger(counts.tests)||counts.tests<=0||counts.tests!==testRecords.length||counts.passed!==passed||counts.failed!==failed||counts.suites!==suiteCount||counts.topLevel!==topLevel||counts.tests!==counts.passed+counts.failed||counts.cancelled!==0||counts.skipped!==0||counts.todo!==0||summary.success!==(failures.length===0)||events[events.length-1]!==summaries[0];
 const validExit=exitCode===(failures.length?1:0);
 return {schemaVersion:1,command:'npm test',rawExitCode:exitCode,rawPassed:exitCode===0,accepted:!invalidSummary&&!invalidTerminal&&validExit&&unexpectedFailures.length===0,counts:counts??null,knownBaseline,unexpectedFailures,invalidSummary,invalidTerminal,validExit,durationMs:summary?.duration_ms??null};
}

export async function runRegression(root=process.cwd(),output=join(root,'build/android-ci')) {
 await mkdir(output,{recursive:true});
 const rawPath=join(output,'node-events.jsonl'),errorPath=join(output,'node-stderr.log');
 const raw=createWriteStream(rawPath),errors=createWriteStream(errorPath);
 // --test-reporter is permitted in NODE_OPTIONS; --test-concurrency is not.
 // This invokes the unchanged npm test command and never drops test files.
 const child=spawn('npm',['test'],{cwd:root,env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS??''} --test-reporter=${resolve(root,'scripts/android-node-reporter.mjs')}`.trim()},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(raw);child.stderr.pipe(errors);
 const exitCode=await new Promise((resolveExit,reject)=>{child.once('error',reject);child.once('close',code=>resolveExit(code));});
 await Promise.all([finished(raw),finished(errors)]);
 const events=(await readFile(rawPath,'utf8')).split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 const result=classifyNodeEvents(events,exitCode,root);
 await writeFile(join(output,'node-test-report.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({command:result.command,rawExitCode:result.rawExitCode,rawPassed:result.rawPassed,accepted:result.accepted,counts:result.counts,knownBaseline:result.knownBaseline.map(({file,name,path})=>({file,name,path})),unexpectedFailures:result.unexpectedFailures.map(({file,name})=>({file,name}))},null,2));
 return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv[2]!=='run')throw Error('Usage: node scripts/android-test-report.mjs run');
 const result=await runRegression();
 if(!result.accepted)process.exitCode=1;
}
