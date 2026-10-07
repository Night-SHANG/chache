export function attachPixelWitness<T>(host:T):T;
export function assertTextPaint(host:unknown,text:string,options?:{within?:{x:number;y:number;w:number;h:number}}):{text:string;pixels:number;visibleRatio:number;rect:{x:number;y:number;w:number;h:number}};
export function assertIconPixels(host:unknown,rect:{x:number;y:number;w:number;h:number},options?:{physical?:boolean}):{rect:unknown;colors:number};
export function assertTextLinesPaint(host:unknown,text:string,options?:{within?:{x:number;y:number;w:number;h:number}}):{text:string;pixels:number;visibleRatio:number;rect:{x:number;y:number;w:number;h:number}}[];
export function displayedStock(read:{status:string;account?:{inventory:Record<string,number>}|null},item:string):number;
