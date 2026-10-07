import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyCommandV11,createRunV11} from '../src/domain/v11/engine.ts';
import {checksumV11,replayV11} from '../src/domain/v11/replay.ts';
import {checksumV14} from '../src/domain/v14/replay.ts';
import {createRunV14} from '../src/domain/v14/engine.ts';
import type {InboundCommandV11,StartV11} from '../src/domain/v11/types.ts';

const frozenV11={
 'src/domain/v11/board.ts':'389884407b3a3dad0a889e23cf0e923e10360a0ff167f6e97216a93a77891a9b',
 'src/domain/v11/content.ts':'984d52b7604d1cd37c1394ee11a59029a5a8fe38f45cee9cd0e62195f534aa5c',
 'src/domain/v11/engine.ts':'f5db290ea2e4cbd382edc6b31140ba238dac3dfcf1ab961b360c665e83d1801f',
 'src/domain/v11/generation.ts':'595ade11e57a3facb400a7864a37ff1d58ae1a792bb927aecf49a879b37f3c8d',
 'src/domain/v11/replay.ts':'d734c8771ad700ab8065955bf4ec20298a6354fa21d0a57401ae170b91732f61',
 'src/domain/v11/tools.ts':'45a4bd3f01089a2d1e7e4f0b5f82ae4d8ccc7b52974df2984d268d05b51e995d',
 'src/domain/v11/types.ts':'91dfe1808e243f5f2f87c32568e4425a614db9bec29afe7c97540f45cd3d7dcc',
};

test('every frozen rules1–11 domain file keeps its exact approved source fingerprint',()=>{
 const older=['inbound-v9-legacy-files.json','inbound-v11-legacy-files.json'].map(file=>JSON.parse(readFileSync(new URL(`./fixtures/${file}`,import.meta.url),'utf8')) as {files:Record<string,string>});
 const files={...older[0].files,...older[1].files,...frozenV11};assert.equal(Object.keys(files).length,53);
 for(const [path,expected] of Object.entries(files))assert.equal(createHash('sha256').update(readFileSync(new URL(`../${path}`,import.meta.url))).digest('hex'),expected,path);
});

test('frozen rules11 checksums retain old reserved-cell placements while rules14 has a distinct identity',()=>{
 const options:StartV11={seed:17,mode:'standard',toolCharges:{rotate:0,clear:1,wildcard:1}},commands:InboundCommandV11[]=[
  {type:'chooseCleanup',branch:'placements'},
  {type:'wildcard',pieceId:'piece.3'},
  {type:'place',pieceId:'piece.3',origin:{x:0,y:0}},
  {type:'place',pieceId:'piece.6',origin:{x:1,y:0}},
  {type:'place',pieceId:'piece.8',origin:{x:0,y:0}},
  {type:'place',pieceId:'piece.9',origin:{x:1,y:0}},
  {type:'place',pieceId:'piece.10',origin:{x:2,y:0}},
  {type:'place',pieceId:'piece.11',origin:{x:3,y:0}},
  {type:'place',pieceId:'piece.12',origin:{x:4,y:0}},
  {type:'place',pieceId:'piece.13',origin:{x:5,y:1}},
  {type:'finish'},
 ];
 const checksums=['5fe9bdda','d515ae55','2ed4c12c','b74991c8','b0fc303d','92b2d207','02511fcb','e51e9348','3e121087','e3bd3747','d6dc77b5','876dbdd7'];
 let state=createRunV11(options);assert.equal(checksumV11(state),checksums[0]);
 for(let i=0;i<commands.length;i++){const result=applyCommandV11(state,commands[i]);assert.equal(result.error,undefined);state=result.state;assert.equal(checksumV11(state),checksums[i+1]);}
 assert.deepEqual(replayV11(options,commands).trace.map(entry=>entry.checksum),checksums.slice(1));
 assert.notEqual(checksumV14(createRunV14(options)),checksumV11(createRunV11(options)));
});
