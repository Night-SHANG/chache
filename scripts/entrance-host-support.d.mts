export interface EntranceBinding {commit:string;expectedCommit:string;sourceSha256:string;expectedSourceSha256:string;manifestSourceSha256:string;gameJsSha256:string;expectedGameJsSha256:string}
export function verifyEntranceBinding(binding:EntranceBinding):void;
export function createBoundEntranceHost(binding:EntranceBinding,options?:Record<string,unknown>):Promise<unknown>;
export function entranceFixtureStorage(spec:import('../src/domain/playable.ts').RunSpec,commands?:unknown[],options?:Record<string,unknown>):Map<string,string>;
