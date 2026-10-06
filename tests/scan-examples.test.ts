import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-expect-error Offline QA module executed by Node.
import {exportExamples} from '../qa/large-scan/export-examples.mjs';
// @ts-expect-error Offline QA module executed by Node.
import {scanRun,campaignSeeds} from '../qa/large-scan/run-core.mjs';
// @ts-expect-error Offline QA provenance module executed by Node.
import {sourceProvenance} from '../qa/large-scan/provenance.mjs';
import {decodeRun} from '../src/application/save.ts';
import {checksum} from '../src/domain/replay.ts';
function fixture(){const options={seedIndex:0,...campaignSeeds(0),strategy:'route'};const {metrics}=scanRun(options);return {completion:{status:'validated_completed'},provenance:sourceProvenance(),replayExamples:[{...options,finalChecksum:metrics.finalChecksum,reasons:['highestChain']}]};}
test('selected examples reproduce exact final checksum and preserve commands and strongest chain snapshot',()=>{const summary=fixture(),out=join(mkdtempSync(join(tmpdir(),'warehouse-example-')),'out');const index=exportExamples(summary,out);assert.equal(index.examples.length,1);const data=JSON.parse(readFileSync(join(out,index.examples[0].file),'utf8'));const state=decodeRun(data.finalSnapshot);assert.equal(checksum(state),summary.replayExamples[0].finalChecksum);assert.deepEqual(data.commands,state.commands);assert.ok(data.strongestChain.commandIndex>0);assert.equal(index.excludedFromCampaignCount,true);});
test('source or checksum mismatch cannot produce a completed replay index',()=>{for(const field of ['sourceSha256','finalChecksum']){const summary=fixture();if(field==='sourceSha256')summary.provenance.sourceSha256='wrong';else summary.replayExamples[0].finalChecksum='wrong';const out=join(mkdtempSync(join(tmpdir(),'warehouse-example-')),'out');assert.throws(()=>exportExamples(summary,out),/mismatch/);try{assert.ok(!readdirSync(out).includes('index.json'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}});
test('incomplete summary and a nonempty output folder are refused',()=>{const summary=fixture();summary.completion.status='running';assert.throws(()=>exportExamples(summary,mkdtempSync(join(tmpdir(),'warehouse-example-'))),/completed/);summary.completion.status='validated_completed';const out=mkdtempSync(join(tmpdir(),'warehouse-example-'));writeFileSync(join(out,'existing.txt'),'preserve');assert.throws(()=>exportExamples(summary,out),/empty/);});
