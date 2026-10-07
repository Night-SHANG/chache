import type {GameCommand,GameRun} from '../domain/playable.ts';
import {CARGO,SHAPES} from '../domain/rulesets/v1/content.ts';
import {OUTBOUND_CARGO,OUTBOUND_TARGETS,isOutboundDifficulty,isValidOutboundPieceV6} from '../domain/v6/content.ts';
import {RULES_V9_CONFIG,UPGRADES_V9,getStageV9,validToolChargesV9} from '../domain/v9/content.ts';
import {RULES_V11_CONFIG,NEUTRAL_LEVEL_IDS_V11,validToolChargesV11} from '../domain/v11/content.ts';
import {outboundRunConfigIdV10} from '../domain/v10/content.ts';
import {RULES_V14_CONFIG} from '../domain/v14/content.ts';
import {reservedEntryCellsV14} from '../domain/v14/board.ts';
import {validScoreStateV12} from '../domain/v12/score.ts';
import {isValidOutboundPieceV12,validToolChargesV12} from '../domain/v12/content.ts';
import {OUTBOUND_ENTRY} from '../domain/v6/content.ts';
import {assertRun,decodeRun,encodeRun} from './save.ts';

type Obj=Record<string,unknown>;
const object=(value:unknown):value is Obj=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):value is number=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
const array=(value:unknown,max=100000):value is unknown[]=>Array.isArray(value)&&value.length<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
const cargo=(value:unknown):boolean=>CARGO.some(item=>item.id===value);
const has=(o:Obj,key:string)=>Object.prototype.hasOwnProperty.call(o,key);
function requireValue(ok:unknown,message:string):asserts ok {if(!ok)throw Error(message);}
function exactKeys(value:Obj,keys:readonly string[]):boolean {return Object.keys(value).length===keys.length&&keys.every(key=>has(value,key));}
function onlyKeys(value:Obj,keys:readonly string[]):boolean {return Object.keys(value).every(key=>keys.includes(key));}
function point(value:unknown,size:number):boolean {return object(value)&&exactKeys(value,['x','y'])&&integer(value.x,0,size-1)&&integer(value.y,0,size-1);}
function unique(values:unknown[]):boolean {return new Set(values).size===values.length;}
const TOOL_IDS=['rotate','clear','wildcard'];
const TRAITS=['pallet','rush','hazard','wildcard','waste'];
const UPGRADE_IDS=UPGRADES_V9.map(upgrade=>upgrade.id);
const DOCK_IDS=['dock.north','dock.east','dock.south','dock.west'];
const COMMON_FIELDS=['rulesetVersion','runConfigId','seed','mode','boardSize','board','cellTraits','rngState','nextId','candidates','orders','phase','shift','completedOrders','score','lastChain','maxChain','generatedPieces','commandIndex','commandBaseIndex','commands','overtime','result','endReason','runSerial','elapsedMs','maxOccupancy'];

