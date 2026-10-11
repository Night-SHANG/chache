import {MUSIC_LEVELS} from '../shared/music-levels.ts';
interface MusicHandle {play():void|Promise<void>;pause():void;setVolume(volume:number):void}
/** One optional soundtrack. Try when the session allows playback; a real gesture retries host rejection. */
export function createMusicController(create:(onError:()=>void)=>MusicHandle) {
 let audio:MusicHandle|undefined,enabled=true,paused=false,hidden=false,gesturing=false,blocked=false,active=false,resumeOnShow=false,generation=0;
 let volume:number=MUSIC_LEVELS.normal,appliedVolume:number|undefined;
 const wanted=()=>enabled&&!paused&&!hidden&&!blocked;
 const pauseHandle=()=>{try{audio?.pause();}catch{/* Audio must never gate gameplay or lifecycle callbacks. */}};
 const stop=()=>{if(active){active=false;generation++;pauseHandle();}};
 const failed=()=>{blocked=true;resumeOnShow=false;stop();};
 const sync=()=>{
  if(!wanted()){stop();return;}
  try{
   audio??=create(failed);
   if(appliedVolume!==volume){appliedVolume=volume;try{audio.setVolume(volume);}catch{/* Optional gain changes never interrupt playback or retry every frame. */}}
   if(active)return;
   const request=++generation;active=true;
   const result=audio.play();
   if(result)void result.then(()=>{
    // A delayed completion must not revive a hidden, disabled, or failed player.
    if(!wanted())pauseHandle();
   },()=>{if(request===generation)failed();});
  }catch{failed();}
 };
 return {
  setState(nextEnabled:boolean,nextPaused:boolean,ducked=false):void{enabled=nextEnabled;paused=nextPaused;volume=ducked?MUSIC_LEVELS.paused:MUSIC_LEVELS.normal;if(hidden&&!enabled)resumeOnShow=false;if(!gesturing)sync();},
  gesture(callback:()=>void):void{blocked=false;gesturing=true;try{callback();}finally{gesturing=false;sync();}},
  hide():void{if(hidden)return;resumeOnShow=active;hidden=true;stop();},
  show():void{if(!hidden)return;hidden=false;if(!resumeOnShow)blocked=true;resumeOnShow=false;sync();},
 };
}
