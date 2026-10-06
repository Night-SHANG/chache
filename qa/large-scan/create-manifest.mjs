import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sourceProvenance,EXECUTION_FILES} from './provenance.mjs';
const [path,total='33334',batch='100',campaign='rules3-100002-uniform-upgrades-v1']=process.argv.slice(2);
const totalSeeds=Number(total),batchSize=Number(batch);
if(!path||!Number.isSafeInteger(totalSeeds)||totalSeeds<1||totalSeeds>33334||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100)throw Error('Usage: create-manifest.mjs PATH [totalSeeds 1..33334] [batchSize 1..100] [campaignId]');
const manifest={protocolVersion:1,campaignId:campaign,totalSeeds,strategies:['random','greedy','route'],batchSize,rulesetVersion:3,mode:'standard',maxCommands:2000,upgradePolicy:'uniform',
 seedPlan:{kind:'consecutive',start:1,step:1},rngSeeds:{placementXor:0x51f15e,upgradeXor:0x6a09e667},
 workerTimeoutMs:60000,maxRssMiB:512,maxDiskMiB:1024,...sourceProvenance(),
 toolCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),executionTreeDirty:!!execFileSync('git',['status','--porcelain','--',...EXECUTION_FILES],{encoding:'utf8'}).trim(),
 interpretation:'Paired seed descriptions with independent upgrade selection, not identical trajectories or causal upgrade effects. Consecutive seeds, not uniform sampling of the entire int32 space.'};
writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
