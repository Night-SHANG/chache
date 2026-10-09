import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import * as runtime from '../scripts/shop-navigation-host-runtime.mjs';
import {assertControlTone} from '../scripts/dialog-feedback-host-protocol.mjs';

test('historical native tone caller supplies two independent interior pixels',()=>{
 const sample=(runtime as unknown as {controlTonePixels?:(driver:unknown,rect:{x:number;y:number;w:number;h:number})=>number[][]}).controlTonePixels;
 assert.equal(typeof sample,'function');
 const canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d'),rect={x:132,y:414,w:186,h:150};
 ctx.fillStyle='#efc45f';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
 const pixels=sample!({h:{viewport:{w:1080,h:1920,dpr:1},context:ctx}},rect);
 assert.equal(pixels.length,2);assertControlTone(pixels,'primary');
 ctx.fillStyle='#28465b';ctx.fillRect(rect.x+rect.w-33,rect.y+21,3,3);
 const changed=sample!({h:{viewport:{w:1080,h:1920,dpr:1},context:ctx}},rect);
 assert.notDeepEqual(changed[0],changed[1]);assert.throws(()=>assertControlTone(changed,'primary'));
});
