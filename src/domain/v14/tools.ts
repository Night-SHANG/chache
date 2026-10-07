import {cloneData} from '../../shared/data.ts';
import { pieceCellsV14,findLegalMovesV14,placementCellsV14,toIndexV14 } from './board.ts';
import type { InboundRunV14,ToolCommandV14,InboundStepResultV14,ToolIdV14 } from './types.ts';

export function applyToolV14(state:InboundRunV14,command:ToolCommandV14):InboundStepResultV14 {
 const reject=(error:string):InboundStepResultV14=>({state,events:[],error});
 if(!command||!['rotate','clear','wildcard'].includes(command.type))return reject('未知道具');
 if(state.mode==='daily'||!['input','rescue'].includes(state.phase)||state.result!==null)return reject('当前不能使用道具');
 const toolId:ToolIdV14=command.type;if(state.toolCharges[toolId]!==1)return reject('没有可用道具');
 const next=cloneData(state);
 if(command.type==='clear'){
  if(!Array.isArray(command.cells)||command.cells.length<1||command.cells.length>2||new Set(command.cells).size!==command.cells.length||command.cells.some(i=>!Number.isInteger(i)||i<0||i>=state.board.length||state.board[i]===null))return reject('请选择1至2个占用格');
  for(const cell of command.cells){next.board[cell]=null;next.cellTraits[cell]=null;}
 }else{
  const index=state.candidates.findIndex(p=>p.id===command.pieceId);if(index<0)return reject('货件已不存在');
  const piece=next.candidates[index];
  if(command.type==='rotate'){
   if(![1,2,3].includes(command.quarterTurns))return reject('旋转朝向无效');
   const before=pieceCellsV14(piece);piece.quarterTurns=(piece.quarterTurns+command.quarterTurns)%4 as 0|1|2|3;
   if(JSON.stringify(before)===JSON.stringify(pieceCellsV14(piece)))return reject('旋转没有改变占格');
  }else{
   if(piece.trait==='wildcard')return reject('货件已经是万能货');
   next.candidates[index]={id:piece.id,shapeId:'shape.single',quarterTurns:0,cargo:piece.cargo,trait:'wildcard'};
  }
 }
 next.toolCharges[toolId]=0;if(!next.usedToolIds.includes(toolId))next.usedToolIds.push(toolId);
 next.commandIndex++;next.commands.push(cloneData(command));
 return {state:next,events:[{type:'toolUsed',toolId,...(command.type==='clear'?{cells:[...command.cells]}:{pieceId:command.pieceId})}]};
}
/** Missing occupied cells, rather than board-wide subsets, give a complete clear witness for any shape. */
function clearWitness(state:InboundRunV14):ToolCommandV14|null {
 if(!state.toolCharges.clear)return null;
 for(const piece of state.candidates){const cells=pieceCellsV14(piece);for(let y=0;y<state.boardSize;y++)for(let x=0;x<state.boardSize;x++){
  const points=cells.map(p=>({x:p.x+x,y:p.y+y}));if(points.some(p=>p.x>=state.boardSize||p.y>=state.boardSize))continue;
  const missing=points.map(p=>toIndexV14(p,state.boardSize)).filter(i=>state.board[i]!==null);
  if(missing.length>0&&missing.length<=2){
   const board=state.board.slice();for(const cell of missing)board[cell]=null;
   // The hypothetical clear must pass the same complete placement predicate as a real move.
   if(!placementCellsV14({...state,board},piece.id,{x,y}).reason)return {type:'clear',cells:missing};
  }
 }}
 return null;
}
export function findRescuePlanV14(state:InboundRunV14):ToolCommandV14[]|null {
 if(state.mode==='daily'||state.result!==null)return null;
 const input={...state,phase:'input' as const};if(findLegalMovesV14(input).length)return [];
 const clear=clearWitness(input);if(clear)return [clear];
 const transforms:ToolCommandV14[]=[];
 for(const piece of input.candidates){if(input.toolCharges.rotate)for(const quarterTurns of [1,2,3] as const)transforms.push({type:'rotate',pieceId:piece.id,quarterTurns});if(input.toolCharges.wildcard)transforms.push({type:'wildcard',pieceId:piece.id});}
 for(const command of transforms){const first=applyToolV14(input,command);if(first.error)continue;if(findLegalMovesV14(first.state).length)return [command];const clear=clearWitness(first.state);if(clear)return [clear,command];
  // Rotation plus wildcard is included, even though wildcard usually makes rotation unnecessary.
  for(const second of transforms){if(second.type===command.type||second.type==='clear')continue;const result=applyToolV14(first.state,second);if(!result.error&&findLegalMovesV14(result.state).length)return [command,second];}
 }
 return null;
}
