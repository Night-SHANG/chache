import type { Point } from '../domain/types.ts';
import type { StoragePort } from '../application/save.ts';
import type { WriterLease } from './writer-lease.ts';
import type {Rect} from '../presentation/layout.ts';
export type PointerType = 'touch'|'mouse'|'pen'|'unknown';
export type PointerEvent = {pointerType?:PointerType;type:'down'|'move'|'up'|'cancel';point:Point;id:number};
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
/** Shared opaque beginFrame backing; never changes the finite scenery envelope. */
export const FRAME_BACKDROP='#0c131c';
export interface Platform {
 /** Opt-in contract for the static warehouse cache: beginFrame paints this opaque color with no clipping. */
 readonly frameBackdrop?:string;
 createCanvasSurface?():CanvasSurface;
 storage:StoragePort;
 writerLease?:WriterLease;
 beginFrame():CanvasRenderingContext2D;
 /** Scenery bounds in logical coordinates; Android may extend finite static scenery to the full viewport. */
 backgroundBounds?():Rect|undefined;
 /** Optional native safe content area, in the same logical coordinates as drawing and input. */
 contentBounds?():Rect|undefined;
 /** Full screen canvas in logical coordinates, separate from finite scenery bounds. */
 overlayBounds?():Rect|undefined;
 frame(callback:(now:number)=>void):number;
 onPointer(callback:(event:PointerEvent)=>void):void;
 onWheel?(callback:(event:WheelEvent)=>boolean):void;
 onHide(callback:()=>void):void;
 onShow(callback:()=>void):void;
 playSound(name:SoundName):void;
 /** Optional short, light tactile acknowledgment; unsupported hosts silently ignore it. */
 vibrate?():void;
 stopSounds?():void;
 setMusicState?(enabled:boolean,paused:boolean,ducked?:boolean):void;
 loadImage(path:string):Promise<CanvasImageSource>;
 now():number;
 wallTime?():number;
}
