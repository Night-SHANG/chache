import type { RunState } from '../domain/types.ts';
import { assertRun, loadRun, type SaveResult, type StoragePort } from './save.ts';
import { RUN_SLOTS, isRunSlot, slotForRun, type RunSlot } from './run-slots.ts';

export interface RunLifecycleKeys {main:string;backup:string;temp:string}
export function runLifecycleKeysFor(slot:RunSlot):RunLifecycleKeys {
 requireValue(isRunSlot(slot),'存档槽无效');
 return {main:`warehouse.run.lifecycle.${slot}.v1`,backup:`warehouse.run.lifecycle.${slot}.backup.v1`,temp:`warehouse.run.lifecycle.${slot}.temp.v1`};
}
type Marker={schemaVersion:1;slot:RunSlot;reason:'abandoned';closedSerial:number};
type Markers={ok:true;floor:number;main:string|null;backup:string|null;mainSerial:number;backupSerial:number}|{ok:false;source:'corrupt'|'unavailable';message:string};
export type PlayableRunLoadResult=ReturnType<typeof loadRun>&{closed?:boolean};
export interface ClosedSerialFloor {ok:boolean;floor:number;message:string}
/** An uncertain failure must block play until a fresh load resolves the stored outcome. */
export interface CloseRunResult extends SaveResult {uncertain?:true}
function requireValue(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
function positiveSerial(value:unknown):value is number {return Number.isSafeInteger(value)&&Number(value)>0;}
function digest(raw:string):string {let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
function encodeMarker(slot:RunSlot,closedSerial:number):string {
 const marker:Marker={schemaVersion:1,slot,reason:'abandoned',closedSerial};
 return JSON.stringify({...marker,digest:digest(JSON.stringify(marker))});
}
function decodeMarker(raw:string,slot:RunSlot):number {
 requireValue(raw.length<=512,'结束记录超出大小限制');
 const value:unknown=JSON.parse(raw);
 requireValue(value!==null&&typeof value==='object'&&!Array.isArray(value),'结束记录结构无效');
 const marker=value as Record<string,unknown>,keys=['schemaVersion','slot','reason','closedSerial','digest'];
 requireValue(Object.keys(marker).length===keys.length&&Object.keys(marker).every(key=>keys.includes(key)),'结束记录字段无效');
 requireValue(marker.schemaVersion===1&&marker.slot===slot&&marker.reason==='abandoned'&&positiveSerial(marker.closedSerial),'结束记录身份无效');
 requireValue(raw===encodeMarker(slot,marker.closedSerial),'结束记录校验失败');
 return marker.closedSerial;
}
function readMarkers(storage:StoragePort,slot:RunSlot):Markers {
 let main:string|null,backup:string|null;
 try {
  const keys=runLifecycleKeysFor(slot);main=storage.get(keys.main);backup=storage.get(keys.backup);
  // A one-off stale read must neither invent a commit nor hide the sole highest cutoff.
  requireValue(storage.get(keys.main)===main&&storage.get(keys.backup)===backup,'结束记录读取不一致');
 }
 catch {return {ok:false,source:'unavailable',message:'无法读取本局结束记录，暂不恢复或覆盖存档'};}
 try {
  const mainSerial=main===null?0:decodeMarker(main,slot),backupSerial=backup===null?0:decodeMarker(backup,slot);
  return {ok:true,floor:Math.max(mainSerial,backupSerial),main,backup,mainSerial,backupSerial};
 }catch {return {ok:false,source:'corrupt',message:'本局结束记录损坏，原文件已保留，暂不恢复或覆盖存档'};}
}

/** Raw snapshots stay available for profile/reset scans; only gameplay loading observes closure. */
export function loadPlayableRun(storage:StoragePort,slot:RunSlot):PlayableRunLoadResult {
 const markers=readMarkers(storage,slot);
 if(!markers.ok)return {state:null,source:markers.source,message:markers.message};
 const loaded=loadRun(storage,slot);
 if(markers.floor>0&&loaded.state&&(loaded.state.runSerial===undefined||loaded.state.runSerial<=markers.floor))return {state:null,source:'empty',closed:true,message:'上局已结束，可以开始新局'};
 return loaded;
}

/** Callers must check ok and allocate strictly above floor, including after Profile recovery. */
export function closedSerialFloor(storage:StoragePort):ClosedSerialFloor {
 let floor=0;
 for(const slot of RUN_SLOTS){const markers=readMarkers(storage,slot);if(!markers.ok)return {ok:false,floor,message:markers.message};floor=Math.max(floor,markers.floor);}
 return {ok:true,floor,message:'已读取结束边界'};
}

function matchesStored(storage:StoragePort,key:string,raw:string|null):boolean {
 // Corroborate both commit and rollback; a single stale match is not durable evidence.
 let matches=0;
 for(let attempt=0;attempt<4;attempt++)try {
  matches=storage.get(key)===raw?matches+1:0;if(matches===2)return true;
 }catch {matches=0;}
 return false;
}
function writeMarker(storage:StoragePort,key:string,raw:string):boolean {
 try {storage.set(key,raw);}catch {/* A host may persist the value before throwing. Read it back. */}
 return matchesStored(storage,key,raw);
}

/** The first verified stable marker commits abandonment; later mirror failures cannot undo it. */
export function closeRun(storage:StoragePort,slot:RunSlot,state:RunState):CloseRunResult {
 try {
  assertRun(state);requireValue(slotForRun(state)===slot&&positiveSerial(state.runSerial),'本局身份或序号无效，暂不能结束');
  const markers=readMarkers(storage,slot);if(!markers.ok)return {ok:false,message:markers.message};
  const floor=Math.max(markers.floor,state.runSerial),keys=runLifecycleKeysFor(slot),raw=encodeMarker(slot,floor);
  if(markers.floor>=state.runSerial)return {ok:true,message:'本局已结束'};
  storage.set(keys.temp,raw);requireValue(storage.get(keys.temp)===raw,'结束记录临时校验失败');
  // Keep the sole highest old cutoff untouched until a replacement is verified.
  const first=markers.mainSerial<markers.backupSerial?'main':'backup',second=first==='main'?'backup':'main';
  if(!writeMarker(storage,keys[first],raw)){
   try {if(markers[first]===null)storage.remove(keys[first]);else storage.set(keys[first],markers[first]);}catch {/* Verify rollback even if the host threw after restoring it. */}
   if(matchesStored(storage,keys[first],markers[first]))return {ok:false,message:'结束记录保存失败，请保留当前棋盘后重试'};
   return {ok:false,uncertain:true,message:'无法确认本局是否已结束，已暂停继续与覆盖；请恢复读取存档后再操作'};
  }
  // Only the other pointer is touched after commit. Never roll back the verified cutoff.
  const mirrored=writeMarker(storage,keys[second],raw)||writeMarker(storage,keys[second],raw);
  try {storage.remove(keys.temp);}catch {/* The verified stable marker already owns the cutoff. */}
  return {ok:true,message:mirrored?'本局已结束':'本局已结束，结束记录副本写入失败，请先恢复检查存储'};
 }catch {return {ok:false,message:'结束记录保存失败，请保留当前棋盘后重试'};}
}
