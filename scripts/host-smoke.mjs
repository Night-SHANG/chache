/** Runs actual packaged game.js against a Canvas2D + WeChat-host simulator.
 * It is not a browser, developer-tool, or physical WeChat test. */
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {encodeRun,SAVE_KEYS} from '../src/application/save.ts';
import {L,getTrayRects} from '../src/presentation/layout.ts';
import {CURRENT_RULESET} from '../src/domain/content.ts';
import {chooseMove} from './simulate.mjs';
import {createRun,applyCommand,previewPlacement} from '../src/domain/engine.ts';
import {createHost} from './host-runtime.mjs';
await mkdir('artifacts',{recursive:true});
const center=rect=>({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
function legacyHost(width=540,height=960,safeTop=0,dpr=1){const h=createHost(width,height,new Map([[SAVE_KEYS.main,encodeRun(createRun(123,'tutorial',2))]]),safeTop,dpr);h.frame();h.tap(540,1147);h.frame();return h;}
const host=legacyHost(),screen=host.canvas;host.frame();assert.equal(host.canvas,screen);assert.equal(host.canvasCount,2);
await writeFile('artifacts/01-host-initial.png',await host.canvas.encode('png'));
host.drag(center(L.trays[0]),{x:300,y:740});host.frame();assert.equal(host.snapshot().commandIndex,1);assert.equal(host.snapshot().completedOrders,0);
host.tap(center(L.trays[1]).x,center(L.trays[1]).y);host.tap(540,740);host.frame(150);assert.equal(host.snapshot().completedOrders,1);assert.equal(host.snapshot().score,100);
await writeFile('artifacts/02-host-shipment.png',await host.canvas.encode('png'));
host.frame(1300);assert.equal(host.snapshot().completedOrders,1);
await writeFile('artifacts/03-host-after-shipment.png',await host.canvas.encode('png'));
const old=host.storage.get(SAVE_KEYS.main);host.pointer('down',206,1666);host.pointer('move',540,1000);host.pointer('cancel',540,1000);host.pointer('up',540,1000);host.frame(1350);assert.equal(host.storage.get(SAVE_KEYS.main),old,'cancel does not submit');
host.tap(980,104);host.frame(1400);const paused=host.storage.get(SAVE_KEYS.main);host.drag(center(L.trays[0]),{x:300,y:860});host.frame(1450);assert.equal(host.storage.get(SAVE_KEYS.main),paused,'pause blocks board');
await writeFile('artifacts/04-host-paused.png',await host.canvas.encode('png'));
const reload=createHost(540,960,host.storage);reload.frame();await writeFile('artifacts/05-host-resume.png',await reload.canvas.encode('png'));reload.tap(540,1147);reload.frame();assert.equal(reload.snapshot().commandIndex,2);assert.equal(reload.snapshot().score,100);
reload.callbacks.hide();reload.frame(100);assert.equal(reload.snapshot().completedOrders,1);reload.callbacks.show();reload.tap(540,1147);reload.frame(150);
const narrow=legacyHost(360,800,24,2);narrow.frame();narrow.drag(center(L.trays[0]),{x:300,y:740});narrow.frame();assert.equal(narrow.snapshot().commandIndex,1);await writeFile('artifacts/06-host-narrow-safe-area.png',await narrow.canvas.encode('png'));
const wide=legacyHost(1200,900);wide.frame();wide.drag(center(L.trays[0]),{x:300,y:740});wide.frame();assert.equal(wide.snapshot().commandIndex,1);await writeFile('artifacts/07-host-wide-letterbox.png',await wide.canvas.encode('png'));
const corruptStore=new Map([[SAVE_KEYS.main,'broken原文']]);const corrupt=createHost(540,960,corruptStore);corrupt.frame();await writeFile('artifacts/08-host-corrupt-save.png',await corrupt.canvas.encode('png'));corrupt.tap(540,1297);corrupt.frame();assert.ok([...corruptStore.values()].includes('broken原文'));assert.equal(corrupt.snapshot().commandIndex,0);
const journey=legacyHost();journey.frame();journey.drag(center(L.trays[0]),{x:300,y:740});journey.frame();journey.tap(540,1666);journey.tap(540,740);for(let i=0;i<5;i++)journey.frame(1000*(i+1));
let capturedUpgrade=false,capturedDense=false,maxDense=0,capturedChain=false,journeyTime=6000;
for(let step=0;step<250&&journey.snapshot().phase!=='result';step++){
 const state=journey.snapshot();
 if(state.phase==='upgrade'){if(!capturedUpgrade){await writeFile('artifacts/09-host-upgrade.png',await journey.canvas.encode('png'));capturedUpgrade=true;}const button=center(L.upgradeRects[0]);journey.tap(button.x,button.y);}
 else{const move=chooseMove(state);const index=state.candidates.findIndex(p=>p.id===move.pieceId);journey.drag(center(getTrayRects(state.candidates.length)[index]),{x:L.board.x+(move.origin.x+0.5)*L.board.cell,y:L.board.y+(move.origin.y+0.5)*L.board.cell});}
 journey.frame(journeyTime+=120);if(journey.snapshot().lastChain>1&&!capturedChain){await writeFile('artifacts/10-host-chain.png',await journey.canvas.encode('png'));capturedChain=true;}
 for(let i=0;i<5;i++)journey.frame(journeyTime+=1000);
 if(journey.snapshot().board.filter(Boolean).length>maxDense){maxDense=journey.snapshot().board.filter(Boolean).length;await writeFile('artifacts/11-host-dense-board.png',await journey.canvas.encode('png'));capturedDense=true;}
}
assert.ok(capturedUpgrade,'actual touch sequence reaches an upgrade');assert.equal(journey.snapshot().phase,'result');await writeFile('artifacts/12-host-result.png',await journey.canvas.encode('png'));
let chainState=null,chainMove=null,winningSeed=null;
for(let seed=1;seed<=30&&(!chainState||winningSeed===null);seed++){
 let state=createRun(seed,'standard',CURRENT_RULESET);
 for(let step=0;step<300&&state.phase!=='result';step++){
  const move=state.phase==='input'?chooseMove(state):null;
  if(move&&!chainState&&previewPlacement(state,move.pieceId,move.origin).shipments.length>1){chainState=state;chainMove=move;}
  const command=move?{type:'place',...move}:{type:'upgrade',upgradeId:state.upgradeChoices[0]};state=applyCommand(state,command).state;
 }
 if(state.result==='won'&&winningSeed===null)winningSeed=seed;
}
assert.ok(chainState&&chainMove,'find a replay-reachable multi-order chain');
const chained=createHost(540,960,new Map([[SAVE_KEYS.main,encodeRun(chainState)]]));chained.frame();chained.tap(540,1147);chained.frame();
const chainIndex=chainState.candidates.findIndex(p=>p.id===chainMove.pieceId);chained.drag(center(getTrayRects(chainState.candidates.length)[chainIndex]),{x:L.board.x+(chainMove.origin.x+0.5)*L.board.cell,y:L.board.y+(chainMove.origin.y+0.5)*L.board.cell});chained.frame(850);chained.frame(1000);assert.ok(chained.snapshot().lastChain>1);await writeFile('artifacts/10-host-chain.png',await chained.canvas.encode('png'));capturedChain=true;
assert.notEqual(winningSeed,null);const victory=createHost(540,960,new Map([[SAVE_KEYS.main,encodeRun({...createRun(winningSeed,'standard',CURRENT_RULESET),maxOccupancy:0})]]));victory.frame();victory.tap(540,1147);victory.frame();let victoryTime=1000;
for(let step=0;step<300&&victory.snapshot().phase!=='result';step++){
 const state=victory.snapshot();if(state.phase==='upgrade'){const button=center(L.upgradeRects[0]);victory.tap(button.x,button.y);}else{const move=chooseMove(state),index=state.candidates.findIndex(p=>p.id===move.pieceId);victory.drag(center(getTrayRects(state.candidates.length)[index]),{x:L.board.x+(move.origin.x+0.5)*L.board.cell,y:L.board.y+(move.origin.y+0.5)*L.board.cell});}for(let i=0;i<5;i++)victory.frame(victoryTime+=1000);
}
assert.equal(victory.snapshot().result,'won');assert.equal(victory.snapshot().shift,5);await writeFile('artifacts/13-host-victory.png',await victory.canvas.encode('png'));
const terminalReload=createHost(540,960,victory.storage);terminalReload.frame();terminalReload.callbacks.hide();assert.equal(terminalReload.snapshot().result,'won');
await writeFile('artifacts/host-smoke.json',JSON.stringify({status:'PASS',kind:'offline Canvas2D WeChat-host simulation, NOT real WeChat or browser',checks:['actual game.js starts without DOM','first screen canvas plus one lazy warehouse surface','drag placement','tap placement','automatic shipment','stable snapshot before animation','pointercancel','pause overlay input isolation','restart/load resume without duplicate score','hide/show recovery','360x800 safe-area DPR2 input','1200x900 letterbox input','corrupt raw bytes preserved'],screenshots:13,winningJourney:{rulesetVersion:victory.snapshot().rulesetVersion,seed:winningSeed,commands:victory.snapshot().commandIndex,orders:victory.snapshot().completedOrders,shift:victory.snapshot().shift},journey:{commands:journey.snapshot().commandIndex,result:journey.snapshot().result,shift:journey.snapshot().shift,orders:journey.snapshot().completedOrders,maxChain:journey.snapshot().maxChain},capturedChain,capturedDense},null,2));
console.log('PASS: 13 core + full journey real-package host simulation checks; Canvas2D rendered images. Browser and WeChat runtime remain NOT RUN.');
