import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const api=await import(new URL('../scripts/android-ci-handoff.mjs',import.meta.url).href).catch(()=>null) as null|{
 runtimeScripts:string[];
 writeHandoffManifest:(options:Record<string,unknown>)=>Promise<{digest:string;manifest:Record<string,unknown>}>;
 verifyHandoffManifest:(options:Record<string,unknown>)=>Promise<Record<string,unknown>>;
 joinBuildRuntime:(build:Record<string,unknown>,runtime:Record<string,unknown>,binding:Record<string,unknown>)=>Record<string,unknown>;
};
const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
const source={commit:'a'.repeat(40),tree:'b'.repeat(40),localCommit:'c'.repeat(40)};
const run={id:'42',attempt:'1',repository:'Night-SHANG/chache',buildJob:'build'};
async function fixture(){
 assert.ok(api,'Immutable Android handoff verifier is missing');
 const root=await mkdtemp(join(tmpdir(),'android-handoff-')),payload=join(root,'handoff');
 await mkdir(join(payload,'apks'),{recursive:true});await mkdir(join(payload,'evidence'));await mkdir(join(root,'scripts'));
 for(const script of api.runtimeScripts)await writeFile(join(root,script),'runtime script '+script);
 const paths=['apks/warehouse-vc1-temporary-debug.apk','apks/warehouse-vc2-temporary-debug.apk','apks/warehouse-androidTest.apk','evidence/android-build-receipt.json','evidence/cache-report.json','evidence/cache-init-report.json','evidence/node-test-report.json','evidence/font-report.json','evidence/sdk-report.json'];
 for(const path of paths)await writeFile(join(payload,path),'fixture '+path);
 const made=await api.writeHandoffManifest({root,payload,source,run,files:paths,apks:{vc1:{path:paths[0]},vc2:{path:paths[1]},test:{path:paths[2]}},inventory:{tests:['demo.Native#one'],sourceFiles:[{path:'android/app/src/androidTest/java/demo/Native.java',sha256:hash('native')}]} });
 const context={source,run,manifestDigest:made.digest,artifactId:'100',artifactDigest:'d'.repeat(64)};
 return {root,payload,made,context,verify:()=>api!.verifyHandoffManifest({root,payload,context}),cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('handoff binds exact current run source inventory scripts and immutable payload bytes',async()=>{
 const f=await fixture();try{const verified=await f.verify();assert.equal(verified.manifestDigest,f.made.digest);assert.equal(verified.artifactId,'100');assert.ok(Number(verified.allocatedBytes)>0);assert.ok(Number(verified.payloadBytes)>0);}finally{await f.cleanup();}
});
test('handoff rejects byte corruption unlisted files and signing material',async()=>{
 for(const path of ['apks/warehouse-vc1-temporary-debug.apk','evidence/android-build-receipt.json','apks/debug.keystore']){
  const f=await fixture();try{await writeFile(join(f.payload,path),'changed');await assert.rejects(f.verify(),/hash|allowlist|file list|signing/i);}finally{await f.cleanup();}
 }
});
test('handoff rejects wrong commit tree mapped source run attempt artifact digest and scripts',async()=>{
 const changes=[{source:{...source,commit:'e'.repeat(40)}},{source:{...source,tree:'e'.repeat(40)}},{source:{...source,localCommit:'e'.repeat(40)}},{run:{...run,id:'41'}},{run:{...run,attempt:'2'}},{manifestDigest:'e'.repeat(64)},{artifactDigest:'invalid'}];
 for(const change of changes){const f=await fixture();try{await assert.rejects(api!.verifyHandoffManifest({root:f.root,payload:f.payload,context:{...f.context,...change}}),/source|provenance|run|digest|binding/i);}finally{await f.cleanup();}}
 const f=await fixture();try{await writeFile(join(f.root,api!.runtimeScripts[0]),'tampered script');await assert.rejects(f.verify(),/script|source|hash/i);}finally{await f.cleanup();}
});
test('handoff rejects symlinked payload before following it',async()=>{
 const f=await fixture();try{await rm(join(f.payload,'evidence/cache-report.json'));await symlink(join(f.payload,'apks/warehouse-vc1-temporary-debug.apk'),join(f.payload,'evidence/cache-report.json'));await assert.rejects(f.verify(),/regular|symlink/i);}finally{await f.cleanup();}
});
test('handoff manifest mutations cannot be hidden behind a forged current digest',async()=>{
 const f=await fixture();try{const path=join(f.payload,'manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));manifest.files.push({...manifest.files[0]});const bytes=JSON.stringify(manifest);await writeFile(path,bytes);await assert.rejects(api!.verifyHandoffManifest({root:f.root,payload:f.payload,context:{...f.context,manifestDigest:hash(bytes)}}),/duplicate|allowlist|file list/i);}finally{await f.cleanup();}
});
test('joined receipt preserves original build receipt and failure precedence without promoting unrun runtime',()=>{
 assert.ok(api);
 const build={source:{...source,runId:run.id,runAttempt:run.attempt},buildStatus:'verified',acceptanceStatus:'blocked',deliveryStatus:'CLOSED_PENDING_ROOT_EVALUATION',identity:{versionCode:2},privateCompiledApk:{sha256:'e'.repeat(64),temporaryDebugCertificateSha256:'f'.repeat(64)},verification:{compile:'passed'}};
 const binding={source,run,manifestDigest:'d'.repeat(64),artifactId:'100',artifactDigest:'d'.repeat(64),apks:{vc2:{sha256:'e'.repeat(64),certificateSha256:'f'.repeat(64),identity:{versionCode:2}}}};
 const original=JSON.stringify(build);
 for(const status of ['not-run','blocked','failed']){const joined=api.joinBuildRuntime(build,{status,instrumentation:{status:'passed'},deviceAcceptance:{status:'passed'}},binding);assert.equal(joined.acceptanceStatus,status==='failed'?'failed':'blocked');assert.equal(joined.deliveryStatus,'CLOSED_PENDING_ROOT_EVALUATION');assert.equal(JSON.stringify(build),original);}
 assert.throws(()=>api!.joinBuildRuntime({...build,source:{...build.source,commit:'9'.repeat(40)}},{status:'passed'},binding),/binding|source/i);
});

test('handoff rejects missing required bounded build evidence even with a new manifest digest',async()=>{
 const f=await fixture();try{const path=join(f.payload,'manifest.json'),manifest=JSON.parse(await readFile(path,'utf8'));manifest.files=manifest.files.filter((r:{path:string})=>r.path!=='evidence/font-report.json');await rm(join(f.payload,'evidence/font-report.json'));manifest.payloadBytes=manifest.files.reduce((n:number,r:{bytes:number})=>n+r.bytes,0);const bytes=JSON.stringify(manifest);await writeFile(path,bytes);await assert.rejects(api!.verifyHandoffManifest({root:f.root,payload:f.payload,context:{...f.context,manifestDigest:hash(bytes)}}),/allowlist|file list|evidence/i);}finally{await f.cleanup();}
});
