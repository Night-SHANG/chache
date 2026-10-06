declare const __DEV_DIAGNOSTICS__:boolean;
import { createBrowserPlatform } from './platform/browser.ts';
import { GameSession } from './application/session.ts';
import { render } from './presentation/renderer.ts';
import { findLegalMoves, previewPlacement } from './domain/engine.ts';
import { checksum } from './domain/replay.ts';
declare const __APP_VERSION__:string;
const canvas=document.querySelector<HTMLCanvasElement>('#game');
if(!canvas)throw Error('Missing game canvas');
const platform=createBrowserPlatform(canvas);
const params=new URLSearchParams(window.location.search);
const seed=__DEV_DIAGNOSTICS__?Number(params.get('seed')||20261005)>>>0:20261005;
const session=new GameSession(platform,{seed,mode:__DEV_DIAGNOSTICS__&&params.get('mode')==='standard'?'standard':'tutorial',developerMode:__DEV_DIAGNOSTICS__});
platform.onPointer(event=>{if(event.type==='cancel')session.input.cancel(event.id);else session.input[event.type](event.point,event.id);});
platform.onHide(()=>session.hide());platform.onShow(()=>session.show());
function frame(now:number){session.tick(now);render(platform.beginFrame(),session.state,session.view);platform.frame(frame);}platform.frame(frame);
// Local browser verification surface. Never imported by the WeChat entry point.
if(__DEV_DIAGNOSTICS__)Object.assign(window,{__WAREHOUSE__:{getState:()=>session.state,getView:()=>session.view,legalMoves:()=>findLegalMoves(session.state),preview:(pieceId:string,origin:{x:number;y:number})=>previewPlacement(session.state,pieceId,origin),checksum:()=>checksum(session.state),version:__APP_VERSION__}});
