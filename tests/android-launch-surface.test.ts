import assert from 'node:assert/strict';
import test from 'node:test';
import {AndroidLaunchSurface} from '../src/platform/android-launch-surface.ts';

const fixture=()=>{const status={hidden:false,textContent:'货箱最后一格\n正在启动…'};return {status,launch:new AndroidLaunchSurface(status)};};
test('Android keeps one unchanged cover through delayed checks and image decode',()=>{
 const {status,launch}=fixture();let paints=0;
 for(let i=0;i<1800;i++)launch.paint('loading',()=>{paints++;});
 launch.paint('superseded',()=>{paints++;});
 assert.equal(paints,0);assert.equal(launch.isCovering,true);assert.equal(status.hidden,false);assert.equal(status.textContent,'货箱最后一格\n正在启动…');
});
test('ready assets reveal only after the complete first frame, with no minimum wait or recurring cover',()=>{
 const {status,launch}=fixture();let paints=0;
 launch.paint('ready',()=>{assert.equal(status.hidden,false);assert.equal(launch.isCovering,true);paints++;});
 assert.equal(paints,1);assert.equal(status.hidden,true);assert.equal(launch.isCovering,false);
 launch.paint('loading',()=>{paints++;});assert.equal(paints,2);assert.equal(status.hidden,true);
});
test('actual image error reveals the painted existing retry gate, never a blank frame',()=>{
 const {status,launch}=fixture();let paints=0;
 launch.paint('error',()=>{assert.equal(status.hidden,false);paints++;});assert.equal(paints,1);assert.equal(status.hidden,true);
 launch.paint('loading',()=>{paints++;});launch.paint('ready',()=>{paints++;});assert.equal(paints,3);
});
test('a failed first render cannot dismiss the cover and a later fatal error restores it',()=>{
 const {status,launch}=fixture();assert.throws(()=>launch.paint('ready',()=>{throw Error('draw failed');}));assert.equal(status.hidden,false);
 launch.fail(Error('draw failed'));assert.match(status.textContent,/无法开始游戏\ndraw failed\n已有存档未被清空/);assert.equal(launch.isCovering,true);
 const next=fixture();next.launch.paint('ready',()=>{});next.launch.fail(Error('later error'));assert.equal(next.status.hidden,false);
});
test('after first-frame handoff normal frames never mutate the hidden DOM cover again',()=>{
 let hidden=false,writes=0;const status={get hidden(){return hidden;},set hidden(value:boolean){hidden=value;writes++;},textContent:'正在启动…'},launch=new AndroidLaunchSurface(status);
 launch.paint('ready',()=>{});for(let i=0;i<120;i++)launch.paint('ready',()=>{});assert.equal(writes,1);
});