export function assertGameCommandShape(value:unknown,version:8|9|10|11|12|13|14):asserts value is GameCommand {
 requireValue(object(value),'指令结构无效');
 requireValue([8,9,10,11,12,13,14].includes(version),'指令版本不匹配');
 const outboundTools=version===12||version===13;
 if(value.type==='place'){
  // Pre-expansion commands retain their original coordinate system.
  requireValue(exactKeys(value,['type','pieceId','origin'])&&id(value.pieceId)&&point(value.origin,version===11||version===14?7:version===9?8:9),'落子指令无效');return;
 }
 if(version===8)throw Error('普通出库指令无效');
 if(version===10){requireValue(value.type==='finishOutboundEndless'&&exactKeys(value,['type']),'无限出库指令无效');return;}
 if(outboundTools&&value.type==='finishOutboundEndless'){requireValue(version===13&&exactKeys(value,['type']),'无限出库指令无效');return;}
 if(outboundTools)requireValue(TOOL_IDS.includes(String(value.type)),'出库指令版本不匹配');
 switch(value.type){
  case 'chooseCleanup':requireValue(exactKeys(value,['type','branch'])&&(value.branch==='orders'||value.branch==='placements'),'清扫指令无效');return;
  case 'upgrade':requireValue(version===9&&onlyKeys(value,['type','upgradeId','cargo'])&&UPGRADE_IDS.includes(value.upgradeId as never)&&(value.cargo===undefined||cargo(value.cargo)),'升级指令无效');return;
  case 'rotate':requireValue(exactKeys(value,['type','pieceId','quarterTurns'])&&id(value.pieceId)&&integer(value.quarterTurns,1,3),'旋转指令无效');return;
  case 'clear':{
   const reserved=version===14?reservedEntryCellsV14({boardSize:7}):outboundTools?[OUTBOUND_ENTRY.entry.y*9+OUTBOUND_ENTRY.entry.x]:[];
   requireValue(exactKeys(value,['type','cells'])&&array(value.cells,2)&&value.cells.length>0&&unique(value.cells)&&value.cells.every(cell=>integer(cell,0,outboundTools?80:version===11||version===14?48:63)&&!reserved.includes(cell)),'清障指令无效');return;
  }
  case 'wildcard':requireValue(exactKeys(value,outboundTools?['type','pieceId','cargo']:['type','pieceId'])&&id(value.pieceId)&&(!outboundTools||OUTBOUND_CARGO.includes(value.cargo as never)),'万能指令无效');return;
  case 'continueOvertime':case 'finish':requireValue(exactKeys(value,['type']),'结束指令无效');return;
  default:throw Error('指令版本不匹配');
 }
}

function assertCommon(value:Obj,version:9|10|11|12|13|14,size:number):void {
 requireValue(integer(value.seed,-2147483648,4294967295),'种子无效');
 requireValue(array(value.rngState,4)&&value.rngState.length===4&&value.rngState.every(n=>integer(n,-2147483648,2147483647)),'随机状态无效');
 requireValue(array(value.board,size*size)&&value.board.length===size*size&&value.board.every(cell=>cell===null||cargo(cell)),'棋盘无效');
 requireValue(array(value.cellTraits,size*size)&&value.cellTraits.length===size*size,'货件特性数量无效');
 for(const field of ['nextId','completedOrders','score','lastChain','maxChain','generatedPieces','commandIndex','commandBaseIndex'])requireValue(integer(value[field]),`${field}无效`);
 requireValue(value.shift===getStageV9(Number(value.completedOrders)),'阶段与订单进度不一致');
 requireValue(Number(value.maxChain)>=Number(value.lastChain),'连单记录无效');
 requireValue(array(value.commands)&&value.commands.length+Number(value.commandBaseIndex)===value.commandIndex&&Number(value.commandBaseIndex)%128===0,'历史分段无效');
 value.commands.forEach(command=>assertGameCommandShape(command,version));
 for(const field of ['runSerial','elapsedMs','maxOccupancy'])if(value[field]!==undefined)requireValue(integer(value[field],field==='runSerial'?1:0,field==='maxOccupancy'?size*size:Number.MAX_SAFE_INTEGER),'应用元数据无效');
 requireValue(value.result===null||value.result==='won'||value.result==='failed','结果无效');
 requireValue(value.endReason===null||['blocked','completed','retired'].includes(String(value.endReason)),'结束原因无效');
 requireValue(typeof value.overtime==='boolean','加班状态无效');
 requireValue(!has(value,'colorTier')&&(![10,12,13].includes(version)?!has(value,'difficultyId'):has(value,'difficultyId')),'规则附加身份无效');
 if(value.phase==='result')requireValue(value.result!==null&&value.endReason!==null,'终局状态不一致');
 else requireValue(value.result===null&&value.endReason===null,'活跃局包含终局结果');
 if(value.result==='failed')requireValue(value.endReason==='blocked'||value.endReason==='retired','失败原因不一致');
 if(value.endReason==='completed')requireValue(value.result==='won','通关结果不一致');
}

