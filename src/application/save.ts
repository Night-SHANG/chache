import type { RunState } from '../domain/types.ts';
import { P0_CONFIG, SHAPES, UPGRADES } from '../domain/content.ts';
import { COLOR_EXIT_CARGO, COLOR_EXIT_TARGETS, RULES_V4_CONFIG } from '../domain/v4/content.ts';
import { UPGRADES as LEGACY_UPGRADES } from '../domain/rulesets/v1/content.ts';

export interface StoragePort { get(key:string):string|null; set(key:string,value:string):void; remove(key:string):void }
export type RunSlot='orders'|'color_exit';
export const COLOR_EXIT_SAVE_KEYS={main:'warehouse.color_exit.run.v4',backup:'warehouse.color_exit.run.backup.v4',temp:'warehouse.color_exit.run.temp.v4'};
export function saveKeysFor(slot:RunSlot):typeof SAVE_KEYS {
  requireValue(slot==='orders'||slot==='color_exit','存档槽无效');
  return slot==='color_exit'?COLOR_EXIT_SAVE_KEYS:SAVE_KEYS;
}
export const SAVE_KEYS={main:'warehouse.run.v1',backup:'warehouse.run.backup.v1',temp:'warehouse.run.temp.v1'};
const CARGO=['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold'];
const DOCKS=['dock.north','dock.east','dock.south','dock.west'];
// Envelope schema and gameplay rules have separate meanings; this is the supported mapping.
const schemaFor=(rules:number)=>rules===1?1:rules===2?2:rules===3?3:rules===4?4:0;
type RecordValue=Record<string,unknown>;
const object=(v:unknown):v is RecordValue=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
const array=(v:unknown,max=100000):v is unknown[]=>Array.isArray(v)&&v.length<=max;
const point=(v:unknown)=>object(v)&&integer(v.x,0,6)&&integer(v.y,0,6);
function requireValue(ok:unknown,message:string):asserts ok { if(!ok)throw Error(message); }

/** Schema four is deliberately separate so old legal snapshots keep their original contract. */
function assertColorExitRun(value:RecordValue):void {
 requireValue(value.rulesetVersion===4&&value.runConfigId===RULES_V4_CONFIG.runConfigId&&value.mode==='color_exit','颜色出口规则版本不兼容');
 requireValue(integer(value.seed,-2147483648,4294967295),'种子无效');
 requireValue(array(value.rngState,4)&&value.rngState.length===4&&value.rngState.every(v=>integer(v,-2147483648,2147483647)),'随机状态无效');
 requireValue(array(value.board,49)&&value.board.length===49&&value.board.every(v=>v===null||COLOR_EXIT_CARGO.some(cargo=>cargo===v)),'棋盘存档无效');
 requireValue(array(value.candidates,3)&&value.candidates.length===(value.phase==='result'&&value.result==='won'?2:3),'候选货物无效');
 requireValue(value.candidates.every(v=>object(v)&&id(v.id)&&SHAPES.some(shape=>shape.id===v.shapeId)&&COLOR_EXIT_CARGO.some(cargo=>cargo===v.cargo)&&v.trait===undefined&&v.rushTurns===undefined),'候选内容无效');
 requireValue(new Set(value.candidates.map(v=>(v as RecordValue).id)).size===value.candidates.length,'候选标识重复');
 requireValue(array(value.orders,3)&&value.orders.length===3&&value.orders.every((order,i)=>object(order)&&Object.keys(order).length===5&&Object.entries(COLOR_EXIT_TARGETS[i]).every(([key,expected])=>order[key]===expected)),'固定出口目标无效');
 requireValue(value.phase==='input'||value.phase==='result','阶段无效');
 requireValue(integer(value.shift,1,5)&&integer(value.completedOrders,0,32)&&integer(value.score)&&value.score%RULES_V4_CONFIG.pointsPerCell===0&&integer(value.lastChain,0,3)&&integer(value.maxChain,0,3)&&integer(value.nextId,4),'进度无效');
 requireValue(array(value.upgrades,0)&&array(value.upgradeChoices,0),'颜色出口不允许升级');
 requireValue(array(value.cellTraits,49)&&value.cellTraits.length===49&&value.cellTraits.every(trait=>trait===null),'颜色出口不允许特殊货件');
 requireValue(integer(value.generatedPieces,3,1000000),'货件生成计数无效');
 requireValue(array(value.commands,100000)&&integer(value.commandIndex)&&value.commandIndex===value.commands.length&&value.commands.every(command=>object(command)&&command.type==='place'&&id(command.pieceId)&&point(command.origin)),'命令存档无效');
 requireValue(value.overtime===false&&(value.tutorialStep===undefined||value.tutorialStep===0)&&value.challengeId===undefined&&value.challengeDay===undefined,'颜色出口不允许每日、教学或加班状态');
 requireValue(value.phase==='input'?value.result===null&&value.endReason===null&&value.completedOrders<30:value.result==='won'?value.endReason==='completed'&&value.completedOrders>=30:value.result==='failed'&&value.endReason==='blocked'&&value.completedOrders<30,'结果与阶段或原因不一致');
 requireValue(value.runSerial===undefined||integer(value.runSerial,1),'本地单局序号无效');
 requireValue(value.elapsedMs===undefined||integer(value.elapsedMs),'游戏时长无效');
 requireValue(value.maxOccupancy===undefined||integer(value.maxOccupancy,0,49),'最高占用记录无效');
}

