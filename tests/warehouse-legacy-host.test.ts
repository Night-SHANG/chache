import test from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../scripts/host-runtime.mjs';

test('legacy screenshot host keeps its original native screen without allocating warehouse surfaces',()=>{
 const host=createHost(360,800,new Map(),24,3),screen=host.canvas;assert.equal(host.canvasCount,1);assert.equal(screen.width,1080);assert.equal(screen.height,2400);
 host.frame(0);assert.equal(host.canvas,screen,'screenshots must retain the original screen while image readiness is pending');assert.equal(host.canvasCount,1);
 const cold=screen.getContext('2d').getImageData(0,0,screen.width,screen.height).data;
 host.frame(16);assert.equal(host.canvas,screen);assert.equal(host.canvasCount,1);assert.deepEqual(screen.getContext('2d').getImageData(0,0,screen.width,screen.height).data,cold);
});
