import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslator,chooseBrowserLocale,locale,configureLocale,translate,wrapLocalizedText} from '../src/presentation/i18n.ts';
test('shared presentation defaults to Chinese until browser opts in',()=>{assert.equal(locale(),'zh');assert.equal(translate('货箱'),'货箱');});
test('browser selection respects valid saved preference and falls back safely',()=>{assert.equal(chooseBrowserLocale('zh','en-US'),'zh');assert.equal(chooseBrowserLocale('en','zh-CN'),'en');assert.equal(chooseBrowserLocale(null,'zh-TW'),'zh');assert.equal(chooseBrowserLocale('invalid','fr-FR'),'en');});
test('exact and nested dynamic translations preserve numeric parameters',()=>{const t=createTranslator({'食品':'Food','出货中 · {0}件':'Shipping · {0} units','预计出货：{0}':'Expected shipment: {0}','{0}{1}件':'{0} {1} units'});assert.equal(t('出货中 · 12件'),'Shipping · 12 units');assert.equal(t('食品'),'Food');assert.equal(t('already English'),'already English');});
test('English wrapping preserves words and explicit newlines',()=>{assert.deepEqual(wrapLocalizedText('Keep a clear path\nShip now',s=>s.length,12,'en'),['Keep a clear','path','Ship now']);});
test('switching locale does not touch game storage',()=>{configureLocale('en');assert.equal(locale(),'en');configureLocale('zh');assert.equal(locale(),'zh');});

import {EN} from '../src/presentation/en.ts';
import {readFileSync} from 'node:fs';
test('all source dictionary placeholders are preserved and English has no Chinese glyphs',()=>{for(const [source,target] of Object.entries(EN)){assert.deepEqual([...(source.match(/\{\d+\}/g)??[])].sort(),[...(target.match(/\{\d+\}/g)??[])].sort(),source);assert.doesNotMatch(target,/[\u4e00-\u9fff]/,source);}});
test('dynamic dictionary strings resolve without Chinese fragments',()=>{const t=createTranslator(EN);for(const source of Object.keys(EN)){const example=source.replace(/\{\d+\}/g,'7');assert.doesNotMatch(t(example),/[\u4e00-\u9fff]/,example);}});
test('browser-only locale initialization never enters native entrypoints',()=>{for(const name of ['wechat-main.ts','android-main.ts'])assert.doesNotMatch(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),/installBrowserLanguage|configureLocale|presentation\/en/);});
test('Chinese line wrapping remains byte-for-byte compatible including spaces',()=>{assert.deepEqual(wrapLocalizedText('第一行  \n 第二行',s=>s.length,20,'zh'),['第一行  ',' 第二行']);});
test('cargo quantities and mixed cargo lists remain natural and keep numeric units',()=>{const t=createTranslator(EN);assert.equal(t('食品4件'),'Food: 4 units');assert.equal(t('预计出货：食品4件、机械2件'),'Expected shipment: Food: 4 units, Parts: 2 units');assert.equal(t('还差3格'),'Need 3 more cells');});
