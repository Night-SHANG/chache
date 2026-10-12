import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunV16} from '../src/domain/v16/engine.ts';
import {projectPlacementPoint} from '../src/presentation/touch-placement.ts';

test('the whole tray band, including gaps between slots, remains a touch drag cancellation area',()=>{
 const state=createRunV16({seed:1,mode:'standard',guided:false});
 for(const x of [370,375,120,1,47,365,715,1033,1079])assert.equal(projectPlacementPoint({x,y:1531},state,true),null,`tray band x=${x}`);
});
