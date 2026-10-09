export interface RasterContract {manifestKey:string;hashKey:string;src:string;width:number;height:number;layout:Record<string,unknown>}
export const RASTER_ART_CONTRACT:RasterContract[];
export const RASTER_CARGO_STYLES:string[];
export const RASTER_THEMES:string[];
export const RASTER_FORKLIFTS:string[];
export const RASTER_FORKLIFT_COLUMNS:readonly number[];
export const RASTER_SCENE_THEMES:string[];
export function assertRasterBinding(binding:unknown):void;
export function assertRasterManifests(browser:unknown,wechat:unknown,binding:unknown,mode:string):unknown;
export function assertRasterImageTrace(trace:unknown,binding:unknown):void;
export function assertRasterDraws(draws:unknown,source:string,crop:number[]):unknown[];
export function assertRasterSnapshot(snapshot:unknown,binding:unknown):void;
export function assertRasterThemeDraws(draws:unknown[],theme:string,minimumBoardCells:number):{tiles:number;frame:number;variants:number};
export interface RasterBundleQuote {missingKeys:string[];originalPrice:number;price:number}
export function rasterBundleQuote(set:unknown,account:unknown,mode:string):RasterBundleQuote;
export function assertRasterBundleCommit(before:unknown,after:unknown,set:unknown,mode:string):RasterBundleQuote;
export const RASTER_PRIOR_CASES:Readonly<Record<string,readonly string[]>>;
export function assertRasterPriorCaseCoverage(cases:{name:string;status:string}[],mode:string):{retained:number;added:number};
export function assertRasterProtectedBoardHash(theme:string,family:string,hash:string):void;
