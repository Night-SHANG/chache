/** Mobile host contract: unsupported modes may round-trip without implementing their pixels. */
export function mobileCanvasContext(raw:CanvasRenderingContext2D){
 let reported=raw.globalCompositeOperation,unsupportedWrites=0;
 const modes:GlobalCompositeOperation[]=[];
 const context=new Proxy(raw,{
  get(target,key){
   if(key==='globalCompositeOperation')return reported;
   if(key==='save')return ()=>{modes.push(reported);target.save();};
   if(key==='restore')return ()=>{target.restore();reported=modes.pop()??target.globalCompositeOperation;};
   if(key==='drawImage')return (...args:Parameters<CanvasRenderingContext2D['drawImage']>)=>{if(reported!=='copy'&&reported!=='lighter')target.drawImage(...args);};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  },
  set(target,key,value){if(key==='globalCompositeOperation'){reported=value;if(value==='copy'||value==='lighter'){unsupportedWrites++;return true;}}return Reflect.set(target,key,value,target);}
 });
 return {context,unsupportedWrites:()=>unsupportedWrites};
}