/** Untrusted JSON is checked before it can reach gameplay or rendering. */
export function assertRun(value:unknown):asserts value is RunState {
  requireValue(object(value),'存档结构无效');
  if(value.rulesetVersion===4||value.mode==='color_exit'){assertColorExitRun(value);return;}
  requireValue(value.rulesetVersion===P0_CONFIG.rulesetVersion&&value.runConfigId===P0_CONFIG.runConfigId||value.rulesetVersion===2&&value.runConfigId==='run.standard_v2'||value.rulesetVersion===3&&value.runConfigId==='run.standard_v3','规则版本不兼容');
  requireValue(integer(value.seed,-2147483648,4294967295),'种子无效');
  requireValue(['standard','daily','tutorial'].includes(String(value.mode)),'游戏模式无效');
  requireValue(array(value.rngState,4)&&value.rngState.length===4&&value.rngState.every(v=>integer(v,-2147483648,2147483647)),'随机状态无效');
  requireValue(array(value.board,49)&&value.board.length===49&&value.board.every(v=>v===null||CARGO.includes(String(v))),'棋盘存档无效');
  requireValue(array(value.candidates,4)&&(value.candidates.length>0||value.rulesetVersion===3&&value.mode==='tutorial'&&value.phase==='result'&&value.result==='won'),'候选货物无效');
  requireValue(value.candidates.every(v=>object(v)&&id(v.id)&&SHAPES.some(shape=>shape.id===v.shapeId)&&CARGO.includes(String(v.cargo))),'候选内容无效');
  requireValue(new Set(value.candidates.map(v=>(v as RecordValue).id)).size===value.candidates.length,'候选标识重复');
  requireValue(array(value.orders,4)&&(value.orders.length>0||value.phase==='result'&&value.result==='won'),'订单无效');
  requireValue(value.orders.every(v=>object(v)&&id(v.id)&&DOCKS.includes(String(v.dockId))&&CARGO.includes(String(v.cargo))&&integer(v.amount,1,49)&&integer(v.baseScore,1,1000000)),'订单内容无效');
  requireValue(new Set(value.orders.map(v=>(v as RecordValue).dockId)).size===value.orders.length,'码头重复');
  requireValue(new Set(value.orders.map(v=>(v as RecordValue).cargo)).size===value.orders.length,'订单货类重复');
  requireValue(['input','upgrade','result'].includes(String(value.phase)),'阶段无效');
  requireValue(integer(value.shift,1,5)&&integer(value.completedOrders,0,100000)&&integer(value.score)&&integer(value.lastChain,0,64)&&integer(value.maxChain,0,64)&&integer(value.nextId,0),'进度无效');
  requireValue(array(value.upgrades,1000)&&value.upgrades.every(id)&&array(value.upgradeChoices,3)&&value.upgradeChoices.every(id),'升级存档无效');
  const catalog=value.rulesetVersion===1?LEGACY_UPGRADES:UPGRADES;
  requireValue([...value.upgrades,...value.upgradeChoices].every(v=>catalog.some(upgrade=>upgrade.id===v)),'升级内容已变更');
  requireValue(new Set(value.upgradeChoices).size===value.upgradeChoices.length,'升级候选重复');
  requireValue(value.phase!=='upgrade'||value.upgradeChoices.length>0,'升级候选缺失');
  requireValue(array(value.commands,100000)&&integer(value.commandIndex)&&value.commandIndex===value.commands.length,'命令索引无效');
  requireValue(value.commands.every(v=>object(v)&&((v.type==='place'&&id(v.pieceId)&&point(v.origin))||(v.type==='upgrade'&&id(v.upgradeId))||(value.rulesetVersion===3&&(v.type==='continueOvertime'||v.type==='finishOvertime')))),'命令存档无效');
  requireValue(value.result===null||value.result==='failed'||value.result==='won','结果无效');
  requireValue((value.phase==='result')===(value.result!==null),'结果与阶段不一致');
  requireValue(value.runSerial===undefined||integer(value.runSerial,1),'本地单局序号无效');
  requireValue(value.elapsedMs===undefined||integer(value.elapsedMs),'游戏时长无效');
  requireValue(value.maxOccupancy===undefined||integer(value.maxOccupancy,0,49),'最高占用记录无效');
  requireValue(value.challengeId===undefined||id(value.challengeId),'挑战标识无效');
  requireValue(value.challengeDay===undefined||typeof value.challengeDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.challengeDay),'挑战日期无效');
  if(value.rulesetVersion===2||value.rulesetVersion===3){
    const traits=value.cellTraits,board=value.board;
    requireValue(array(traits,49)&&traits.length===49,'特殊货件状态缺失');
    requireValue(traits.every((t,i)=>t===null||object(t)&&board[i]!==null&&['pallet','rush','hazard','wildcard','waste'].includes(String(t.kind))&&(t.kind!=='rush'||integer(t.remaining,1,50)&&integer(t.bornAtCommand,0,Number(value.commandIndex)))),'特殊货件状态无效');
    requireValue(integer(value.generatedPieces,value.rulesetVersion===3?0:1,1000000),'货件生成计数无效');
    requireValue(value.candidates.every(p=>object(p)&&(p.trait===undefined||['pallet','rush','hazard','wildcard'].includes(String(p.trait))&&p.shapeId==='shape.single'&&(p.trait!=='rush'||integer(p.rushTurns,1,50)))),'特殊候选无效');
    requireValue(catalog.every(upgrade=>(value.upgrades as string[]).filter(id=>id===upgrade.id).length<=upgrade.maxStack),'升级层数超限');
  }
  if(value.rulesetVersion===3){
    requireValue(integer(value.tutorialStep,0,3)&&typeof value.overtime==='boolean','教学或加班状态缺失');
    requireValue(value.endReason===null||['blocked','completed','retired'].includes(String(value.endReason)),'结算原因无效');
    requireValue((value.phase==='result')===(value.endReason!==null),'结算阶段与原因不一致');
    requireValue(!value.overtime||value.mode==='standard'&&value.shift===5,'加班模式无效');
  }
}
function digest(raw:string):string { let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0'); }
export function encodeRun(state:RunState):string {
  assertRun(state);
  const body=JSON.stringify(state);
  return JSON.stringify({schemaVersion:schemaFor(state.rulesetVersion),digest:digest(body),state});
}
export function decodeRun(raw:string):RunState {
  requireValue(raw.length<=950000,'存档超出大小限制');
  const value:unknown=JSON.parse(raw);
  requireValue(object(value),'存档结构无效');
  requireValue(value.schemaVersion===1||value.schemaVersion===2||value.schemaVersion===3||value.schemaVersion===4,'存档版本不兼容');
  requireValue(typeof value.digest==='string'&&value.digest===digest(JSON.stringify(value.state)),'存档校验失败');
  assertRun(value.state);
  requireValue(value.schemaVersion===schemaFor(value.state.rulesetVersion),'存档版本与规则不兼容');
  return value.state;
}
export interface SaveResult { ok:boolean;message:string }
export interface LoadResult { state:RunState|null;source:'main'|'backup'|'empty'|'corrupt'|'unavailable';message:string }
function archiveRaw(storage:StoragePort,key:string,raw:string):void {
 const archive=`${key}.corrupt.${digest(raw)}`,existing=storage.get(archive);
 requireValue(existing===null||existing===raw,'存档归档标识冲突，已停止覆盖');
 storage.set(archive,raw);requireValue(storage.get(archive)===raw,'损坏存档备份失败');
}
function decodeSlot(raw:string,slot:RunSlot):RunState {
 const state=decodeRun(raw);requireValue((state.mode==='color_exit')===(slot==='color_exit'),'存档模式与槽不一致');return state;
}
export function loadRun(storage:StoragePort,slot:RunSlot='orders'):LoadResult {
  try {
    const keys=saveKeysFor(slot),main=storage.get(keys.main),backup=storage.get(keys.backup);
    if(main!==null){try{return {state:decodeSlot(main,slot),source:'main',message:'发现上次值班'};}catch{/* Preserve raw bytes and try the verified backup. */}}
    if(backup!==null){try{return {state:decodeSlot(backup,slot),source:'backup',message:'主存档不可用，可恢复上一份备份'};}catch{/* Both copies remain untouched. */}}
    return {state:null,source:main!==null||backup!==null?'corrupt':'empty',message:main!==null||backup!==null?'存档无法读取，原文件已保留':'尚无存档'};
  } catch {return {state:null,source:'unavailable',message:'无法访问本地存储，本局暂不能保存'};}
}
function restore(storage:StoragePort,key:string,raw:string|null):void {
 try{if(raw===null)storage.remove(key);else storage.set(key,raw);}catch{/* A prior valid backup or exact-byte archive remains available. */}
}
export function saveRun(storage:StoragePort,state:RunState,slot:RunSlot=state.mode==='color_exit'?'color_exit':'orders'):SaveResult {
  let previous:string|null=null,oldBackup:string|null=null,changed=false;
  let keys:typeof SAVE_KEYS|undefined;
  try {
    keys=saveKeysFor(slot);
    const raw=encodeRun(state);decodeSlot(raw,slot);
    requireValue(raw.length<=950000,'存档超出大小限制');
    previous=storage.get(keys.main);oldBackup=storage.get(keys.backup);
    if(previous!==null){try{decodeSlot(previous,slot);}catch{return {ok:false,message:'旧档损坏，已保护原文件；请先选择恢复或新开'};}}
    storage.set(keys.temp,raw);
    const verified=storage.get(keys.temp);
    requireValue(verified===raw,'写入校验失败');decodeSlot(verified,slot);
    if(oldBackup!==null){try{decodeSlot(oldBackup,slot);}catch{archiveRaw(storage,keys.backup,oldBackup);}}
    changed=true;
    if(previous!==null){storage.set(keys.backup,previous);requireValue(storage.get(keys.backup)===previous,'备份读回校验失败');}
    storage.set(keys.main,raw);
    requireValue(storage.get(keys.main)===raw,'保存读回校验失败');
    try{storage.remove(keys.temp);}catch{/* Successful stable write; abandoned temp never wins load. */}
    return {ok:true,message:'已保存'};
  }catch{
    if(changed&&keys){restore(storage,keys.main,previous);restore(storage,keys.backup,oldBackup);}
    return {ok:false,message:'保存失败，上一份有效存档仍保留'};
  }
}
/** Called only after the player explicitly chooses recovery or a new run. */
export function preserveCorrupt(storage:StoragePort,slot:RunSlot='orders'):SaveResult {
  try {
    const keys=saveKeysFor(slot);
    for(const key of [keys.main,keys.backup]){
      const raw=storage.get(key);if(raw===null)continue;
      try{decodeSlot(raw,slot);continue;}catch{/* Archive exact bytes before clearing the unusable pointer. */}
      archiveRaw(storage,key,raw);
      storage.remove(key);
    }
    return {ok:true,message:'原始损坏存档已保留'};
  }catch{return {ok:false,message:'无法保留旧档，暂不覆盖'};}
}
