import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runCoherentSetShopHost} from '../scripts/host-coherent-set-shop.mjs';

test('coherent shop acceptance cannot rebuild or execute an unbound source-derived package',async()=>{
 const out=await mkdtemp(join(tmpdir(),'unbound-shop-'));
 try{await assert.rejects(runCoherentSetShopHost({out,buildBundle:false}),/owner-frozen binding.*required/i);}finally{await rm(out,{recursive:true,force:true});}
});
