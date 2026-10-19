import {installBrowserLanguage} from './presentation/browser-locale.ts';
import {EN} from './presentation/en.ts';
import {configureStaticArt} from './presentation/static-art-resources.ts';
import {prepareStaticArtForView} from './presentation/static-art-requirements.ts';
declare const __DEV_DIAGNOSTICS__:boolean;
import { createBrowserPlatform } from './platform/browser.ts';
import { GameSession } from './application/session.ts';
import { render } from './presentation/renderer.ts';
import {acquireBrowserWriter} from './platform/writer-lease.ts';
import {findPlayableMoves,previewPlayablePlacement,playableChecksum} from './domain/playable.ts';
declare const __APP_VERSION__:string;
const canvas=document.querySelector<HTMLCanvasElement>('#game');
if(!canvas)throw Error('Missing game canvas');
async function start(canvas:HTMLCanvasElement):Promise<void>{
const languageControl=installBrowserLanguage(EN);
const writer=await acquireBrowserWriter(navigator.locks);
const platform=createBrowserPlatform(canvas,writer);
const params=new URLSearchParams(window.location.search);
const seed=__DEV_DIAGNOSTICS__?Number(params.get('seed')||20261005)>>>0:20261005;
configureStaticArt(platform.loadImage);
const session=new GameSession(platform,{seed,mode:__DEV_DIAGNOSTICS__&&params.get('mode')==='standard'?'standard':'tutorial',developerMode:__DEV_DIAGNOSTICS__});
prepareStaticArtForView(session.view);
platform.onPointer(event=>{if(event.type==='cancel')session.input.cancel(event.id);else if(event.type==='down')session.input.down(event.point,event.id,event.pointerType);else session.input[event.type](event.point,event.id);});
platform.onWheel?.(event=>session.input.wheel(event.point,event.deltaY));
platform.onHide(()=>session.hide());platform.onShow(()=>session.show());
function frame(now:number){if(languageControl)languageControl.hidden=!['menu','settings'].includes(session.view.screen??'');session.tick(now);prepareStaticArtForView(session.view);render(platform.beginFrame(),session.state,session.view,platform.backgroundBounds?.(),platform.overlayBounds?.(),platform.frameBackdrop);platform.frame(frame);}platform.frame(frame);
// Local browser verification surface. Never imported by the WeChat entry point.
if(__DEV_DIAGNOSTICS__)Object.assign(window,{__WAREHOUSE__:{getState:()=>session.state,getView:()=>session.view,legalMoves:()=>findPlayableMoves(session.state),preview:(pieceId:string,origin:{x:number;y:number})=>previewPlayablePlacement(session.state,pieceId,origin),checksum:()=>playableChecksum(session.state),version:__APP_VERSION__}});
}
void start(canvas);
