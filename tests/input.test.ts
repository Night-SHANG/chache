import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../src/presentation/input.ts';
import { L } from '../src/presentation/layout.ts';
import type { Command, RunState } from '../src/domain/types.ts';
import type { ViewState } from '../src/presentation/view-types.ts';
function harness() {
 const state={phase:'input',candidates:[{id:'p1'},{id:'p2'},{id:'p3'}],upgradeChoices:['u1','u2','u3']} as RunState;
 const view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,developerMode:true,needsResume:false} as ViewState;
 const commands:Command[]=[];let resumed=0;
 const controller=new InputController({getState:()=>state,getView:()=>view,patchView:patch=>Object.assign(view,patch),preview:()=>({valid:true,cells:[],shipments:[]}),dispatch:command=>commands.push(command),togglePause:()=>{view.paused=!view.paused;},restart:()=>{},resume:()=>{view.needsResume=false;resumed++;},toggleDebug:()=>{view.debug=!view.debug;}});
 return {state,view,commands,controller,resumed:()=>resumed};
}
const tray=()=>({x:L.trays[0].x+L.trays[0].w/2,y:L.trays[0].y+L.trays[0].h/2});
const cell=()=>({x:L.board.x+L.board.cell*1.5,y:L.board.y+L.board.cell*1.5});
test('drag produces one placement command on release',()=>{const h=harness();h.controller.down(tray(),7);h.controller.move(cell(),7);h.controller.up(cell(),7);assert.deepEqual(h.commands,[{type:'place',pieceId:'p1',origin:{x:1,y:1}}]);h.controller.up(cell(),7);assert.equal(h.commands.length,1);});
test('tap candidate then tap board produces same placement command',()=>{const h=harness();h.controller.down(tray());h.controller.up(tray());assert.equal(h.view.selectedPieceId,'p1');h.controller.down(cell());h.controller.up(cell());assert.deepEqual(h.commands,[{type:'place',pieceId:'p1',origin:{x:1,y:1}}]);});
test('drag off canvas cancels without a command',()=>{const h=harness();h.controller.down(tray());h.controller.move(cell());h.controller.up({x:-10,y:-10});assert.equal(h.commands.length,0);assert.equal(h.view.dragPoint,null);});
test('pointer cancellation cannot commit on later release',()=>{const h=harness();h.controller.down(tray());h.controller.move(cell());h.controller.cancel();h.controller.up(cell());assert.equal(h.commands.length,0);});
test('secondary finger cannot steal active placement',()=>{const h=harness();h.controller.down(tray(),1);h.controller.move(cell(),2);h.controller.up(cell(),2);assert.equal(h.commands.length,0);h.controller.move(cell(),1);h.controller.up(cell(),1);assert.equal(h.commands.length,1);});
test('pause overlay blocks board taps',()=>{const h=harness();h.view.paused=true;h.view.selectedPieceId='p1';h.controller.down(cell());h.controller.up(cell());assert.equal(h.commands.length,0);});
test('animation locks placement',()=>{const h=harness();h.view.animation={} as NonNullable<ViewState['animation']>;h.controller.down(tray());h.controller.up(cell());assert.equal(h.commands.length,0);});
test('recovery overlay only resumes from its explicit button',()=>{const h=harness();h.view.needsResume=true;h.controller.down(cell());h.controller.up(cell());assert.equal(h.resumed(),0);const p={x:L.resume.x+10,y:L.resume.y+10};h.controller.down(p);h.controller.up(p);assert.equal(h.resumed(),1);assert.equal(h.commands.length,0);});
test('opening pause during drag cancels pending placement',()=>{const h=harness();h.controller.down(tray(),1);h.view.paused=true;h.controller.up(cell(),1);assert.equal(h.commands.length,0);});
test('four-candidate upgrade can select and place the fourth slot',()=>{const h=harness();h.state.candidates.push({id:'p4',shapeId:'shape.single',cargo:'cargo.food'});h.controller.down({x:920,y:1666});h.controller.up({x:920,y:1666});h.controller.down(cell());h.controller.up(cell());assert.equal(h.commands[0].type==='place'&&h.commands[0].pieceId,'p4');});
test('debug overlay blocks hidden placements and paginates without gameplay commands',()=>{const h=harness();h.view.debug=true;h.view.selectedPieceId='p1';h.controller.down(cell());h.controller.up(cell());assert.equal(h.commands.length,0);h.controller.down({x:710,y:1580});h.controller.up({x:710,y:1580});assert.equal(h.view.debugPage,1);h.controller.down({x:260,y:1580});h.controller.up({x:260,y:1580});assert.equal(h.view.debugPage,0);});
