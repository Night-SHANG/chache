export function runDailyGuidesHostQA(options?:Record<string,unknown>):Promise<unknown>;
export function hostControlPaintLabels(control:{label:string;action:{type:string;branch?:string}},rulesetVersion:number):string[];
export function practiceAnimationExitTarget(practice:import('../src/application/tutorial-practice.ts').PracticeRun,animationActive:boolean):{x:number;y:number}|null;
export function hostGuidePaintText(view:{guide?:{text?:string}|null;screen?:string;paused?:boolean;needsResume?:boolean;confirmation?:unknown},state:{rulesetVersion:number;phase:string},animationActive:boolean):string|null;
export function chooseHostClearablePlacement(state:import('../src/domain/playable.ts').GameRun):{pieceId:string;origin:{x:number;y:number}}|undefined;
export function hostRecoveryView(status:string):{accountBlocked:boolean};
