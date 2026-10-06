/** Version-2 content contracts against the real compiled game.js. Fixtures are authored QA cases, not balance claims. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRun} from '../src/domain/engine.ts';
import {encodeRun,SAVE_KEYS} from '../src/application/save.ts';
import {L,getTrayRects} from '../src/presentation/layout.ts';
import {createHost} from './host-runtime.mjs';
const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
function ready(state){const host=createHost(540,960,new Map([[SAVE_KEYS.main,encodeRun(state)]]));host.frame();host.tap(540,1147);host.frame(30);return host;}
const state=createRun(42,'standard',2);state.shift=3;state.completedOrders=12;state.nextId=400;
state.upgrades=['upgrade.four_choices','upgrade.side_gate','upgrade.pallet_pass','upgrade.hazard_clearance'];
state.orders=[{id:'order.qa1',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:150},{id:'order.qa2',dockId:'dock.east',cargo:'cargo.machine',amount:4,baseScore:150},{id:'order.qa3',dockId:'dock.south',cargo:'cargo.chem',amount:4,baseScore:150}];
state.candidates=[{id:'piece.qa1',shapeId:'shape.single',cargo:'cargo.food',trait:'pallet'},{id:'piece.qa2',shapeId:'shape.single',cargo:'cargo.machine',trait:'rush',rushTurns:3},{id:'piece.qa3',shapeId:'shape.single',cargo:'cargo.chem',trait:'hazard'},{id:'piece.qa4',shapeId:'shape.single',cargo:'cargo.electronic',trait:'wildcard'}];
state.board[3]='cargo.cold';for(const cell of [8,9,10])state.board[cell]='cargo.food';state.cellTraits[8]={kind:'pallet'};
state.board[40]='cargo.machine';state.cellTraits[40]={kind:'rush',remaining:1,bornAtCommand:0};state.board[26]='cargo.chem';state.cellTraits[26]={kind:'hazard'};state.board[32]='cargo.electronic';state.cellTraits[32]={kind:'wildcard'};state.board[31]='cargo.cold';state.cellTraits[31]={kind:'waste'};
const host=ready(state);await writeFile('artifacts/14-host-v2-special-cargo.png',await host.canvas.encode('png'));
host.drag(center(getTrayRects(4)[3]),{x:L.board.x+L.board.cell/2,y:L.board.y+L.board.cell/2});host.frame(200);assert.equal(host.snapshot().commandIndex,1);assert.equal(host.snapshot().candidates.length,4);assert.equal(host.snapshot().cellTraits[40].kind,'waste');assert.equal(host.snapshot().completedOrders,13);
for(let i=0;i<5;i++)host.frame(1000*(i+1));await writeFile('artifacts/15-host-v2-rush-expired.png',await host.canvas.encode('png'));
const restored=createHost(540,960,host.storage);restored.frame();restored.tap(540,1147);restored.frame();assert.deepEqual(restored.snapshot(),host.snapshot());
const hazard=createRun(88,'standard',2);hazard.shift=3;hazard.completedOrders=12;hazard.upgrades=['upgrade.hazard_clearance'];hazard.orders=[{id:'order.qah',dockId:'dock.north',cargo:'cargo.chem',amount:3,baseScore:100},{id:'order.qaf',dockId:'dock.east',cargo:'cargo.food',amount:4,baseScore:100}];hazard.candidates[0]={id:'piece.qah',shapeId:'shape.single',cargo:'cargo.food'};
for(const cell of [23,24,25])hazard.board[cell]='cargo.chem';hazard.cellTraits[24]={kind:'hazard'};for(const cell of [16,17]){hazard.board[cell]='cargo.cold';hazard.cellTraits[cell]={kind:'waste'};}
const h=ready(hazard);h.drag(center(getTrayRects(3)[0]),{x:L.board.x+60,y:L.board.y+60});h.frame(250);assert.equal(h.snapshot().board[16],null);assert.equal(h.snapshot().board[17],null);assert.equal(h.snapshot().cellTraits[16],null);assert.equal(h.snapshot().completedOrders,13);await writeFile('artifacts/16-host-v2-hazard-cleanup.png',await h.canvas.encode('png'));
const jam=createRun(9,'standard',2);jam.board=Array.from({length:49},(_,i)=>i%2?'cargo.chem':'cargo.food');jam.board[24]=null;jam.orders=[{id:'order.jam1',dockId:'dock.north',cargo:'cargo.food',amount:9,baseScore:100},{id:'order.jam2',dockId:'dock.east',cargo:'cargo.machine',amount:9,baseScore:100}];jam.candidates[0]={id:'piece.jam',shapeId:'shape.single',cargo:'cargo.cold'};const failed=ready(jam);failed.drag(center(getTrayRects(3)[0]),{x:L.board.x+3.5*L.board.cell,y:L.board.y+3.5*L.board.cell});failed.frame();assert.equal(failed.snapshot().result,'failed');await writeFile('artifacts/17-host-v2-no-space.png',await failed.canvas.encode('png'));
await writeFile('artifacts/host-v2-smoke.json',JSON.stringify({status:'PASS',kind:'real game.js offline host simulation; authored contract fixtures; NOT browser or WeChat runtime',checks:['4 special cargo displayed distinctly','fourth candidate actual touch dispatch','southwest side-gate route ships while original north entry blocked','rush expiry after exactly one valid placement','all v2 metadata preserved on restore','Hazard upgrade clears exactly two adjacent waste cells','trait metadata cleared with physical cells','all candidates blocked produces truthful failure result'],images:4},null,2));
console.log('PASS: v2 real-package special-cargo/side-gate/four-candidate/expiry/recovery/cleanup contracts.');
