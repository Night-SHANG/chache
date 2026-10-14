import {GameSession} from '../application/session.ts';
import {configureDouyinRendering} from '../presentation/douyin/bounded-painter.ts';
import {DouyinSidebar} from '../presentation/douyin/sidebar.ts';
import {render} from '../presentation/renderer.ts';
import {configureStaticArt} from '../presentation/static-art-resources.ts';
import {prepareStaticArtForView} from '../presentation/static-art-requirements.ts';
import {createDouyinPlatform,type DouyinClock,type DouyinHost} from './douyin.ts';

/** Actual tt bootstrap, kept separate from the three existing host entry points. */
export function startDouyinGame(host:DouyinHost,clock:DouyinClock,options:{seed?:number;developerMode?:boolean}={}) {
 const platform=createDouyinPlatform(host,clock);
 configureDouyinRendering(platform.createCanvasSurface!);
 configureStaticArt(platform.loadImage);
 const session=new GameSession(platform,{seed:options.seed??20261005,mode:'tutorial',developerMode:options.developerMode??false});
 const sidebar=new DouyinSidebar(platform,()=>session.view);
 prepareStaticArtForView(session.view);
 platform.onPointer(event=>{
  if(sidebar.pointer(event))return;
  if(event.type==='cancel')session.input.cancel(event.id);
  else if(event.type==='down')session.input.down(event.point,event.id,event.pointerType);
  else session.input[event.type](event.point,event.id);
  sidebar.refresh();
 });
 platform.onHide(()=>{sidebar.hide();session.hide();});platform.onShow(()=>{session.show();sidebar.show();});
 const frame=(now:number)=>{
  session.tick(now);prepareStaticArtForView(session.view);
  const context=platform.beginFrame();
  render(context,session.state,session.view,platform.backgroundBounds?.(),platform.overlayBounds?.(),platform.frameBackdrop);
  sidebar.draw(context);
  platform.frame(frame);
 };
 platform.frame(frame);
 return {platform,session};
}
