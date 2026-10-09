import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARGO_ATLAS } from '../src/presentation/cargo-atlas.ts';

const refined=['wood','neon_circuit','lava_core','ocean_relic'];
const manifest=JSON.parse(readFileSync(new URL('../assets/cargo-materials.manifest.json',import.meta.url),'utf8')) as {
 bytes:number;styles:string[];cargos:string[];sources:{style:string;path:string;cropRects:number[][]}[];
};
test('v0.20 cargo source selection uses the four approved refinements and preserves the other ten masters',()=>{
 assert.equal(manifest.sources.length,15);
 for(const source of manifest.sources){
  const expected=source.style==='harbor_container'
   ?'artifacts/v0210-art-source/cargo-harbor_container-generated.png'
   :refined.includes(source.style)
   ?'artifacts/v0200-art-source/cargo-'+source.style+'-generated.png'
   :'artifacts/v0190-art-source/'+source.style+'-generated.png';
  assert.equal(source.path,expected,source.style+' must use its reviewed master');
 }
});
test('cargo refinement preserves five semantic columns and fits the existing runtime budget',()=>{
 assert.deepEqual(manifest.styles,CARGO_ATLAS.styles);
 assert.deepEqual(manifest.cargos,['cargo.food','cargo.machine','cargo.chem','cargo.electronic','cargo.cold']);
 assert.ok(manifest.bytes<=400000,'cargo atlas must stay within its 400 KB allocation');
 for(const source of manifest.sources.filter(s=>refined.includes(s.style))){
  assert.equal(source.cropRects.length,5);
  for(const [left,top,right,bottom]of source.cropRects){
   const ratio=(right-left)/(bottom-top);
   assert.ok(ratio>=.94&&ratio<=1.1,source.style+' refined silhouette stays nearly square: '+ratio);
  }
 }
});
