import type {RunSpec,GameRun,GameCommand} from '../src/domain/playable.ts';
import type {Profile} from '../src/application/profile.ts';
export interface CosmeticHostBinding {commit:string;expectedCommit:string;sourceSha256:string;expectedSourceSha256:string;manifestSourceSha256:string;gameJsSha256:string;expectedGameJsSha256:string}
export interface CosmeticFixtureOptions {label?:string;wallet?:number;owned?:string[];cosmetics?:Profile['cosmetics'];outline?:boolean;constructedState?:GameRun}
export function verifyCosmeticStage15Binding(binding:CosmeticHostBinding):void;
export function cosmeticAccountStorage(options?:CosmeticFixtureOptions):Map<string,string>;
export function cosmeticResumeStorage(spec:RunSpec,commands?:GameCommand[],options?:CosmeticFixtureOptions):Map<string,string>;
export function createBoundCosmeticStage15Host(binding:CosmeticHostBinding,options?:Record<string,unknown>):Promise<unknown>;
export function legacyRedPreviewFixture():{storage:Map<string,string>;profile:Profile;commands:unknown[];provenance:string;finalChecksum:string};
