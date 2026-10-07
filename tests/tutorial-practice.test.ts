import test from 'node:test';import assert from 'node:assert/strict';
import {INBOUND_GUIDE_V16} from '../src/application/inbound-guide-v16.ts';import {OUTBOUND_GUIDE_V12} from '../src/application/outbound-guide-v12.ts';
const path='../src/application/tutorial-practice.ts';const adapter=await import(path).catch(()=>null);
const daily=[['piece.5',0,0],['piece.4',4,0],['piece.7',5,0],['piece.8',0,1],['piece.3',1,1],['piece.6',3,1]] as const;
for(const kind of ['inbound','outbound','daily'] as const)test(`${kind} practice uses actual bounded domain commands with no account identity`,()=>{
 assert.ok(adapter,'isolated practice adapter must exist');
 for(const branch of kind==='daily'?['orders','placements']:['orders']){
  let practice=adapter.createPractice(kind);const initial=structuredClone(practice);assert.deepEqual(adapter.createPractice(kind),initial);assert.notEqual(adapter.createPractice(kind).progress,practice.progress);assert.equal(practice.state.runSerial,undefined);assert.deepEqual(practice.state.toolCharges,{rotate:0,clear:0,wildcard:0});
  for(const command of [{type:'finish'},{type:'continueOvertime'},{type:'rotate',pieceId:practice.state.candidates[0]?.id,quarterTurns:1},{type:'place',pieceId:'bad',origin:{x:0,y:0}}]){const rejected=adapter.applyPracticeCommand(practice,command);assert.ok(rejected.error);assert.equal(rejected.practice,practice);}
  const commands=kind==='inbound'?INBOUND_GUIDE_V16.commands:kind==='outbound'?OUTBOUND_GUIDE_V12.commands:[{type:'chooseCleanup',branch},...daily.map(([pieceId,x,y])=>({type:'place',pieceId,origin:{x,y}}))];
  let cleaned=0,expired=false;for(const [index,command] of commands.entries()){assert.ok(adapter.practiceOverlay(practice));const step=adapter.applyPracticeCommand(practice,command);assert.equal(step.error,undefined);practice=step.practice;if(kind==='daily'){if(index===1)assert.equal(practice.state.cellTraits[0].remaining,3);if(index===2)assert.equal(practice.state.cellTraits[0].remaining,2);if(index===3)assert.equal(practice.state.cellTraits[0].remaining,1);if(index===4){assert.equal(practice.state.cellTraits[0].kind,'waste');assert.equal(practice.state.score,0);}expired ||= step.events.some((e:{type:string})=>e.type==='rushExpired');cleaned+=step.events.filter((e:{type:string})=>e.type==='cleanup').length;if(index<6)assert.equal(practice.completed,false);}}
  assert.equal(practice.completed,true);assert.equal(adapter.practiceOverlay(practice),null);assert.notEqual(practice.state.phase,'result');assert.ok(adapter.applyPracticeCommand(practice,commands[commands.length-1]).error);
  if(kind==='daily'){assert.equal(expired,true);assert.equal(cleaned,1);assert.equal(practice.state.board[0],null);assert.equal(practice.state.cellTraits[1].kind,'waste');assert.equal(practice.state.completedOrders,2);assert.equal(practice.state.score,215);assert.equal(practice.state.cleanup.branch,branch);}
 }
});
