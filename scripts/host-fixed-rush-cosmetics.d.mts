import type {FinalEconomyBinding} from './final-economy-host-support.mjs';
import type {GameRun,GameCommand,RunSpec} from '../src/domain/playable.ts';
import type {UiControl} from '../src/presentation/ui-types.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {CosmeticDefinition} from '../src/application/cosmetics.ts';
export const NEW_COSMETICS:readonly string[];
export const HOST_DEPENDENCIES:readonly string[];
export function verifyFixedRushBinding(binding:FinalEconomyBinding):void;
export function fixedRushPaintLabels(control:{label:string;action:{type:string;branch?:string}},version:number):string[];
export function selectedVisibleCosmetic(controls:UiControl[],view:ViewState):CosmeticDefinition;
export function constructedFixedBoundary(tools?:{rotate:0|1;clear:0|1;wildcard:0|1}):{spec:RunSpec;state:GameRun;next:GameCommand;label:string};
export function fixedRushStorage(spec:RunSpec,commands?:GameCommand[],options?:{constructedState?:GameRun;label?:string;storage?:Map<string,string>;wallet?:number;inventory?:{rotate:number;clear:number;wildcard:number}}):Map<string,string>;
export function independentMaxUnitsStorage():Map<string,string>;
export function writeFixedRushReport(out:string,report:unknown):Promise<void>;
export function runFixedRushHostQA(options?:{out?:string;expectedCommit?:string;expectedSourceSha256?:string;expectedGameJsSha256?:string;only?:string}):Promise<{status:string;executedScenarios:number;images:unknown[]}>;

export function preWinToolCommand(state:GameRun,next:GameCommand):GameCommand;

export function assertNativeCosmeticSelection(host:Parameters<typeof import('./refinement-host-support.mjs').assertTextPaint>[0],controls:UiControl[],view:ViewState):unknown;

export function constructedCosmeticScene(family:'inbound'|'outbound'):{spec:RunSpec;state:GameRun;next:GameCommand;label:string;storage:Map<string,string>};

export function constructedFixedFailure():{spec:RunSpec;state:GameRun;next:GameCommand;label:string};
