import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowserLanguage,LANGUAGE_STORAGE_KEY} from '../src/presentation/browser-locale.ts';
import {configureLocale,locale} from '../src/presentation/i18n.ts';
import {EN} from '../src/presentation/en.ts';
test('browser selector switches live and persists only its separate preference',()=>{
 const storage=new Map([['existing-game-save','unchanged'],['existing-audio-setting','off']]),writes:string[]=[],handlers=new Map<string,()=>void>();
 const doc={title:'',documentElement:{lang:''},body:{append:()=>{}},createElement:()=>({id:'',value:'',textContent:'',style:{cssText:''},setAttribute:()=>{},append:()=>{},addEventListener:(name:string,callback:()=>void)=>handlers.set(name,callback)})};
 const globals={window:{localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{writes.push(key);storage.set(key,value);}}},document:doc,navigator:{language:'en-US'}};
 const old=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  const select=installBrowserLanguage(EN);assert.ok(select);assert.equal(select.value,'en');assert.equal(doc.documentElement.lang,'en');assert.equal(writes.length,0);
  select.value='zh';handlers.get('change')!();assert.equal(locale(),'zh');assert.equal(doc.title,'货箱：最后一格');assert.deepEqual(writes,[LANGUAGE_STORAGE_KEY]);assert.equal(storage.get('existing-game-save'),'unchanged');assert.equal(storage.get('existing-audio-setting'),'off');
  const reloaded=installBrowserLanguage(EN);assert.equal(reloaded?.value,'zh');
  select.value='en';handlers.get('change')!();
 }finally{for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}configureLocale('zh');}
});
