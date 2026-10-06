import type {RunState} from '../domain/types.ts';
import type {ViewState} from './view-types.ts';
import {buildDebugRows} from './diagnostics.ts';
export const DEBUG_PREVIOUS={x:180,y:1540,w:310,h:84};
export const DEBUG_NEXT={x:590,y:1540,w:310,h:84};
/** Fixed-size pages preserve every canonical route coordinate without shrinking text. */
export function debugPages(state:RunState,view:ViewState):string[][]{
 const lines:string[]=[];
 for(const row of buildDebugRows(state,view)){
  let line='',width=0;
  for(const char of row){const units=char.charCodeAt(0)>255?2:1;if(width+units>64){lines.push(line);line='  ';width=2;}line+=char;width+=units;}
  lines.push(line);
 }
 const pages:string[][]=[];for(let i=0;i<lines.length;i+=24)pages.push(lines.slice(i,i+24));return pages.length?pages:[[]];
}
