import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResumeStorage} from '../scripts/growth-host-support.mjs';
import {reservedEntryCells} from '../src/domain/playable.ts';
test('dense native art fixtures have strict storage, all legal cargo colors and empty mandatory gates on both board sizes',async()=>{
 const {constructedDenseRasterScene}=await import('../scripts/raster-art-host-runtime.mjs');
 for(const family of ['inbound','outbound']){const f=constructedDenseRasterScene(family),account=validateResumeStorage(f.storage).account!,state=account.run!.state;assert.match(f.label,/^CONSTRUCTED:/);assert.equal(state.boardSize,family==='inbound'?7:9);assert.equal(new Set(state.board.filter(Boolean)).size,family==='inbound'?5:3);for(const cell of reservedEntryCells(state))assert.equal(state.board[cell],null);assert.ok(state.board.filter(Boolean).length>state.board.length/2);}
});
