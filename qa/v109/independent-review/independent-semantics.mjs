import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
const source=resolve(process.argv[2]??'.'),out=resolve(process.argv[3]??'qa/v109/independent');
const imp=p=>import(`${source}/${p}`);
const {GameSession}=await imp('src/application/session.ts');
const {sessionHost,startInbound}=await imp('tests/helpers/session-fixtures.ts');
const {createMusicController}=await imp('src/platform/music.ts');
const {UiFeedback}=await imp('src/application/ui-feedback.ts');
const cases=[],test=(name,fn)=>{fn();cases.push({name,status:'PASS'});};
test('lost-writer-causes-real-accountBlocked-and-suspends-paused-music',()=>{
 const h=sessionHost({wallet:777}),states=[];h.platform.setMusicState=(...v)=>states.push(v);const session=new GameSession(h.platform,{seed:41,mode:'standard'});startInbound(session);session.togglePause();assert.deepEqual(states.at(-1),[true,false,true]);
 h.platform.writerLease.status='busy';session.togglePause();assert.equal(session.view.accountBlocked,true);assert.deepEqual(states.at(-1),[true,true,true]);assert.ok(session.view.readOnlyReason);session.show();assert.deepEqual(states.at(-1),[true,true,true]);
});
test('volume-failure-never-restarts-and-tries-only-new-desired-volume',()=>{
 let creates=0,plays=0,pauses=0,writes=0,rejectVolume=false;const ctl=createMusicController(()=>{creates++;return {play(){plays++;},pause(){pauses++;},setVolume(){writes++;if(rejectVolume)throw Error('host setter rejected');}};});
 ctl.setState(true,false,false);assert.equal(plays,1);rejectVolume=true;ctl.setState(true,false,true);const failedWrites=writes;for(let i=0;i<100;i++){ctl.setState(true,false,true);ctl.gesture(()=>{});}assert.equal(writes,failedWrites);assert.equal(plays,1);assert.equal(pauses,0);assert.equal(creates,1);rejectVolume=false;ctl.setState(true,false,false);assert.equal(writes,failedWrites+1);assert.equal(plays,1);
});
test('pending-play-duck-transitions-remain-single-request',()=>{
 let plays=0,creates=0,volume=0;const ctl=createMusicController(()=>{creates++;return {play(){plays++;return new Promise(()=>{});},pause(){},setVolume(v){volume=v;}};});ctl.setState(true,false,false);for(let i=0;i<100;i++){ctl.setState(true,false,true);assert.equal(volume,.12);ctl.setState(true,false,false);assert.equal(volume,.18);}assert.equal(plays,1);assert.equal(creates,1);
});
test('UI-click-existing-60ms-rate-limit-prevents-self-overlap-and-preserves-actions',()=>{
 let t=0,actions=0;const emitted=[],settings={sound:true,music:true,reducedMotion:false};const ui=new UiFeedback({now:()=>t,playSound:name=>emitted.push({name,time:t})},()=>settings,()=>false);
 for(const dt of [0,1,15,45,59,60,61,119,120]){t=dt;ui.activate(()=>actions++,false);}assert.equal(actions,9);assert.deepEqual(emitted,[{name:'ui_click',time:0},{name:'ui_click',time:60},{name:'ui_click',time:120}]);
});
test('business-cue-priority-and-mute-unmute-gestures-stay-silent',()=>{
 let t=0;const emitted=[],settings={sound:true,music:true,reducedMotion:false};const ui=new UiFeedback({now:()=>t,playSound:name=>emitted.push(name)},()=>settings,()=>false);ui.activate(()=>ui.sound('place'),false);assert.deepEqual(emitted,['place']);t=100;ui.activate(()=>{settings.sound=false;},false);t=200;ui.activate(()=>{settings.sound=true;},false);assert.deepEqual(emitted,['place']);t=300;ui.activate(()=>{},false);assert.deepEqual(emitted,['place','ui_click']);
});
await writeFile(resolve(out,'independent-semantics.json'),JSON.stringify({status:'PASS',cases},null,2));console.log(JSON.stringify({status:'PASS',cases:cases.length}));
