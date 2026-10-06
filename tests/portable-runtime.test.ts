import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {build} from 'esbuild';

test('v9 rules run in a plain JavaScript host without browser clone or encoding globals',async()=>{
 const bundled=await build({entryPoints:['src/domain/v9/engine.ts'],bundle:true,write:false,format:'iife',globalName:'InboundRules',platform:'neutral',target:'es2018'});
 const context=vm.createContext({});
 vm.runInContext(bundled.outputFiles[0].text,context);
 assert.equal(vm.runInContext('typeof structuredClone',context),'undefined');
 assert.equal(vm.runInContext('typeof TextEncoder',context),'undefined');
 const facts=vm.runInContext("(()=>{let s=InboundRules.createRunV9({seed:17,mode:'standard'});s=InboundRules.applyCommandV9(s,{type:'chooseCleanup',branch:'orders'}).state;const move=InboundRules.findLegalMovesV9(s)[0];s=InboundRules.applyCommandV9(s,{type:'place',...move}).state;return [s.rulesetVersion,s.candidates.length,s.commandIndex];})()",context);
 assert.deepEqual(Array.from(facts as number[]),[9,3,2]);
});
