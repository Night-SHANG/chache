/** Replays actual reachable states, then measures CPU work only. Never a device FPS test. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const target=resolve(process.argv[2]??ROOT),output=process.argv[3];
const source=path=>import(pathToFileURL(resolve(target,path)).href);
const {createRunV16}=await source('src/domain/v16/engine.ts'),{createRunV18}=await source('src/domain/v18/engine.ts'),{createRunV21}=await source('src/domain/v21/engine.ts');
const {applyPlayableCommand,previewPlayablePlacement,findPlayableMoves,playableChecksum}=await source('src/domain/playable.ts');
const {InputController}=await source('src/presentation/input.ts'),{placementRisk}=await source('src/presentation/placement-risk.ts'),{cellCenter,getTrayRects}=await source('src/presentation/layout.ts');
const cases=JSON.parse(readFileSync(resolve(ROOT,'tests/fixtures/mobile/drag-traces.json'),'utf8'));
const statistics=times=>{times.sort((a,b)=>a-b);return {samples:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)};};
const measure=fn=>{for(let i=0;i<20;i++)fn(i);const times=[];for(let i=0;i<240;i++){const start=performance.now();fn(i);times.push(performance.now()-start);}return statistics(times);};
const rows=[];
for(const spec of cases){
 let state=spec.kind==='rush'?createRunV21({seed:spec.seed,mode:'rush'}):spec.kind==='normal'?createRunV16({seed:spec.seed,mode:'standard'}):createRunV18({seed:spec.seed,mode:'standard',inboundDifficulty:spec.kind});
 for(const command of spec.commands){const result=applyPlayableCommand(state,command);assert.equal(result.error,undefined);state=result.state;}
 assert.deepEqual({commandIndex:state.commandIndex,shift:state.shift,occupancy:state.board.filter(Boolean).length},spec.expected);
 const checksum=playableChecksum(state),move=findPlayableMoves(state)[0],point=cellCenter(move.origin,state),view={selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,screen:'game'};
 let previewCalls=0,riskCalls=0;
 const input=new InputController({getState:()=>state,getView:()=>view,patchView:patch=>Object.assign(view,patch),preview:(id,origin)=>{previewCalls++;return previewPlayablePlacement(state,id,origin);},risk:(id,origin,preview)=>{riskCalls++;return placementRisk(state,id,origin,preview);},dispatch(){throw Error('Benchmark never releases cargo');},togglePause(){},restart(){},resume(){},toggleDebug(){}});
 const tray=getTrayRects(state.candidates.length)[state.candidates.findIndex(piece=>piece.id===move.pieceId)];input.down({x:tray.x+tray.w/2,y:tray.y+tray.h/2});
 const sameCell=measure(i=>input.move({x:point.x+i%4,y:point.y+i%3}));const calls={preview:previewCalls,risk:riskCalls};
 const samePieceMoves=findPlayableMoves(state).filter(candidate=>candidate.pieceId===move.pieceId);const other=samePieceMoves.find(candidate=>candidate.origin.x!==move.origin.x||candidate.origin.y!==move.origin.y);
 const alternate=other?cellCenter(other.origin,state):{x:-1,y:-1};
 const changingCell=measure(i=>input.move(i%2?point:alternate));assert.equal(playableChecksum(state),checksum);input.cancel();
 rows.push({kind:spec.kind,stage:spec.stage,rulesetVersion:state.rulesetVersion,...spec.expected,commandTail:state.commands.length,checksum,sameCell,sameCellCalls:calls,changingCell,alternatingValidCells:!!other});
}
const result={method:'Cloud Node CPU only, not phone/browser/WeChat FPS. 20 warmups + 240 measured moves. Genuine reducer-replayed fixture traces, no synthetic history inflation; all tails below production 128-command boundary.',node:process.version,source:target,rows};
if(output)writeFileSync(resolve(output),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