function assertInbound(value:Obj):void {
 requireValue(onlyKeys(value,[...COMMON_FIELDS,'guided','levels','upgradeChoices','pendingThresholds','claimedThresholds','supplyCargo','cleanup','successfulPlacements','toolCharges','usedToolIds']),'入库包含其他规则字段');
 requireValue(value.runConfigId===RULES_V9_CONFIG.runConfigId&&['standard','daily','endless'].includes(String(value.mode)),'入库身份无效');
 requireValue(value.boardSize===7||value.boardSize===8,'入库尺寸无效');
 assertCommon(value,9,value.boardSize);
 requireValue(typeof value.guided==='boolean'&&(!value.guided||value.mode==='standard'),'引导身份无效');
 requireValue(['cleanup','input','upgrade','rescue','result'].includes(String(value.phase)),'入库阶段无效');
 requireValue(object(value.levels)&&exactKeys(value.levels,UPGRADE_IDS),'升级层数结构无效');
 const levels=value.levels;
 for(const upgrade of UPGRADES_V9)requireValue(integer(levels[upgrade.id],0,upgrade.maxStack)&&(Number(levels[upgrade.id])===0||Number(value.completedOrders)>=upgrade.unlockOrders),'升级层数或解锁进度无效');
 const levelTotal=Object.values(levels).reduce<number>((sum,n)=>sum+Number(n),0);
 requireValue(levelTotal<=7&&value.boardSize===(levels.warehouse_expand===1?8:7),'扩仓或升级总数不一致');
 requireValue(integer(value.successfulPlacements)&&Number(value.successfulPlacements)<=Number(value.commandIndex),'有效放置计数无效');
 requireValue(validToolChargesV9(value.toolCharges,value.mode as 'standard'|'daily'|'endless'),'道具预算无效');
 requireValue(array(value.usedToolIds,2)&&unique(value.usedToolIds)&&value.usedToolIds.every(tool=>TOOL_IDS.includes(String(tool))),'已用道具无效');
 const charges=value.toolCharges;
 requireValue(value.usedToolIds.every(tool=>charges[tool as keyof typeof charges]===0)&&Object.values(charges).reduce((sum,n)=>sum+n,0)+value.usedToolIds.length<=2,'道具预留与消耗矛盾');
 requireValue(value.mode!=='daily'||value.usedToolIds.length===0,'每日不接受道具');
 requireValue((levels.cargo_supply===0&&value.supplyCargo===null)||(Number(levels.cargo_supply)>0&&CARGO.slice(0,RULES_V9_CONFIG.cargoByShift[Number(value.shift)-1]).some(c=>c.id===value.supplyCargo)),'专供货类无效');
 requireValue(value.cleanup===null||(object(value.cleanup)&&exactKeys(value.cleanup,['branch','progress'])&&(value.cleanup.branch==='orders'||value.cleanup.branch==='placements')&&integer(value.cleanup.progress,0,value.cleanup.branch==='orders'?1:5)),'清扫进度无效');
 if(value.cleanup===null)requireValue(value.phase==='cleanup'||value.guided===true&&Number(value.shift)===1,'未选择清扫的状态无效');
 else requireValue(value.phase!=='cleanup','已选择清扫仍要求再次选择');
 requireValue(array(value.pendingThresholds,7)&&array(value.claimedThresholds,7),'升级阈值无效');
 const thresholds=[...value.claimedThresholds,...value.pendingThresholds],earned=RULES_V9_CONFIG.upgradeThresholds.filter(n=>n<=Number(value.completedOrders));
 requireValue(JSON.stringify(thresholds)===JSON.stringify(earned)&&value.claimedThresholds.length===levelTotal,'升级奖励丢失或重复');
 requireValue(value.pendingThresholds.length===0||value.phase==='upgrade'||value.phase==='cleanup','待领奖励与操作阶段不一致');
 requireValue(array(value.upgradeChoices,3)&&unique(value.upgradeChoices),'升级候选无效');
 if(value.phase==='upgrade')requireValue(value.pendingThresholds.length>0&&value.upgradeChoices.length===3&&value.upgradeChoices.every(id=>UPGRADES_V9.some(u=>u.id===id&&u.unlockOrders<=Number(value.completedOrders)&&Number(levels[u.id])<u.maxStack))&&value.upgradeChoices.filter(id=>UPGRADES_V9.some(u=>u.id===id&&u.functional)).length>=2,'升级候选不符合资格');
 else requireValue(value.upgradeChoices.length===0,'非升级阶段包含候选');
 const expectedCandidates=3+Number(levels.candidate_slots),initialCleanup=value.phase==='cleanup'&&value.commandIndex===0&&!value.guided;
 requireValue(array(value.candidates,5)&&value.candidates.length===(initialCleanup?0:expectedCandidates),'候选槽数量无效');
 requireValue(value.candidates.every(piece=>object(piece)&&id(piece.id)&&SHAPES.some(shape=>shape.id===piece.shapeId)&&cargo(piece.cargo)&&integer(piece.quarterTurns,0,3)&&!has(piece,'cellCargos')&&!has(piece,'orientation')&&(!has(piece,'trait')||TRAITS.slice(0,4).includes(String(piece.trait))&&piece.shapeId==='shape.single')&&(piece.trait==='rush'?piece.rushTurns===3:piece.rushTurns===undefined)),'候选货件无效');
 requireValue(unique(value.candidates.map(p=>(p as Obj).id)),'候选标识重复');
 const board=value.board as unknown[],traits=value.cellTraits as unknown[];
 traits.forEach((trait,index)=>{
  if(trait===null)return;
  requireValue(object(trait)&&board[index]!==null&&TRAITS.includes(String(trait.kind))&&!has(trait,'bornAtCommand'),'棋盘特性无效');
  if(trait.kind==='rush')requireValue(integer(trait.remaining,1,3)&&integer(trait.bornAtPlacement,0,Number(value.successfulPlacements)),'加急期限无效');
  else requireValue(trait.remaining===undefined&&trait.bornAtPlacement===undefined,'非加急货含期限');
 });
 requireValue(array(value.orders,4)&&value.orders.length===RULES_V9_CONFIG.docksByShift[Number(value.shift)-1],'订单数无效');
 requireValue(value.orders.every(order=>object(order)&&exactKeys(order,['id','dockId','cargo','amount','baseScore'])&&id(order.id)&&DOCK_IDS.includes(String(order.dockId))&&cargo(order.cargo)&&integer(order.amount,3,7)&&integer(order.baseScore,1,1000000)),'订单内容无效');
 requireValue(unique(value.orders.map(order=>(order as Obj).id))&&unique(value.orders.map(order=>(order as Obj).dockId))&&unique(value.orders.map(order=>(order as Obj).cargo)),'订单标识重复');
 if(value.overtime)requireValue(value.mode==='standard'&&Number(value.completedOrders)>=30,'加班身份无效');
 if(value.endReason==='completed')requireValue(value.mode!=='endless'&&Number(value.completedOrders)>=30&&value.pendingThresholds.length===0,'入库通关条件无效');
 if(value.endReason==='retired')requireValue(value.result===(value.mode==='standard'&&value.overtime?'won':'failed'),'主动结束结果不一致');
 if(value.result==='won')requireValue(value.endReason==='completed'||value.endReason==='retired'&&value.mode==='standard'&&value.overtime,'入库胜利原因无效');
}

