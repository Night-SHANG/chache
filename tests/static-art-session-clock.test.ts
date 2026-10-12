import assert from 'node:assert/strict';
import test from 'node:test';
import {GameSession} from '../src/application/session.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {playableChecksum} from '../src/domain/playable.ts';

test('presentation loading freezes gameplay clocks while music and input refresh keep their original behavior',()=>{
 const host=sessionHost(),music:unknown[][]=[];host.platform.setMusicState=(...state)=>music.push(state);const session=new GameSession(host.platform,{seed:77,mode:'standard'});startInbound(session);let refreshes=0;const refresh=session.input.refresh.bind(session.input);session.input.refresh=()=>{refreshes++;refresh();};
 host.time(100);session.tick(100);const before=session.view.elapsed,checksum=playableChecksum(session.state),saved=[...host.data],selection=structuredClone(session.view.profile?.cosmetics);const musicBefore=music.length;
 for(const now of [1000,5000,15000]){host.time(now);session.tick(now,true);}
 assert.equal(session.view.elapsed,before);assert.equal(playableChecksum(session.state),checksum);assert.deepEqual([...host.data],saved);assert.deepEqual(session.view.profile?.cosmetics,selection);assert.equal(music.length,musicBefore+3);assert.deepEqual(music[music.length-1],[true,false,false]);assert.equal(refreshes,4);
 host.time(15016);session.tick(15016);assert.equal(session.view.elapsed,before+16);
});

test('presentation loading also preserves existing growth animation progress',()=>{
 const {session,time}=sessionHost();startInbound(session);session.view.growthFx={label:'test',progress:0};
 time(100);session.tick(100);const before=session.view.growthFx?.progress;assert.ok(before!==undefined);
 time(1000);session.tick(1000,true);assert.equal(session.view.growthFx?.progress,before);
 time(1016);session.tick(1016);assert.ok(session.view.growthFx&&session.view.growthFx.progress>before!);assert.ok(session.view.growthFx.progress<1);
});
