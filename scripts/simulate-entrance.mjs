/** Fixed, visible-information v11/v14 entry-reservation comparison; never tunes gameplay. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRunV11,applyCommandV11} from '../src/domain/v11/engine.ts';
import {createRunV14,applyCommandV14} from '../src/domain/v14/engine.ts';
import * as oldBoard from '../src/domain/v11/board.ts';
import * as newBoard from '../src/domain/v14/board.ts';
import {checksumV11} from '../src/domain/v11/replay.ts';
import {checksumV14} from '../src/domain/v14/replay.ts';
import {RULES_V11_CONFIG as CONFIG} from '../src/domain/v11/content.ts';
import {baseCoins} from '../src/application/economy.ts';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sum=xs=>xs.reduce((a,b)=>a+b,0),sha=s=>createHash('sha256').update(s).digest('hex');
const boardFns=state=>state.rulesetVersion===14?{moves:newBoard.findLegalMovesV14,cells:newBoard.pieceCellsV14,docks:newBoard.docksV14,select:newBoard.selectOrderGroupV14,neighbors:newBoard.neighborsV14}:{moves:oldBoard.findLegalMovesV11,cells:oldBoard.pieceCellsV11,docks:oldBoard.docksV11,select:oldBoard.selectOrderGroupV11,neighbors:oldBoard.neighborsV11};
const create=(version,seed)=>version===14?createRunV14({seed,mode:'standard'}):createRunV11({seed,mode:'standard'});
const apply=(state,command)=>(state.rulesetVersion===14?applyCommandV14:applyCommandV11)(state,command);
const checksum=state=>(state.rulesetVersion===14?checksumV14:checksumV11)(state);
export const ENTRANCE_PROTOCOL=Object.freeze({id:'reserved-entries-paired-v1',seeds:[1,32],versions:[11,14],strategies:['route','greedy'],cleanup:['orders','placements'],cases:256,maxPlacements:300,
 information:'Only visible board, candidate shapes/colors, current orders and active rules. No generated candidates/orders or future RNG inspected.',
 policy:'Same geometric scoring and tray/y/x tie order as refinement study; v14 excludes reserved entries before evaluating moves. v11 parity is separately tested.',
 pairing:'Same seed, strategy and cleanup; once moves differ the generated states can diverge. No enforced matching of later pieces.',
 scope:'Ordinary five-shift, unguided, no tools. 49 total cells in both versions; v14 has four reserved empty cells and45 placeable positions. Generation weights remain unchanged.',
 reporting:'All preregistered cases including caps retained; no human win-rate, fun or optimal-policy inference; no tuning.',budgetMs:180000});
function projection(state,move,f){
 const piece=state.candidates.find(p=>p.id===move.pieceId),size=state.boardSize;
 const cells=f.cells(piece).map(p=>(p.y+move.origin.y)*size+p.x+move.origin.x),board=[...state.board],cellTraits=[...state.cellTraits];
 for(const cell of cells){board[cell]=piece.cargo;cellTraits[cell]=piece.trait?{kind:piece.trait}:null;}
 const view={...state,board,cellTraits},pending=[...state.orders],cleared=new Set(),docks=f.docks(view);let value=0,batches=0;
 pending.sort((a,b)=>docks.findIndex(d=>d.id===a.dockId)-docks.findIndex(d=>d.id===b.dockId));
 while(pending.length){let group=null,index=-1;for(let i=0;i<pending.length;i++){group=f.select(view,pending[i]);if(group){index=i;break;}}if(!group)break;
  const [order]=pending.splice(index,1);batches++;const base=order.baseScore+Math.max(0,group.group.units-order.amount)*CONFIG.score.overfill+(group.path.length-1)*CONFIG.score.routeDepth;
  value+=Math.floor(base*(100+(batches-1)*CONFIG.score.chainPercent)/100);
  const extra=group.group.cells.some(i=>cellTraits[i]?.kind==='hazard')?[...new Set(group.group.cells.flatMap(i=>f.neighbors(i,size)))].sort((a,b)=>a-b).filter(i=>cellTraits[i]?.kind==='waste').slice(0,1):[];
  for(const cell of [...group.group.cells,...extra]){cleared.add(cell);board[cell]=null;cellTraits[cell]=null;}
 }return {piece,cells,cleared,value};
}
export function chooseEntranceMove(state,strategy='route'){
 assert.ok([11,14].includes(state.rulesetVersion));assert.ok(ENTRANCE_PROTOCOL.strategies.includes(strategy));if(state.phase!=='input')return null;
 const f=boardFns(state);let best=null,bestValue=-Infinity,bestSecondary=-Infinity;
 for(const move of f.moves(state)){const p=projection(state,move,f);let value,secondary=0;
  if(strategy==='greedy'){value=p.cleared.size-p.cells.length;secondary=p.value;}
  else{value=p.value*15+p.cleared.size*25-p.cells.length*3;for(const cell of p.cells){for(const n of f.neighbors(cell,state.boardSize)){if(state.board[n]===p.piece.cargo)value+=14;else if(state.board[n]===null)value++;}if(f.docks(state).some(d=>d.entry.y*state.boardSize+d.entry.x===cell))value-=300;}if(state.orders.some(o=>o.cargo===p.piece.cargo))value+=12;}
  if(value>bestValue||value===bestValue&&secondary>bestSecondary){best=move;bestValue=value;bestSecondary=secondary;}
 }return best;
}
function sourceBinding(){const files=['scripts/simulate-entrance.mjs','src/application/economy.ts','src/domain/random.ts','src/domain/pieces.ts','src/shared/data.ts','src/domain/types.ts','src/domain/rulesets/v1/content.ts','src/domain/rulesets/v1/types.ts','package.json','package-lock.json'];
 for(const version of [11,14])for(const n of readdirSync(join(ROOT,`src/domain/v${version}`)))if(n.endsWith('.ts'))files.push(`src/domain/v${version}/${n}`);
 const h=createHash('sha256');for(const n of files.sort()){h.update(n);h.update(readFileSync(join(ROOT,n)));}return h.digest('hex');}
const atomic=(path,value)=>{writeFileSync(path+'.pending',JSON.stringify(value,null,2)+'\n');renameSync(path+'.pending',path);};
export function runEntranceComparison(out){
 mkdirSync(out,{recursive:true});const source=sourceBinding(),protocol={...ENTRANCE_PROTOCOL,sourceSha256:source};const protocolPath=join(out,'protocol.json');
 if(existsSync(protocolPath))assert.deepEqual(JSON.parse(readFileSync(protocolPath,'utf8')),protocol,'Resume must retain protocol/source');else atomic(protocolPath,protocol);
 const records=[],started=performance.now();let current=null;
 try{for(let seed=1;seed<=32;seed++)for(const strategy of ENTRANCE_PROTOCOL.strategies)for(const cleanup of ENTRANCE_PROTOCOL.cleanup)for(const version of ENTRANCE_PROTOCOL.versions){
  assert.ok(performance.now()-started<ENTRANCE_PROTOCOL.budgetMs,'Case boundary budget exceeded');const id=`v${version}-${strategy}-${cleanup}-s${seed}`,path=join(out,id+'.json');
  if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));assert.equal(saved.sourceSha256,source);assert.equal(saved.id,id);const {evidenceSha256,...body}=saved;assert.equal(sha(JSON.stringify(body)),evidenceSha256,'Stored case content hash');let replay=create(version,seed);for(const step of saved.trace){const r=apply(replay,step.command);assert.equal(r.error,undefined);assert.equal(checksum(r.state),step.checksum);replay=r.state;}assert.equal(checksum(replay),saved.finalChecksum);records.push(saved);continue;}
  let state=create(version,seed),placements=0;const trace=[];current={id,seed,strategy,cleanup,version,trace};
  while(state.phase!=='result'&&placements<300){const move=state.phase==='input'?chooseEntranceMove(state,strategy):null;const command=state.phase==='cleanup'?{type:'chooseCleanup',branch:cleanup}:move?{type:'place',...move}:null;assert.ok(command,'Nonterminal ordinary no-tool state has no command');const result=apply(state,command);assert.equal(result.error,undefined);state=result.state;if(command.type==='place')placements++;trace.push({command,checksum:checksum(state),events:result.events});if(version===14)for(const cell of newBoard.reservedEntryCellsV14(state))assert.equal(state.board[cell],null);}
  let replay=create(version,seed);for(const step of trace){const r=apply(replay,step.command);assert.equal(r.error,undefined);assert.equal(checksum(r.state),step.checksum);replay=r.state;}
  const record={...current,sourceSha256:source,status:state.result??'capped',failureStage:state.result==='failed'?state.shift:null,placements,commands:state.commandIndex,orders:state.completedOrders,score:state.score,coins:baseCoins('inbound',state.completedOrders,state.score),finalChecksum:checksum(state),finalState:state};record.evidenceSha256=sha(JSON.stringify(record));atomic(path,record);records.push(record);
 }}catch(error){atomic(join(out,'fault.json'),{sourceSha256:source,error:String(error.stack??error),current});throw error;}
 assert.equal(records.length,256);assert.equal(sourceBinding(),source,'No domain source drift during study');const summaries=[];
 for(const version of [11,14]){const group=records.filter(r=>r.version===version),failures={};for(const r of group)if(r.failureStage)failures[r.failureStage]=(failures[r.failureStage]??0)+1;summaries.push({version,cases:group.length,won:group.filter(r=>r.status==='won').length,failed:group.filter(r=>r.status==='failed').length,capped:group.filter(r=>r.status==='capped').length,failureStages:failures,meanPlacements:sum(group.map(r=>r.placements))/group.length,meanOrders:sum(group.map(r=>r.orders))/group.length,meanScore:sum(group.map(r=>r.score))/group.length,meanCoins:sum(group.map(r=>r.coins))/group.length});}
 const summary={protocol,wallMs:performance.now()-started,caseCount:records.length,traceCommands:sum(records.map(r=>r.trace.length)),summaries,caseIds:records.map(r=>r.id)};atomic(join(out,'summary.json'),summary);return summary;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=resolve(process.argv[2]??join(ROOT,'artifacts/entrance-comparison'));console.log(JSON.stringify(runEntranceComparison(out)));}
