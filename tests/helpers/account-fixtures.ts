import type { AccountRun, AccountSnapshot } from '../../src/application/account-types.ts';
import { createProfile } from '../../src/application/profile.ts';
import type { RunState } from '../../src/domain/types.ts';
import { createRunV8 } from '../../src/domain/v8/engine.ts';
import type { StoragePort } from '../../src/application/save.ts';
import { dailyAward } from '../../src/application/economy.ts';

export function makeAccountFixture(patch:Partial<AccountSnapshot>={}):AccountSnapshot {
 const {schemaVersion,settings,cosmetics,tutorialComplete,nextRunSerial,...legacyResults}=createProfile();
 void schemaVersion;void tutorialComplete;void nextRunSerial;
 return {formatVersion:1,economyVersion:1,epoch:'test.epoch',generation:0,nextRunSerial:1,closedThroughSerial:0,wallet:0,inventory:{rotate:0,clear:0,wildcard:0},run:null,lastClosedResult:null,profile:{settings,cosmetics,legacyResults,results:{}},guides:{inbound:{learned:[],skipped:false,authoredStartConsumed:false},outbound:{learned:[],skipped:false,authoredStartConsumed:false}},dailyPaid:{},resetCursor:{serial:0,commandIndex:0},legacyImported:false,migration:{version:1,sourceDigests:{}},lastOperation:null,...patch};
}
export function makeAccountRun():AccountRun & {state:RunState};
export function makeAccountRun(patch:Partial<AccountRun>):AccountRun;
export function makeAccountRun(patch:Partial<AccountRun>={}):AccountRun {
 const state=createRunV8(42,'normal');
 return {identity:{runId:'test.run',serial:1,rulesetVersion:8,runConfigId:state.runConfigId,mode:'outbound',difficultyId:'normal',economyVersion:1},state,history:{seed:42,runConfigId:state.runConfigId,head:null,totalCommands:0,tail:[]},lifecycle:'active',reserved:[],creditedBase:0,resultCursor:null,...patch};
}
export function awardsForAttempts(bases:number[]):number[] {
 let previous={bestBase:0,paid:0};return bases.map(base=>{const award=dailyAward(base,previous);previous=award.next;return base+award.extra;});
}
export type IOFault={at:number;timing:'before'|'after'};
export class FaultStorage implements StoragePort {
 values=new Map<string,string>(); operations:{kind:'get'|'set'|'remove'|'list'|'capacity';key:string;value?:string}[]=[];
 fault:IOFault|null=null; limitBytes=Infinity;
 private io<T>(kind:'get'|'set'|'remove'|'list'|'capacity',key:string,action:()=>T,value?:string):T {
  this.operations.push({kind,key,...value===undefined?{}:{value}});const match=this.fault?.at===this.operations.length;
  if(match&&this.fault?.timing==='before')throw Error('injected before I/O');
  const result=action();if(match&&this.fault?.timing==='after')throw Error('injected after I/O');return result;
 }
 get(key:string){return this.io('get',key,()=>this.values.get(key)??null);}
 set(key:string,value:string){return this.io('set',key,()=>{const current=this.values.get(key);this.values.set(key,value);if(this.byteUsage()>this.limitBytes){if(current===undefined)this.values.delete(key);else this.values.set(key,current);throw Error('quota');}},value);}
 remove(key:string){return this.io('remove',key,()=>{this.values.delete(key);});}
 listKeys(prefix:string){return this.io('list',prefix,()=>[...this.values.keys()].filter(key=>key.startsWith(prefix)));}
 capacity(){return this.io('capacity','',()=>({usedBytes:this.byteUsage(),limitBytes:this.limitBytes}));}
 byteUsage(){return [...this.values.values()].reduce((sum,raw)=>sum+new TextEncoder().encode(raw).length,0);}
 resetFault(fault:IOFault|null=null){this.operations=[];this.fault=fault;}
}
