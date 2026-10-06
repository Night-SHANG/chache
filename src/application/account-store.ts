import type { AccountSnapshot } from './account-types.ts';
import type { StoragePort } from './save.ts';
import { assertAccountSnapshot } from './account-profile.ts';
import { accountDigest, canonicalStringify, serializeAccount, deserializeAccount, assertAccountCapacity, UnavailableRead, UnsupportedHistoryFormat } from './history-store.ts';
export const ACCOUNT_KEYS=Object.freeze({a:'warehouse.account.s1.a',b:'warehouse.account.s1.b'});
export interface AccountLoad {status:'empty'|'ready'|'degraded'|'unknown'|'unavailable'|'corrupt';account:AccountSnapshot|null;message:string}
export interface CommitResult {status:'acknowledged'|'committed_unmirrored'|'not_committed'|'unknown';account:AccountSnapshot|null;message:string}
const UNCERTAIN='保存结果尚未确认，请重试';
class FutureFormat extends Error {}
export function encodeAccount(account:AccountSnapshot):string {const body=serializeAccount(account);return canonicalStringify({formatVersion:1,generation:account.generation,digest:accountDigest(body),account:JSON.parse(body)});}
export function decodeAccount(storage:StoragePort,raw:string):AccountSnapshot {
 const parsed:unknown=JSON.parse(raw);if(parsed===null||typeof parsed!=='object'||Array.isArray(parsed))throw Error('账户信封无效');const value=parsed as Record<string,unknown>;
 if(value.formatVersion!==1)throw new FutureFormat('账户版本不兼容');
 if(value.account!==null&&typeof value.account==='object'){const account=value.account as Record<string,unknown>;if(account.formatVersion!==1||account.economyVersion!==1)throw new FutureFormat('账户负载版本不兼容');}
 if(Object.keys(value).length!==4||!Object.keys(value).every(key=>['formatVersion','generation','digest','account'].includes(key))||!Number.isSafeInteger(value.generation)||Number(value.generation)<0||value.digest!==accountDigest(canonicalStringify(value.account)))throw Error('账户信封校验失败');
 const account=deserializeAccount(storage,canonicalStringify(value.account));if(account.generation!==value.generation||encodeAccount(account)!==raw)throw Error('账户代际或规范序列化无效');return account;
}
function readRoots(storage:StoragePort,verify:(account:AccountSnapshot)=>void):{load:AccountLoad;raws:[string|null,string|null];accounts:[AccountSnapshot|null,AccountSnapshot|null]} {
 let raws:[string|null,string|null];try {raws=[storage.get(ACCOUNT_KEYS.a),storage.get(ACCOUNT_KEYS.b)];if(storage.get(ACCOUNT_KEYS.a)!==raws[0]||storage.get(ACCOUNT_KEYS.b)!==raws[1])throw Error('读取不一致');}catch{return {load:{status:'unavailable',account:null,message:'无法读取账户，请重试'},raws:[null,null],accounts:[null,null]};}
 const accounts:[AccountSnapshot|null,AccountSnapshot|null]=[null,null];let future=false,corrupt=false,unavailable=false;
 raws.forEach((raw,i)=>{if(raw===null)return;try{accounts[i]=decodeAccount(storage,raw);verify(accounts[i]!);}catch(error){accounts[i]=null;if(error instanceof FutureFormat||error instanceof UnsupportedHistoryFormat)future=true;else if(error instanceof UnavailableRead)unavailable=true;else corrupt=true;}});
 const answer=(status:AccountLoad['status'],account:AccountSnapshot|null,message:string)=>({load:{status,account,message},raws,accounts});
 if(unavailable)return answer('unavailable',null,'无法完整读取账户历史，请重试');
 if(future)return answer('unknown',null,'账户版本不兼容，原记录已保留');
 const [a,b]=accounts;if(!a&&!b)return answer(corrupt?'corrupt':'empty',null,corrupt?'账户记录损坏，原记录已保留':'尚无账户');
 if(a&&b&&(a.epoch!==b.epoch||a.generation===b.generation&&raws[0]!==raws[1]))return answer('unknown',null,UNCERTAIN);
 const selected=!a?b!:!b?a:a.generation>=b.generation?a:b;
 return answer(a&&b&&raws[0]===raws[1]?'ready':'degraded',selected,a&&b&&raws[0]===raws[1]?'账户已确认保存':'账户已提交，需修复副本');
}
export function loadAccount(storage:StoragePort,verifyReferences:(account:AccountSnapshot)=>void):AccountLoad {return readRoots(storage,verifyReferences).load;}
function confirmed(result:AccountLoad,next:AccountSnapshot):boolean {return result.account!==null&&encodeAccount(result.account)===encodeAccount(next);}
export function commitAccount(storage:StoragePort,previous:AccountSnapshot|null,next:AccountSnapshot,verifyReferences:(account:AccountSnapshot)=>void):CommitResult {
 try{assertAccountSnapshot(next);verifyReferences(next);}catch{return {status:'not_committed',account:previous,message:'账户或历史验证失败，旧记录已保护'};}
 const roots=readRoots(storage,verifyReferences),loaded=roots.load;
 if(['unknown','unavailable','corrupt'].includes(loaded.status))return {status:'unknown',account:null,message:UNCERTAIN};
 if(loaded.account?.lastOperation?.operationId===next.lastOperation?.operationId){if(!confirmed(loaded,next))return {status:'not_committed',account:loaded.account,message:'同一操作的内容已改变'};return loaded.status==='ready'?{status:'acknowledged',account:loaded.account,message:'操作已确认保存'}:repairAccount(storage,verifyReferences);}
 if(loaded.status==='degraded')return {status:'not_committed',account:loaded.account,message:'请先修复账户副本'};
 if(previous?loaded.account===null||encodeAccount(loaded.account)!==encodeAccount(previous):loaded.status!=='empty')return {status:'not_committed',account:loaded.account,message:'账户已更新，请重新读取'};
 const priorGeneration=previous?.generation??0;
 if(next.generation!==priorGeneration+1||previous&&next.epoch!==previous.epoch||next.lastOperation===null||next.lastOperation.expectedGeneration!==priorGeneration||next.lastOperation.committedGeneration!==next.generation)return {status:'not_committed',account:loaded.account,message:'操作代际无效或已过期'};
 try{assertAccountCapacity(storage,next,next.run===null&&next.closedThroughSerial>(previous?.closedThroughSerial??0));}catch(error){return {status:'not_committed',account:previous,message:error instanceof Error?error.message:'存储空间不足'};}
 const raw=encodeAccount(next);
 try{storage.set(ACCOUNT_KEYS.b,raw);}catch{/* A persisted write may throw; only fresh verified roots establish its outcome. */}
 const first=loadAccount(storage,verifyReferences);if(!confirmed(first,next))return {status:['unknown','unavailable'].includes(first.status)?'unknown':'not_committed',account:first.account,message:UNCERTAIN};
 if(first.status==='ready')return {status:'acknowledged',account:first.account,message:'账户已确认保存'};
 try{storage.set(ACCOUNT_KEYS.a,raw);}catch{/* Never roll back a verified generation. */}
 const mirrored=loadAccount(storage,verifyReferences);return mirrored.status==='ready'&&confirmed(mirrored,next)?{status:'acknowledged',account:mirrored.account,message:'账户已确认保存'}:{status:'committed_unmirrored',account:first.account,message:'账户已提交，副本尚未确认，请重试'};
}
export function repairAccount(storage:StoragePort,verifyReferences:(account:AccountSnapshot)=>void):CommitResult {
 const roots=readRoots(storage,verifyReferences),loaded=roots.load;if(loaded.status==='ready')return {status:'acknowledged',account:loaded.account,message:'账户副本已确认'};
 if(loaded.status!=='degraded'||!loaded.account)return {status:'unknown',account:null,message:UNCERTAIN};
 const raw=encodeAccount(loaded.account);const side=roots.raws[0]===raw?'b':'a';try{storage.set(ACCOUNT_KEYS[side],raw);}catch{/* Repair writes only the newest verified generation. */}
 const after=loadAccount(storage,verifyReferences);return after.status==='ready'&&confirmed(after,loaded.account)?{status:'acknowledged',account:after.account,message:'账户副本已修复'}:{status:'committed_unmirrored',account:loaded.account,message:'账户已提交，副本尚未确认，请重试'};
}
