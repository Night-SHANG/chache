/** Clone the plain data used by rules and saves without a browser host API. */
export function cloneData<T>(value:T):T {
 const visiting=new WeakSet<object>();
 const copy=(item:unknown):unknown=>{
  if(typeof item==='function'||typeof item==='symbol')throw Error('只支持普通数据');
  if(item===null||typeof item!=='object')return item;
  const proto=Object.getPrototypeOf(item);
  if(!Array.isArray(item)&&proto!==Object.prototype&&proto!==null)throw Error('只支持普通数据');
  if(visiting.has(item))throw Error('普通数据不能循环引用');
  visiting.add(item);
  const target:object=Array.isArray(item)?new Array(item.length):Object.create(proto) as object;
  for(const key of Object.keys(item))Object.defineProperty(target,key,{value:copy((item as Record<string,unknown>)[key]),enumerable:true,writable:true,configurable:true});
  visiting.delete(item);return target;
 };
 return copy(value) as T;
}

/** UTF-8, replacing isolated UTF-16 surrogates with U+FFFD like the standard encoder. */
export function utf8Bytes(text:string):number[] {
 const bytes:number[]=[];
 for(let i=0;i<text.length;i++){
  let point=text.charCodeAt(i);
  if(point>=0xd800&&point<=0xdbff){
   const low=text.charCodeAt(i+1);
   if(low>=0xdc00&&low<=0xdfff){point=0x10000+((point-0xd800)<<10)+(low-0xdc00);i++;}else point=0xfffd;
  }else if(point>=0xdc00&&point<=0xdfff)point=0xfffd;
  if(point<0x80)bytes.push(point);
  else if(point<0x800)bytes.push(0xc0|(point>>6),0x80|(point&0x3f));
  else if(point<0x10000)bytes.push(0xe0|(point>>12),0x80|((point>>6)&0x3f),0x80|(point&0x3f));
  else bytes.push(0xf0|(point>>18),0x80|((point>>12)&0x3f),0x80|((point>>6)&0x3f),0x80|(point&0x3f));
 }
 return bytes;
}
