/** Original-speed actual game.js frames, including exact fixed-phase Canvas checks. Offline evidence only. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createHost} from './host-runtime.mjs';
import {FIXED_PHASE_BOUNDARIES,LONG_DETOUR_CELLS,sourceHash,validateFixedOutboundPlan,assertSampleLegal,traversedSegments,traceForklifts,assertActualTransportFrame} from './outbound-fixed-qa-support.mjs';
import {createRun,applyCommand} from '../src/domain/engine.ts';
import {buildOutboundTransport,sampleOutboundTransport} from '../src/presentation/outbound-transport.ts';
import {encodeRun,saveKeysFor} from '../src/application/save.ts';
import {createProfile,encodeProfile,PROFILE_KEYS} from '../src/application/profile.ts';
import {cellCenter,getTrayRects,L} from '../src/presentation/layout.ts';
import {pieceCellCargo} from '../src/domain/pieces.ts';
import {checksum} from '../src/domain/replay.ts';

const OUT='artifacts/v074-video',fps=30,width=540,height=960,paddingMs=500,hostEpoch=Date.parse('2026-10-05T12:00:00.000Z');
const manifest=JSON.parse(await readFile('build/wechat/build-manifest.json','utf8')),source=await sourceHash(),gameSha=createHash('sha256').update(await readFile('build/wechat/game.js')).digest('hex');
assert.equal(source,manifest.sourceSha256,'build this exact source before video capture');assert.equal(manifest.developerDiagnostics,false);await mkdir(OUT,{recursive:true});
const cases=[['four-boxes',[4,5,13,14]],['branch-seven',[4,13,22,12,11,14,15]],['loop-five',[4,13,14,22,23]],['corridor-eight',Array.from({length:8},(_,y)=>y*9+4)],['dense-eighty',Array.from({length:81},(_,i)=>i).filter(i=>i!==76)],['east-four',[4,5,13,14],'east'],['west-four',[4,5,13,14],'west'],['mixed-remnant',[4,5,13,14]],['long-detour',LONG_DETOUR_CELLS]];
const results=[],center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
async function commandOutput(command,args){const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{errors+=chunk;});const [code]=await once(child,'close');assert.equal(code,0,`${command}: ${errors}`);return output;}
async function probeVideo(file,frames){
 const media=JSON.parse(await commandOutput('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration:format=duration,size','-of','json',file]));
 assert.equal(media.streams.length,1,`${file}: silent video only`);const stream=media.streams[0];assert.equal(stream.codec_type,'video');assert.equal(stream.width,width);assert.equal(stream.height,height);assert.equal(stream.r_frame_rate,'30/1');assert.equal(stream.avg_frame_rate,'30/1');assert.equal(Number(stream.nb_frames),frames);assert.ok(Math.abs(Number(stream.duration)-frames/fps)<1e-5,`${file}: original speed`);return media;
}
for(const [name,sourceCells,side='north']of cases){
 const cells=sourceCells.map(i=>side==='east'?(i%9)*9+8-Math.floor(i/9):side==='west'?(8-i%9)*9+Math.floor(i/9):i),cargo=side==='east'?'cargo.chem':side==='west'?'cargo.machine':'cargo.food',state=createRun(73,'color_exit',8,'normal'),hole=cells[cells.length-1];
 if(name==='long-detour')for(let i=0;i<81;i++)state.board[i]=(i%9+Math.floor(i/9))%2?'cargo.chem':'cargo.machine';
 for(const cell of cells)state.board[cell]=cargo;state.board[hole]=null;state.board[76]=null;state.candidates[0]={id:'piece.1',shapeId:'shape.single',cargo};
 const command={type:'place',pieceId:'piece.1',origin:{x:hole%9,y:Math.floor(hole/9)}};
 if(name==='mixed-remnant'){state.board.fill(null);state.board[4]='cargo.food';state.board[5]='cargo.food';state.candidates[0]={id:'piece.1',shapeId:'shape.square',cargo:'cargo.food',cellCargos:['cargo.food','cargo.food','cargo.chem','cargo.chem']};command.origin={x:4,y:1};}
 state.runSerial=100;const expected=applyCommand(state,command),events=expected.events.filter(e=>e.type==='shipment');assert.equal(events.length,1,`${name}: one showcased group`);const event=events[0],board=state.board.slice();
 for(const [index,cell]of expected.events.find(e=>e.type==='placed').cells.entries())board[cell]=pieceCellCargo(state.candidates[0],index);
 const plan=buildOutboundTransport(event,board),planChecks=validateFixedOutboundPlan(plan,event,board,name);
 if(name==='long-detour'){assert.equal(plan.route.moves,32);assert.equal(plan.route.turnQuarters,8);assert.ok(planChecks.minMoveMs<12,'long detour fits the carry budget instead of the former 150 ms minimum');}
 const profile=createProfile();profile.tutorialComplete=true;profile.nextRunSerial=101;
 const storage=new Map([[PROFILE_KEYS.main,encodeProfile(profile)],[saveKeysFor('outbound8_normal').main,encodeRun(state)],['warehouse.active-mode.v1','outbound8_normal']]),host=createHost(width,height,storage,0,1,hostEpoch),ctx=host.canvas.getContext('2d'),fill=ctx.fillText.bind(ctx),trace=traceForklifts(ctx);let labels=[];
 ctx.fillText=(text,x,y,...args)=>{const m=ctx.getTransform();labels.push({text:String(text),x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f});return fill(text,x,y,...args);};
 host.frame(0);const resume=center(L.resume);host.tap(resume.x,resume.y);host.frame(16);const from=center(getTrayRects(state.candidates.length)[0]),to=cellCenter(command.origin,state);host.drag(from,to);const base=16;
 const file=`${OUT}/${name}.mp4`,encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-threads','1','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 let errors='';encoder.stderr.on('data',chunk=>{errors+=chunk;});const exited=once(encoder,'close');
 const sequence=[],boundaryFrames=[],encodedTimes=Array.from({length:Math.ceil((plan.durationMs+paddingMs)*fps/1000)+1},(_,index)=>index*1000/fps),timeline=[...new Set([...encodedTimes,...FIXED_PHASE_BOUNDARIES])].sort((a,b)=>a-b);
 let previous=sampleOutboundTransport(plan,0),previousElapsed=0,maxPositionJump=0,maxAngleJump=0,maxPickupJump=0,badgeChecks=0,vehicleChecks=0,groupLoadTransitions=0;
 for(const elapsed of timeline){
  labels=[];trace.clear();host.frame(base+elapsed);
  // The wx host supplies Date.now(): preserve its epoch rounding instead of relaxing pixel checks.
  const clockElapsed=(hostEpoch+(base+elapsed))-(hostEpoch+base);
  const sample=sampleOutboundTransport(plan,Math.min(1,clockElapsed/plan.durationMs));assertSampleLegal(plan,board,sample,Math.min(clockElapsed,1000),`${name}/${elapsed}`);
  const actual=assertActualTransportFrame({trace,labels,plan,event,elapsed:clockElapsed,viewport:{w:width,h:height},label:`${name}/${elapsed}ms`});badgeChecks+=actual.badgeChecks;vehicleChecks+=actual.vehicleChecks;
  if(FIXED_PHASE_BOUNDARIES.includes(elapsed)){const picture=`${OUT}/${name}-at-${String(elapsed).replace('.','_')}ms.png`;await writeFile(picture,await host.canvas.encode('png'));boundaryFrames.push({elapsed,clockElapsed,stage:sample.stage,position:sample.position,loadedCount:sample.loadedCount,picture,...actual});}
  if(!encodedTimes.includes(elapsed))continue;
  const positionJump=Math.hypot(sample.position.x-previous.position.x,sample.position.y-previous.position.y),angleJump=Math.abs(Math.atan2(Math.sin(sample.angle-previous.angle),Math.cos(sample.angle-previous.angle)))*180/Math.PI;
  maxPositionJump=Math.max(maxPositionJump,positionJump);maxAngleJump=Math.max(maxAngleJump,angleJump);maxPickupJump=Math.max(maxPickupJump,sample.loadedCount-previous.loadedCount);
  if(sample.loadedCount!==previous.loadedCount){assert.equal(sample.loadedCount-previous.loadedCount,event.cells.length);groupLoadTransitions++;}
  // A 30 fps frame may span several cardinal edges and turns. Their certified route is the motion,
  // not a straight line drawn between sampled positions, so fast legal turns are not false failures.
  sequence.push({elapsed,clockElapsed,stage:sample.stage,position:sample.position,angle:sample.angle,loadedCount:sample.loadedCount,positionJump,angleJump,traversed:traversedSegments(plan,previousElapsed,Math.min(clockElapsed,1000)),...actual});
  const pixels=Buffer.from(ctx.getImageData(0,0,width,height).data);if(!encoder.stdin.write(pixels))await once(encoder.stdin,'drain');previous=sample;previousElapsed=clockElapsed;
 }
 assert.equal(groupLoadTransitions,1);assert.equal(sequence.length,46,'one second action plus half-second padding at original 30 fps');encoder.stdin.end();const [code]=await exited;assert.equal(code,0,errors);assert.equal(checksum(host.snapshot()),checksum(expected.state));
 const mediaVerification=await probeVideo(file,sequence.length);
 const result={name,file,mediaVerification,durationMs:plan.durationMs,paddingMs,videoFrames:sequence.length,fps,pickups:event.cells.length,route:plan.route,maxPositionJump,maxAngleJump,maxPickupJump,groupLoadTransitions,badgeChecks,vehicleChecks,actualFramesChecked:timeline.length,phaseBoundariesMs:FIXED_PHASE_BOUNDARIES,planChecks,boundaryFrames,checksum:checksum(expected.state)};
 results.push(result);await writeFile(`${OUT}/${name}-sequence.json`,JSON.stringify({manifest,sourceSha256:source,gameJsSha256:gameSha,...result,sequence},null,2));console.log(`PASS ${name}: ${plan.durationMs}ms, ${sequence.length}frames, ${vehicleChecks}actual poses, max ${maxPositionJump.toFixed(3)}cell/${maxAngleJump.toFixed(2)}deg`);
}
const previewFile=`${OUT}/fixed-second-preview.mp4`;
await commandOutput('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',`${OUT}/branch-seven.mp4`,'-i',`${OUT}/dense-eighty.mp4`,'-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-r',String(fps),'-an','-c:v','libx264','-threads','1','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',previewFile]);
const preview={file:previewFile,cases:['branch-seven','dense-eighty'],fps,videoFrames:92,mediaVerification:await probeVideo(previewFile,92)};
console.log(`PASS preview: ${preview.videoFrames} frames, original ${fps} fps, silent`);
assert.equal(await sourceHash(),source,'source frozen throughout video capture');assert.equal(createHash('sha256').update(await readFile('build/wechat/game.js')).digest('hex'),gameSha);
await writeFile(`${OUT}/report.json`,JSON.stringify({status:'PASS',evidence:'Actual built game.js in offline native Canvas/wx host; original-speed 30 fps video with 500 ms ending padding; not browser or WeChat-device footage',manifest,sourceSha256:source,gameJsSha256:gameSha,results,preview},null,2));
