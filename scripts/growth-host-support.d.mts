import type {AccountLoad} from '../src/application/account-store.ts';
export function verifyEvidenceBinding(binding:{sourceSha256:string;gameJsSha256:string;manifestSourceSha256:string;expectedGameJsSha256?:string}):void;
export function validateResumeStorage(values:Map<string,string>):AccountLoad;
export function probeBuiltHost(options?:{bundlePath?:string}):Promise<{status:'PASS'|'FAIL';executedChecks:number;canvasCount?:number;extraGlobals?:string[];gameJsSha256?:string;error?:string}>;
