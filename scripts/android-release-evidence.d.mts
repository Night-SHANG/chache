export interface ReleaseFacts {
 applicationId:string; versionName:string; versionCode:number; appName:string;
 debuggable:boolean; testOnly:boolean; internet:boolean; entries:string[];
 expectedAssets:Record<string,string>; actualAssets:Record<string,string>;
}
export function validateReleaseFacts(facts:ReleaseFacts):true;
export function prepareUnsigned(root?:string):Promise<void>;
export function releaseAssetManifest(stagedAssets:Record<string,string>):Record<string,string>;
