/** Recorded-input compatibility only. This module never imports or executes a move-selection policy. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
import {createRun,applyCommand,findLegalMoves} from '../src/domain/engine.ts';
import {checksum} from '../src/domain/replay.ts';
import {createRunV7,applyCommandV7} from '../src/domain/v7/engine.ts';
import {RULES_V6_CONFIG,OUTBOUND_DIFFICULTIES,OUTBOUND_ENTRY} from '../src/domain/v6/content.ts';
import {RULES_V8_CONFIG} from '../src/domain/v8/content.ts';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const INPUT='artifacts/outbound-v6-comparison';
const FIXTURES=['tests/fixtures/outbound-v8-legacy-files.json','tests/fixtures/mixed-color-legacy-golden.json','tests/fixtures/mixed-color-v5-golden.json','tests/fixtures/outbound-v6-golden.json','tests/fixtures/endless-v7-seed1-route.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=file=>JSON.parse(readFileSync(join(ROOT,file),'utf8'));
const without=(value,fields)=>Object.fromEntries(Object.entries(value).filter(([key])=>!fields.includes(key)));
const sum=values=>values.reduce((total,value)=>total+value,0);
const digestState=state=>sha(JSON.stringify(state));
export const PROTOCOL=Object.freeze({
 id:'outbound-v8-recorded-prefix-v1',sourceProtocol:'outbound-v6-compare-v1',sourceRulesetVersion:6,targetRulesetVersion:8,
 recordedRuns:400,matchedSeeds:100,seedRange:[1,100],tiers:['easy','normal','hard','expert'],freshPolicySimulations:0,
 entryIndex:76,identityFields:['rulesetVersion','runConfigId'],earlyTerminalFields:['phase','result','endReason'],
 scope:'One pass over already-recorded v6 commands: complete v6 replay, v8 replay only through its first terminal state, then rejection-only probes.',
 parity:'Every state field is compared after removing only rulesetVersion and runConfigId. At a proven early entry stop only phase/result/endReason may additionally differ; events differ only by one appended failed result.',
 limits:'No new bot games, move-policy selection, generator campaign, tuning, player-fairness or fun claim. Save, profiles, session and UI are outside this report.',
});
export function assertProtocol(){
 assert.equal(RULES_V6_CONFIG.rulesetVersion,6);assert.deepEqual(RULES_V8_CONFIG,{...RULES_V6_CONFIG,rulesetVersion:8,runConfigId:'run.outbound9_v8'});
 assert.deepEqual(OUTBOUND_DIFFICULTIES,PROTOCOL.tiers);assert.deepEqual(OUTBOUND_ENTRY.entry,{x:4,y:8});
 assert.equal(PROTOCOL.entryIndex,OUTBOUND_ENTRY.entry.y*9+OUTBOUND_ENTRY.entry.x);return true;
}
export function verifyInputBytes(bytes,manifest){
 assert.equal(manifest.protocol,PROTOCOL.sourceProtocol,'Unexpected original input protocol');
 assert.equal(sha(bytes),manifest.outputs['runs.jsonl'],'Recorded input SHA-256 mismatch');
 return bytes.toString('utf8').trim().split('\n').map(JSON.parse);
}
export function assertStateParity(legacy,current){
 assert.equal(legacy.rulesetVersion,6);assert.equal(current.rulesetVersion,8);
 assert.equal(legacy.runConfigId,`run.outbound9_v6.${legacy.difficultyId}`);assert.equal(current.runConfigId,`run.outbound9_v8.${legacy.difficultyId}`);
 const early=legacy.phase==='input'&&current.phase==='result';
 if(early){
  assert.notEqual(legacy.board[PROTOCOL.entryIndex],null,'Early loss requires the occupied entry after legacy settlement');
  assert.equal(current.board[PROTOCOL.entryIndex],legacy.board[PROTOCOL.entryIndex]);
  assert.equal(legacy.result,null);assert.equal(legacy.endReason,null);
  assert.equal(current.result,'failed');assert.equal(current.endReason,'blocked');
 }
 const excluded=early?[...PROTOCOL.identityFields,...PROTOCOL.earlyTerminalFields]:PROTOCOL.identityFields;
 assert.deepEqual(without(current,excluded),without(legacy,excluded),'Nonidentity gameplay state drift');
 return early;
}
function assertRejected(state,command){
 const before=digestState(state),result=applyCommand(state,command);
 assert.ok(result.error,'Terminal v8 accepted a future command');assert.equal(result.state,state,'Terminal rejection replaced state');assert.deepEqual(result.events,[]);
 assert.equal(digestState(state),before,'Terminal rejection mutated state');
}
function endSummary(state){return {phase:state.phase,result:state.result,endReason:state.endReason,commandIndex:state.commandIndex,entryOccupied:state.board[76]!==null,emptyCells:state.board.filter(cell=>cell===null).length,score:state.score,batches:state.completedOrders,checksum:checksum(state)};}
export function verifyRecordedRun(run){
 assert.ok(PROTOCOL.tiers.includes(run.tier),'Unknown recorded tier');assert.equal(run.trace.length,run.moves,'Recorded command count');
 let legacy=createRun(run.seed,'color_exit',6,run.tier),current=createRun(run.seed,'color_exit',8,run.tier);
 assert.equal(checksum(legacy),run.initialChecksum,'v6 initial checksum');assertStateParity(legacy,current);
 const prefixDigest=createHash('sha256'),prefixCommandDigest=createHash('sha256');
 prefixDigest.update(JSON.stringify({commandIndex:0,v6:checksum(legacy),v8:checksum(current),gameplay:sha(JSON.stringify(without(current,PROTOCOL.identityFields)))})+'\n');
 const checkpoints=new Map(run.checkpoints.map(point=>[point.commandIndex,point]));let checkpointChecks=0;
 const checkPoint=()=>{const point=checkpoints.get(legacy.commandIndex);if(point){assert.equal(checksum(legacy),point.checksum,'v6 recorded checkpoint checksum');checkpointChecks++;}};
 checkPoint();let accepted=0,earlyEntryStop=false,remainingCommandRejections=0,terminalGuardChecks=0,eventParityChecks=0,nonIdentityStateChecks=1,fillingOnlyChecks=0;
 for(const [index,step] of run.trace.entries()){
  const previous=legacy,result=applyCommand(legacy,step.command);assert.equal(result.error,undefined,`v6 rejected recorded command ${index+1}`);
  legacy=result.state;assert.equal(step.commandIndex,index+1,'Recorded command index must be contiguous');assert.equal(legacy.commandIndex,step.commandIndex);
  assert.equal(checksum(legacy),step.checksum,`v6 command checksum ${index+1}`);checkPoint();
  if(current.phase!=='result'){
   const actual=applyCommand(current,step.command);assert.equal(actual.error,undefined,`v8 rejected recorded prefix command ${index+1}`);
   current=actual.state;accepted++;const early=assertStateParity(legacy,current);nonIdentityStateChecks++;
   assert.deepEqual(actual.events,early?[...result.events,{type:'result',result:'failed'}]:result.events,'v8 settlement/event drift');eventParityChecks++;
   if(early){assert.equal(earlyEntryStop,false);earlyEntryStop=true;}
   prefixCommandDigest.update(JSON.stringify(step.command)+'\n');
   prefixDigest.update(JSON.stringify({commandIndex:current.commandIndex,v6:checksum(legacy),v8:checksum(current),gameplay:sha(JSON.stringify(without(current,PROTOCOL.identityFields)))})+'\n');
  }else{
   assert.ok(earlyEntryStop,'A matching terminal state cannot have remaining recorded commands');
   assertRejected(current,step.command);remainingCommandRejections++;
   assert.equal(step.command.type,'place','Avoided command must be placement');assert.notEqual(previous.board[76],null);assert.equal(legacy.board[76],previous.board[76]);
   assert.equal(result.events.filter(event=>event.type==='shipment').length,0,'Post-blocked-entry v6 command unexpectedly shipped cargo');
   for(let cell=0;cell<81;cell++)if(previous.board[cell]!==null)assert.equal(legacy.board[cell],previous.board[cell],'Blocked-entry continuation removed cargo');
   assert.ok(legacy.board.filter(Boolean).length>previous.board.filter(Boolean).length,'Avoided command did not add cargo');fillingOnlyChecks++;
  }
 }
 assert.deepEqual(legacy,run.finalState,'v6 final state');assert.equal(checksum(legacy),run.finalChecksum,'v6 final checksum');
 assert.equal(checkpointChecks,checkpoints.size,'Every recorded v6 checkpoint checked');
 assert.deepEqual(legacy.commands,run.trace.map(step=>step.command),'v6 recorded command history');
 assert.equal(run.status,legacy.phase==='result'?legacy.result:'capped','Recorded final result');assert.equal(run.terminal,legacy.phase==='result');
 if(run.status==='failed'){assert.equal(legacy.endReason,'blocked');assert.equal(findLegalMoves(legacy).length,0,'Original v6 failed run must be unplaceable');}
 if(run.status==='won'){assert.equal(earlyEntryStop,false,'Previously completed win stopped early');assert.deepEqual(without(current,PROTOCOL.identityFields),without(legacy,PROTOCOL.identityFields));}
 if(current.phase==='result'){
  const legal=findLegalMoves(current)[0];assertRejected(current,legal?{type:'place',...legal}:run.trace.at(-1).command);terminalGuardChecks++;
 }
 assert.equal(remainingCommandRejections,run.moves-accepted);assert.equal(fillingOnlyChecks,remainingCommandRejections);
 return {seed:run.seed,tier:run.tier,oldStatus:run.status,oldCommands:run.moves,v6CommandChecksumChecks:run.trace.length,v6CheckpointChecks:checkpointChecks,
  v6FinalStateMatched:true,v8AcceptedCommands:accepted,nonIdentityStateChecks,eventParityChecks,earlyEntryStop,
  avoidedFillingCommands:remainingCommandRejections,remainingCommandRejections,terminalGuardChecks,fillingOnlyChecks,
  prefixCommandsSha256:prefixCommandDigest.digest('hex'),prefixTraceSha256:prefixDigest.digest('hex'),v6End:endSummary(legacy),v8End:endSummary(current)};
}
function distribution(values){const sorted=[...values].sort((left,right)=>left-right),n=sorted.length;return {total:sum(values),n,min:n?sorted[0]:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null,max:n?sorted.at(-1):null};}
export function summarizeRuns(runs){
 const total=field=>sum(runs.map(run=>run[field])),early=runs.filter(run=>run.earlyEntryStop),failed=runs.filter(run=>run.oldStatus==='failed'),unchanged=failed.filter(run=>!run.earlyEntryStop);
 return {recordedRuns:runs.length,oldWon:runs.filter(run=>run.oldStatus==='won').length,oldFailed:failed.length,oldCapped:runs.filter(run=>run.oldStatus==='capped').length,
  unchangedCompletedWins:runs.filter(run=>run.oldStatus==='won'&&run.v8End.result==='won'&&!run.earlyEntryStop).length,
  earlyEntryStops:early.length,oldFailedNowEarlyEntryStop:early.filter(run=>run.oldStatus==='failed').length,
  oldFailedWithoutEarlyStop:unchanged.length,oldFailedWithoutOccupiedEntry:unchanged.filter(run=>!run.v8End.entryOccupied).length,
  oldFailedEntryOccupiedAtSameFinalCommand:unchanged.filter(run=>run.v8End.entryOccupied).length,
  oldFailedWithoutEarlyStopCases:unchanged.map(run=>({seed:run.seed,tier:run.tier,entryOccupiedAtFinal:run.v8End.entryOccupied,commands:run.oldCommands})),
  avoidedFillingCommands:distribution(early.map(run=>run.avoidedFillingCommands)),
  checks:Object.fromEntries(['v6CommandChecksumChecks','v6CheckpointChecks','v8AcceptedCommands','nonIdentityStateChecks','eventParityChecks','remainingCommandRejections','terminalGuardChecks','fillingOnlyChecks'].map(field=>[field,total(field)]))};
}
export function verifyLegacyFixtures(){
 const files=readJSON(FIXTURES[0]);for(const [file,hash] of Object.entries(files))assert.equal(sha(readFileSync(join(ROOT,file))),hash,`Frozen v1-v7 source drift: ${file}`);
 let goldenChecksumChecks=0,goldenCommands=0;const versions=new Set(),casesByVersion={};
 for(const [fixture,version,digest] of [[FIXTURES[1],null,checksum],[FIXTURES[2],5,checksum],[FIXTURES[3],6,digestState]]){
  for(const item of readJSON(fixture).cases){const ver=version??item.version;versions.add(ver);casesByVersion[ver]=(casesByVersion[ver]??0)+1;
   let state=createRun(item.seed,item.mode??'color_exit',ver,item.colorTier??item.difficulty);assert.equal(digest(state),item.trace[0],`v${ver} initial golden`);goldenChecksumChecks++;
   assert.equal(item.trace.length,item.commands.length+1);
   for(const [index,command] of item.commands.entries()){const result=applyCommand(state,command);assert.equal(result.error,undefined);state=result.state;assert.equal(digest(state),item.trace[index+1],`v${ver} golden ${index+1}`);goldenChecksumChecks++;goldenCommands++;}
  }
 }
 // v7 has a stable command fixture and frozen engine, but no pre-existing checksum trace.
 // Compare the public router with that byte-pinned implementation throughout the route and explicit finish.
 const route=readJSON(FIXTURES[4]);let root=createRun(route.seed,'endless',7),direct=createRunV7(route.seed),v7RootParityChecks=1;assert.deepEqual(root,direct);
 const v7Digest=createHash('sha256');v7Digest.update(JSON.stringify(root)+'\n');
 for(const command of [...route.commands,{type:'finishEndless'}]){const actual=applyCommand(root,command),expected=applyCommandV7(direct,command);assert.equal(actual.error,undefined);assert.deepEqual(actual,expected);root=actual.state;direct=expected.state;v7RootParityChecks++;v7Digest.update(JSON.stringify(root)+'\n');}
 assert.equal(root.phase,'result');assert.equal(root.endReason,'retired');versions.add(7);casesByVersion[7]=1;
 return {versions:[...versions].sort(),frozenFiles:Object.keys(files).length,casesByVersion,goldenChecksumChecks,goldenCommands,v7RootParityChecks,v7FullStateTraceSha256:v7Digest.digest('hex'),
  v7Evidence:'Existing command fixture plus unchanged v7 source; root/direct full-state and event parity, not a pre-existing checksum golden.',fixtureHashes:Object.fromEntries(FIXTURES.map(file=>[file,sha(readFileSync(join(ROOT,file)))]))};
}
function filesBelow(folder){return readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?filesBelow(join(folder,entry.name)):[join(folder,entry.name)]).sort();}
export function sourceBinding(){
 const paths=[...filesBelow(join(ROOT,'src/domain')),...filesBelow(join(ROOT,'node_modules/pure-rand/lib/esm')).filter(file=>file.endsWith('.js')),
  join(ROOT,'node_modules/pure-rand/package.json'),...FIXTURES.map(file=>join(ROOT,file)),join(ROOT,'qa/v8-prefix-verify.mjs'),join(ROOT,'tests/v8-prefix-verify.test.ts'),join(ROOT,'docs/v070-player-copy-and-deadlock-spec.md')].sort();
 const files=Object.fromEntries(paths.map(file=>[relative(ROOT,file),sha(readFileSync(file))]));return {sha256:sha(JSON.stringify(files)),files};
}
function verifyOldArtifacts(manifest){
 for(const [file,hash] of Object.entries(manifest.outputs))assert.equal(sha(readFileSync(join(ROOT,INPUT,file))),hash,`Original artifact SHA drift: ${file}`);
 if(manifest.publishedReport)assert.equal(sha(readFileSync(join(ROOT,manifest.publishedReport.path))),manifest.publishedReport.sha256,'Original published report SHA drift');
}
function markdown(report,binding,input){
 const s=report.summary,lines=['# v8 旧输入前缀兼容性核验','',`核验日期：${report.completedAt.slice(0,10)}。协议：${PROTOCOL.id}。`,'',
  '本次只读取此前 v6 的 400 条完整记录，不是 400 局新机器人对局，不运行新策略，也不重新抽样或调整规则。旧记录来源是同一策略、种子 1–100、四档各 100 条。',
  '',`旧 v6：400/400 完整重放通过，${s.checks.v6CommandChecksumChecks} 个逐命令 checksum、${s.checks.v6CheckpointChecks} 个已有检查点 checksum、400 个完整终态全部匹配。原输入及原报告的 SHA-256 均匹配旧 manifest。`,
  `新 v8：只按原命令执行至各自首个终局，共接受 ${s.checks.v8AcceptedCommands} 条命令。${s.checks.nonIdentityStateChecks} 次完整状态比较（含 400 个初态），除版本/配置身份外逐字段一致；提前终局时只允许 phase/result/endReason 改变，并单独验证入口 index 76 有货及追加且仅追加一个失败事件。`,
  '', '| 难度 | 旧胜利保持 | 旧失败 | 提前入口结束 | 无提前结束 | 避免后续填格总数 | 每条提前结束记录 min / median / max |','| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
 for(const tier of PROTOCOL.tiers){const t=report.tiers[tier],d=t.avoidedFillingCommands;lines.push(`| ${tier} | ${t.unchangedCompletedWins} | ${t.oldFailed} | ${t.oldFailedNowEarlyEntryStop} | ${t.oldFailedWithoutEarlyStop} | ${d.total} | ${d.min??'—'} / ${d.median??'—'} / ${d.max??'—'} |`);}
 lines.push('',`合计：${s.unchangedCompletedWins} 条旧胜利全部保持完成；${s.oldFailed} 条旧失败中 ${s.oldFailedNowEarlyEntryStop} 条在入口有货时提前结束，省去 ${s.avoidedFillingCommands.total} 条原后续填格命令（每条提前结束记录最少 ${s.avoidedFillingCommands.min}、中位 ${s.avoidedFillingCommands.median}、最多 ${s.avoidedFillingCommands.max} 条）。`,
  `省去的每条命令都在旧 v6 中继续成功重放，并验证入口持续占用、无出货、已有货物未删除且占用格只增加。它们在新 v8 中仅作终局拒绝探针，${s.checks.remainingCommandRejections}/${s.checks.remainingCommandRejections} 被拒绝且状态/事件不变。所有 ${s.checks.terminalGuardChecks} 个新终局另有拒绝探针。`,
  '',`未提前结束的旧失败共 ${s.oldFailedWithoutEarlyStop} 条：其中 ${s.oldFailedWithoutOccupiedEntry} 条直到旧终局入口仍为空，${s.oldFailedEntryOccupiedAtSameFinalCommand} 条恰在原最终命令占入口（没有可省去的后续命令）。具体 seed/difficulty 与分类见 report.json 的 summary.oldFailedWithoutEarlyStopCases。`,
  '',`旧规则证明：v1–v7 共 ${report.legacy.frozenFiles} 个冻结源码 SHA 保持；v1–v6 已有黄金夹具 ${report.legacy.goldenChecksumChecks} 次初态/逐步摘要保持。v7 使用已有 seed-1 命令夹具，对公开路由与已冻结实现作 ${report.legacy.v7RootParityChecks} 次完整状态/事件比较（含直接结算）；没有把新生成摘要说成旧黄金 checksum。`,
  '', '## 证据与复现','',`- 原输入：${INPUT}/runs.jsonl；SHA-256 ${input.runsSha256}`,
  `- 原 manifest：${INPUT}/manifest.json；SHA-256 ${input.manifestSha256}`,
  `- 当前规则、路由、replay、依赖、验证器和旧夹具绑定：${binding.sha256}`,
  '- artifacts/v8-prefix-verification/report.json：聚合统计和每条记录的紧凑结果，保留 v6/v8 前缀命令/摘要哈希，不复制旧大日志。',
  '- artifacts/v8-prefix-verification/manifest.json：本次输入来源、协议、源码/输出哈希、环境与运行前后未漂移证明。旧 manifest 的 current-root 源码哈希是历史来源，不要求已新增 v8 的路由恢复旧字节。',
  '- 小协议测试：node --test tests/v8-prefix-verify.test.ts。正式读取入口：node qa/v8-prefix-verify.mjs --output <新证据目录>；拒绝覆盖既有输出。',
  '- 只检查已生成证据及当前绑定：node qa/v8-prefix-verify.mjs --verify artifacts/v8-prefix-verification；不再重放 400 条。',
  '', '此证据只支持有限旧输入的兼容性和可证明的提前结束性质。它不证明最佳策略、真人公平性、趣味性或胜率提升；新终局反例、玩家 UI、触控、存档/成绩/session 由各自测试另外覆盖。','');
 return lines.join('\n');
}
export function verifyEvidence(folder){
 const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
 assert.equal(manifest.protocol,PROTOCOL.id);assert.deepEqual(sourceBinding(),manifest.sourceBinding,'Bound verifier/rule source changed');
 assert.equal(sha(readFileSync(join(ROOT,INPUT,'manifest.json'))),manifest.input.manifestSha256);verifyOldArtifacts(readJSON(join(INPUT,'manifest.json')));
 for(const [file,hash] of Object.entries(manifest.outputs))assert.equal(sha(readFileSync(join(folder,file))),hash,`Output SHA drift: ${file}`);
 if(manifest.publishedReport)assert.equal(sha(readFileSync(join(ROOT,manifest.publishedReport.path))),manifest.publishedReport.sha256);
 const report=JSON.parse(readFileSync(join(folder,'report.json'),'utf8'));assert.deepEqual(summarizeRuns(report.runs),report.summary);
 assert.equal(report.summary.recordedRuns,400);assert.equal(manifest.sourceUnchangedDuringRun,true);return {protocol:manifest.protocol,recordedRuns:report.summary.recordedRuns,integrity:'matched',replayedAgain:false};
}
function main(){
 const args=process.argv.slice(2);
 if(args.length===2&&args[0]==='--verify'){process.stdout.write(JSON.stringify(verifyEvidence(resolve(args[1])))+'\n');return;}
 assert.ok(args.length===0||args.length===2&&args[0]==='--output','Usage: node qa/v8-prefix-verify.mjs [--output directory | --verify directory]');
 const output=resolve(args[1]??join(ROOT,'artifacts/v8-prefix-verification'));assert.ok(!existsSync(output)||readdirSync(output).length===0,'Existing evidence must not be overwritten');
 assertProtocol();const binding=sourceBinding(),createdAt=new Date().toISOString(),started=performance.now();
 const manifestBytes=readFileSync(join(ROOT,INPUT,'manifest.json')),original=JSON.parse(manifestBytes),bytes=readFileSync(join(ROOT,INPUT,'runs.jsonl'));
 verifyOldArtifacts(original);const recorded=verifyInputBytes(bytes,original);assert.equal(recorded.length,PROTOCOL.recordedRuns);assert.equal(original.fullGames,400);assert.deepEqual(original.seedRange,PROTOCOL.seedRange);
 const identities=recorded.map(run=>`${run.seed}:${run.tier}`);assert.equal(new Set(identities).size,400);
 for(let seed=1;seed<=100;seed++)for(const tier of PROTOCOL.tiers)assert.ok(identities.includes(`${seed}:${tier}`));
 const legacy=verifyLegacyFixtures(),runs=[];
 for(const run of recorded)runs.push(verifyRecordedRun(run));
 assert.deepEqual(sourceBinding(),binding,'Bound rule/verification source drifted during recorded replay');verifyOldArtifacts(original);
 const summary=summarizeRuns(runs);assert.equal(summary.oldCapped,0);assert.equal(summary.unchangedCompletedWins,summary.oldWon);
 const input={directory:INPUT,manifestSha256:sha(manifestBytes),runsSha256:sha(bytes),bytes:bytes.length,protocol:original.protocol,originalCoreSha256HistoricalOnly:original.coreSource.sha256};
 const report={protocol:PROTOCOL,createdAt,completedAt:new Date().toISOString(),elapsedMs:performance.now()-started,summary,tiers:Object.fromEntries(PROTOCOL.tiers.map(tier=>[tier,summarizeRuns(runs.filter(run=>run.tier===tier))])),legacy,runs};
 const content=JSON.stringify(report)+'\n',document=markdown(report,binding,input);mkdirSync(output,{recursive:true});writeFileSync(join(output,'report.json'),content);
 const manifest={protocol:PROTOCOL.id,createdAt,completedAt:report.completedAt,node:process.version,platform:process.platform,arch:process.arch,input,sourceBinding:binding,sourceUnchangedDuringRun:true,recordedRuns:400,freshPolicySimulations:0,outputs:{'report.json':sha(content)}};
 if(output===join(ROOT,'artifacts/v8-prefix-verification')){const path='docs/v8-prefix-verification.md';writeFileSync(join(ROOT,path),document);manifest.publishedReport={path,sha256:sha(document)};}
 else{writeFileSync(join(output,'report.md'),document);manifest.outputs['report.md']=sha(document);}
 writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');process.stdout.write(JSON.stringify({output,sourceSha256:binding.sha256,elapsedMs:report.elapsedMs,summary,legacy},null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(error){process.stderr.write(`${error.stack??error}\n`);process.exitCode=1;}}
