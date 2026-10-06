export function inspectAccountEvidence(entries:unknown):{status:'verified';generation:number;wallet:number;rulesetVersion:number|null;commandIndex:number};
export function parseFaultTap(text:string,exitCode:number|null):{tests:number;passed:number};
export function runAccountFaultChecks():{status:'passed';tests:number;passed:number;durationMs:number;files:string[];output:string};
