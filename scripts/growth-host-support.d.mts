import type {AccountLoad} from '../src/application/account-store.ts';
import type {Image,Canvas,SKRSContext2D} from '@napi-rs/canvas';
export interface PackagedImageTrace {source:string;status:string;sha256?:string;bytes?:number;width?:number;height?:number;error?:string;injectedFailure?:boolean}
export function createPackagedImageLoader(packageRoot:string,options?:{defer?:boolean;rejectLoads?:boolean}):{create():Image;settle():Promise<PackagedImageTrace[]>;trace:PackagedImageTrace[]};
export function createPassiveAudioTrace(clock?:()=>number):{events:Array<{id:number;kind:string;time:number;value?:unknown;src?:string}>;handles:Array<{id:number;src:string;loop:boolean;volume:number;play:number;pause:number;stop:number;destroy:number;errorListeners:number}>;create():{src:string;loop:boolean;volume:number;play():void;pause():void;stop():void;destroy():void;onError(callback:()=>void):void}};
export function verifyEvidenceBinding(binding:{sourceSha256:string;gameJsSha256:string;manifestSourceSha256:string;expectedGameJsSha256?:string}):void;
export function validateResumeStorage(values:Map<string,string>):AccountLoad;
export function probeBuiltHost(options?:{bundlePath?:string}):Promise<{status:'PASS'|'FAIL';executedChecks:number;canvasCount?:number;extraGlobals?:string[];gameJsSha256?:string;error?:string}>;

export interface NativeGrowthHost {
 canvas:Canvas;
 context:SKRSContext2D;
 imageTrace:PackagedImageTrace[];settleImages():Promise<PackagedImageTrace[]>;canvasCount:number;labels:Array<{text:string}>;frame(time?:number):void;
 canvasObservers:Array<(surface:Canvas,id:number)=>void>;
 surfaceInfo:Array<{id:number;width:number;height:number}>;
}
export function createGrowthHost(options?:Record<string,unknown>):Promise<NativeGrowthHost>;
