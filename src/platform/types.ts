import type { Point } from '../domain/types.ts';
import type { StoragePort } from '../application/save.ts';
import type { WriterLease } from './writer-lease.ts';
export type PointerEvent = {type:'down'|'move'|'up'|'cancel';point:Point;id:number};
export const SOUND_NAMES=['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail'] as const;
export type SoundName=typeof SOUND_NAMES[number];
export interface Platform {
 storage:StoragePort;
 writerLease?:WriterLease;
 beginFrame():CanvasRenderingContext2D;
 frame(callback:(now:number)=>void):number;
 onPointer(callback:(event:PointerEvent)=>void):void;
 onHide(callback:()=>void):void;
 onShow(callback:()=>void):void;
 playSound(name:SoundName):void;
 stopSounds?():void;
 loadImage(path:string):Promise<CanvasImageSource>;
 now():number;
 wallTime?():number;
}
