/** Preregistered final adaptive validation. Run only after the controller freezes product/API source. */
import assert from 'node:assert/strict';
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRunV14,applyCommandV14} from '../src/domain/v14/engine.ts';
import {pieceCellsV14,reservedEntryCellsV14} from '../src/domain/v14/board.ts';
import {checksumV14} from '../src/domain/v14/replay.ts';
import {RULES_V14_CONFIG as CONFIG} from '../src/domain/v14/content.ts';
import {encodeGameRun,decodeGameRun} from '../src/application/game-codec.ts';
import {baseCoins} from '../src/application/economy.ts';
import {chooseEntranceMove} from './simulate-entrance.mjs';
import {FINAL_ADAPTIVE_PROTOCOL as PROTOCOL,atomicJson,sha256,buildFinalCases,validatePlacementCap,runCheckpointed,createRushLedger,observeGenerated,observeTransition,summarizeRush} from './final-adaptive-support.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const walk=path=>readdirSync(join(ROOT,path),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${path}/${entry.name}`):[`${path}/${entry.name}`]);
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const sorted=xs=>[...xs].sort();

export function finalSourceBinding(){
 const paths=sorted([...walk('src/domain'),...walk('src/shared'),'src/application/game-codec.ts','src/application/save.ts','src/application/run-slots.ts','src/application/economy.ts','scripts/validate-final-adaptive.mjs','scripts/final-adaptive-support.mjs','scripts/simulate-entrance.mjs','tests/final-adaptive-protocol.test.ts','package.json','package-lock.json']);
 const files=Object.fromEntries(paths.map(path=>[path,sha256(readFileSync(join(ROOT,path)))]));return {sha256:sha256(JSON.stringify(files)),files};
}
function preregister(out){
 mkdirSync(out,{recursive:true});const path=join(out,'preregistration.json'),registration={protocol:PROTOCOL,cases:buildFinalCases(),visiblePolicySha256:sha256(readFileSync(join(ROOT,'scripts/simulate-entrance.mjs')))};
 if(existsSync(path))assert.deepEqual(readJson(path),registration,'Preregistered cases or visible policies changed');else atomicJson(path,registration);return registration;
}
function preserveSource(out,source){
 for(const path of Object.keys(source.files)){const target=join(out,'source',path);mkdirSync(dirname(target),{recursive:true});if(existsSync(target))assert.equal(sha256(readFileSync(target)),source.files[path],'Archived source differs');else copyFileSync(join(ROOT,path),target);}
 atomicJson(join(out,'source-manifest.json'),source);
 const frozen=Object.keys(source.files).filter(path=>path.startsWith('src/domain/')&&path.endsWith('.ts')&&!/^src\/domain\/v(12|13|14)\//.test(path)&&path!=='src/domain/playable.ts');
 const baselineRoot=join(ROOT,'artifacts/refinement-simulation/full/source'),files=frozen.map(path=>{const baseline=join(baselineRoot,path);assert.ok(existsSync(baseline),`Missing preserved legacy source ${path}`);return {path,beforeSha256:sha256(readFileSync(baseline)),afterSha256:source.files[path]};});
 const legacy={baseline:'artifacts/refinement-simulation/full/source',scope:'Released rules1–11 and shared domain code; current multi-version dispatcher playable.ts excluded.',fileCount:files.length,unchanged:files.every(file=>file.beforeSha256===file.afterSha256),files};
 atomicJson(join(out,'legacy-1-11-source-hashes.json'),legacy);assert.ok(legacy.unchanged,'Released rules1–11 source changed from preserved baseline');return legacy;
}
function sampleCodec(state){
 const encoded=encodeGameRun(state),decoded=decodeGameRun(encoded);assert.equal(checksumV14(decoded),checksumV14(state),'Strict codec checksum mismatch');assert.deepEqual(decoded,state,'Strict codec state mismatch');
 const damaged=JSON.parse(encoded);damaged.digest='tampered';assert.throws(()=>decodeGameRun(JSON.stringify(damaged)),'Strict codec accepts a damaged envelope');
}
function verifyBoard(state,ledger){
 for(const cell of reservedEntryCellsV14(state))assert.equal(state.board[cell],null,'Reserved entry occupied');
 for(const [cell,owner] of ledger.owners){const trait=state.cellTraits[cell];assert.equal(trait?.kind,owner.status==='active'?'rush':'waste','Tracked rush cell diverges from board');if(owner.status==='active')assert.equal(trait.bornAtPlacement,owner.born,'Rush birth marker changed');}
 for(let cell=0;cell<state.cellTraits.length;cell++)if(state.cellTraits[cell]?.kind==='rush')assert.equal(ledger.owners.get(cell)?.born,state.cellTraits[cell].bornAtPlacement,'Untracked rush cell');
 for(const record of ledger.pieces.values())if(record.activeCells.length){const clocks=record.activeCells.map(cell=>state.cellTraits[cell].remaining);assert.equal(new Set(clocks).size,1,'Partial rush residual clocks differ');}
}
function visibleObservation(state){
 // These fields are sufficient for the existing frozen scorer. Hide random/future identity fields entirely.
 const {rulesetVersion,boardSize,board,cellTraits,candidates,orders,phase,shift,levels}=state;
 return {rulesetVersion,boardSize,board,cellTraits,candidates,orders,phase,shift,levels};
}

export function simulateFinalCase(spec,context){
 validatePlacementCap(spec.maxPlacements,spec.mode);const started=performance.now(),ledger=createRushLedger(),trace=context.trace;
 let state=createRunV14({seed:spec.seed,mode:spec.mode,guided:false}),placements=0,codecSamples=0;
 sampleCodec(state);codecSamples++;observeGenerated(ledger,state.candidates,p=>pieceCellsV14(p).length);
 while(state.phase!=='result'&&placements<spec.maxPlacements){
  const move=state.phase==='input'?chooseEntranceMove(visibleObservation(state),spec.strategy):null;
  const command=state.phase==='cleanup'?{type:'chooseCleanup',branch:spec.cleanup}:move?{type:'place',...move}:null;
  context.command=command;context.beforeChecksum=checksumV14(state);assert.ok(command,'Nonterminal no-tool run lacks a command');
  const before=state,result=applyCommandV14(before,command);assert.equal(result.error,undefined,'Production reducer rejected chosen visible command');state=result.state;
  if(command.type==='place')placements++;
  for(const candidate of before.candidates){const waiting=state.candidates.find(p=>p.id===candidate.id);if(waiting)assert.deepEqual(waiting,candidate,'Waiting candidate changed or rush clock ticked');}
  observeTransition(ledger,before,state,command,result.events,CONFIG.cleanup);observeGenerated(ledger,state.candidates,p=>pieceCellsV14(p).length);verifyBoard(state,ledger);
  const boardRush=state.cellTraits.some(trait=>trait?.kind==='rush'),multiCandidate=state.candidates.some(piece=>piece.trait==='rush'&&pieceCellsV14(piece).length>1);
  if(state.commandIndex%10===0||boardRush||multiCandidate){sampleCodec(state);codecSamples++;}
  trace.push({index:state.commandIndex,command,checksum:checksumV14(state),events:result.events});
 }
 sampleCodec(state);codecSamples++;assert.equal(state.usedToolIds.length,0);assert.deepEqual(state.toolCharges,{rotate:0,clear:0,wildcard:0});
 assert.equal(ledger.allGeneratedPieces,state.generatedPieces,'Generated candidate accounting missed an ID');
 const baseEntitlement=baseCoins('inbound',state.completedOrders,state.score,2);assert.equal(baseEntitlement,Math.floor(state.score/120),'Final economy2 inbound formula differs');
 const status=state.result??(spec.mode==='endless'?'censored':'capped');
 return {trace,status,placements,commands:state.commandIndex,orders:state.completedOrders,score:state.score,failureStage:state.result==='failed'?state.shift:null,finalStage:state.shift,cap:spec.maxPlacements,codecSamples,rush:summarizeRush(ledger),generatedRush:ledger.generated,placedRush:[...ledger.pieces.values()],entitlement:{kind:'potential-formula-only',economyVersion:2,base:baseEntitlement,hypotheticalFirstDailyWinTotal:spec.mode==='daily'&&state.result==='won'?3*baseEntitlement:null,actualWalletTested:false},finalChecksum:checksumV14(state),finalState:state,measuredMs:performance.now()-started};
}
export function verifyFinalCase(record){
 const ledger=createRushLedger();let state=createRunV14({seed:record.spec.seed,mode:record.spec.mode,guided:false});observeGenerated(ledger,state.candidates,p=>pieceCellsV14(p).length);
 for(const step of record.trace){const before=state,result=applyCommandV14(state,step.command);assert.equal(result.error,undefined,'Replay rejected an accepted command');state=result.state;assert.equal(checksumV14(state),step.checksum,'Accepted command checksum replay mismatch');assert.equal(state.commandIndex,step.index);assert.deepEqual(result.events,step.events,'Replay event mismatch');observeTransition(ledger,before,state,step.command,result.events,CONFIG.cleanup);observeGenerated(ledger,state.candidates,p=>pieceCellsV14(p).length);}
 assert.equal(checksumV14(state),record.finalChecksum,'Final replay checksum mismatch');assert.deepEqual(state,record.finalState,'Final replay state mismatch');assert.deepEqual(summarizeRush(ledger),record.rush,'Replayed rush accounting mismatch');sampleCodec(state);
}

function summarize(records){
 const sum=key=>records.reduce((total,record)=>total+record[key],0),failureStages={};
 for(const record of records)if(record.failureStage)failureStages[record.failureStage]=(failureStages[record.failureStage]??0)+1;
 const rush=Object.fromEntries(Object.keys(records[0].rush).map(key=>[key,records.reduce((n,r)=>n+r.rush[key],0)]));
 return {cases:records.length,won:records.filter(r=>r.status==='won').length,failed:records.filter(r=>r.status==='failed').length,capped:records.filter(r=>r.status==='capped').length,censored:records.filter(r=>r.status==='censored').length,failureStages,placements:sum('placements'),commands:sum('commands'),orders:sum('orders'),score:sum('score'),meanPlacements:sum('placements')/records.length,meanScore:sum('score')/records.length,potentialBaseEntitlement:records.reduce((n,r)=>n+r.entitlement.base,0),rush};
}
function readableReport(summary){
 const lines=['# Final adaptive generation validation','',`Source SHA-256: ${summary.sourceSha256}`,`Completed ${summary.caseCount}/288 preregistered cases; ${summary.traceCommands} accepted commands replayed; ${summary.codecSamples} strict codec round-trip samples. Sequential wall time ${Math.round(summary.wallMs)}ms.`,
  '', 'Real production adaptive generator and RNG; route/greedy visible policies, both cleanup choices, no tools. Ordinary and daily seeds1–32; endless seeds1–8. Same seed is paired input, not synchronized future RNG. No forced shapes or supply tape. This is separate from the448 fixed-tape experiment.',
  '', '| Mode | Cases | Won | Failed | Capped | Censored | Mean score | Mean placements |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
 for(const [mode,s] of Object.entries(summary.modes))lines.push(`| ${mode} | ${s.cases} | ${s.won} | ${s.failed} | ${s.capped} | ${s.censored} | ${s.meanScore.toFixed(2)} | ${s.meanPlacements.toFixed(2)} |`);
 lines.push('', '| Mode | Generated rush pieces / cells | Placed pieces / cells | Shipped pieces / cells | Expired pieces / cells | Active cells / waste cells left | Cleanup hit / empty triggers |','|---|---:|---:|---:|---:|---:|---:|');
 for(const [mode,{rush:r}] of Object.entries(summary.modes))lines.push(`| ${mode} | ${r.generatedPieces} / ${r.generatedCells} | ${r.placedPieces} / ${r.placedCells} | ${r.shippedPieces} / ${r.shippedCells} | ${r.expiredPieces} / ${r.expiredCells} | ${r.remainingActiveCells} / ${r.remainingWasteCells} | ${r.cleanupHitCells} / ${r.cleanupEmptyTriggers} |`);
 lines.push('', 'Rush pieces are keyed by bornAtPlacement. A partially shipped piece can later expire, so shipped and expired piece counts overlap. Cell conservation is asserted per case. Generated but unplaced tray pieces count only as generated. Cleanup triggers come from actual progress, including empty triggers omitted by production event logs.',
  '', 'Endless observations stop at120 placements and are censored if still active; finite modes cap at300. These fixed-policy samples do not estimate human win rate, optimal play, fun, or lifetime survival. No balance values were selected from the results.',
  '', 'Potential economy2 entitlement is floor(displayed score/120), with a hypothetical first daily win total of3x base. These are formula-only records; no AccountService or wallet payouts were exercised. Actual account transaction evidence is maintained separately. Outbound scoring is outside this inbound adaptive suite.',
  '', `Released rules1–11: ${summary.legacy.fileCount} archived source files hash-match the preserved pre-update source. All measured source and original visible policy bytes are archived under source/. Raw commands, checksums, events, final states and per-piece ledgers are in cases/.`,
  '', '## Detailed policy groups','', '| Mode / policy / cleanup | Cases | Won | Failed | Cap / censored | Failure stages |','|---|---:|---:|---:|---:|---|');
 for(const [key,s] of Object.entries(summary.groups))lines.push(`| ${key} | ${s.cases} | ${s.won} | ${s.failed} | ${s.capped} / ${s.censored} | ${JSON.stringify(s.failureStages)} |`);
 return lines.join('\n')+'\n';
}
export function runFinalAdaptive(out,{stopAfter=Infinity,budgetMs=PROTOCOL.budgetMs}={}){
 preregister(out);const source=finalSourceBinding(),legacy=preserveSource(out,source),cases=buildFinalCases();
 assert.equal(CONFIG.special.weights.rush,6);assert.equal(CONFIG.special.dailyRushWeight,12);
 const result=runCheckpointed({out,cases,source,readSource:finalSourceBinding,runCase:simulateFinalCase,verifyCase:verifyFinalCase,stopAfter,budgetMs});
 if(result.status!=='complete')return {status:result.status,complete:result.records.length,total:cases.length,sourceSha256:source.sha256,wallMs:result.elapsedMs};
 const modes=Object.fromEntries(['standard','daily','endless'].map(mode=>[mode,summarize(result.records.filter(r=>r.spec.mode===mode))])),groups={};
 for(const mode of ['standard','daily','endless'])for(const strategy of PROTOCOL.strategies)for(const cleanup of PROTOCOL.cleanup){const key=`${mode}/${strategy}/${cleanup}`;groups[key]=summarize(result.records.filter(r=>r.spec.mode===mode&&r.spec.strategy===strategy&&r.spec.cleanup===cleanup));}
 const summary={status:'complete',protocol:PROTOCOL,sourceSha256:source.sha256,caseCount:result.records.length,wallMs:result.elapsedMs,traceCommands:result.records.reduce((n,r)=>n+r.trace.length,0),codecSamples:result.records.reduce((n,r)=>n+r.codecSamples,0),legacy:{fileCount:legacy.fileCount,unchanged:legacy.unchanged},modes,groups,caseIds:result.records.map(r=>r.id)};
 atomicJson(join(out,'summary.json'),summary);writeFileSync(join(out,'report.md'),readableReport(summary));return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2],out=resolve(process.argv[3]??join(ROOT,'artifacts/final-adaptive-validation'));
 assert.ok(['--preregister','--source-frozen'].includes(mode),'Use --preregister, or --source-frozen only after controller source/API freeze');
 console.log(JSON.stringify(mode==='--preregister'?{status:'preregistered',...preregister(out)}:runFinalAdaptive(out)));
}
