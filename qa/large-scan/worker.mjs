import {openSync,writeSync,fsyncSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {scanRun,campaignSeeds} from './run-core.mjs';
import {verifyProvenance} from './provenance.mjs';
const args={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--manifest','--batch-start','--batch-count','--output'].includes(key)||!process.argv[i+1])throw Error('Invalid scan worker arguments');args[key.slice(2)]=process.argv[i+1];}
const send=event=>writeSync(1,JSON.stringify(event)+'\n');
let fd=null,current=null;
try{
 const manifest=JSON.parse(readFileSync(args.manifest,'utf8'));verifyProvenance(manifest);
 const start=Number(args['batch-start']),count=Number(args['batch-count']);
 if(manifest.protocolVersion!==1||manifest.rulesetVersion!==3||manifest.upgradePolicy!=='uniform'||manifest.seedPlan?.kind!=='consecutive'||manifest.seedPlan.start!==1||manifest.seedPlan.step!==1||manifest.rngSeeds?.placementXor!==0x51f15e||manifest.rngSeeds.upgradeXor!==0x6a09e667||!Number.isSafeInteger(start)||!Number.isSafeInteger(count)||start<0||count<1||start+count>manifest.totalSeeds)throw Error('Unsupported or invalid campaign batch');
 fd=openSync(args.output,'wx');const hasher=createHash('sha256'),began=performance.now(),cpu=process.cpuUsage(),seenWitness=new Set();let runs=0;
 for(let seedIndex=start;seedIndex<start+count;seedIndex++)for(const strategy of manifest.strategies){
  const seeds=campaignSeeds(seedIndex);current={seedIndex,strategy,...seeds};send({type:'runStart',...current});
  const {metrics}=scanRun({...current,maxCommands:manifest.maxCommands,upgradePolicy:'uniform'},send);
  // Preserve each effect's first witness in every batch, not a redundant copy in every run.
  if(metrics.coverage.firstWitness)for(const key of Object.keys(metrics.coverage.firstWitness)){
   if(seenWitness.has(key))delete metrics.coverage.firstWitness[key];else seenWitness.add(key);
  }
  const line=JSON.stringify(metrics)+'\n';writeSync(fd,line);hasher.update(line);runs++;
  send({type:'runDone',seedIndex,strategy,status:metrics.status,capped:metrics.status==='capped'});
 }
 fsyncSync(fd);closeSync(fd);fd=null;
 const usage=process.resourceUsage(),used=process.cpuUsage(cpu);
 const stats={runs,wallMs:performance.now()-began,cpuUserMs:used.user/1000,cpuSystemMs:used.system/1000,maxRssKiB:usage.maxRSS};
 writeFileSync(args.output+'.stats.json',JSON.stringify(stats,null,2));
 send({type:'batchDone',...stats,sha256:hasher.digest('hex')});
}catch(error){
 const failure={kind:'scan-worker-failure',current,message:String(error?.message??error),stack:String(error?.stack??''),evidence:error?.scanFailure??null};
 try{writeFileSync(args.output+'.failure.json',JSON.stringify(failure,null,2));}catch(dumpError){writeSync(2,JSON.stringify({failure,dumpError:String(dumpError)})+'\n');}
 try{if(fd!==null)closeSync(fd);}catch{/* Original failure stays primary. */}
 writeSync(2,JSON.stringify({message:failure.message,current,failureFile:args.output+'.failure.json'})+'\n');process.exitCode=1;
}
