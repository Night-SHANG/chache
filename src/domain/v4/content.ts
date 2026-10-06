import type {CargoId,Dock,Order} from '../types.ts';

/** Frozen P0 proposal: changing any generation/scoring value requires a new rules identity. */
export const RULES_V4_CONFIG={
 balanced:false,rulesetVersion:4,runConfigId:'run.color_exit_p0_v4',
 boardSize:7,candidateCount:3,minBatch:4,targetBatches:30,batchesPerStage:6,stageCount:5,pointsPerCell:10,
 generation:{occupancySmallPercent:200,recentShapeDivisor:2,cargoBaseWeight:20,cargoPresenceWeight:2},
} as const;
export const COLOR_EXIT_ENTRY:Dock={id:'dock.south',name:'南入口',entry:{x:3,y:6},side:'south',priority:3};
export const COLOR_EXIT_DOCKS:(Dock&{cargo:CargoId})[]=[
 {id:'dock.north',name:'北食品出口',entry:{x:3,y:0},side:'north',priority:0,cargo:'cargo.food'},
 {id:'dock.east',name:'东化工出口',entry:{x:6,y:3},side:'east',priority:1,cargo:'cargo.chem'},
 {id:'dock.west',name:'西机械出口',entry:{x:0,y:3},side:'west',priority:2,cargo:'cargo.machine'},
];
/** These are static exit targets, never randomly refreshed or counted as generated IDs. */
export const COLOR_EXIT_TARGETS:Order[]=COLOR_EXIT_DOCKS.map(dock=>({
 id:`exit.${dock.cargo.slice('cargo.'.length)}`,dockId:dock.id,cargo:dock.cargo,amount:RULES_V4_CONFIG.minBatch,baseScore:0,
}));
export const COLOR_EXIT_CARGO:CargoId[]=['cargo.food','cargo.machine','cargo.chem'];