function assertInboundV11(value:Obj,version:11|14=11):void {
 requireValue(onlyKeys(value,[...COMMON_FIELDS,'guided','levels','upgradeChoices','pendingThresholds','claimedThresholds','supplyCargo','cleanup','successfulPlacements','toolCharges','usedToolIds']),'入库包含其他规则字段');
 if(version===14){
  const optional=['runSerial','elapsedMs','maxOccupancy'];
  requireValue(exactKeys(value,[...COMMON_FIELDS.filter(field=>!optional.includes(field)),...optional.filter(field=>has(value,field)),'guided','levels','upgradeChoices','pendingThresholds','claimedThresholds','supplyCargo','cleanup','successfulPlacements','toolCharges','usedToolIds']),'入库字段无效');
  requireValue(value.maxOccupancy===undefined||integer(value.maxOccupancy,0,45),'占用格数包含预留入口');
 }
 requireValue(value.runConfigId===(version===14?RULES_V14_CONFIG:RULES_V11_CONFIG).runConfigId&&['standard','daily','endless'].includes(String(value.mode)),'入库身份无效');
 requireValue(value.boardSize===7,'入库尺寸无效');
 assertCommon(value,version,value.boardSize);
 if(version===14)requireValue(reservedEntryCellsV14({boardSize:7}).every(cell=>(value.board as unknown[])[cell]===null&&(value.cellTraits as unknown[])[cell]===null),'入口必须保持空置');
 requireValue(typeof value.guided==='boolean'&&(!value.guided||value.mode==='standard'),'引导身份无效');
 requireValue(['cleanup','input','rescue','result'].includes(String(value.phase)),'入库阶段无效');
 requireValue(object(value.levels)&&exactKeys(value.levels,NEUTRAL_LEVEL_IDS_V11)&&Object.values(value.levels).every(level=>level===0),'新入库不接受升级层数');
 requireValue(array(value.upgradeChoices,0)&&array(value.pendingThresholds,0)&&array(value.claimedThresholds,0)&&value.supplyCargo===null,'新入库不接受升级奖励或专供');
 requireValue(integer(value.successfulPlacements)&&Number(value.successfulPlacements)<=Number(value.commandIndex),'有效放置计数无效');
 requireValue(validToolChargesV11(value.toolCharges,value.mode as 'standard'|'daily'|'endless'),'道具预算无效');
 requireValue(array(value.usedToolIds,2)&&unique(value.usedToolIds)&&value.usedToolIds.every(tool=>TOOL_IDS.includes(String(tool))),'已用道具无效');
 const charges=value.toolCharges;
 requireValue(value.usedToolIds.every(tool=>charges[tool as keyof typeof charges]===0)&&Object.values(charges).reduce((sum,n)=>sum+n,0)+value.usedToolIds.length<=2,'道具预留与消耗矛盾');
 requireValue(value.mode!=='daily'||value.usedToolIds.length===0,'每日不接受道具');

 requireValue(value.cleanup===null||(object(value.cleanup)&&exactKeys(value.cleanup,['branch','progress'])&&(value.cleanup.branch==='orders'||value.cleanup.branch==='placements')&&integer(value.cleanup.progress,0,value.cleanup.branch==='orders'?1:5)),'清扫进度无效');
 if(value.cleanup===null)requireValue(value.phase==='cleanup'||value.guided===true&&Number(value.shift)===1,'未选择清扫的状态无效');
 else requireValue(value.phase!=='cleanup','已选择清扫仍要求再次选择');
 const initialCleanup=value.phase==='cleanup'&&value.commandIndex===0&&!value.guided;
 requireValue(array(value.candidates,3)&&value.candidates.length===(initialCleanup?0:3),'候选槽数量无效');
 requireValue(value.candidates.every(piece=>object(piece)&&id(piece.id)&&SHAPES.some(shape=>shape.id===piece.shapeId)&&cargo(piece.cargo)&&integer(piece.quarterTurns,0,3)&&!has(piece,'cellCargos')&&!has(piece,'orientation')&&(!has(piece,'trait')||TRAITS.slice(0,4).includes(String(piece.trait))&&(piece.shapeId==='shape.single'||version===14&&piece.trait==='rush'))&&(piece.trait==='rush'?piece.rushTurns===3:piece.rushTurns===undefined)),'候选货件无效');
 requireValue(unique(value.candidates.map(p=>(p as Obj).id)),'候选标识重复');
 const board=value.board as unknown[],traits=value.cellTraits as unknown[];
 if(version===14){
  requireValue(value.candidates.every(piece=>object(piece)&&exactKeys(piece,['id','shapeId','cargo','quarterTurns',...(has(piece,'trait')?['trait']:[]),...(has(piece,'rushTurns')?['rushTurns']:[])])),'入库候选字段无效');
  requireValue(value.candidates.every(piece=>object(piece)&&SHAPES.some(shape=>shape.id===piece.shapeId&&shape.minShift<=Number(value.shift))&&CARGO.slice(0,RULES_V14_CONFIG.cargoByShift[Number(value.shift)-1]).some(cargo=>cargo.id===piece.cargo)),'入库候选尚未解锁');
  requireValue(traits.every(trait=>trait===null||object(trait)&&exactKeys(trait,trait.kind==='rush'?['kind','remaining','bornAtPlacement']:['kind'])),'入库特性字段无效');
 }
 traits.forEach((trait,index)=>{
  if(trait===null)return;
  requireValue(object(trait)&&board[index]!==null&&TRAITS.includes(String(trait.kind))&&!has(trait,'bornAtCommand'),'棋盘特性无效');
  if(trait.kind==='rush')requireValue(integer(trait.remaining,1,3)&&integer(trait.bornAtPlacement,0,Number(value.successfulPlacements)),'加急期限无效');
  else requireValue(trait.remaining===undefined&&trait.bornAtPlacement===undefined,'非加急货含期限');
 });
 if(version===14){
  const bornClocks=new Map<number,{remaining:number;cargo:unknown}>();
  traits.forEach((trait,index)=>{if(!object(trait)||trait.kind!=='rush')return;
   const born=Number(trait.bornAtPlacement),remaining=Number(trait.remaining),prior=bornClocks.get(born);
   requireValue(born>=1&&remaining===3-(Number(value.successfulPlacements)-born),'加急时钟与有效放置次数不一致');
   requireValue(!prior||prior.remaining===remaining&&prior.cargo===board[index],'同一货件的加急时钟或货类不一致');
   bornClocks.set(born,{remaining,cargo:board[index]});
  });
 }
 requireValue(array(value.orders,4)&&value.orders.length===RULES_V11_CONFIG.docksByShift[Number(value.shift)-1],'订单数无效');
 requireValue(value.orders.every(order=>object(order)&&exactKeys(order,['id','dockId','cargo','amount','baseScore'])&&id(order.id)&&DOCK_IDS.includes(String(order.dockId))&&cargo(order.cargo)&&integer(order.amount,3,7)&&integer(order.baseScore,1,1000000)),'订单内容无效');
 requireValue(unique(value.orders.map(order=>(order as Obj).id))&&unique(value.orders.map(order=>(order as Obj).dockId))&&unique(value.orders.map(order=>(order as Obj).cargo)),'订单标识重复');
 if(value.overtime)requireValue(value.mode==='standard'&&Number(value.completedOrders)>=30,'加班身份无效');
 if(value.endReason==='completed')requireValue(value.mode!=='endless'&&Number(value.completedOrders)>=30,'入库通关条件无效');
 if(value.endReason==='retired')requireValue(value.result===(value.mode==='standard'&&value.overtime?'won':'failed'),'主动结束结果不一致');
 if(value.result==='won')requireValue(value.endReason==='completed'||value.endReason==='retired'&&value.mode==='standard'&&value.overtime,'入库胜利原因无效');
}

