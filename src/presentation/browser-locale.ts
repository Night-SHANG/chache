import {chooseBrowserLocale,configureLocale,locale,type Dictionary} from './i18n.ts';
export const LANGUAGE_STORAGE_KEY='warehouse.browser.language.v1';
/** Separate preference only. Never reads or rewrites account, run, or audio settings. */
export function installBrowserLanguage(dictionary:Dictionary):HTMLSelectElement|undefined {
 let saved:string|null=null;try{saved=window.localStorage.getItem(LANGUAGE_STORAGE_KEY);}catch{/* Private browsing still allows session-only selection. */}
 configureLocale(chooseBrowserLocale(saved,navigator.language||'zh'),dictionary);
 // Canvas-only verification hosts do not provide a DOM control layer.
 if(!document.body||typeof document.body.append!=='function')return undefined;
 const control=document.createElement('select');control.id='warehouse-language';control.setAttribute('aria-label','Language / 语言');
 for(const [value,label] of [['zh','中文'],['en','English']]){const option=document.createElement('option');option.value=value;option.textContent=label;control.append(option);}
 control.value=locale();
 control.style.cssText='position:fixed;top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));z-index:10;font:14px system-ui,sans-serif;color:#fff0cf;background:#203344;border:1px solid #7890a3;border-radius:7px;padding:5px 8px;max-width:110px;';
 const updateDocument=()=>{document.documentElement.lang=locale()==='en'?'en':'zh-CN';document.title=locale()==='en'?'Warehouse: Last Slot':'货箱：最后一格';document.querySelector?.('#game')?.setAttribute('aria-label',locale()==='en'?'Warehouse: Last Slot. Select a piece below, then tap the board, or drag the piece.':'货箱最后一格。选择底部货物后点棋盘，或拖动货物。');};
 control.addEventListener('change',()=>{configureLocale(control.value==='en'?'en':'zh');try{window.localStorage.setItem(LANGUAGE_STORAGE_KEY,locale());}catch{/* The active session can still switch languages. */}updateDocument();});
 updateDocument();document.body.append(control);return control;
}
