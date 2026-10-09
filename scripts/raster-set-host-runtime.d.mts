export function runRasterSetCases(options:Record<string,unknown>):Promise<void>;
export function returnRasterSetListToFirstPage(driver:{readonly cosmeticSetPage?:number;action:(action:{type:'selectCosmeticSetPage';page:number},options?:{disabled:boolean})=>unknown}):void;
