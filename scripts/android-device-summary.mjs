import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateResult} from './android-acceptance-report.mjs';
const phases=['history-before','history-mid','b-after','a-before','a-after','receipt-lost'];
export async function writeDeviceSummary(out,{scope='full',exitCode=0,stage='complete',certificate='',invocation=''}={}){
 if(!['full','functional-only'].includes(scope))throw Error('Unknown acceptance scope');
 const read=name=>readFile(join(out,name+'.json'),'utf8').then(JSON.parse).catch(()=>null);
 const completedRecoveryPhases=[];
 for(const phase of phases){
  const dead=await read('crash-'+phase),alive=await read('recover-'+phase);
  try{
   if(dead?.schema!==1||dead.status!=='checkpoint'||dead.action!=='seed-crash'||dead.phase!==phase||dead.reached!==phase||!Number.isSafeInteger(dead.pid)||dead.pid<=0||dead.nonce!==invocation+'.crash.'+phase||dead.pid===alive?.pid)throw Error('Incomplete death proof');
   validateResult(alive,{action:'verify-crash',phase,nonce:invocation+'.recover-'+phase});completedRecoveryPhases.push(phase);
  }catch{/* Incomplete or failed evidence must not become a passed phase. */}
 }
 let upgrade='not-run';
 const before=await read('upgrade-before'),after=await read('upgrade-after');
 try{
  validateResult(before,{action:'seed-upgrade',phase:'none',nonce:invocation+'.upgrade-before'});
  validateResult(after,{action:'verify-upgrade',phase:'none',nonce:invocation+'.upgrade-after'});
  if(JSON.stringify(before.result.account)!==JSON.stringify(after.result.account))throw Error('Upgrade changed account');
  upgrade='passed';
 }catch{if(stage.startsWith('upgrade'))upgrade='failed';}
 const recovery=completedRecoveryPhases.length===phases.length?'passed':/^(crash|recover)-/.test(stage)?'failed':'not-run';
 const performance={};
 for(const n of ['normal','realistic','extreme'])performance[n]=scope==='functional-only'
  ?{status:'not-run',reason:'Explicit software-TCG functional scope; phone performance unverified'}
  :await read('performance-'+n)??{status:'not-run',reason:'Driver ended before complete measurement'};
 const anr=await read('anr-report')??{status:'not-verified'};
 const complete=stage==='complete'&&exitCode===0&&recovery==='passed'&&upgrade==='passed';
 const status=exitCode!==0?(exitCode===78?'blocked':'failed'):!complete?'blocked'
  :anr.status==='failed'?'failed':scope==='functional-only'?'blocked':Object.values(performance).every(r=>r.status==='passed')&&anr.status==='passed'?'passed':'failed';
 const summary={schema:1,scope,status,stage,commandExitCode:exitCode,invocation,reason:scope==='functional-only'?'Functional evidence only; performance acceptance remains unrun and closed':'Complete matrix required for acceptance',anr,frameTiming:'not-measured',target:'explicit-disposable-emulator',applicationId:'io.github.nightshang.chache',fromVersionCode:1,toVersionCode:2,certificateSha256:certificate,processDeathPhases:phases,completedRecoveryPhases,recovery,upgrade,performance,physicalPhone:'not-verified',audibleOutput:'not-verified',finiteHistoryMaximum:false,acceptanceApproved:false};
 await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [out,scope,exitCode,stage,certificate,invocation]=process.argv.slice(2);
 await writeDeviceSummary(out,{scope,exitCode:Number(exitCode),stage,certificate,invocation});
}
