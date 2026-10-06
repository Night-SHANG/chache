import type {CargoId,Dock,Order,OutboundDifficulty,Piece} from '../types.ts';
import {SHAPES} from '../rulesets/v1/content.ts';

/** New size and generation distribution have an isolated identity; v1-v5 remain frozen. */
export const RULES_V6_CONFIG={
 balanced:false,rulesetVersion:6,runConfigId:'run.outbound9_v6',
 boardSize:9,candidateCount:3,minBatch:4,targetBatches:30,batchesPerStage:6,stageCount:5,pointsPerCell:10,
 generation:{occupancySmallPercent:200,recentShapeDivisor:2,cargoBaseWeight:20,cargoPresenceWeight:2},
} as const;
export const OUTBOUND_DIFFICULTIES:readonly OutboundDifficulty[]=['easy','normal','hard','expert'];
export const MIXED_COLOR_PERCENT_V6:Readonly<Record<OutboundDifficulty,number>>={easy:20,normal:30,hard:40,expert:50};
export function isOutboundDifficulty(value:unknown):value is OutboundDifficulty {return OUTBOUND_DIFFICULTIES.some(difficulty=>difficulty===value);}
export function outboundRunConfigId(difficulty:OutboundDifficulty):string {
 if(!isOutboundDifficulty(difficulty))throw Error('出库规则版本必须指定有效难度');
 return `${RULES_V6_CONFIG.runConfigId}.${difficulty}`;
}
export const OUTBOUND_ENTRY:Dock={id:'dock.south',name:'南入口',entry:{x:4,y:8},side:'south',priority:3};
export const OUTBOUND_DOCKS:(Dock&{cargo:CargoId})[]=[
 {id:'dock.north',name:'北食品出口',entry:{x:4,y:0},side:'north',priority:0,cargo:'cargo.food'},
 {id:'dock.east',name:'东化工出口',entry:{x:8,y:4},side:'east',priority:1,cargo:'cargo.chem'},
 {id:'dock.west',name:'西机械出口',entry:{x:0,y:4},side:'west',priority:2,cargo:'cargo.machine'},
];
export const OUTBOUND_TARGETS:Order[]=OUTBOUND_DOCKS.map(dock=>({id:`exit.${dock.cargo.slice('cargo.'.length)}`,dockId:dock.id,cargo:dock.cargo,amount:RULES_V6_CONFIG.minBatch,baseScore:0}));
export const OUTBOUND_CARGO:CargoId[]=['cargo.food','cargo.machine','cargo.chem'];
export const MIXED_SHAPES_V6:readonly string[]=Object.freeze(['shape.square','shape.i4_h','shape.i4_v','shape.l4_e','shape.l4_w','shape.s4_h','shape.z4_h','shape.p5']);
/** A always owns the first cell; shape cells retain their frozen v1 ordering. */
export const MIXED_PARTITIONS_V6:Readonly<Record<string,readonly string[]>>=Object.freeze({
 'shape.square':Object.freeze(['AABB','ABAB']),
 'shape.i4_h':Object.freeze(['AABB']),'shape.i4_v':Object.freeze(['AABB']),
 'shape.l4_e':Object.freeze(['AABB']),'shape.l4_w':Object.freeze(['AABB']),
 'shape.s4_h':Object.freeze(['AABB']),'shape.z4_h':Object.freeze(['AABB']),
 'shape.p5':Object.freeze(['AABBB','AABAB','ABABA']),
});
export const COLOR_PAIRS_V6:readonly (readonly CargoId[])[]=Object.freeze(OUTBOUND_CARGO.flatMap(first=>OUTBOUND_CARGO.filter(second=>second!==first).map(second=>Object.freeze([first,second]))));
/** The complete validation catalogue; generation samples shape first, never this flattened pool. */
export const MIXED_COLOR_PATTERNS_V6:readonly {shapeId:string;cellCargos:readonly CargoId[]}[]=Object.freeze(MIXED_SHAPES_V6.flatMap(shapeId=>MIXED_PARTITIONS_V6[shapeId].flatMap(partition=>COLOR_PAIRS_V6.map(pair=>Object.freeze({shapeId,cellCargos:Object.freeze([...partition].map(letter=>pair[letter==='A'?0:1]))})))));
/** Shared by save validation and v6 placement. Legacy square-only validation is untouched. */
export function isValidOutboundPieceV6(value:unknown):value is Piece {
 if(value===null||typeof value!=='object'||Array.isArray(value))return false;
 const p=value as Partial<Piece>;
 if(typeof p.id!=='string'||!p.id||!SHAPES.some(shape=>shape.id===p.shapeId)||!OUTBOUND_CARGO.some(cargo=>cargo===p.cargo)||p.trait!==undefined||p.rushTurns!==undefined)return false;
 if(p.cellCargos===undefined)return true;
 if(!Array.isArray(p.cellCargos)||p.cellCargos[0]!==p.cargo)return false;
 return MIXED_COLOR_PATTERNS_V6.some(pattern=>pattern.shapeId===p.shapeId&&pattern.cellCargos.length===p.cellCargos!.length&&pattern.cellCargos.every((cargo,index)=>cargo===p.cellCargos![index]));
}
