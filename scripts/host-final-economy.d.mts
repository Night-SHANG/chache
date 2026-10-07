import type {RunSpec,GameRun} from '../src/domain/playable.ts';
export function chooseDailyScenario():{epoch:number;identity:{day:string;seed:number};branch:string;strategy:string;commands:unknown[];attempts:unknown[];finalChecksum:string};
export function simpleClearState(spec:RunSpec,options?:{terminal?:boolean;chain?:boolean}):GameRun;
export function runFinalEconomyHostQA(options?:Record<string,unknown>):Promise<unknown>;
