/** Presentation-only localization. Other hosts remain Chinese unless explicitly initialized. */
export type Locale='zh'|'en';
export type Dictionary=Readonly<Record<string,string>>;
let current:Locale='zh';
let english:(value:string)=>string=value=>value;
const missing=new Set<string>();
export const locale=():Locale=>current;
export function configureLocale(value:Locale,dictionary?:Dictionary):void {current=value;if(dictionary)english=createTranslator(dictionary);missing.clear();}
export function chooseBrowserLocale(saved:string|null|undefined,language:string):Locale {return saved==='zh'||saved==='en'?saved:/^zh(?:-|$)/i.test(language)?'zh':'en';}
/** Verification hook: no logging, network, or game-state mutation. */
export function untranslatedText():string[]{return [...missing];}
export function translate(value:string):string {if(current==='zh')return value;const result=english(value);if(/[\u4e00-\u9fff]/.test(result))missing.add(value);return result;}
export function createTranslator(dictionary:Dictionary):(value:string)=>string {
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const entries=Object.entries(dictionary);
 const patterns=entries.filter(([key])=>/\{\d+\}/.test(key)).map(([key,value])=>{
  const ids:number[]=[];let offset=0,source='';for(const match of key.matchAll(/\{(\d+)\}/g)){source+=escape(key.slice(offset,match.index))+'([\\s\\S]*?)';ids.push(Number(match[1]));offset=match.index+match[0].length;}source+=escape(key.slice(offset));
  return {regex:new RegExp('^'+source+'$'),value,ids,specificity:key.replace(/\{\d+\}/g,'').length};
 }).sort((a,b)=>b.specificity-a.specificity);
 const fragments=entries.filter(([key])=>!key.includes('{')&&/[\u4e00-\u9fff]/.test(key)).sort((a,b)=>b[0].length-a[0].length);
 const cache=new Map<string,string>();
 const resolve=(value:string,depth=0):string=>{
  if(!/[\u4e00-\u9fff]/.test(value))return value;
  const exact=dictionary[value];if(exact!==undefined)return exact;
  if(depth>8)return value;
  if(value.includes('、'))return value.split('、').map(part=>resolve(part,depth+1)).join(', ');
  const cargoUnits=/^(食品|机械|化工|电子|冷链|货物)([0-9]+)件$/.exec(value);
  if(cargoUnits&&dictionary['{0}{1}件'])return dictionary['{0}{1}件'].replace('{0}',resolve(cargoUnits[1],depth+1)).replace('{1}',cargoUnits[2]);
  for(const pattern of patterns){const match=pattern.regex.exec(value);if(match){const args=new Map(pattern.ids.map((id,index)=>[id,resolve(match[index+1],depth+1)]));return pattern.value.replace(/\{(\d+)\}/g,(_,id:string)=>args.get(Number(id))??'');}}
  let result=value;for(const [key,replacement] of fragments)if(result.includes(key))result=result.split(key).join(replacement);
  return result;
 };
 return value=>{let result=cache.get(value);if(result===undefined){result=resolve(value);if(cache.size>4000)cache.clear();cache.set(value,result);}return result;};
}
export function wrapLocalizedText(value:string,measure:(value:string)=>number,width:number,language:Locale=current):string[]{
 const lines:string[]=[];
 if(language==='zh'){let line='';for(const char of value){if(char==='\n'||measure(line+char)>width){lines.push(line);line=char==='\n'?'':char;}else line+=char;}if(line)lines.push(line);return lines;}
 for(const paragraph of value.split('\n')){
  if(!paragraph){lines.push('');continue;}
  const tokens=language==='en'?paragraph.match(/\S+\s*/g)??[]:[...paragraph];let line='';
  for(const token of tokens){if(line&&measure((line+token).trimEnd())>width){lines.push(line.trimEnd());line='';}
   if(measure(token.trimEnd())>width){for(const char of token){if(line&&measure(line+char)>width){lines.push(line.trimEnd());line='';}line+=char;}}else line+=token;
  }if(line)lines.push(line.trimEnd());
 }return lines;
}
