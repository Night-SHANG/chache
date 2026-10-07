export const outboundRecordScores:{normal:{plain:number[];tools:(number|undefined)[]};endless:{plain:number[];tools:(number|undefined)[]}};
export function outboundModeRecordStorage():Map<string,string>;
export function outboundModeHudStorage(family:'inbound'|'outbound',mode:'normal'|'endless',options?:{units?:number;shift?:number}):Map<string,string>;
export function runOutboundModeSwitchHostQA(options?:{out?:string;expectedCommit?:string;expectedSourceSha256?:string;expectedGameJsSha256?:string}):Promise<unknown>;

export function outboundZeroRecordFixture(mode:'normal'|'endless'):{storage:Map<string,string>;clearCell:number;finishCommand:import('../src/domain/playable.ts').GameCommand};
export interface UnitStripSample {index:number;bar:number[];background:number[];contrast:number}
export function unitStripEvidence(host:{viewport:{w:number;h:number;safe?:number;dpr?:number};context:{getImageData(x:number,y:number,w:number,h:number):{data:Uint8ClampedArray}}}):UnitStripSample[];
export function assertUnitStripEvidence(evidence:UnitStripSample[],present:boolean):void;
