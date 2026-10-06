import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectAccountEvidence,parseFaultTap} from '../scripts/verify-account-faults.mjs';
import {createAccountService} from '../src/application/account-service.ts';
import {FaultStorage} from './helpers/account-fixtures.ts';

function fixture(){const storage=new FaultStorage(),service=createAccountService(storage,{status:'held',release(){}},()=>0);const result=service.transact({operationId:'first',type:'setSettings',patch:{sound:false}},0);assert.equal(result.status,'acknowledged');return [...storage.values];}
test('account evidence checker accepts only two fully verified matching roots',()=>{
 const entries=fixture(),before=JSON.stringify(entries),valid=inspectAccountEvidence(entries);assert.equal(valid.status,'verified');assert.equal(valid.generation,1);assert.equal(JSON.stringify(entries),before);
 assert.throws(()=>inspectAccountEvidence(entries.filter(([key]:string[])=>!key.endsWith('.b'))));
 assert.throws(()=>inspectAccountEvidence(entries.map(([key,value]:string[])=>[key,key.endsWith('.a')?'broken':value])));
 assert.throws(()=>inspectAccountEvidence([...entries,entries[0]]));
});
test('fault-test summary refuses failed, skipped-only, truncated or unsuccessful test processes',()=>{
 assert.deepEqual(parseFaultTap('# tests 80\n# pass 80\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',0),{tests:80,passed:80});
 for(const [text,code] of [['# tests 80\n# pass 80\n# fail 0\n',1],['# tests 0\n# pass 0\n# fail 0\n',0],['not ok 1 - loss\n# tests 80\n# pass 80\n# fail 0\n',0],['# tests 80\n# pass 0\n# fail 0\n# skipped 80\n',0]] as const)assert.throws(()=>parseFaultTap(text,code));
});
test('CLI checker records a corrupt fixture as failure and exits nonzero',()=>{
 const dir=mkdtempSync(join(tmpdir(),'warehouse-fault-check-'));try{const input=join(dir,'broken.json'),output=join(dir,'report.json');writeFileSync(input,JSON.stringify({entries:[['warehouse.account.s1.a','broken']]}));
  const result=spawnSync(process.execPath,['scripts/verify-account-faults.mjs','--fixture',input,'--output',output],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(JSON.parse(readFileSync(output,'utf8')).status,'failed');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
