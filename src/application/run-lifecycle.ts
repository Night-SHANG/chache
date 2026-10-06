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
 try {const keys=runLifecycleKeysFor(slot);main=storage.get(keys.main);backup=storage.get(keys.backup);}
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

/** Explicit user-confirmed abandonment, not a terminal game result or Profile mutation. */
export function closeRun(storage:StoragePort,slot:RunSlot,state:RunState):SaveResult {
 try {
  assertRun(state);requireValue(slotForRun(state)===slot&&positiveSerial(state.runSerial),'本局身份或序号无效，暂不能结束');
  const markers=readMarkers(storage,slot);if(!markers.ok)return {ok:false,message:markers.message};
  const floor=Math.max(markers.floor,state.runSerial),keys=runLifecycleKeysFor(slot),raw=encodeMarker(slot,floor);
  if(markers.main===raw&&markers.backup===raw)return {ok:true,message:'本局已结束'};
  storage.set(keys.temp,raw);requireValue(storage.get(keys.temp)===raw,'结束记录临时校验失败');
  storage.set(keys.backup,raw);requireValue(storage.get(keys.backup)===raw,'结束记录备份校验失败');
  storage.set(keys.main,raw);requireValue(storage.get(keys.main)===raw,'结束记录保存校验失败');
  try {storage.remove(keys.temp);}catch {/* A verified stable pair already owns the cutoff. */}
  return {ok:true,message:'本局已结束'};
 }catch {return {ok:false,message:'结束记录保存失败，请保留当前棋盘后重试'};}
}
