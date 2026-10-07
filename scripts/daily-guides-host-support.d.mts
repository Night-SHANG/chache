import type {FinalEconomyBinding} from './final-economy-host-support.mjs';
import type {GameRun,GameCommand,RunSpec} from '../src/domain/playable.ts';
import type {PracticeRun} from '../src/application/tutorial-practice.ts';
import type {InboundRunV16} from '../src/domain/v16/types.ts';
export function verifyDailyGuidesBinding(binding:FinalEconomyBinding):void;
export function dailyGuidesResumeStorage(spec:RunSpec,commands?:GameCommand[],options?:Record<string,unknown>):Map<string,string>;
export interface StorageSnapshot {bytes:[string,string][];operationIndex:number}
export interface StorageHost {storage:Map<string,string>;operations:{kind:string;key:string}[]}
export function snapshotStorage(host:StorageHost):StorageSnapshot;
export function assertZeroWrites(host:StorageHost,before:StorageSnapshot):{keys:number;byteWrites:number};
export function rebindDailyScenario(raw:Record<string,unknown>):{state:InboundRunV16;states:InboundRunV16[];commands:GameCommand[];spec:RunSpec;expectedModelChecksum:string;firstRush:number;firstTick:number;wallTime:number;identity:{seed:number;day:string}};
export function rebindTierScenario(raw:Record<string,unknown>,tier:'normal'|'hard'|'expert'):{state:GameRun;states:GameRun[];commands:GameCommand[];spec:RunSpec;expectedModelChecksum:string};
export function practiceEvidence(practice:PracticeRun,observed:{labels:string[];cellPixels:{cell:number;sha256:string}[];byteWrites:number}):{expectedModel:{source:string;kind:string;commandIndex:number;checksum:string;score:number;completed:boolean};observed:{source:string;labels:string[];cellPixels:{cell:number;sha256:string}[];byteWrites:number}};
export function assertNewControlGeometry(controls:{rect:{x:number;y:number;w:number;h:number};action:{type:string}}[],viewport:{w:number;h:number;safe?:number;dpr?:number},avoid?:{x:number;y:number;w:number;h:number}[]):unknown;
export function writeHostReport(out:string,report:Record<string,unknown>):Promise<void>;
