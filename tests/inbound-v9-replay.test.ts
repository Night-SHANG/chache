import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {makeV9Fixture} from './helpers/v9-fixtures.ts';import {createRunV9,applyCommandV9} from '../src/domain/v9/engine.ts';import {checksumV9,replayV9,compactCommandTailV9} from '../src/domain/v9/replay.ts';import type{InboundRunV9,InboundCommandV9,StartV9}from'../src/domain/v9/types.ts';
const gameplay=(s:InboundRunV9)=>{const {commands,commandBaseIndex,...rest}=s;void commands;void commandBaseIndex;return rest;};
test('history compaction preserves gameplay and allows accepted command 129; invalid compaction throws',()=>{
 const s=makeV9Fixture({commandIndex:128,commands:Array.from({length:128},()=>({type:'place' as const,pieceId:'history',origin:{x:0,y:0}}))});assert.equal(s.commandBaseIndex,0);assert.equal(s.commands.length,128);const compacted=compactCommandTailV9(s,128);assert.equal(compacted.commandBaseIndex,128);assert.equal(compacted.commands.length,0);assert.equal(checksumV9(compacted),checksumV9(s));const next=applyCommandV9(compacted,{type:'place',pieceId:compacted.candidates[0].id,origin:{x:0,y:0}}).state;assert.equal(next.commandIndex,129);assert.equal(next.commandBaseIndex,128);assert.equal(next.commands.length,1);for(const through of [-1,129,.5])assert.throws(()=>compactCommandTailV9(s,through));assert.throws(()=>compactCommandTailV9(compacted,127));
 const rejected=applyCommandV9(next,{type:'chooseCleanup',branch:'orders'});assert.equal(rejected.state.commandIndex,129);
});
test('checksum includes all future affecting v9 facts and excludes app metadata and history representation',()=>{
 const s=createRunV9({seed:17,mode:'standard'}),base=checksumV9(s);const changes:((s:InboundRunV9)=>void)[]=[n=>{n.seed++},n=>{n.rngState[0]++},n=>{n.board[0]='cargo.food'},n=>{n.cellTraits[0]={kind:'rush',remaining:2,bornAtPlacement:1}},n=>{n.guided=true},n=>{n.mode='endless'},n=>{n.boardSize=8},n=>{n.nextId++},n=>{n.commandIndex++},n=>{n.phase='input'},n=>{n.completedOrders++},n=>{n.shift=2},n=>{n.score++},n=>{n.lastChain++},n=>{n.maxChain++},n=>{n.generatedPieces++},n=>{n.successfulPlacements++},n=>{n.levels.candidate_slots=1},n=>{n.supplyCargo='cargo.food'},n=>{n.pendingThresholds=[4]},n=>{n.claimedThresholds=[4]},n=>{n.upgradeChoices=['small_parcels']},n=>{n.cleanup={branch:'placements',progress:2}},n=>{n.toolCharges.clear=1},n=>{n.usedToolIds=['clear']},n=>{n.overtime=true},n=>{n.result='failed'},n=>{n.endReason='retired'},n=>{n.orders[0].amount++},n=>{n.candidates=[{id:'p',shapeId:'shape.i4_h',cargo:'cargo.food',quarterTurns:1}]}];
 for(const mutate of changes){const n=structuredClone(s);mutate(n);assert.notEqual(checksumV9(n),base);}
 const meta={...s,runSerial:7,elapsedMs:900,maxOccupancy:40,commandBaseIndex:2,commands:[]};assert.equal(checksumV9(meta),base);
 const supplied=applyCommandV9(s,{type:'chooseCleanup',branch:'orders'}).state;const turned=structuredClone(supplied);turned.candidates[0].quarterTurns=1;assert.notEqual(checksumV9(turned),checksumV9(supplied));
});
test('replay consumes iterable commands and rejects invalid history without accepting it',()=>{
 const options:StartV9={seed:1,mode:'standard'};function* commands():Generator<InboundCommandV9>{yield{type:'chooseCleanup',branch:'orders'};yield{type:'finish'};}
 const replay=replayV9(options,commands());assert.equal(replay.state.commandIndex,2);assert.equal(replay.trace.length,2);assert.equal(replay.trace[1].index,2);assert.equal(replay.trace[1].checksum,checksumV9(replay.state));assert.throws(()=>replayV9(options,[{type:'place',pieceId:'missing',origin:{x:0,y:0}}]),/Replay command 1/);
});
test('fixed-seed goldens replay, resume and stream across 127/128/129 with every checksum',()=>{
 const goldens=JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json',import.meta.url),'utf8')) as {options:StartV9;commands:InboundCommandV9[];checksums:string[];state:InboundRunV9}[];
 for(const golden of goldens){const replay=replayV9(golden.options,golden.commands);assert.deepEqual(replay.trace.map(e=>e.checksum),golden.checksums);assert.deepEqual(gameplay(replay.state),gameplay(golden.state));
 for(const cut of [127,128,129].filter(i=>i<golden.commands.length)){let s=createRunV9(golden.options);for(const command of golden.commands.slice(0,cut))s=applyCommandV9(s,command).state;s=JSON.parse(JSON.stringify(s)) as InboundRunV9;s=compactCommandTailV9(s,cut);for(const command of golden.commands.slice(cut))s=applyCommandV9(s,command).state;assert.deepEqual(gameplay(s),gameplay(golden.state));}
 function* stream(){for(let offset=0;offset<golden.commands.length;offset+=128)yield* golden.commands.slice(offset,offset+128);}assert.deepEqual(replayV9(golden.options,stream()).trace,replay.trace);
 }
 assert.ok(goldens.some(g=>g.commands.length>=129));assert.deepEqual(goldens.map(g=>g.options.seed),[1,17,5678]);
});
test('goldens include restorable pending offers and orientation, rush and cleanup checkpoints',()=>{
 const goldens=JSON.parse(readFileSync(new URL('./fixtures/inbound-v9-golden.json',import.meta.url),'utf8')) as {options:StartV9;commands:InboundCommandV9[];checkpoints:{index:number;state:InboundRunV9}[];coverage:{rush:boolean;cleanup:boolean;rotation:boolean;expanded:boolean}}[];
 assert.ok(goldens.some(g=>g.checkpoints?.some(p=>p.state.phase==='upgrade'&&p.state.upgradeChoices.length===3)));
 assert.ok(goldens.some(g=>g.coverage?.rush&&g.coverage?.cleanup&&g.coverage?.rotation&&g.coverage?.expanded));
 for(const g of goldens)for(const checkpoint of g.checkpoints??[]){const restored=JSON.parse(JSON.stringify(checkpoint.state)) as InboundRunV9;let continued=restored;for(const command of g.commands.slice(checkpoint.index))continued=applyCommandV9(continued,command).state;assert.equal(checksumV9(continued),checksumV9(replayV9(g.options,g.commands).state));}
});
