import {readFile,readdir,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateMeasurement,validateResult} from './android-acceptance-report.mjs';

const requireValue=(condition,message)=>{if(!condition)throw Error(message);};
const phases=['history-before','history-mid','b-after','a-before','a-after','receipt-lost'];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function parseSourceMapping(message,tree){
 const locals=[...message.matchAll(/^Local source snapshot: ([a-f0-9]{40})$/gm)],trees=[...message.matchAll(/^Tree verified: ([a-f0-9]{40})$/gm)];
 if(locals.length===0&&trees.length===0)return {localCommit:null,status:'No mapped snapshot metadata; coordinator verification required'};
 requireValue(locals.length===1&&trees.length===1&&trees[0][1]===tree,'Mapped snapshot metadata conflicts with actual checked-out tree');
 return {localCommit:locals[0][1],status:'Commit snapshot metadata matches actual tree; coordinator independently verifies remote mapping'};
}
export function parseApkIdentity(badging){
 const packages=[...badging.matchAll(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/gm)];
 requireValue(packages.length===1,'APK must contain exactly one package identity');
 const [,applicationId,code,versionName]=packages[0];
 requireValue(applicationId==='io.github.nightshang.chache'&&versionName==='1.0.12'&&['1','2'].includes(code),'Compiled APK identity/version mismatch');
 requireValue(/^application-label:'货箱最后一格'$/m.test(badging),'Compiled APK label mismatch');
 requireValue(!/uses-permission[^\n]*name='android.permission.INTERNET'/.test(badging),'Offline APK must not request INTERNET');
 return {applicationId,appName:'货箱最后一格',versionName,versionCode:Number(code)};
}
export function candidateFileName(code,commit){
 requireValue([1,2].includes(code)&&/^[a-f0-9]{40}$/.test(commit),'Invalid candidate version/source identity');
 return `warehouse-last-slot-1.0.12-vc${code}-temporary-debug-candidate-${commit.slice(0,12)}.apk`;
}
export function aggregateAcceptanceStatus(...reports){
 if(reports.some(report=>report?.status==='failed'))return 'failed';
 return reports.length>0&&reports.every(report=>report?.status==='passed')?'passed':'blocked';
}
export async function readJUnitEvidence(root,reports,source,driver=false){
 try{
  const data=JSON.parse(execFileSync('python',['-c',String.raw`
import pathlib,sys,re,json,xml.etree.ElementTree as E
root=pathlib.Path(sys.argv[1]);reports=root/sys.argv[2];source=root/sys.argv[3]
expected=set()
for p in source.rglob('*.java'):
 s=p.read_text();package=re.search(r'package\s+([\w.]+)\s*;',s);cls=re.search(r'public class\s+(\w+)',s)
 if not package or not cls: continue
 for m in re.findall(r'@Test(?:\([^)]*\))?\s+public void\s+(\w+)\s*\(',s):expected.add(package[1]+'.'+cls[1]+'#'+m)
assert expected,'No expected native tests'
seen={};caseEvidence={};files=[];suites=[];total=0;counts={'tests':0,'passed':0,'failures':0,'errors':0,'skipped':0}
for p in sorted(reports.rglob('*.xml')):
 assert not p.is_symlink(),'JUnit symlink'
 r=E.parse(p).getroot();assert r.tag=='testsuite','Unsupported JUnit root'
 cases=r.findall('testcase');assert len(cases)>0,'Empty JUnit suite'
 def count(k):
  v=r.get(k);assert v is not None and re.fullmatch(r'\d+',v),'Missing JUnit count '+k;return int(v)
 assert count('tests')==len(cases),'JUnit total mismatch'
 assert count('failures')==sum(c.find('failure') is not None for c in cases),'JUnit failure mismatch'
 assert count('errors')==sum(c.find('error') is not None for c in cases),'JUnit error mismatch'
 assert count('skipped')==sum(c.find('skipped') is not None for c in cases),'JUnit skip mismatch'
 suiteCounts={k:count(k) for k in ['tests','failures','errors','skipped']}
 for k,v in suiteCounts.items():counts[k]+=v
 for c in cases:
  key=c.get('classname',r.get('name',''))+'#'+c.get('name','');assert key not in seen,'Duplicate JUnit identity'
  assert sum(c.find(k) is not None for k in ['failure','error','skipped'])<=1,'Conflicting JUnit case outcomes'
  seen[key]='failed' if c.find('failure') is not None or c.find('error') is not None else 'skipped' if c.find('skipped') is not None else 'passed'
  caseEvidence[key]={'attributes':c.attrib,'status':seen[key],**{kind+'s':[dict(n.attrib,text=''.join(n.itertext())) for n in c.findall(kind)] for kind in ['failure','error']},'skipped':[dict(n.attrib,text=''.join(n.itertext())) for n in c.findall('skipped')]}
  if seen[key]=='passed':counts['passed']+=1
 files.append(str(p.relative_to(root)));total+=len(cases)
 suites.append({'path':str(p.relative_to(root)),'attributes':r.attrib,'counts':suiteCounts})
assert files,'Missing JUnit reports'
allowed='io.github.nightshang.chache.DeviceAcceptanceTest#runAcceptanceAction'
for k in expected:assert k in seen,'Missing required native test '+k
for k,v in seen.items():assert v!='skipped' or (sys.argv[4]=='true' and k==allowed),'Native test was not executed '+k
assert counts['tests']==counts['passed']+counts['failures']+counts['errors']+counts['skipped'],'JUnit aggregate mismatch'
print(json.dumps({'status':'failed' if any(v=='failed' for v in seen.values()) else 'passed','tests':total,'counts':counts,'cases':seen,'caseEvidence':caseEvidence,'suites':suites,'files':files}))
`,root,reports,source,String(driver)],{encoding:'utf8',maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']}));
  const checksums=[];for(const path of data.files)checksums.push({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')});
  return {...data,checksums,driverOnlySkipDoesNotProveAcceptance:driver};
 }catch(error){return {status:'blocked',reason:error.stderr?.toString().trim()||error.message};}
}
export async function inspectAcceptanceEvidence(root,certificate,versionCode,expectedScope){
 const out=join(root,'build/android-ci/device-acceptance'),errors=[];
 const read=name=>readFile(join(out,name+'.json'),'utf8').then(JSON.parse);
 const result={status:'blocked',storageRecovery:'not-verified',sameSignatureUpgrade:'not-verified',performance:Object.fromEntries(['normal','realistic','extreme'].map(n=>[n,{status:'not-verified'}])),anr:{status:'not-verified'},physicalPhone:'not-verified',audibleOutput:'not-verified',frameTiming:'not-measured',errors};
 const check=async(label,fn)=>{try{return await fn();}catch(error){errors.push(`${label}: ${error.message}`);return null;}};
 const summary=await check('summary',()=>read('summary'));
 const functional=summary?.scope==='functional-only'||(!summary&&expectedScope==='functional-only');
 result.scope=functional?'functional-only':'full';
 if(expectedScope&&expectedScope!==result.scope)errors.push('Runtime and device-driver acceptance scopes disagree');
 if(summary?.scope!==undefined&&!['full','functional-only'].includes(summary.scope))errors.push('Unknown driver scope');
 if(functional)for(const variant of ['normal','realistic','extreme']){
  await check('unrun performance '+variant,async()=>{
   const value=summary?.performance?.[variant]??(!summary&&expectedScope==='functional-only'?{status:'not-run',reason:'Explicit software-TCG functional scope; phone performance unverified'}:null);
   requireValue(value?.status==='not-run'&&value.reason==='Explicit software-TCG functional scope; phone performance unverified','Missing explicit unrun performance category');
   const existing=await readFile(join(out,'performance-'+variant+'.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
   requireValue(!existing,'Unrun performance label conflicts with existing raw measurement');result.performance[variant]=value;
  });
 }
 const first=await check('invocation',()=>read('crash-history-before'));
 const base=/^(\d+\.\d+)\.crash\.history-before$/.exec(first?.nonce??'')?.[1]??(/^[0-9]+[.][0-9]+$/.test(summary?.invocation??'')?summary.invocation:null);
 if(!base){errors.push('Missing current driver invocation nonce');return {...result,reason:errors.join('; ')};}
 const driverFailure=summary?.schema===1&&summary.status==='failed'&&summary.invocation===base&&Number.isSafeInteger(summary.commandExitCode)&&summary.commandExitCode>0
  && /^(?:crash-(?:history-before|history-mid|b-after|a-before|a-after|receipt-lost)|recover-(?:history-before|history-mid|b-after|a-before|a-after|receipt-lost)|upgrade-before|upgrade-after|performance-(?:normal|realistic|extreme)|complete)$/.test(summary.stage??'');
 if(driverFailure)result.executionFailure={stage:summary.stage,exitCode:summary.commandExitCode};
 const recovery=[];
 for(const phase of phases){
  const proof=await check('recovery '+phase,async()=>{
   const dead=await read('crash-'+phase),alive=await read('recover-'+phase);
   requireValue(dead.schema===1&&dead.status==='checkpoint'&&dead.action==='seed-crash'&&dead.phase===phase&&dead.reached===phase&&dead.nonce===`${base}.crash.${phase}`&&Number.isSafeInteger(dead.pid)&&dead.pid>0,'Invalid process-death checkpoint');
   validateResult(alive,{action:'verify-crash',phase,nonce:`${base}.recover-${phase}`});
   requireValue(alive.pid!==dead.pid,'Recovery reused the killed PID');return {phase,killedPid:dead.pid,recoveredPid:alive.pid,nonce:alive.nonce,status:'passed'};
  });if(proof)recovery.push(proof);
 }
 result.processDeath=recovery;
 result.phaseOutcomes=Object.fromEntries(phases.map(phase=>[phase,recovery.some(r=>r.phase===phase)?{status:'passed'}:driverFailure&&[`crash-${phase}`,`recover-${phase}`].includes(summary.stage)?{status:'failed',exitCode:summary.commandExitCode}:{status:'not-run'}]));
 if(recovery.length===phases.length)result.storageRecovery='passed';
 else if(driverFailure&&/^(crash|recover)-/.test(summary.stage))result.storageRecovery='failed';
 if(functional&&summary?.upgrade==='not-run')result.sameSignatureUpgrade='not-run';
 const upgrade=await check('upgrade',async()=>{
  requireValue(versionCode===2,'Final APK must be vc2 to prove increasing-version upgrade');
  const before=await read('upgrade-before'),after=await read('upgrade-after');
  validateResult(before,{action:'seed-upgrade',phase:'none',nonce:`${base}.upgrade-before`});validateResult(after,{action:'verify-upgrade',phase:'none',nonce:`${base}.upgrade-after`});
  requireValue(equal(before.result.account,after.result.account),'Upgrade changed the complete account');
  requireValue(summary?.certificateSha256===certificate&&summary?.fromVersionCode===1&&summary?.toVersionCode===2,'Upgrade certificate/version proof mismatches actual final APK');
  for(const name of ['apk-vc1','apk-vc2','test-apk']){
   const text=await readFile(join(out,name+'-signature.txt'),'utf8'),signers=[...text.matchAll(/^Signer #[0-9]+ certificate SHA-256 digest: ([a-f0-9]{64})$/gmi)];
   requireValue(signers.length===1&&signers[0][1].toLowerCase()===certificate,'Same-job APK certificate evidence mismatch');
  }
  for(const code of [1,2])requireValue(parseApkIdentity(await readFile(join(out,`apk-vc${code}-badging.txt`),'utf8')).versionCode===code,'Upgrade APK identity evidence mismatch');
  requireValue(/versionCode=2(?:\s|$)/.test(await readFile(join(out,'installed-package.txt'),'utf8')),'Installed vc2 evidence missing');
  return {status:'passed',fromVersionCode:1,toVersionCode:2,certificateSha256:certificate,account:after.result.account};
 });
 if(upgrade){result.sameSignatureUpgrade='passed';result.upgrade=upgrade;}
 else if(driverFailure&&summary.stage.startsWith('upgrade'))result.sameSignatureUpgrade='failed';
 if(!functional)for(const variant of ['normal','realistic','extreme']){
  const report=await check('performance '+variant,async()=>{
   const raw=await read('performance-'+variant);validateMeasurement(raw,{action:'performance',phase:variant,nonce:`${base}.performance-${variant}`});
   requireValue(equal(raw,summary?.performance?.[variant]),'Summary differs from raw100-sample measurement');return raw;
  });if(report)result.performance[variant]=report;
 }
 const anr=await check('ANR',async()=>{
  const raw=await read('anr-report'),before=new Set((await readFile(join(out,'anr-before.txt'),'utf8')).split('\n'));
  const events=(await readFile(join(out,'anr-after.txt'),'utf8')).split('\n').filter(line=>!before.has(line)&&line.includes('io.github.nightshang.chache'));
  requireValue(raw.schema===1&&raw.status===(events.length?'failed':'passed')&&equal(raw.observedEvents,events)&&raw.frameTiming==='not-measured'&&raw.eventBufferMayBeBounded===true&&equal(raw,summary?.anr),'ANR evidence is missing or inconsistent');return raw;
 });if(anr)result.anr=anr;
 await check('summary contract',async()=>{
  requireValue(summary?.schema===1&&summary.target==='explicit-disposable-emulator'&&summary.applicationId==='io.github.nightshang.chache'&&summary.recovery==='passed'&&summary.upgrade==='passed'&&equal(summary.processDeathPhases,phases)&&summary.physicalPhone==='not-verified'&&summary.audibleOutput==='not-verified'&&summary.frameTiming==='not-measured'&&summary.finiteHistoryMaximum===false,'Incomplete native acceptance summary');
  const status=result.anr.status==='failed'?'failed':functional?'blocked':Object.values(result.performance).every(r=>r.status==='passed')&&result.anr.status==='passed'?'passed':'failed';requireValue(summary.status===status,'Summary hides a failed or unrun performance/ANR gate');
 });
 if(driverFailure)result.status='failed';
 else if(errors.length===0)result.status=summary.status;
 if(errors.length>0)result.reason=errors.join('; ');
 return result;
}
export async function evidenceFiles(root){
 const dir=join(root,'build/android-ci/device-acceptance'),names=await readdir(dir).catch(()=>[]),output=[];
 for(const name of names)if(/^[A-Za-z0-9_.-]+\.(json|txt)$/.test(name)){
  const path=join(dir,name);requireValue((await lstat(path)).isFile()&&!(await lstat(path)).isSymbolicLink(),'Acceptance evidence must be regular files');output.push(`device-acceptance/${name}`);
 }return output.sort();
}
