export interface FinalEconomyBinding {commit:string;expectedCommit:string;sourceSha256:string;expectedSourceSha256:string;manifestSourceSha256:string;gameJsSha256:string;expectedGameJsSha256:string}
export function verifyFinalEconomyBinding(binding:FinalEconomyBinding):void;
export function createBoundFinalEconomyHost(binding:FinalEconomyBinding,options?:Record<string,unknown>):Promise<unknown>;
export function finalEconomyFixtureStorage(spec:import('../src/domain/playable.ts').RunSpec,commands?:unknown[],options?:Record<string,unknown>):Map<string,string>;
