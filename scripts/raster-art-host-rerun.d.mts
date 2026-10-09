export function rasterNavigationCases(mode:string):string[];
export function rasterSelectedCases(mode:string,only?:string):string[]|null;
export function rasterExpectedCases(mode:string):string[];
export function mergeRasterNavigationEvidence(input:Record<string,unknown>):Record<string,unknown>;