function assertOutboundTools(value:Obj,version:12|13):void {
 const optional=['runSerial','elapsedMs','maxOccupancy'];
 requireValue(exactKeys(value,[...COMMON_FIELDS.filter(field=>!optional.includes(field)),...optional.filter(field=>has(value,field)),'difficultyId','upgrades','upgradeChoices','toolCharges','usedToolIds','rawScore']),'出库字段无效');
 requireValue(value.mode==='color_exit'&&value.boardSize===9&&isOutboundDifficulty(value.difficultyId)&&value.runConfigId===`run.outbound9_v${version}.${value.difficultyId}`,'出库工具规则身份无效');
 assertCommon(value,version,9);
 requireValue(['input','rescue','result'].includes(String(value.phase)),'出库阶段无效');
 const board=value.board as unknown[];
 requireValue(board.every(cell=>cell===null||OUTBOUND_CARGO.includes(cell as never))&&(value.cellTraits as unknown[]).every(trait=>trait===null),'出库棋盘货类无效');
 requireValue(board[OUTBOUND_ENTRY.entry.y*9+OUTBOUND_ENTRY.entry.x]===null,'入口必须保持空置');
 requireValue(value.maxOccupancy===undefined||integer(value.maxOccupancy,0,80),'占用格数包含预留入口');
 const commands=value.commands as Obj[],lastCommand=commands[commands.length-1];
 const candidateCounts=version===12&&value.endReason==='completed'?(lastCommand?.type==='place'?[2]:lastCommand?.type==='clear'?[3]:[2,3]):[3];
 requireValue(array(value.candidates,3)&&candidateCounts.includes(value.candidates.length)&&value.candidates.every(piece=>object(piece)&&exactKeys(piece,['id','shapeId','cargo','quarterTurns',...(has(piece,'cellCargos')?['cellCargos']:[])])&&id(piece.id)&&integer(piece.quarterTurns,0,3)&&isValidOutboundPieceV12(piece))&&unique(value.candidates.map(piece=>(piece as Obj).id)),'出库候选无效');
 requireValue(array(value.orders,3)&&value.orders.length===3&&value.orders.every((order,i)=>object(order)&&exactKeys(order,['id','dockId','cargo','amount','baseScore'])&&Object.entries(OUTBOUND_TARGETS[i]).every(([key,expected])=>order[key]===expected)),'固定出口目标无效');
 requireValue(array(value.upgrades,0)&&array(value.upgradeChoices,0)&&value.overtime===false,'出库包含入库状态');
 requireValue(validToolChargesV12(value.toolCharges),'道具预算无效');
 requireValue(array(value.usedToolIds,2)&&unique(value.usedToolIds)&&value.usedToolIds.every(tool=>TOOL_IDS.includes(String(tool))),'已用道具无效');
 const charges=value.toolCharges;
 requireValue(value.usedToolIds.every(tool=>charges[tool as keyof typeof charges]===0)&&Object.values(charges).reduce((sum,n)=>sum+n,0)+value.usedToolIds.length<=2,'道具预留与消耗矛盾');
 requireValue(integer(value.rawScore)&&Number(value.rawScore)%10===0&&validScoreStateV12(value.rawScore,value.score,value.difficultyId as 'easy'|'normal'|'hard'|'expert')&&Number(value.lastChain)<=3&&Number(value.maxChain)<=3&&Number(value.generatedPieces)>=3,'出库分数或生成计数无效');
 if(value.phase==='rescue')requireValue(Object.values(charges).some(charge=>charge===1),'救援阶段缺少可用道具');
 if(version===12){
  requireValue(value.endReason!=='retired','普通出库不能收工');
  requireValue(value.phase==='result'?(Number(value.completedOrders)>=30?value.result==='won'&&value.endReason==='completed':value.result==='failed'&&value.endReason==='blocked'):Number(value.completedOrders)<30,'普通出库结束状态无效');
 }else requireValue(value.phase!=='result'?value.result===null:value.endReason==='retired'?value.result==='won':value.result==='failed'&&value.endReason==='blocked','无限出库结束状态无效');
}

