/** Read-only account evidence verification and a bounded, fail-closed fault regression runner. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createAccountService} from '../src/application/account-service.ts';

export function inspectAccountEvidence(entries){
 assert.ok(Array.isArray(entries)&&entries.every(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(value=>typeof value==='string')),'fixture entries must be string key/value pairs');
 assert.equal(new Set(entries.map(pair=>pair[0])).size,entries.length,'duplicate fixture key');
 const data=new Map(entries),before=JSON.stringify([...data]);
 const storage={get:key=>data.get(key)??null,set(){throw Error('read-only evidence verifier wrote storage');},remove(){throw Error('read-only evidence verifier removed storage');}};
 const service=createAccountService(storage,{status:'unsupported',release(){}},()=>0),account=service.getSnapshot();
 assert.equal(service.getStatus(),'ready','fixture is not two fully verified matching account roots');assert.ok(account);
 assert.equal(JSON.stringify([...data]),before);
 return {status:'verified',generation:account.generation,wallet:account.wallet,rulesetVersion:account.run?.identity.rulesetVersion??null,commandIndex:account.run?.state.commandIndex??account.lastClosedResult?.commandIndex??0};
}

export function parseFaultTap(text,exitCode){
 assert.equal(exitCode,0,'fault regression process failed');assert.doesNotMatch(text,/^not ok\b/m,'a fault regression failed');
 const count=name=>{const match=text.match(new RegExp(`^# ${name} (\\d+)$`,'m'));assert.ok(match,`missing TAP ${name} summary`);return Number(match[1]);};
 const tests=count('tests'),passed=count('pass');assert.ok(tests>=50,'fault runner unexpectedly executed too few checks');assert.equal(passed,tests);
 for(const name of ['fail','cancelled','skipped','todo'])assert.equal(count(name),0,`nonzero ${name}`);
 return {tests,passed};
}

export function runAccountFaultChecks(){
 const files=['economy','account-profile','account-store','writer-lease','account-history','account-migration','account-service','account-result-reset','account-session','tutorial-session'].map(name=>`tests/${name}.test.ts`);
 const started=Date.now(),result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=2',...files],{encoding:'utf8',maxBuffer:16*1024*1024});
 const output=(result.stdout??'')+(result.stderr??'');
 if(result.error)throw result.error;
 return {status:'passed',...parseFaultTap(output,result.status),durationMs:Date.now()-started,files,output};
}

function save(path,value){mkdirSync(dirname(path),{recursive:true});const pending=`${path}.pending`;writeFileSync(pending,JSON.stringify(value,null,2)+'\n');renameSync(pending,path);}
function main(argv){
 let fixture=null,output='artifacts/growth-faults/report.json';
 for(let i=0;i<argv.length;i+=2){assert.ok(['--fixture','--output'].includes(argv[i])&&argv[i+1],`unsupported argument ${argv[i]}`);if(argv[i]==='--fixture')fixture=argv[i+1];else output=argv[i+1];}
 try{
  const report=fixture?inspectAccountEvidence(JSON.parse(readFileSync(fixture,'utf8')).entries):runAccountFaultChecks();
  if(report.output){const log=output.replace(/\.json$/,'')+'.tap';mkdirSync(dirname(log),{recursive:true});writeFileSync(log,report.output);delete report.output;report.log=log;}
  save(output,{...report,checkedAt:new Date().toISOString(),fixture});console.log(JSON.stringify(report));
 }catch(error){save(output,{status:'failed',checkedAt:new Date().toISOString(),fixture,error:error instanceof Error?error.message:String(error)});console.error(error);process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2));
