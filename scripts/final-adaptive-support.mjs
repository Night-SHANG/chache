/** Checkpoint and piece-level accounting support; no generation or policy overrides. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const atomicJson=(path,value)=>{writeFileSync(path+'.pending',JSON.stringify(value,null,2)+'\n');renameSync(path+'.pending',path);};
export const FINAL_ADAPTIVE_PROTOCOL=Object.freeze({
 id:'final-adaptive-multishape-v1',preregisteredAt:'2026-10-07T04:46:00Z',
 finiteSeeds:Object.freeze([1,32]),endlessSeeds:Object.freeze([1,8]),strategies:Object.freeze(['route','greedy']),cleanup:Object.freeze(['orders','placements']),
 finiteModes:Object.freeze(['standard','daily']),finiteCases:256,endlessCases:32,totalCases:288,finitePlacementCap:300,endlessPlacementCap:120,budgetMs:180000,
 policies:'Unmodified chooseEntranceMove from scripts/simulate-entrance.mjs; route and greedy. Tray order then y/x supplies the original deterministic tie order.',
 information:'Policy receives visible board, current candidate geometry/cargo/traits, current orders and active rules only. No future generation calls, hidden RNG or supply tape.',
 rules:'Real production rules14 adaptive generation: ordinary/endless rush6% and daily12%, fixed across shifts, same ordinary shape and unlocked cargo distribution. No tools or authored guides. No ramps.',
 pairing:'Same seed is paired input only; ordinary/daily and different decisions need not share future RNG trajectories.',
 caps:'Retain every finite cap at300 and every endless observation cap at120; endless caps are censored observations, never wins or survival estimates.',
 codecSampling:'Strict encode/decode at creation, every10 accepted commands, every transition containing multi-cell rush candidates or board rush, and final state; tampered checksum envelope rejected at every sample.',
 accounting:'Distinct generated IDs; placed rush keyed by unique bornAtPlacement. A piece may be partly shipped and later expire, so shipped and expired piece counts overlap. Residual active and waste cells tracked separately.',
 cleanupAccounting:'Derive all triggers from pre-command progress and actual shipment count/placement; count actual cleanup cells and empty triggers even when production omits empty cleanup events.',
 entitlement:'Read-only economyVersion2 baseCoins formula and hypothetical first-win daily3x only. No AccountService, wallet mutation, or actual payout claim.',
 reporting:'Validation of approved fixed rules, not tuning. No human win rate, coins/minute, fun, optimality, or browser/WeChat acceptance inference. Separate from the448 fixed-tape experiment.',
});

export function validatePlacementCap(cap,mode){
 const limit=mode==='endless'?FINAL_ADAPTIVE_PROTOCOL.endlessPlacementCap:FINAL_ADAPTIVE_PROTOCOL.finitePlacementCap;
 assert.ok(Number.isSafeInteger(cap)&&cap>0&&cap<=limit,'Invalid placement cap');return cap;
}
export function buildFinalCases(){
 const cases=[];
 for(let seed=1;seed<=32;seed++)for(const strategy of FINAL_ADAPTIVE_PROTOCOL.strategies)for(const cleanup of FINAL_ADAPTIVE_PROTOCOL.cleanup)for(const mode of FINAL_ADAPTIVE_PROTOCOL.finiteModes)
  cases.push({id:`v14-${mode}-${strategy}-${cleanup}-s${seed}`,seed,strategy,cleanup,mode,maxPlacements:300});
 for(let seed=1;seed<=8;seed++)for(const strategy of FINAL_ADAPTIVE_PROTOCOL.strategies)for(const cleanup of FINAL_ADAPTIVE_PROTOCOL.cleanup)
  cases.push({id:`v14-endless-${strategy}-${cleanup}-s${seed}`,seed,strategy,cleanup,mode:'endless',maxPlacements:120});
 return cases;
}

export function runCheckpointed({out,cases,source,runCase,verifyCase,readSource=()=>source,budgetMs=FINAL_ADAPTIVE_PROTOCOL.budgetMs,stopAfter=Infinity,now=()=>performance.now()}){
 assert.ok(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=FINAL_ADAPTIVE_PROTOCOL.budgetMs,'Invalid runtime budget');
 assert.ok(stopAfter===Infinity||Number.isSafeInteger(stopAfter)&&stopAfter>=0,'Invalid checkpoint stop');
 assert.equal(new Set(cases.map(c=>c.id)).size,cases.length,'Duplicate protocol case');
 for(const spec of cases)validatePlacementCap(spec.maxPlacements,spec.mode);
 mkdirSync(join(out,'cases'),{recursive:true});
 const binding={protocol:FINAL_ADAPTIVE_PROTOCOL,cases,source},bindingPath=join(out,'binding.json'),records=[];
 const started=now();let current=null,executed=0;
 try{
  if(existsSync(bindingPath))assert.deepEqual(JSON.parse(readFileSync(bindingPath,'utf8')),binding,'Resume source/protocol binding mismatch');else atomicJson(bindingPath,binding);
  for(const spec of cases){
   if(now()-started>=budgetMs||executed>=stopAfter)break;
   current={...spec,command:null,trace:[]};
   assert.deepEqual(readSource(),source,'Source drift before case');
   const path=join(out,'cases',spec.id+'.json');
   if(existsSync(path)){
    const saved=JSON.parse(readFileSync(path,'utf8')),{evidenceSha256,...body}=saved;
    assert.equal(sha256(JSON.stringify(body)),evidenceSha256,'Stored case evidence hash mismatch');
    assert.equal(saved.sourceSha256,source.sha256,'Stored case source mismatch');assert.deepEqual(saved.spec,spec,'Stored case specification mismatch');assert.equal(saved.id,spec.id,'Stored case identity mismatch');
    verifyCase(saved);records.push(saved);continue;
   }
   const measured=runCase(spec,current),body={...measured,id:spec.id,spec,sourceSha256:source.sha256};
   verifyCase(body);assert.deepEqual(readSource(),source,'Source drift during case');
   const record={...body,evidenceSha256:sha256(JSON.stringify(body))};atomicJson(path,record);records.push(record);executed++;
   atomicJson(join(out,'progress.json'),{sourceSha256:source.sha256,status:'running',complete:records.length,total:cases.length,lastCaseId:spec.id,elapsedMs:now()-started});
  }
  const result={status:records.length===cases.length?'complete':'paused',records,executed,elapsedMs:now()-started};
  assert.deepEqual(readSource(),source,'Source drift after validation');
  atomicJson(join(out,'progress.json'),{sourceSha256:source.sha256,status:result.status,complete:records.length,total:cases.length,elapsedMs:result.elapsedMs});return result;
 }catch(error){atomicJson(join(out,'fault.json'),{source,commandLine:process.argv,error:String(error.stack??error),current});throw error;}
}

export function createRushLedger(){return {seen:new Set(),generated:[],pieces:new Map(),owners:new Map(),allGeneratedPieces:0,allGeneratedCells:0,cleanupTriggers:0,cleanupHitCells:0,cleanupEmptyTriggers:0};}
export function observeGenerated(ledger,candidates,cellCount){
 for(const piece of candidates){if(ledger.seen.has(piece.id))continue;ledger.seen.add(piece.id);const cells=cellCount(piece);assert.ok(Number.isSafeInteger(cells)&&cells>0,'Generated piece has invalid cells');ledger.allGeneratedPieces++;ledger.allGeneratedCells+=cells;
  if(piece.trait==='rush')ledger.generated.push({id:piece.id,shapeId:piece.shapeId,cargo:piece.cargo,cells});
 }
}
export function observeTransition(ledger,before,after,command,events,cleanupTargets){
 if(command.type!=='place')return;
 const candidate=before.candidates.find(p=>p.id===command.pieceId),placed=events.find(e=>e.type==='placed');assert.ok(candidate&&placed,'Accepted placement lacks candidate or event');
 if(candidate.trait==='rush'){
  const born=after.successfulPlacements;assert.ok(!ledger.pieces.has(born),'Rush birth placement reused');
  const record={id:candidate.id,bornAtPlacement:born,shapeId:candidate.shapeId,cargo:candidate.cargo,placedCells:[...placed.cells],shippedCells:[],expiredCells:[],clearedWasteCells:[],activeCells:[...placed.cells],wasteCells:[]};ledger.pieces.set(born,record);
  for(const cell of placed.cells){assert.ok(!ledger.owners.has(cell),'Rush placement overlaps an existing tracked cell');ledger.owners.set(cell,{born,status:'active'});}
 }
 const remove=(cells,cause)=>{for(const cell of cells??[]){const owner=ledger.owners.get(cell);if(!owner)continue;const record=ledger.pieces.get(owner.born);
  if(owner.status==='active'){assert.equal(cause,'shipment','Only shipments remove active rush in the no-tool baseline');record.shippedCells.push(cell);record.activeCells=record.activeCells.filter(i=>i!==cell);}
  else{record.clearedWasteCells.push(cell);record.wasteCells=record.wasteCells.filter(i=>i!==cell);}
  ledger.owners.delete(cell);
 }};
 for(const event of events){
  if(event.type==='shipment'){remove(event.cells,'shipment');remove(event.extraClearedCells,'hazard');}
  if(event.type==='cleanup')remove(event.cells,'cleanup');
  if(event.type==='rushExpired')for(const cell of event.cells){const owner=ledger.owners.get(cell);assert.equal(owner?.status,'active','Expiry lacks an active rush owner');const record=ledger.pieces.get(owner.born);record.expiredCells.push(cell);record.activeCells=record.activeCells.filter(i=>i!==cell);record.wasteCells.push(cell);owner.status='waste';}
 }
 if(before.cleanup){const shipments=events.filter(e=>e.type==='shipment').length,total=before.cleanup.progress+(before.cleanup.branch==='orders'?shipments:1),triggers=Math.floor(total/cleanupTargets[before.cleanup.branch]),hits=events.filter(e=>e.type==='cleanup').reduce((n,e)=>n+e.cells.length,0);assert.ok(hits<=triggers,'Cleanup clears more cells than triggers');ledger.cleanupTriggers+=triggers;ledger.cleanupHitCells+=hits;ledger.cleanupEmptyTriggers+=triggers-hits;}
}
export function summarizeRush(ledger){
 const pieces=[...ledger.pieces.values()],sum=key=>pieces.reduce((n,p)=>n+p[key].length,0);
 const value={allGeneratedPieces:ledger.allGeneratedPieces,allGeneratedCells:ledger.allGeneratedCells,generatedPieces:ledger.generated.length,generatedCells:ledger.generated.reduce((n,p)=>n+p.cells,0),generatedMulticellPieces:ledger.generated.filter(p=>p.cells>1).length,placedPieces:pieces.length,placedCells:sum('placedCells'),shippedPieces:pieces.filter(p=>p.shippedCells.length).length,shippedCells:sum('shippedCells'),fullyShippedPieces:pieces.filter(p=>p.shippedCells.length===p.placedCells.length).length,partiallyShippedPieces:pieces.filter(p=>p.shippedCells.length>0&&p.shippedCells.length<p.placedCells.length).length,expiredPieces:pieces.filter(p=>p.expiredCells.length).length,expiredCells:sum('expiredCells'),remainingActivePieces:pieces.filter(p=>p.activeCells.length).length,remainingActiveCells:sum('activeCells'),remainingWasteCells:sum('wasteCells'),clearedWasteCells:sum('clearedWasteCells'),cleanupTriggers:ledger.cleanupTriggers,cleanupHitCells:ledger.cleanupHitCells,cleanupEmptyTriggers:ledger.cleanupEmptyTriggers};
 assert.equal(value.placedCells,value.shippedCells+value.expiredCells+value.remainingActiveCells,'Rush cell conservation');assert.equal(value.expiredCells,value.clearedWasteCells+value.remainingWasteCells,'Expired rush cell conservation');return value;
}
