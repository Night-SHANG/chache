import { cloneData, utf8Bytes } from '../shared/data.ts';
import type { AccountSnapshot, HistoryChunk, HistoryCursor, RunIdentity } from './account-types.ts';
import type { GameCommand } from '../domain/playable.ts';
import { assertAccountSnapshot, assertHistoryCursor } from './account-profile.ts';
import type { StoragePort } from './save.ts';
import { assertGameRun, assertGameCommandShape } from './game-codec.ts';
import { ACCOUNT_KEYS, decodeAccount } from './account-store.ts';
export class UnavailableRead extends Error {}
export class UnsupportedHistoryFormat extends Error {}
export class UnverifiedHistory extends Error {}
function getHistory(storage:StoragePort,key:string):string|null {try{return storage.get(key);}catch{throw new UnavailableRead('无法读取历史段');}}
export const HISTORY_PREFIX='warehouse.account.history.s1.';
export const ACCOUNT_MAX_BYTES=512*1024;
export const ACCOUNT_NORMAL_BYTES=496*1024;
const bytes=(raw:string)=>utf8Bytes(raw).length;
export function canonicalStringify(value:unknown):string {
 const normalize=(v:unknown):unknown=>{if(Array.isArray(v))return v.map(normalize);if(v!==null&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(key=>[key,normalize((v as Record<string,unknown>)[key])]));return v;};
 return JSON.stringify(normalize(value));
}
/** Local corruption detection only, never an authentication or anti-cheat proof. */
export function accountDigest(raw:string):string {let hash=2166136261;for(const byte of utf8Bytes(raw)){hash^=byte;hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
function keyFor(identity:RunIdentity,first:number,digest:string):string {return `${HISTORY_PREFIX}${identity.runId}.${first}.${digest}`;}
function commandValid(command:unknown,version:8|9|10|11):boolean {try{assertGameCommandShape(command,version);return true;}catch{return false;}}

function chunkRaw(chunk:Omit<HistoryChunk,'digest'>):string {const digest=accountDigest(canonicalStringify(chunk));return canonicalStringify({...chunk,digest});}
function readChunksValidated(storage:StoragePort,identity:RunIdentity,history:HistoryCursor):{commands:GameCommand[];keys:string[]} {
 assertHistoryCursor(history);requireValue(history.runConfigId===identity.runConfigId,'历史规则身份不匹配');
 const commands:GameCommand[][]=[],keys:string[]=[],seen=new Set<string>();let ref=history.head,remaining=history.totalCommands-history.tail.length;
 while(ref){requireValue(!seen.has(ref.key)&&ref.commandCount===128&&remaining>=128,'历史链重复或长度无效');seen.add(ref.key);
  const raw=getHistory(storage,ref.key);if(getHistory(storage,ref.key)!==raw)throw new UnavailableRead('历史段读取不一致');requireValue(raw!==null,'历史段缺失');
  const chunk:unknown=JSON.parse(raw);requireValue(chunk!==null&&typeof chunk==='object'&&!Array.isArray(chunk),'历史段结构无效');const c=chunk as HistoryChunk;
  if(c.formatVersion!==1)throw new UnsupportedHistoryFormat('历史段版本不兼容');
  requireValue(Object.keys(c).length===6&&Object.keys(c).every(key=>['formatVersion','runId','firstCommandIndex','commands','previous','digest'].includes(key))&&c.formatVersion===1&&c.runId===identity.runId&&c.firstCommandIndex===remaining-128&&Array.isArray(c.commands)&&c.commands.length===128&&c.commands.every(command=>commandValid(command,identity.rulesetVersion)),'历史段身份或内容无效');
  const {digest,...body}=c;requireValue(digest===ref.digest&&digest===accountDigest(canonicalStringify(body))&&ref.key===keyFor(identity,c.firstCommandIndex,digest)&&raw===canonicalStringify(c),'历史段摘要无效');
  if(c.previous!==null)requireValue(c.previous!==undefined&&typeof c.previous.key==='string'&&Object.keys(c.previous).length===3&&c.previous.commandCount===128&&typeof c.previous.digest==='string','历史前段引用无效');
  commands.push(c.commands);keys.push(ref.key);remaining-=128;ref=c.previous;
 }
 requireValue(remaining===0,'历史链不完整');return {commands:commands.reverse().flat(),keys};
}
function readChunks(storage:StoragePort,identity:RunIdentity,history:HistoryCursor):{commands:GameCommand[];keys:string[]} {
 try{return readChunksValidated(storage,identity,history);}catch(error){if(error instanceof UnavailableRead||error instanceof UnsupportedHistoryFormat)throw error;throw new UnverifiedHistory(error instanceof Error?error.message:'历史引用未验证');}
}
export function stageHistory(storage:StoragePort,identity:RunIdentity,history:HistoryCursor,commands:readonly GameCommand[],absoluteIndex:number,options:{closing?:boolean}={}):{cursor:HistoryCursor;commandBaseIndex:number;tail:GameCommand[]} {
 assertHistoryCursor(history);readChunks(storage,identity,history);
 const base=history.totalCommands-history.tail.length;
 requireValue(Number.isSafeInteger(absoluteIndex)&&absoluteIndex>=history.totalCommands&&absoluteIndex===base+commands.length&&commands.every(command=>commandValid(command,identity.rulesetVersion)),'历史命令边界无效');
 requireValue(canonicalStringify(commands.slice(0,history.tail.length))===canonicalStringify(history.tail),'历史尾段不能改写');
 let head=history.head,offset=0;
 while(commands.length-offset>=128){const body:Omit<HistoryChunk,'digest'>={formatVersion:1,runId:identity.runId,firstCommandIndex:base+offset,commands:cloneData(commands.slice(offset,offset+128)) as GameCommand[],previous:head};const raw=chunkRaw(body),digest=accountDigest(canonicalStringify(body)),key=keyFor(identity,base+offset,digest);const prior=storage.get(key);requireValue(prior===null||prior===raw,'历史段同键内容冲突');
  if(prior===null){if(storage.capacity){const capacity=storage.capacity();requireValue(capacity.limitBytes===Infinity||capacity.limitBytes-capacity.usedBytes>=bytes(raw)+(options.closing?0:2*ACCOUNT_MAX_BYTES),'存储空间不足，请先结束本局');}try{storage.set(key,raw);}catch{requireValue(storage.get(key)===raw,'历史段保存失败');}}
  requireValue(storage.get(key)===raw&&storage.get(key)===raw,'历史段保存尚未确认');head={key,digest,commandCount:128};offset+=128;
 }
 const tail=cloneData(commands.slice(offset)) as GameCommand[];return {cursor:{...history,head,totalCommands:absoluteIndex,tail},commandBaseIndex:base+offset,tail};
}
export function readHistory(storage:StoragePort,identity:RunIdentity,history:HistoryCursor,tail:readonly GameCommand[]):Iterable<GameCommand> {
 try{
  requireValue(canonicalStringify(tail)===canonicalStringify(history.tail)&&tail.every(command=>commandValid(command,identity.rulesetVersion)),'历史尾段不一致');
  return [...readChunks(storage,identity,history).commands,...cloneData(tail)];
 }catch(error){if(error instanceof UnavailableRead||error instanceof UnsupportedHistoryFormat||error instanceof UnverifiedHistory)throw error;throw new UnverifiedHistory(error instanceof Error?error.message:'历史尾段未验证');}
}
export function serializeAccount(account:AccountSnapshot):string {
 assertAccountSnapshot(account);
 if(account.run){const state=account.run.state;const expected=state.rulesetVersion>=9?account.run.history.tail:state.commands.slice(state.commandIndex-account.run.history.tail.length);requireValue(canonicalStringify(expected)===canonicalStringify(account.run.history.tail),'棋盘与历史尾段不一致');const {commands,...snapshot}=state;void commands;return canonicalStringify({...account,run:{...account.run,state:snapshot}});}
 return canonicalStringify(account);
}
export function accountBytes(account:AccountSnapshot):number {return bytes(serializeAccount(account));}
export function deserializeAccount(storage:StoragePort,raw:string):AccountSnapshot {
 const account:unknown=JSON.parse(raw);assertAccountSnapshot(account);
 if(account.run){const commands=account.run.identity.rulesetVersion>=9?account.run.history.tail:[...readHistory(storage,account.run.identity,account.run.history,account.run.history.tail)];account.run.state={...account.run.state,commands} as typeof account.run.state;}
 return account;
}
export function verifyAccountReferences(storage:StoragePort,account:AccountSnapshot):void {
 assertAccountSnapshot(account);if(account.run){const run=account.run;readHistory(storage,run.identity,run.history,run.history.tail);assertGameRun(run.state);requireValue(canonicalStringify(run.state.rulesetVersion>=9?run.state.commands:run.state.commands.slice(run.state.commandIndex-run.history.tail.length))===canonicalStringify(run.history.tail),'棋盘历史尾段不一致');}
 if(account.lastClosedResult)readHistory(storage,account.lastClosedResult.identity,account.lastClosedResult.history,account.lastClosedResult.history.tail);
}
export function assertAccountCapacity(storage:StoragePort,next:AccountSnapshot,closing=false):void {
 const body=serializeAccount(next),raw=canonicalStringify({formatVersion:1,generation:next.generation,digest:accountDigest(body),account:JSON.parse(body)}),size=bytes(raw);
 requireValue(size<=(closing?ACCOUNT_MAX_BYTES:ACCOUNT_NORMAL_BYTES),closing?'结束记录超出512KiB限制，旧记录已保护':'记录超出496KiB限制，请先结束本局');
 if(storage.capacity){const capacity=storage.capacity();requireValue(Number.isSafeInteger(capacity.usedBytes)&&capacity.usedBytes>=0&&(capacity.limitBytes===Infinity||Number.isSafeInteger(capacity.limitBytes)&&capacity.limitBytes>=capacity.usedBytes),'无法确认存储配额');if(capacity.limitBytes===Infinity)return;
  const a=storage.get(ACCOUNT_KEYS.a),b=storage.get(ACCOUNT_KEYS.b),current=bytes(a??'')+bytes(b??'');
  const after=capacity.usedBytes-current+2*size;
  requireValue(after+(closing?0:2*(size+16*1024))<=capacity.limitBytes,'存储空间不足，已保留本局结束所需空间');
 }
}
export function collectOrphanHistory(storage:StoragePort):{removed:number;message:string} {
 if(!storage.listKeys)return {removed:0,message:'存储不支持安全列举'};
 try {const raws=[storage.get(ACCOUNT_KEYS.a),storage.get(ACCOUNT_KEYS.b)];requireValue(storage.get(ACCOUNT_KEYS.a)===raws[0]&&storage.get(ACCOUNT_KEYS.b)===raws[1],'根读取不一致');const used=new Set<string>();
  for(const raw of raws){if(raw===null)continue;const account=decodeAccount(storage,raw);verifyAccountReferences(storage,account);for(const run of [account.run,account.lastClosedResult])if(run)for(const key of readChunks(storage,run.identity,run.history).keys)used.add(key);}
  const keys=storage.listKeys(HISTORY_PREFIX);requireValue(keys.every(key=>key.startsWith(HISTORY_PREFIX)),'历史键列举无效');const candidates=keys.filter(key=>!used.has(key));
  requireValue(storage.get(ACCOUNT_KEYS.a)===raws[0]&&storage.get(ACCOUNT_KEYS.b)===raws[1],'回收时根已改变');let removed=0;for(const key of candidates){storage.remove(key);removed++;}return {removed,message:'已回收未引用历史段'};
 }catch{return {removed:0,message:'无法确认全部引用，未回收历史段'};}
}
