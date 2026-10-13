import {configureStaticArt,prepareStaticArt,type StaticArtRequirements,type StaticArtReadiness} from '../presentation/static-art-resources.ts';

/** A failure upper bound, never a minimum delay. Late image resolutions cannot
 * replace a startup image promise that already failed at the deadline. */
export const ANDROID_STARTUP_ART_DEADLINE_MS=4000;
export async function prepareAndroidStartupArt(load:(path:string)=>Promise<CanvasImageSource>,requirements:StaticArtRequirements,deadlineMs=ANDROID_STARTUP_ART_DEADLINE_MS):Promise<StaticArtReadiness> {
 let preparing=true,expired=false;
 const pending=new Set<(reason:Error)=>void>();
 const timer=setTimeout(()=>{expired=true;for(const reject of pending)reject(Error('Android initial artwork deadline exceeded'));pending.clear();},deadlineMs);
 configureStaticArt(path=>{
  if(!preparing)return load(path);
  if(expired)return Promise.reject(Error('Android initial artwork deadline exceeded'));
  return new Promise<CanvasImageSource>((resolve,reject)=>{
   const fail=(error:Error)=>{pending.delete(fail);reject(error);};pending.add(fail);
   void Promise.resolve().then(()=>load(path)).then(image=>{pending.delete(fail);resolve(image);},fail);
  });
 });
 try{return await prepareStaticArt(requirements);}finally{preparing=false;clearTimeout(timer);}
}
