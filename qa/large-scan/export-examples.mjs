import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {scanRun} from './run-core.mjs';
import {verifyProvenance} from './provenance.mjs';
import {createRun,applyCommand} from '../../src/domain/engine.ts';
import {checksum} from '../../src/domain/replay.ts';
import {encodeRun} from '../../src/application/save.ts';

/** Supplementary replays are explicitly excluded from the campaign denominator. */
export function exportExamples(summary,output){
 assert.equal(summary.completion?.status,'validated_completed','Only a completed validated summary can produce examples');
 verifyProvenance(summary.provenance);
 assert.ok(Array.isArray(summary.replayExamples)&&summary.replayExamples.length<=20,'At most twenty curated examples');
 const keys=summary.replayExamples.map(e=>`${e.seedIndex}:${e.strategy}`);assert.equal(new Set(keys).size,keys.length,'Duplicate example identity');
 assert.ok(!existsSync(output)||readdirSync(output).length===0,'Output folder must be empty');mkdirSync(output,{recursive:true});
 const index={status:'PASS',excludedFromCampaignCount:true,kind:'supplementary deterministic replays, not extra campaign samples',sourceSha256:summary.provenance.sourceSha256,
  exporterSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),examples:[]};
 for(const item of summary.replayExamples){
  const {state,metrics}=scanRun({...item,maxCommands:2000,upgradePolicy:'uniform'});assert.equal(metrics.finalChecksum,item.finalChecksum,'Example final checksum mismatch');
  let replayed=createRun(item.seed,'standard',3),strongestChain=null;
  for(const command of state.commands){
   const before=replayed,result=applyCommand(before,command);assert.equal(result.error,undefined);replayed=result.state;
   const shipments=result.events.filter(e=>e.type==='shipment');
   if(shipments.length>(strongestChain?.shipments.length??0))strongestChain={commandIndex:replayed.commandIndex,command,beforeSnapshot:encodeRun(before),shipments,afterSnapshot:encodeRun(replayed)};
  }
  assert.equal(checksum(replayed),item.finalChecksum,'Exported command replay mismatch');
  const file=`seed-${item.seed}-${item.strategy}.json`,data={identity:item,commands:state.commands,finalSnapshot:encodeRun(state),strongestChain,
   observed:{commands:metrics.commands,orders:metrics.orders,score:metrics.score,peakOccupiedCells:metrics.peakOccupiedCells,maxChain:metrics.maxChain},excludedFromCampaignCount:true};
  const bytes=JSON.stringify(data,null,2)+'\n';writeFileSync(join(output,file),bytes);index.examples.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),seed:item.seed,strategy:item.strategy,finalChecksum:item.finalChecksum});
 }
 writeFileSync(join(output,'index.json'),JSON.stringify(index,null,2)+'\n');return index;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [summary,output]=process.argv.slice(2);if(!summary||!output)throw Error('Usage: export-examples.mjs SUMMARY_JSON OUTPUT_DIR');
 console.log(JSON.stringify(exportExamples(JSON.parse(readFileSync(summary,'utf8')),output)));
}
