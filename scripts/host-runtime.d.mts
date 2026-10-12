import type {Canvas} from '@napi-rs/canvas';
export function createHost(width?:number,height?:number,storage?:Map<string,string>,safeTop?:number,dpr?:number,epoch?:number):{readonly canvas:Canvas;readonly canvasCount:number;frame(time?:number):void};
