import type {GameRun} from '../src/domain/playable.ts';
export function constructedDenseRasterScene(family:string):{spec:Record<string,unknown>;state:GameRun;label:string;storage:Map<string,string>};
export interface RasterDraw {source:string;args:number[];alpha:number;transform:number[];viaSurfaces:number[]}
export interface RasterWitness {rasterDraws:RasterDraw[];rasterComposites:unknown[];rasterCounters:{assetDrawCalls:number;offscreenAssetDrawCalls:number;compositeDrawCalls:number}}
export function attachRasterDrawWitness<T>(host:T):T & RasterWitness;
export function runRasterArtNative(options:Record<string,unknown>):Promise<Record<string,unknown>>;