function assertOutbound(value:Obj):void {
 requireValue(onlyKeys(value,[...COMMON_FIELDS,'difficultyId','upgrades','upgradeChoices']),'出库包含其他规则字段');
 requireValue(value.mode==='color_exit'&&value.boardSize===9&&isOutboundDifficulty(value.difficultyId)&&value.runConfigId===outboundRunConfigIdV10(value.difficultyId),'无限出库身份无效');
 assertCommon(value,10,9);
 requireValue(value.phase==='input'||value.phase==='result','出库阶段无效');
 requireValue((value.board as unknown[]).every(cell=>cell===null||OUTBOUND_CARGO.includes(cell as never))&&(value.cellTraits as unknown[]).every(trait=>trait===null),'出库棋盘货类无效');
 requireValue(array(value.candidates,3)&&value.candidates.length===3&&value.candidates.every(isValidOutboundPieceV6)&&unique(value.candidates.map(p=>p.id)),'出库候选无效');
 requireValue(array(value.orders,3)&&value.orders.length===3&&value.orders.every((order,i)=>object(order)&&exactKeys(order,['id','dockId','cargo','amount','baseScore'])&&Object.entries(OUTBOUND_TARGETS[i]).every(([key,expected])=>order[key]===expected)),'固定出口目标无效');
 requireValue(array(value.upgrades,0)&&array(value.upgradeChoices,0)&&value.overtime===false&&!has(value,'guided')&&!has(value,'toolCharges'),'出库包含入库状态');
 requireValue(Number(value.score)%10===0&&Number(value.lastChain)<=3&&Number(value.maxChain)<=3&&Number(value.generatedPieces)>=3,'出库分数或生成计数无效');
 requireValue(value.phase==='input'?value.result===null:value.endReason==='retired'?value.result==='won':value.result==='failed'&&value.endReason==='blocked','出库结束状态无效');
}

