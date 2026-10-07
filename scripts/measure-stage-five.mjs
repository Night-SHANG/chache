/** Actual-generator paired stage5 study. Execution requires the controller's source freeze. */
import assert from 'node:assert/strict';
import {copyFileSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chooseEntranceMove} from './simulate-entrance.mjs';
import {createRushLedger,observeGenerated,observeTransition,summarizeRush} from './final-adaptive-support.mjs';
import {STAGE_FIVE_PROTOCOL as PROTOCOL,atomicJson,sha256,buildStageFiveCases,validateStageFiveCap,stageFiveVisibleObservation,withoutRulesetIdentity,verifyPairedPrefix,runStageFiveCheckpointed,createStageFiveTracker,observeStageFiveCandidates,observeStageFiveTransition} from './stage-five-study-support.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const walk=path=>readdirSync(join(ROOT,path),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${path}/${entry.name}`):[`${path}/${entry.name}`]);
const sum=(rows,key)=>rows.reduce((n,row)=>n+(row[key]??0),0);
const prefixHash=state=>sha256(JSON.stringify(withoutRulesetIdentity(state)));

export function stageFiveSourceBinding(){
 const paths=[...walk('src/domain'),...walk('src/shared'),'src/application/game-codec.ts','src/application/save.ts','src/application/run-slots.ts','src/application/economy.ts','scripts/measure-stage-five.mjs','scripts/stage-five-study-support.mjs','scripts/final-adaptive-support.mjs','scripts/simulate-entrance.mjs','tests/stage-five-study-protocol.test.ts','package.json','package-lock.json'].sort();
 const files=Object.fromEntries(paths.map(path=>[path,sha256(readFileSync(join(ROOT,path)))]));return {sha256:sha256(JSON.stringify(files)),files};
}
export function preregisterStageFive(out){
 mkdirSync(out,{recursive:true});const value={protocol:PROTOCOL,cases:buildStageFiveCases(),visiblePolicySha256:sha256(readFileSync(join(ROOT,'scripts/simulate-entrance.mjs')))},path=join(out,'preregistration.json');
 if(existsSync(path))assert.deepEqual(readJson(path),value,'Preregistered cases or visible policy changed');else atomicJson(path,value);return value;
}
function preserveSource(out,source){
 const baseline='artifacts/final-adaptive-validation/source',released=Object.keys(source.files).filter(path=>path.startsWith('src/domain/v14/'));
 const files=released.map(path=>({path,beforeSha256:sha256(readFileSync(join(ROOT,baseline,path))),afterSha256:source.files[path]}));
 assert.ok(files.every(row=>row.beforeSha256===row.afterSha256),'Released rules14 source changed from byte-pinned baseline');
 assert.equal(sha256(readFileSync(join(ROOT,'scripts/simulate-entrance.mjs'))),sha256(readFileSync(join(ROOT,baseline,'scripts/simulate-entrance.mjs'))),'Frozen visible policy changed');
 const oldBoard=readFileSync(join(ROOT,'src/domain/v14/board.ts'),'utf8'),newBoard=readFileSync(join(ROOT,'src/domain/v15/board.ts'),'utf8').replaceAll('V15','V14').replaceAll('v15','v14');
 assert.equal(newBoard,oldBoard,'Rules15 board/scorer cannot be represented by frozen rules14 visible policy');
 for(const path of Object.keys(source.files)){const target=join(out,'source',path);mkdirSync(dirname(target),{recursive:true});if(existsSync(target))assert.equal(sha256(readFileSync(target)),source.files[path],'Archived source mismatch');else copyFileSync(join(ROOT,path),target);}
 const pin={baseline,fileCount:files.length,unchanged:true,visiblePolicyUnchanged:true,boardScorerEquivalent:true,files};atomicJson(join(out,'released14-byte-pin.json'),pin);atomicJson(join(out,'source-manifest.json'),source);return pin;
}
async function loadApis(){
 const codec=await import('../src/application/game-codec.ts'),apis={};
 for(const v of [14,15]){const engine=await import(`../src/domain/v${v}/engine.ts`),board=await import(`../src/domain/v${v}/board.ts`),replay=await import(`../src/domain/v${v}/replay.ts`),content=await import(`../src/domain/v${v}/content.ts`);apis[v]={create:engine[`createRunV${v}`],apply:engine[`applyCommandV${v}`],checksum:replay[`checksumV${v}`],cells:board[`pieceCellsV${v}`],reserved:board[`reservedEntryCellsV${v}`],config:content[`RULES_V${v}_CONFIG`]};}
 return {...apis,...codec};
}
function codecCheck(state,api,apis){const encoded=apis.encodeGameRun(state),decoded=apis.decodeGameRun(encoded);assert.equal(api.checksum(decoded),api.checksum(state),'Strict save checksum mismatch');assert.deepEqual(decoded,state,'Strict save state mismatch');const damaged=JSON.parse(encoded);damaged.digest='tampered';assert.throws(()=>apis.decodeGameRun(JSON.stringify(damaged)),'Strict codec accepts damaged digest');}
function boardCheck(state,api,ledger){
 for(const cell of api.reserved(state))assert.equal(state.board[cell],null,'Reserved entry occupied');
 for(const [cell,owner] of ledger.owners){const trait=state.cellTraits[cell];assert.equal(trait?.kind,owner.status==='active'?'rush':'waste','Tracked rush diverges from board');if(owner.status==='active')assert.equal(trait.bornAtPlacement,owner.born,'Rush birth marker differs');}
 for(let i=0;i<state.cellTraits.length;i++)if(state.cellTraits[i]?.kind==='rush')assert.equal(ledger.owners.get(i)?.born,state.cellTraits[i].bornAtPlacement,'Untracked rush cell');
 for(const piece of ledger.pieces.values())if(piece.activeCells.length)assert.equal(new Set(piece.activeCells.map(cell=>state.cellTraits[cell].remaining)).size,1,'One rush piece has unequal clocks');
}
function cohortSummary(tracker,ledger,stageFiveGenerated){
 const origins=[...tracker.generated.values()].filter(p=>stageFiveGenerated?p.stage===5:p.stage<5),ids=new Set(origins.map(p=>p.id)),rushOrigins=origins.filter(p=>p.trait==='rush'),placed=tracker.placedRush.filter(p=>ids.has(p.id));
 const allPieces=[...ledger.pieces.values()].filter(p=>ids.has(p.id)),expired=allPieces.filter(p=>tracker.expiredByBirth.has(p.bornAtPlacement));
 return {generatedPieces:origins.length,generatedCells:sum(origins,'cells'),generatedRushPieces:rushOrigins.length,generatedRushCells:sum(rushOrigins,'cells'),generatedRushSingleCellPieces:rushOrigins.filter(p=>p.cells===1).length,generatedRushMulticellPieces:rushOrigins.filter(p=>p.cells>1).length,placedRushPieces:placed.length,placedRushCells:sum(placed,'cells'),expiredRushPieces:expired.length,expiredRushCells:expired.reduce((n,p)=>n+tracker.expiredByBirth.get(p.bornAtPlacement),0),shippedRushPieces:allPieces.filter(p=>p.shippedCells.length).length,shippedRushCells:allPieces.reduce((n,p)=>n+p.shippedCells.length,0),remainingActiveRushCells:allPieces.reduce((n,p)=>n+p.activeCells.length,0),remainingWasteCells:allPieces.reduce((n,p)=>n+p.wasteCells.length,0)};
}
function stageSummary(tracker,ledger,final,now){
 const {simulatorStartedMs,...entry}=tracker.entry??{};return {reached:tracker.entry!==null,entry:tracker.entry?entry:null,firstGenerationCommand:tracker.firstGenerationCommand,windowCommands:tracker.commands,windowPlacements:tracker.placements,windowSimulatorMs:tracker.entry?Math.max(0,now-simulatorStartedMs):null,cleanupTriggers:tracker.cleanupTriggers,cleanupHitCells:tracker.cleanupHitCells,cleanupEmptyTriggers:tracker.cleanupEmptyTriggers,expiredRushPieces:tracker.expiredByBirth.size,expiredRushCells:tracker.expiredCells,terminalUnusedRefills:tracker.terminalUnusedRefills,terminalRushCandidates:final.candidates.filter(p=>p.trait==='rush').length,newGenerated:cohortSummary(tracker,ledger,true),priorGenerated:cohortSummary(tracker,ledger,false)};
}
function sameStageSummary(a,b){const strip=row=>{const c=structuredClone(row);delete c.windowSimulatorMs;return c;};assert.deepEqual(strip(a),strip(b),'Replayed stage5 accounting differs');}
export function simulateStageFiveCase(spec,context,apis){
 validateStageFiveCap(spec.maxPlacements);const api=apis[spec.version],started=performance.now(),ledger=createRushLedger(),tracker=createStageFiveTracker(),trace=context.trace;
 let state=api.create({seed:spec.seed,mode:spec.mode,guided:false}),placements=0,codecSamples=0;
 const initialPrefixHash=prefixHash(state);codecCheck(state,api,apis);codecSamples++;observeGenerated(ledger,state.candidates,p=>api.cells(p).length);observeStageFiveCandidates(tracker,state,p=>api.cells(p).length);
 while(state.phase!=='result'&&placements<spec.maxPlacements){
  const move=state.phase==='input'?chooseEntranceMove(stageFiveVisibleObservation(state),spec.strategy):null,command=state.phase==='cleanup'?{type:'chooseCleanup',branch:spec.cleanup}:move?{type:'place',...move}:null;
  context.command=command;context.beforeChecksum=api.checksum(state);assert.ok(command,'Nonterminal no-tool case lacks legal visible command');
  const before=state,result=api.apply(before,command);assert.equal(result.error,undefined,'Production reducer rejected visible command');state=result.state;if(command.type==='place')placements++;
  for(const p of before.candidates){const waiting=state.candidates.find(q=>q.id===p.id);if(waiting)assert.deepEqual(waiting,p,'Waiting candidate changed or aged');}
  observeTransition(ledger,before,state,command,result.events,api.config.cleanup);observeGenerated(ledger,state.candidates,p=>api.cells(p).length);const fresh=observeStageFiveTransition(tracker,before,state,command,result.events,p=>api.cells(p).length,api.config.cleanup);boardCheck(state,api,ledger);
  if(spec.version===15)for(const p of fresh)if(p.stage===5)assert.equal(p.trait,'rush','Rules15 stage5 generated non-rush');
  if(state.commandIndex%10===0||state.cellTraits.some(t=>t?.kind==='rush')||state.candidates.some(p=>p.trait==='rush'&&api.cells(p).length>1)){codecCheck(state,api,apis);codecSamples++;}
  trace.push({index:state.commandIndex,command,checksum:api.checksum(state),prefixHash:prefixHash(state),events:result.events,newGeneratedAtStage:fresh.length?state.shift:null,newGeneratedIds:fresh.map(p=>p.id),terminalSkippedRefill:spec.version===15&&command.type==='place'&&state.result==='won'&&fresh.length===0});
 }
 codecCheck(state,api,apis);codecSamples++;assert.equal(state.usedToolIds.length,0);assert.deepEqual(state.toolCharges,{rotate:0,clear:0,wildcard:0});assert.equal(ledger.allGeneratedPieces,state.generatedPieces,'Generated ID ledger incomplete');
 return {trace,initialPrefixHash,status:state.result??'capped',placements,commands:state.commandIndex,orders:state.completedOrders,score:state.score,failureStage:state.result==='failed'?state.shift:null,finalStage:state.shift,cap:spec.maxPlacements,codecSamples,rush:summarizeRush(ledger),stageFive:stageSummary(tracker,ledger,state,performance.now()),generated:[...tracker.generated.values()],placedRush:[...ledger.pieces.values()],finalChecksum:api.checksum(state),finalState:state,measuredMs:performance.now()-started};
}
export function verifyStageFiveCase(record,apis){
 const api=apis[record.spec.version],ledger=createRushLedger(),tracker=createStageFiveTracker();let state=api.create({seed:record.spec.seed,mode:record.spec.mode,guided:false});assert.equal(prefixHash(state),record.initialPrefixHash);observeGenerated(ledger,state.candidates,p=>api.cells(p).length);observeStageFiveCandidates(tracker,state,p=>api.cells(p).length);
 for(const step of record.trace){const before=state,result=api.apply(state,step.command);assert.equal(result.error,undefined,'Replay reducer rejected accepted command');state=result.state;assert.equal(state.commandIndex,step.index);assert.equal(api.checksum(state),step.checksum,'Replay checksum drift');assert.equal(prefixHash(state),step.prefixHash,'Replay normalized state drift');assert.deepEqual(result.events,step.events,'Replay event drift');observeTransition(ledger,before,state,step.command,result.events,api.config.cleanup);observeGenerated(ledger,state.candidates,p=>api.cells(p).length);const fresh=observeStageFiveTransition(tracker,before,state,step.command,result.events,p=>api.cells(p).length,api.config.cleanup);assert.deepEqual(fresh.map(p=>p.id),step.newGeneratedIds);assert.equal(fresh.length?state.shift:null,step.newGeneratedAtStage);}
 assert.equal(api.checksum(state),record.finalChecksum,'Final replay checksum drift');assert.deepEqual(state,record.finalState,'Final replay state drift');assert.deepEqual(summarizeRush(ledger),record.rush,'Replayed rush accounting differs');sameStageSummary(stageSummary(tracker,ledger,state,performance.now()),record.stageFive);assert.deepEqual([...tracker.generated.values()],record.generated);assert.deepEqual([...ledger.pieces.values()],record.placedRush);codecCheck(state,api,apis);
}
function pairsFor(records){
 const groups=new Map();for(const row of records){const key=`${row.spec.mode}/${row.spec.strategy}/${row.spec.cleanup}/s${row.spec.seed}`,group=groups.get(key)??{};group[row.spec.version]=row;groups.set(key,group);}
 return [...groups.entries()].flatMap(([id,p])=>p[14]&&p[15]?[{id,...verifyPairedPrefix(p[14],p[15]),oldStatus:p[14].status,newStatus:p[15].status,oldReachedStageFive:p[14].stageFive.reached,newReachedStageFive:p[15].stageFive.reached,placementsDelta:p[15].placements-p[14].placements,stageFivePlacementsDelta:p[15].stageFive.windowPlacements-p[14].stageFive.windowPlacements}]:[]);
}
function summarizeGroup(records){
 const reached=records.filter(r=>r.stageFive.reached),stages={},rushKeys=Object.keys(records[0]?.rush??{}),cohortKeys=Object.keys(records[0]?.stageFive.newGenerated??{});
 for(const row of records)if(row.failureStage)stages[row.failureStage]=(stages[row.failureStage]??0)+1;
 const total=records.length,won=records.filter(r=>r.status==='won').length,stageFive={reached:reached.length,won:reached.filter(r=>r.status==='won').length,failed:reached.filter(r=>r.status==='failed').length,capped:reached.filter(r=>r.status==='capped').length,windowPlacements:reached.reduce((n,r)=>n+r.stageFive.windowPlacements,0),windowCommands:reached.reduce((n,r)=>n+r.stageFive.windowCommands,0),windowSimulatorMs:reached.reduce((n,r)=>n+r.stageFive.windowSimulatorMs,0),cleanupHitCells:reached.reduce((n,r)=>n+r.stageFive.cleanupHitCells,0),cleanupEmptyTriggers:reached.reduce((n,r)=>n+r.stageFive.cleanupEmptyTriggers,0),preexistingCandidatePieces:reached.reduce((n,r)=>n+r.stageFive.entry.preexistingCandidateIds.length,0),preexistingBoardCells:reached.reduce((n,r)=>n+r.stageFive.entry.preexistingBoardCells,0),preexistingBoardRushCells:reached.reduce((n,r)=>n+r.stageFive.entry.preexistingBoardRushCells,0),terminalUnusedRefills:sum(records.map(r=>r.stageFive),'terminalUnusedRefills')};
 for(const cohort of ['newGenerated','priorGenerated'])stageFive[cohort]=Object.fromEntries(cohortKeys.map(key=>[key,records.reduce((n,r)=>n+r.stageFive[cohort][key],0)]));
 stageFive.winFraction=stageFive.reached?stageFive.won/stageFive.reached:null;stageFive.meanWindowPlacements=stageFive.reached?stageFive.windowPlacements/stageFive.reached:null;
 return {cases:total,won,failed:records.filter(r=>r.status==='failed').length,capped:records.filter(r=>r.status==='capped').length,winFraction:total?won/total:null,failureStages:stages,placements:sum(records,'placements'),meanPlacements:total?sum(records,'placements')/total:null,score:sum(records,'score'),orders:sum(records,'orders'),rush:Object.fromEntries(rushKeys.map(key=>[key,records.reduce((n,r)=>n+r.rush[key],0)])),stageFive};
}
function readableReport(summary){
 const l=['# Fifth-stage rush pressure: actual-generator paired study','',`Status: ${summary.status}; ${summary.caseCount}/256 preregistered cases. Source SHA-256: ${summary.sourceSha256}.`,`${summary.traceCommands} accepted commands replayed; ${summary.codecSamples} strict codec samples plus final replay samples. Pilot ${Math.round(summary.pilotMs)}ms; post-pilot ${Math.round(summary.spentAfterPilotMs)}ms of180000ms budget.`,
  '', 'Seeds1–16; route/greedy visible policies; both cleanup choices; ordinary/daily; rules14/15; no tools or guides. Four valid pilot cases are retained. Every case has a300-placement cap. This is an actual adaptive-generator comparison; no supply tape, policy RNG access, tuning or seed expansion.',
  '', '| Arm | Whole-run won / cases | Failed / capped | Mean placements | Failure stage counts | Reached stage5 | Won / reached stage5 | Mean stage5 placements |','|---|---:|---:|---:|---|---:|---:|---:|'];
 for(const [key,s] of Object.entries(summary.arms))l.push(`| ${key} | ${s.won}/${s.cases} | ${s.failed}/${s.capped} | ${s.meanPlacements?.toFixed(2)??'n/a'} | ${JSON.stringify(s.failureStages)} | ${s.stageFive.reached} | ${s.stageFive.won}/${s.stageFive.reached} | ${s.stageFive.meanWindowPlacements?.toFixed(2)??'n/a'} |`);
 l.push('', '| Arm | New stage5 rush pieces/cells | Of these placed pieces/cells | Of these expired pieces/cells | Old-source rush placed during5 pieces/cells | Old-source rush expired during5 pieces/cells | Cleanup hit/empty |','|---|---:|---:|---:|---:|---:|---:|');
 for(const [key,{stageFive:s}] of Object.entries(summary.arms)){const n=s.newGenerated,p=s.priorGenerated;l.push(`| ${key} | ${n.generatedRushPieces}/${n.generatedRushCells} | ${n.placedRushPieces}/${n.placedRushCells} | ${n.expiredRushPieces}/${n.expiredRushCells} | ${p.placedRushPieces}/${p.placedRushCells} | ${p.expiredRushPieces}/${p.expiredRushCells} | ${s.cleanupHitCells}/${s.cleanupEmptyTriggers} |`);}
 l.push('', 'The stage5 window starts in the first resulting shift5 state. Generation on the entering command counts as stage5 generation, while that placement, expiry and cleanup happened before the window and are excluded from window counts. Old-source means generated before stage5; the recorded entry separately identifies waiting tray pieces and existing board rush cells. Simulator milliseconds are execution time, not player duration. A rush piece can ship partly and later expire; those piece counts overlap.',
 '', `Paired prefixes verified: ${summary.pairs.length}/128. Initial state and all command-boundary states before the first stage5 generation match except ruleset/run identity, and the entering command/pre-refill events match. ${summary.pairs.filter(p=>p.intentionalTerminalNoDraw).length} pairs first reach that boundary as an immediate rules15 terminal no-draw win.`,
 `Rules14 terminal unused refills: ${Object.entries(summary.arms).filter(([key])=>key.startsWith('v14/')).reduce((n,[,s])=>n+s.stageFive.terminalUnusedRefills,0)}; rules15 terminal unused refills: ${Object.entries(summary.arms).filter(([key])=>key.startsWith('v15/')).reduce((n,[,s])=>n+s.stageFive.terminalUnusedRefills,0)}. These intentional final-refill differences are retained, not normalized away.`,
 '', 'Same seed is paired input only. Stage5 trait changes can alter shape/color draw consumption, visible decisions and all subsequent RNG trajectories. These outcomes therefore do not establish that every difference is caused only by urgency. They do not estimate human win rate, optimal play, fun or WeChat performance. This study selects no balance parameters.',
 '', `Released rules14: ${summary.released14.fileCount} source files byte-match the archived release; original visible scorer unchanged. Full frozen source is in source/, cases/ contains commands/events/checksums/final states and piece ledgers, and pairs.json contains prefix validation and outcomes.`,
 '', '## Policy and cleanup breakdown','', '| Arm/policy/cleanup | Won/cases | Failed/capped | Reached5 | Won/reached5 | Failure stages |','|---|---:|---:|---:|---:|---|');
 for(const [key,s] of Object.entries(summary.groups))l.push(`| ${key} | ${s.won}/${s.cases} | ${s.failed}/${s.capped} | ${s.stageFive.reached} | ${s.stageFive.won}/${s.stageFive.reached} | ${JSON.stringify(s.failureStages)} |`);
 return l.join('\n')+'\n';
}
export async function runStageFiveStudy(out,{pilotOnly=false}={}){
 preregisterStageFive(out);const source=stageFiveSourceBinding(),released14=preserveSource(out,source),apis=await loadApis();
 for(const v of [14,15]){assert.equal(apis[v].config.special.weights.rush,6);assert.equal(apis[v].config.special.dailyRushWeight,12);}
 const result=runStageFiveCheckpointed({out,cases:buildStageFiveCases(),source,readSource:stageFiveSourceBinding,runCase:(spec,context)=>simulateStageFiveCase(spec,context,apis),verifyCase:record=>verifyStageFiveCase(record,apis),verifyPairs:pairsFor,pilotOnly});
 const arms={},groups={};for(const version of [14,15])for(const mode of PROTOCOL.modes){const rows=result.records.filter(r=>r.spec.version===version&&r.spec.mode===mode);if(rows.length)arms[`v${version}/${mode}`]=summarizeGroup(rows);for(const strategy of PROTOCOL.strategies)for(const cleanup of PROTOCOL.cleanup){const subset=rows.filter(r=>r.spec.strategy===strategy&&r.spec.cleanup===cleanup);if(subset.length)groups[`v${version}/${mode}/${strategy}/${cleanup}`]=summarizeGroup(subset);}}
 const pairs=pairsFor(result.records),summary={status:result.status,protocol:PROTOCOL,sourceSha256:source.sha256,caseCount:result.records.length,wallMs:result.elapsedMs,pilotMs:result.pilotMs,spentAfterPilotMs:result.spentAfterPilotMs,traceCommands:sum(result.records,'commands'),codecSamples:sum(result.records,'codecSamples'),released14,arms,groups,pairs,caseIds:result.records.map(r=>r.id)};
 atomicJson(join(out,'pairs.json'),pairs);atomicJson(join(out,'summary.json'),summary);writeFileSync(join(out,'report.md'),readableReport(summary));return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2],out=resolve(process.argv[3]??join(ROOT,'artifacts/stage-five-pressure'));assert.ok(['--preregister','--pilot-source-frozen','--source-frozen'].includes(mode),'Use --preregister or source-frozen modes only after controller freeze');
 const result=mode==='--preregister'?{status:'preregistered',...preregisterStageFive(out)}:await runStageFiveStudy(out,{pilotOnly:mode==='--pilot-source-frozen'});console.log(JSON.stringify(result));
}
