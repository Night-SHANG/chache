import type { StoragePort } from '../application/save.ts';

/** The entire synchronous native surface. No Capacitor promise conversion or JS cache. */
export interface NativeStorageBridge {
 get(key:string):string;
 set(key:string,value:string):string;
 remove(key:string):string;
 listKeys(prefix:string):string;
}
const MAX_KEY_UNITS=256,MAX_VALUE_UNITS=2*1024*1024;
export class AndroidStorageError extends Error {
 readonly code:string;
 constructor(code:string){super(`Android storage: ${code}`);this.name='AndroidStorageError';this.code=code;}
}
function wellFormed(value:string):boolean {
 for(let i=0;i<value.length;i++){
  const unit=value.charCodeAt(i);
  if(unit>=0xd800&&unit<=0xdbff){const low=value.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))return false;}
  else if(unit>=0xdc00&&unit<=0xdfff)return false;
 }
 return true;
}
const validKey=(value:unknown):value is string=>typeof value==='string'&&value.startsWith('warehouse.')&&value.length<=MAX_KEY_UNITS&&!value.includes('\0')&&wellFormed(value);
const validValue=(value:unknown):value is string=>typeof value==='string'&&value.length<=MAX_VALUE_UNITS&&wellFormed(value);
function requireArgument(valid:boolean):void {if(!valid)throw new AndroidStorageError('INVALID_ARGUMENT');}
function decode(raw:unknown):unknown {
 if(typeof raw!=='string')throw new AndroidStorageError('INVALID_RESPONSE');
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new AndroidStorageError('INVALID_RESPONSE');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new AndroidStorageError('INVALID_RESPONSE');
 const envelope=parsed as Record<string,unknown>,keys=Object.keys(envelope);
 if(envelope.v!==1||typeof envelope.ok!=='boolean'||keys.length!==3||!keys.includes('v')||!keys.includes('ok'))throw new AndroidStorageError('INVALID_RESPONSE');
 if(envelope.ok){if(!keys.includes('value'))throw new AndroidStorageError('INVALID_RESPONSE');return envelope.value;}
 if(!keys.includes('code')||typeof envelope.code!=='string'||!(/^[A-Z][A-Z0-9_]{0,63}$/).test(envelope.code))throw new AndroidStorageError('INVALID_RESPONSE');
 throw new AndroidStorageError(envelope.code);
}
function call(action:()=>string):unknown {
 let raw:unknown;try{raw=action();}catch{throw new AndroidStorageError('BRIDGE_UNAVAILABLE');}
 return decode(raw);
}
export function createAndroidStorage(bridge:NativeStorageBridge):StoragePort {
 if(!bridge||!['get','set','remove','listKeys'].every(method=>typeof bridge[method as keyof NativeStorageBridge]==='function'))throw new AndroidStorageError('BRIDGE_UNAVAILABLE');
 return {
  get(key){requireArgument(validKey(key));const value=call(()=>bridge.get(key));if(value!==null&&!validValue(value))throw new AndroidStorageError('INVALID_RESPONSE');return value;},
  set(key,value){requireArgument(validKey(key)&&validValue(value));if(call(()=>bridge.set(key,value))!==null)throw new AndroidStorageError('INVALID_RESPONSE');},
  remove(key){requireArgument(validKey(key));if(call(()=>bridge.remove(key))!==null)throw new AndroidStorageError('INVALID_RESPONSE');},
  listKeys(prefix){
   requireArgument(validKey(prefix));const keys=call(()=>bridge.listKeys(prefix));
   if(!Array.isArray(keys)||!keys.every((key,index)=>validKey(key)&&key.startsWith(prefix)&&(index===0||keys[index-1]<key)))throw new AndroidStorageError('INVALID_RESPONSE');
   return keys;
  }
 };
}
