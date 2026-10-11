import type { Point } from '../domain/types.ts';
import type { StoragePort } from '../application/save.ts';
import type { WriterLease } from './writer-lease.ts';
import type {Rect} from '../presentation/layout.ts';
export type PointerEvent = {type:'down'|'move'|'up'|'cancel';point:Point;id:number};
export type WheelEvent = {point:Point;deltaY:number};
export const SOUND_NAMES=['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail','ui_click'] as const;
export type SoundName=typeof SOUND_NAMES[number];
/** Optional offscreen canvas capability; no canvas is allocated until a preview needs one. */
export interface CanvasSurface {
 width:number;
 height:number;
 getContext(type:'2d'):CanvasRenderingContext2D|null;
 addEventListener?(type:string,callback:()=>void):void;
}
export interface Platform {
 createCanvasSurface?():CanvasSurface;
 storage:StoragePort;
 writerLease?:WriterLease;
 beginFrame():CanvasRenderingContext2D;
 /** Logical horizontal extent of the safe viewport; never changes input geometry. */
 backgroundBounds?():Rect|undefined;
 frame(callback:(now:number)=>void):number;
 onPointer(callback:(event:PointerEvent)=>void):void;
 onWheel?(callback:(event:WheelEvent)=>boolean):void;
 onHide(callback:()=>void):void;
 onShow(callback:()=>void):void;
 playSound(name:SoundName):void;
 /** Optional short, light tactile acknowledgment; unsupported hosts silently ignore it. */
 vibrate?():void;
 stopSounds?():void;
 setMusicState?(enabled:boolean,paused:boolean):void;
 loadImage(path:string):Promise<CanvasImageSource>;
 now():number;
 wallTime?():number;
}
