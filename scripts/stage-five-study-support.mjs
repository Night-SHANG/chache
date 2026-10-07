/** Bounded preregistration and checkpoint mechanics; never changes game rules. */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {atomicJson,sha256} from './final-adaptive-support.mjs';
export {atomicJson,sha256};
export const STAGE_FIVE_PROTOCOL=Object.freeze({
 id:'stage-five-rush-actual-generator-v1',preregisteredAt:'2026-10-07T06:24:00Z',seeds:Object.freeze([1,16]),versions:Object.freeze([14,15]),modes:Object.freeze(['standard','daily']),strategies:Object.freeze(['route','greedy']),cleanup:Object.freeze(['orders','placements']),totalCases:256,casesPerModeVersion:64,pilotCases:4,maxPlacements:300,budgetMs:180000,
 policy:'Unmodified chooseEntranceMove from simulate-entrance.mjs. Both versions use its rules14 board/scorer identity, after board-equivalence checks; same tray/y/x tie order. Only visible board, traits, candidates, current orders, stage and active levels are supplied. No future RNG or supply tape.',
 generator:'Real production adaptive generators. Rules14 unchanged. Rules15 standard/daily stages1–4 match rules14; stage5 new pieces are100% rush with ordinary adaptive shape/color, including one-cell shapes. Existing board/tray unchanged. No tools, no guides, no tuning, no overtime or direct endless cases.',
 pairing:'Same seed supplies paired input; later decisions/generation streams can diverge. Initial state and all states before the first stage5 generation transition must match exactly except rulesetVersion/runConfigId, with matching entering command and pre-refill events. Terminal30 skipped order/candidate refill is a separate intentional difference.',
 stageWindow:'Entry is the first resulting state at shift5. New generation on that entering command belongs to stage5. Window placements, expiry and cleanup begin with commands whose BEFORE state is already shift5; entering placement is excluded. Candidate/board cargo brought into stage5 is reported separately. Durations are command/placement counts and simulator milliseconds, never human time.',
 accounting:'Rush source cohort is generated-before-stage5 versus generated-at-stage5. Generated, placed, shipped, expired pieces/cells are distinct; partly shipped pieces can later expire. Cleanup hit cells/empty triggers derive from actual progress. Conditional win denominators are reached-stage5 cases, alongside whole-run outcomes.',
 validation:'Every accepted command, event and checksum replayed; strict encode/decode and tampered digest rejection at creation, every10 commands, every active/multicell-rush transition and final state. Full command logs and final state retained. Frozen source hash checked at each case boundary. Released rules14 bytes pinned to final-adaptive-validation/source.',
 stopping:'Retain the first4 pilot cases if valid. Remaining preregistered cases share a180000ms cumulative budget, checked at finite case boundaries; one bounded <=300-placement case may cross the boundary. Resume never duplicates a completed case or resets budget. Stop/dump on real reducer, replay, codec, prefix or source error. No seed expansion or parameter repair.',
 limits:'Fixed visible policies, not human win rates, optimality, fun, or browser/WeChat acceptance. Outcome differences do not isolate urgency: generated shapes/colors and future streams may diverge; terminal refill behavior differs too.',
});
export function validateStageFiveCap(cap){assert.ok(Number.isSafeInteger(cap)&&cap>0&&cap<=STAGE_FIVE_PROTOCOL.maxPlacements,'Invalid placement cap');return cap;}
export function buildStageFiveCases(){const cases=[];for(let seed=1;seed<=16;seed++)for(const strategy of STAGE_FIVE_PROTOCOL.strategies)for(const cleanup of STAGE_FIVE_PROTOCOL.cleanup)for(const mode of STAGE_FIVE_PROTOCOL.modes)for(const version of STAGE_FIVE_PROTOCOL.versions)cases.push({id:`v${version}-${mode}-${strategy}-${cleanup}-s${seed}`,version,seed,strategy,cleanup,mode,maxPlacements:300});return cases;}
export function stageFiveVisibleObservation(state){const {boardSize,board,cellTraits,candidates,orders,phase,shift,levels}=state;return {rulesetVersion:14,boardSize,board,cellTraits,candidates,orders,phase,shift,levels};}
export function withoutRulesetIdentity(state){const copy=structuredClone(state);delete copy.rulesetVersion;delete copy.runConfigId;return copy;}
export function verifyPairedPrefix(oldRecord,newRecord){
 assert.equal(oldRecord.initialPrefixHash,newRecord.initialPrefixHash,'Initial paired prefix mismatch');
 const oldFirst=oldRecord.stageFive.firstGenerationCommand,newFirst=newRecord.stageFive.firstGenerationCommand;
 const first=Math.min(oldFirst??Infinity,newFirst??Infinity);let matchedStates=1,matchedCommands=0,intentionalTerminalNoDraw=false;
 assert.equal(oldRecord.trace.length>0,newRecord.trace.length>0,'Empty prefix mismatch');
 for(let i=0;i<Math.max(oldRecord.trace.length,newRecord.trace.length);i++){
  const a=oldRecord.trace[i],b=newRecord.trace[i];if((a?.index??b?.index)>first)break;
  assert.ok(a&&b,'Paired prefix length mismatch');assert.deepEqual(a.command,b.command,'Paired prefix command mismatch');matchedCommands++;
  if(a.index===first){
   intentionalTerminalNoDraw=!!b.terminalSkippedRefill&&newRecord.status==='won'&&newFirst===null;
   assert.ok(oldFirst===newFirst||intentionalTerminalNoDraw,'First stage5 generation index mismatch');
   const preRefillEvents=events=>events.filter(event=>event.type!=='result'&&event.type!=='rescue');
   assert.deepEqual(preRefillEvents(a.events),preRefillEvents(b.events),'Paired entering pre-refill events mismatch');break;
  }
  assert.equal(a.prefixHash,b.prefixHash,'Paired pre-stage5 prefix state mismatch');assert.deepEqual(a.events,b.events,'Paired prefix event mismatch');matchedStates++;
 }
 return {matchedStates,matchedCommands,firstGenerationCommand:Number.isFinite(first)?first:null,intentionalTerminalNoDraw,preStageFiveTerminal:!Number.isFinite(first)};
}
export function runStageFiveCheckpointed({out,cases,source,runCase,verifyCase,verifyPairs=()=>{},readSource=()=>source,pilotOnly=false,budgetMs=STAGE_FIVE_PROTOCOL.budgetMs,now=()=>performance.now()}){
 assert.ok(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=STAGE_FIVE_PROTOCOL.budgetMs,'Invalid runtime budget');assert.equal(new Set(cases.map(c=>c.id)).size,cases.length,'Duplicate protocol case');for(const c of cases)validateStageFiveCap(c.maxPlacements);
 mkdirSync(join(out,'cases'),{recursive:true});const path=join(out,'binding.json'),binding={protocol:STAGE_FIVE_PROTOCOL,cases,source},records=[];
 const progressPath=join(out,'progress.json'),previous=existsSync(progressPath)?JSON.parse(readFileSync(progressPath,'utf8')):null;
 let current=null,executed=0,fullStarted=null,spentMs=previous?.spentAfterPilotMs??0,pilotMs=previous?.pilotMs??0,status='paused';const started=now();
 const elapsedBudget=()=>spentMs+(fullStarted===null?0:now()-fullStarted);
 try{
  if(existsSync(path))assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),binding,'Resume source/protocol binding mismatch');else atomicJson(path,binding);
  for(let i=0;i<cases.length;i++){
   if(pilotOnly&&i>=STAGE_FIVE_PROTOCOL.pilotCases)break;
   const spec=cases[i];current={...spec,command:null,trace:[]};assert.deepEqual(readSource(),source,'Source drift before case');
   const casePath=join(out,'cases',spec.id+'.json');
   if(existsSync(casePath)){
    const saved=JSON.parse(readFileSync(casePath,'utf8')),{evidenceSha256,...body}=saved;assert.equal(sha256(JSON.stringify(body)),evidenceSha256,'Stored case evidence hash mismatch');assert.equal(saved.sourceSha256,source.sha256,'Stored case source mismatch');assert.deepEqual(saved.spec,spec,'Stored case specification mismatch');assert.equal(saved.id,spec.id,'Stored case identity mismatch');verifyCase(saved);records.push(saved);verifyPairs(records);continue;
   }
   if(i>=STAGE_FIVE_PROTOCOL.pilotCases){if(fullStarted===null)fullStarted=now();if(elapsedBudget()>=budgetMs){status='budget-exhausted';break;}}
   const caseStarted=now(),measured=runCase(spec,current),body={...measured,id:spec.id,spec,sourceSha256:source.sha256};verifyCase(body);assert.deepEqual(readSource(),source,'Source drift during case');verifyPairs([...records,body]);
   const record={...body,evidenceSha256:sha256(JSON.stringify(body))};atomicJson(casePath,record);records.push(record);executed++;if(i<STAGE_FIVE_PROTOCOL.pilotCases)pilotMs+=now()-caseStarted;
   atomicJson(progressPath,{sourceSha256:source.sha256,status:'running',complete:records.length,total:cases.length,lastCaseId:spec.id,spentAfterPilotMs:elapsedBudget(),pilotMs});
  }
  if(records.length===cases.length)status='complete';else if(pilotOnly&&records.length>=Math.min(4,cases.length))status='pilot-complete';else if(elapsedBudget()>=budgetMs)status='budget-exhausted';
  assert.deepEqual(readSource(),source,'Source drift after study');const result={status,records,executed,elapsedMs:now()-started,spentAfterPilotMs:elapsedBudget(),pilotMs};
  atomicJson(progressPath,{sourceSha256:source.sha256,status,complete:records.length,total:cases.length,elapsedMs:result.elapsedMs,spentAfterPilotMs:result.spentAfterPilotMs,pilotMs});return result;
 }catch(error){atomicJson(join(out,'fault.json'),{source,commandLine:process.argv,error:String(error.stack??error),current});throw error;}
}

