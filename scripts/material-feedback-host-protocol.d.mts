import type {BinaryLike} from 'node:crypto';
export interface OwnerBinding {
 root?:string;ownerFrozen:boolean;aggregateChecksPassed:boolean;expectedCommit:string;expectedSourceSha256:string;
 expectedGameJsSha256:string;expectedBrowserJsSha256:string;expectedPaidGameJsSha256:string;freeBuildRoot:string;paidBuildRoot:string;
 legacySfxSha256?:Record<string,string>|null;
}
export interface HostManifest {
 version:string;shopPricingMode:string;developerDiagnostics:boolean;commit:string;sourceSha256:string;
 backgroundMusic:{sha256:string;defaultVolume:number};soundEffects:{browserVolume:number;wechatVolume:number};
 cosmetics:{catalogSize:number};modes:{rush:{maxToolTypes:number}};
}
export interface NaturalPixelRow {
 wave:number;checksum:string;
 cards:{dock?:string;cargo?:string;strong:boolean;labels:string[];fill?:number[]}[];
 gates:{north:number[];east:number[]};
 eastGatePatch?:{x:number;y:number;rgba:number[]}[];
}
export const MUSIC_SHA:string;
export const VIEWPORTS:{width:number;height:number;safeTop:number;dpr:number}[];
export const SHELLS:string[];
export const EXACT_SENTENCE:string;
export function sha256(value:BinaryLike):string;
export function assertManifestPair(browser:HostManifest,wechat:HostManifest,binding:OwnerBinding,mode?:string):HostManifest;
export function assertOwnerBinding(binding:OwnerBinding):void;
export function waveTimeline(waves:number):{wave:number;elapsed:number;absoluteMs:number}[];
export function sampleEastGatePatch(readPixel:(x:number,y:number)=>number[]):{x:number;y:number;rgba:number[]}[];
export function assertNaturalPixels<T extends NaturalPixelRow>(row:T):T;
