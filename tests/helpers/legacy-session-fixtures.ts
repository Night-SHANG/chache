import assert from 'node:assert/strict';
import {GameSession} from '../../src/application/session.ts';
import {ACTIVE_SLOT_KEY} from '../../src/application/session.ts';
import {encodeRun,saveKeysFor} from '../../src/application/save.ts';
import {slotForRun} from '../../src/application/run-slots.ts';
import {createRun} from '../../src/domain/engine.ts';
import type {RunState} from '../../src/domain/types.ts';
import type {Platform} from '../../src/platform/types.ts';
import {legacyState,sessionHost} from './session-fixtures.ts';
import {createAccountService} from '../../src/application/account-service.ts';
import {isInboundV9} from '../../src/domain/playable.ts';
import type {InboundRunV9} from '../../src/domain/v9/types.ts';

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
 if(mode!=='color_exit'){
  assert.equal(session.view.screen,'game');assert.equal(session.state.rulesetVersion,11);assert.equal(session.state.phase,'cleanup');
  assert.equal(session.state.commandIndex,0);assert.equal(session.view.account?.run?.state.phase,'cleanup');
  session.action({type:'chooseCleanup',branch:'orders'});assert.equal(session.state.commandIndex,1);
 }
 assert.equal(session.view.screen,'game');assert.equal(session.state.rulesetVersion,mode==='color_exit'?8:11);
}

export function inboundV9State(session:GameSession):InboundRunV9 {
 assert.equal(isInboundV9(session.state),true,'compatibility assertions require a verified v9 run');
 if(!isInboundV9(session.state))throw Error('Expected saved v9 inbound run');return session.state;
}

/** Build a persisted v9 account through its real start transaction, then explicitly resume it. */
export function resumedV9Host(options:{guided?:boolean;mode?:'standard'|'endless'}={}) {
 const host=sessionHost(),guided=options.guided??false,mode=options.mode??'standard';
 const service=createAccountService(host.storage,host.platform.writerLease!,()=>host.platform.wallTime!());
 const started=service.transact({type:'start',operationId:'fixture.start.v9',intent:{
  spec:{family:'inbound',mode,rulesetVersion:9,seed:71,guided,toolCharges:{rotate:0,clear:0,wildcard:0}},
  items:[],guide:guided?'guided':'direct',...(guided?{}:{cleanupBranch:'orders' as const}),
 }},service.getSnapshot()!.generation);
 assert.equal(started.status,'acknowledged');assert.equal(started.account?.run?.state.rulesetVersion,9);
 const session=new GameSession(host.platform,{seed:71,mode:'standard'});
 inboundV9State(session);assert.equal(session.view.needsResume,true);session.resume();
 assert.equal(session.view.needsResume,false);assert.equal(session.view.screen,'game');
 return {...host,session};
}
