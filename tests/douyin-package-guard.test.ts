import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function execute(code:string){return spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});}
test('Douyin package guard uses the unsplit 20 MB limit and rejects malformed inventories',()=>{
 const result=execute(`import assert from 'node:assert/strict';import {douyinPackageReport} from './scripts/douyin-package-report.mjs';
 assert.equal(douyinPackageReport([{path:'game.js',bytes:5_000_000}]).overLimit,false);
 assert.equal(douyinPackageReport([{path:'game.js',bytes:20_000_001}]).overLimit,true);
 assert.equal(douyinPackageReport([{path:'game.js',bytes:20_000_000}]).overLimit,false);
 for(const value of [[{path:'../game.js',bytes:1}],[{path:'game.js',bytes:NaN}],[{path:'game.js',bytes:1},{path:'game.js',bytes:1}]])assert.throws(()=>douyinPackageReport(value));`);
 assert.equal(result.status,0,result.stdout+result.stderr);
});
test('Douyin Canvas gate rejects literal dot/bracket unsupported accesses but ignores strings/comments',()=>{
 const result=execute(`import assert from 'node:assert/strict';import {unsupportedDouyinCanvasAPIs as scan} from './scripts/douyin-canvas-guard.mjs';
 assert.deepEqual(scan('ctx.clip();ctx["lineDashOffset"]=0;ctx.isPointInPath(1,2);'),['clip','isPointInPath','lineDashOffset']);
 assert.deepEqual(scan('// ctx.clip();\\nconsole.log("lineDashOffset");'),[]);
 assert.deepEqual(scan('ctx.globalCompositeOperation="copy";'),['globalCompositeOperation:copy']);`);
 assert.equal(result.status,0,result.stdout+result.stderr);
});
