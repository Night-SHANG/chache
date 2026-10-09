export interface DialogBinding {root?:string;ownerFrozen:boolean;aggregateChecksPassed:boolean;expectedCommit:string;expectedSourceSha256:string;expectedGameJsSha256:string;expectedBrowserJsSha256:string;expectedPaidGameJsSha256:string;expectedPaidBrowserJsSha256:string;expectedAtlasSha256?:string;freeBuildRoot:string;paidBuildRoot:string;expectedVersion:string;expectedCatalogSize:number;artScope:{status:string;styles:string[]}}
export interface Snapshot {commit:string;sourceSha256:string;gameJsSha256:string;browserJsSha256:string;paidGameJsSha256:string;paidBrowserJsSha256:string;freeWechatAtlasSha256?:string;freeBrowserAtlasSha256?:string;paidWechatAtlasSha256?:string;paidBrowserAtlasSha256?:string}
export const EXACT_RUSH_SENTENCE:string;
export const WILDCARD_LINES:string[];
export const REMOVED_HELP_LINES:string[];
export const DIALOG_VIEWPORTS:{width:number;height:number;safeTop:number;dpr:number}[];
export const DIALOG_QA_PROTOCOL:object;
export function assertDialogBinding(binding:unknown):void;
export function assertDialogManifests<T>(browser:T,wechat:T,binding:DialogBinding,mode:'free'|'paid'):T;
export function assertControlTone(samples:number[][],expected:'primary'|'secondary'|'disabled'):object;
export function assertCopyContract(labels:(string|{text:string})[],options?:{required?:string[];forbidden?:string[]}):object;
export function assertNoStorageChanges(before:{entries:string[][];writeCount:number},after:{entries:string[][];writeCount:number}):void;
export function assertSingleCommit<T extends {generation:number}>(before:T,after:T,repeated:T):void;
export function assertSnapshotPair(begin:Snapshot,end:Snapshot,binding:DialogBinding):void;
