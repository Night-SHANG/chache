import assert from 'node:assert/strict';
import {GameSession} from '../../src/application/session.ts';
import {ACTIVE_SLOT_KEY} from '../../src/application/session.ts';
import {encodeRun,saveKeysFor} from '../../src/application/save.ts';
import {slotForRun} from '../../src/application/run-slots.ts';
import {createRun} from '../../src/domain/engine.ts';
import type {RunState} from '../../src/domain/types.ts';
import type {Platform} from '../../src/platform/types.ts';
import {legacyState} from './session-fixtures.ts';

export function legacyTutorial(seed=123):RunState {
 const state=createRun(seed,'tutorial',3);state.maxOccupancy=0;return state;
}

/** Tests opt into compatibility by supplying a real saved run, never a new-game flag. */
export function storeLegacyRun(data:Map<string,string>,state:RunState,active=false):void {
 const slot=slotForRun(state);data.set(saveKeysFor(slot).main,encodeRun(state));
 if(active)data.set(ACTIVE_SLOT_KEY,slot);
}

export function resumeStoredLegacy(platform:Platform,options:{seed:number;mode:RunState['mode']}):GameSession {
 const session=new GameSession(platform,options);legacyState(session);
 assert.equal(session.view.screen,'game','a stored legacy run must be available');
 if(session.state.phase!=='result')assert.equal(session.view.needsResume,true,'legacy input resumes explicitly');
 session.resume();assert.equal(session.view.needsResume,false);return session;
}

export function startCurrentRun(session:GameSession,mode:'standard'|'daily'|'endless'|'color_exit',difficultyId:'easy'|'normal'='easy'):void {
 session.action({type:'newRun',mode,...(mode==='color_exit'?{difficultyId}:{})});
 if(session.view.confirmation)session.action({type:'confirm'});
 if(session.view.screen==='guideOffer')session.action({type:'directStart'});
 if(session.view.screen==='prepareTools')session.action({type:'prepareNext'});
 if(session.view.screen==='prepareCleanup')session.action({type:'chooseCleanup',branch:'orders'});
 assert.equal(session.view.screen,'game');assert.equal(session.state.rulesetVersion,mode==='color_exit'?8:9);
}
