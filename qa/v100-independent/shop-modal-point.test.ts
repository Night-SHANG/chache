import assert from 'node:assert/strict';
import test from 'node:test';
import {sessionHost} from '../../tests/helpers/session-fixtures.ts';
import {COSMETIC_CATALOG} from '../../src/application/cosmetics.ts';
import {COSMETIC_SETS} from '../../src/application/cosmetic-sets.ts';
import {getUiControls} from '../../src/presentation/ui.ts';

for(const item of COSMETIC_CATALOG.filter(x=>x.price>0))for(const dismissal of ['confirm','cancel'] as const)test(`${item.key}/${dismissal}/rapid same-coordinate taps preserve chosen item`,()=>{
 const h=sessionHost({wallet:20000}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectShopSection',section:item.kind});s.action({type:'previewCosmetic',kind:item.kind,id:item.id});s.action({type:'purchaseCosmetic',kind:item.kind,id:item.id});
 const c=getUiControls(s.state,s.view).find(c=>c.action.type===dismissal)!;assert.ok(c);const p={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};
 s.input.down(p);s.input.up(p);const after=JSON.stringify(s.view.cosmeticPreview),raw=new Map(h.data);s.input.up(p);s.input.down(p);s.input.up(p);s.input.down(p);s.input.up(p);
 assert.equal(JSON.stringify(s.view.cosmeticPreview),after,`${item.key}: same-point tap changed preview`);assert.equal(s.view.confirmation,null);assert.deepEqual(h.data,raw);
});
for(const set of COSMETIC_SETS)for(const dismissal of ['confirm','cancel'] as const)test(`set.${set.id}/${dismissal}/rapid same-coordinate taps preserve chosen set`,()=>{
 const h=sessionHost({wallet:20000}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});s.action({type:'selectShopSection',section:'sets'});s.action({type:'previewCosmeticSet',id:set.id});s.action({type:'purchaseCosmeticSet',id:set.id});
 const c=getUiControls(s.state,s.view).find(c=>c.action.type===dismissal)!;assert.ok(c);const p={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};s.input.down(p);s.input.up(p);const preview=s.view.cosmeticSetPreview,raw=new Map(h.data);s.input.up(p);s.input.down(p);s.input.up(p);s.input.down(p);s.input.up(p);
 assert.equal(s.view.cosmeticSetPreview,preview);assert.equal(s.view.confirmation,null);assert.deepEqual(h.data,raw);
});

for(const dismissal of ['confirm','cancel'] as const)test(`boundary/${dismissal}/same coordinate blocked at 349ms but works at 350ms`,t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);const h=sessionHost({wallet:20000}),s=h.session;
 for(const a of [{type:'shop'},{type:'selectShopTab',tab:'cosmetics'},{type:'selectShopSection',section:'theme'},{type:'previewCosmetic',kind:'theme',id:'paper_warehouse'},{type:'purchaseCosmetic',kind:'theme',id:'paper_warehouse'}] as const)s.action(a);
 const c=getUiControls(s.state,s.view).find(c=>c.action.type===dismissal)!;const p={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};s.input.down(p);s.input.up(p);const raw=new Map(h.data);
 const underlying=getUiControls(s.state,s.view).find(c=>!c.disabled&&p.x>=c.rect.x&&p.x<=c.rect.x+c.rect.w&&p.y>=c.rect.y&&p.y<=c.rect.y+c.rect.h);assert.ok(underlying);assert.equal(underlying.action.type,'previewCosmetic');if(underlying.action.type!=='previewCosmetic')throw Error('expected underlying selector');assert.notEqual(underlying.action.id,'paper_warehouse');
 now=1349;s.input.down(p);s.input.up(p);assert.equal(s.view.cosmeticPreview?.theme,'paper_warehouse');
 now=1350;s.input.down(p);s.input.up(p);assert.equal(s.view.cosmeticPreview?.theme,underlying.action.id);assert.deepEqual(h.data,raw);
});
for(const dismissal of ['confirm','cancel'] as const)test(`boundary/${dismissal}/different-coordinate intentional tap remains immediately usable`,t=>{
 t.mock.method(Date,'now',()=>1000);const h=sessionHost({wallet:20000}),s=h.session;
 for(const a of [{type:'shop'},{type:'selectShopTab',tab:'cosmetics'},{type:'selectShopSection',section:'theme'},{type:'previewCosmetic',kind:'theme',id:'paper_warehouse'},{type:'purchaseCosmetic',kind:'theme',id:'paper_warehouse'}] as const)s.action(a);
 const c=getUiControls(s.state,s.view).find(c=>c.action.type===dismissal)!;const p={x:c.rect.x+c.rect.w/2,y:c.rect.y+c.rect.h/2};s.input.down(p);s.input.up(p);const raw=new Map(h.data);
 const other=getUiControls(s.state,s.view).find(other=>!other.disabled&&other.action.type==='previewCosmetic'&&other.action.id!=='paper_warehouse'&&(other.rect.x+other.rect.w/2<c.rect.x||other.rect.x+other.rect.w/2>c.rect.x+c.rect.w||other.rect.y+other.rect.h/2<c.rect.y||other.rect.y+other.rect.h/2>c.rect.y+c.rect.h));assert.ok(other);if(other.action.type!=='previewCosmetic')throw Error('expected selector');const q={x:other.rect.x+other.rect.w/2,y:other.rect.y+other.rect.h/2};s.input.down(q);s.input.up(q);assert.equal(s.view.cosmeticPreview?.theme,other.action.id);assert.deepEqual(h.data,raw);
});