export function createStageFiveTracker(){return {generated:new Map(),entry:null,firstGenerationCommand:null,commands:0,placements:0,placedRush:[],expiredByBirth:new Map(),expiredCells:0,cleanupTriggers:0,cleanupHitCells:0,cleanupEmptyTriggers:0,terminalUnusedRefills:0};}
export function observeStageFiveCandidates(tracker,state,cellCount){
 const fresh=[];for(const piece of state.candidates)if(!tracker.generated.has(piece.id)){const row={...piece,cells:cellCount(piece),stage:state.shift,commandIndex:state.commandIndex,terminalUnused:state.result==='won'};tracker.generated.set(piece.id,row);fresh.push(row);if(state.shift===5&&tracker.firstGenerationCommand===null)tracker.firstGenerationCommand=state.commandIndex;if(row.terminalUnused)tracker.terminalUnusedRefills++;}return fresh;
}
export function observeStageFiveTransition(tracker,before,after,command,events,cellCount,cleanupTargets,now=()=>performance.now()){
 if(before.shift<5&&after.shift===5){const beforeIds=new Set(before.candidates.map(p=>p.id));tracker.entry={commandIndex:after.commandIndex,placements:after.successfulPlacements,completedOrders:after.completedOrders,simulatorStartedMs:now(),preexistingCandidateIds:after.candidates.filter(p=>beforeIds.has(p.id)&&p.id!==command.pieceId).map(p=>p.id),preexistingBoardCells:after.board?.filter(c=>c!==null).length??0,preexistingBoardRushCells:after.cellTraits.filter(t=>t?.kind==='rush').length};}
 const generated=observeStageFiveCandidates(tracker,after,cellCount);
 if(before.shift===5){tracker.commands++;
  if(command.type==='place'){
   tracker.placements++;const piece=before.candidates.find(p=>p.id===command.pieceId),placed=events.find(e=>e.type==='placed');assert.ok(piece&&placed,'Stage5 accepted placement lacks candidate/event');
   if(piece.trait==='rush'){const origin=tracker.generated.get(piece.id);assert.ok(origin,'Unknown stage5 placed rush origin');tracker.placedRush.push({id:piece.id,bornAtPlacement:after.successfulPlacements,cells:placed.cells.length,sourceStage:origin.stage});}
   for(const event of events)if(event.type==='rushExpired')for(const cell of event.cells){tracker.expiredCells++;const born=before.cellTraits[cell]?.bornAtPlacement;tracker.expiredByBirth.set(born,(tracker.expiredByBirth.get(born)??0)+1);}
   if(before.cleanup){const shipments=events.filter(e=>e.type==='shipment').length,triggers=Math.floor((before.cleanup.progress+(before.cleanup.branch==='orders'?shipments:1))/cleanupTargets[before.cleanup.branch]),hits=events.filter(e=>e.type==='cleanup').reduce((n,e)=>n+e.cells.length,0);assert.ok(hits<=triggers);tracker.cleanupTriggers+=triggers;tracker.cleanupHitCells+=hits;tracker.cleanupEmptyTriggers+=triggers-hits;}
  }
 }
 return generated;
}
