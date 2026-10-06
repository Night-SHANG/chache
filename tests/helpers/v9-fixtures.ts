import {emptyLevelsV9} from '../../src/domain/v9/content.ts';
import type { InboundRunV9 } from '../../src/domain/v9/types.ts';
import { createRandomState } from '../../src/domain/random.ts';
export function makeV9Fixture(patch:Partial<InboundRunV9>={}):InboundRunV9 {
  const size=patch.boardSize??7;
  const state:InboundRunV9={rulesetVersion:9,runConfigId:'run.inbound_v9',seed:1,mode:'standard',guided:false,
    boardSize:size,board:Array(size*size).fill(null),cellTraits:Array(size*size).fill(null),rngState:createRandomState(1),nextId:10,
    candidates:[{id:'piece.1',shapeId:'shape.single',cargo:'cargo.food',quarterTurns:0},{id:'piece.3',shapeId:'shape.domino_h',cargo:'cargo.machine',quarterTurns:0},{id:'piece.4',shapeId:'shape.single',cargo:'cargo.chem',quarterTurns:0}],
    orders:[{id:'order.2',dockId:'dock.north',cargo:'cargo.food',amount:4,baseScore:100},{id:'order.5',dockId:'dock.east',cargo:'cargo.chem',amount:4,baseScore:100}],
    phase:'input',shift:1,completedOrders:0,score:0,lastChain:0,maxChain:0,levels:emptyLevelsV9(),upgradeChoices:[],pendingThresholds:[],claimedThresholds:[],
    supplyCargo:null,cleanup:{branch:'orders',progress:0},successfulPlacements:0,generatedPieces:3,
    toolCharges:{rotate:0,clear:0,wildcard:0},usedToolIds:[],commandIndex:0,commandBaseIndex:0,commands:[],
    overtime:false,result:null,endReason:null,maxOccupancy:0,...patch};
  return structuredClone(state);
}
