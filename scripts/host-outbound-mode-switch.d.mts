export const outboundRecordScores:{normal:{plain:number[];tools:(number|undefined)[]};endless:{plain:number[];tools:(number|undefined)[]}};
export function outboundModeRecordStorage():Map<string,string>;
export function outboundModeHudStorage(family:'inbound'|'outbound',mode:'normal'|'endless',options?:{units?:number;shift?:number}):Map<string,string>;
export function runOutboundModeSwitchHostQA(options?:{out?:string;expectedCommit?:string;expectedSourceSha256?:string;expectedGameJsSha256?:string}):Promise<unknown>;
