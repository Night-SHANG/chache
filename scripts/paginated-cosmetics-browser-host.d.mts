import type {Canvas,SKRSContext2D} from '@napi-rs/canvas';
import type {AccountLoad} from '../src/application/account-store.ts';
import type {PackagedImageTrace} from './growth-host-support.mjs';
export interface PaginatedBrowserHost {
 canvas:Canvas;context:SKRSContext2D;storage:Map<string,string>;
 labels:Array<{text:string}>;canvasObservers:Array<(surface:Canvas,id:number)=>void>;
 imageTrace:PackagedImageTrace[];settleImages():Promise<PackagedImageTrace[]>;
 gameJsSha256:string;browserJsSha256:string;readonly time:number;
 frame(time?:number):void;pointer(type:'down'|'move'|'up'|'cancel',x:number,y:number,id?:number):void;tap(x:number,y:number):void;
 wheel(x:number,y:number,deltaY:number,options?:Record<string,unknown>):boolean;account():AccountLoad;
 callbacks:{hide():void;show():void;blur():void};
}
export function createPaginatedBrowserHost(options?:Record<string,unknown>&{vibrate?:(duration:number)=>boolean|void}):Promise<PaginatedBrowserHost>;
