import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
// @ts-expect-error Offline QA module executed by Node.
import {exportExamples} from '../qa/large-scan/export-examples.mjs';
// @ts-expect-error Offline QA module executed by Node.
import {scanRun,campaignSeeds} from '../qa/large-scan/run-core.mjs';
// @ts-expect-error Offline QA provenance module executed by Node.
import {sourceProvenance} from '../qa/large-scan/provenance.mjs';
import {decodeRun} from '../src/application/save.ts';
import {checksum} from '../src/domain/replay.ts';
// These are tests of the historical v0.3.1 scanner, whose provenance gate must
// remain strict even after the app's presentation has advanced. Isolate only its
// build artifact; source/rules dependencies still come from this checkout.
const originalCwd=process.cwd(),sandbox=mkdtempSync(join(tmpdir(),'warehouse-frozen-qa-'));
for(const name of ['src','scripts','qa','node_modules','package.json','package-lock.json'])symlinkSync(resolve(originalCwd,name),join(sandbox,name));
mkdirSync(join(sandbox,'build/wechat'),{recursive:true});
const frozen=gunzipSync(readFileSync(new URL('./fixtures/game-v031.js.gz',import.meta.url)));
assert.equal(createHash('sha256').update(frozen).digest('hex'),'c5774c8f3b434390d1f463c1136dc4f5ceeb4bd9efb68b5b23437bde8470abd0');
writeFileSync(join(sandbox,'build/wechat/game.js'),frozen);
function exportInFrozenWorkspace(summary:unknown,output:string){
 process.chdir(sandbox);try{return exportExamples(summary,output);}finally{process.chdir(originalCwd);}
}
function fixture(){const options={seedIndex:0,...campaignSeeds(0),strategy:'route'};const {metrics}=scanRun(options);return {completion:{status:'validated_completed'},provenance:sourceProvenance(),replayExamples:[{...options,finalChecksum:metrics.finalChecksum,reasons:['highestChain']}]};}
test('selected examples reproduce exact final checksum and preserve commands and strongest chain snapshot',()=>{const summary=fixture(),out=join(mkdtempSync(join(tmpdir(),'warehouse-example-')),'out');const index=exportInFrozenWorkspace(summary,out);assert.equal(index.examples.length,1);const data=JSON.parse(readFileSync(join(out,index.examples[0].file),'utf8'));const state=decodeRun(data.finalSnapshot);assert.equal(checksum(state),summary.replayExamples[0].finalChecksum);assert.deepEqual(data.commands,state.commands);assert.ok(data.strongestChain.commandIndex>0);assert.equal(index.excludedFromCampaignCount,true);});
test('source or checksum mismatch cannot produce a completed replay index',()=>{for(const field of ['sourceSha256','finalChecksum']){const summary=fixture();if(field==='sourceSha256')summary.provenance.sourceSha256='wrong';else summary.replayExamples[0].finalChecksum='wrong';const out=join(mkdtempSync(join(tmpdir(),'warehouse-example-')),'out');assert.throws(()=>exportInFrozenWorkspace(summary,out),/mismatch/);try{assert.ok(!readdirSync(out).includes('index.json'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}});
test('incomplete summary and a nonempty output folder are refused',()=>{const summary=fixture();summary.completion.status='running';assert.throws(()=>exportInFrozenWorkspace(summary,mkdtempSync(join(tmpdir(),'warehouse-example-'))),/completed/);summary.completion.status='validated_completed';const out=mkdtempSync(join(tmpdir(),'warehouse-example-'));writeFileSync(join(out,'existing.txt'),'preserve');assert.throws(()=>exportInFrozenWorkspace(summary,out),/empty/);});

test('historical exporter refuses any nonfrozen replacement artifact without depending on a local build',()=>{
 const summary=fixture(),out=join(mkdtempSync(join(tmpdir(),'warehouse-current-build-')),'out');
 const artifact=join(sandbox,'build/wechat/game.js');writeFileSync(artifact,Buffer.concat([frozen,Buffer.from('\n// changed presentation fixture\n')]));
 try{assert.throws(()=>exportInFrozenWorkspace(summary,out),/Frozen game.js changed/);}finally{writeFileSync(artifact,frozen);}
});