/** Untrusted state must be validated before entering a new engine or presentation. */
export function assertGameRun(value:unknown):asserts value is GameRun {
 requireValue(object(value),'单局结构无效');
 if(value.rulesetVersion===9){assertInbound(value);return;}
 if(value.rulesetVersion===10){assertOutbound(value);return;}
 if(value.rulesetVersion===11){assertInboundV11(value);return;}
 if(value.rulesetVersion===14){assertInboundV11(value,14);return;}
 if(value.rulesetVersion===12||value.rulesetVersion===13){assertOutboundTools(value,value.rulesetVersion);return;}
 requireValue(integer(value.rulesetVersion,1,8),'不支持的规则版本');assertRun(value);
}
function digest(raw:string):string {let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
export function encodeGameRun(run:GameRun):string {
 assertGameRun(run);if(run.rulesetVersion<=8)return encodeRun(run as Parameters<typeof encodeRun>[0]);
 return JSON.stringify({schemaVersion:run.rulesetVersion,digest:digest(JSON.stringify(run)),state:run});
}
export function decodeGameRun(raw:string):GameRun {
 requireValue(typeof raw==='string'&&raw.length<=950000,'单局存档超出大小限制');
 const envelope:unknown=JSON.parse(raw);requireValue(object(envelope),'单局存档无效');
 if(integer(envelope.schemaVersion,1,8))return decodeRun(raw);
 requireValue([9,10,11,12,13,14].includes(Number(envelope.schemaVersion)),'单局格式版本无效');
 if(Number(envelope.schemaVersion)>=12)requireValue(exactKeys(envelope,['schemaVersion','digest','state']),'单局封装字段无效');
 requireValue(typeof envelope.digest==='string'&&envelope.digest===digest(JSON.stringify(envelope.state)),'单局校验失败');
 assertGameRun(envelope.state);requireValue(envelope.state.rulesetVersion===envelope.schemaVersion,'格式与规则版本不一致');
 return envelope.state;
}
