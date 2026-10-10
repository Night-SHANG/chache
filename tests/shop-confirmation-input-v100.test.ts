import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionHost} from './helpers/session-fixtures.ts';
import {getUiControls} from '../src/presentation/ui.ts';
import type {UiAction} from '../src/presentation/ui-types.ts';
const center=(r:{x:number;y:number;w:number;h:number})=>({x:r.x+r.w/2,y:r.y+r.h/2});
for(const kind of ['single','bundle','classic'] as const)for(const dismiss of ['confirm','cancel'] as const)test(`${kind} ${dismiss}: rapid repeat does not hit the shop underneath; intentional later input works`,t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);
 const h=sessionHost({wallet:10000}),s=h.session;s.action({type:'shop'});s.action({type:'selectShopTab',tab:'cosmetics'});
 let purchase:UiAction;
 if(kind==='single'){s.action({type:'selectShopSection',section:'theme'});s.action({type:'previewCosmetic',kind:'theme',id:'paper_warehouse'});purchase={type:'purchaseCosmetic',kind:'theme',id:'paper_warehouse'};}
 else if(kind==='bundle'){s.action({type:'previewCosmeticSet',id:'cold_chain'});purchase={type:'purchaseCosmeticSet',id:'cold_chain'};}
 else{s.action({type:'previewCosmeticSet',id:'classic'});s.action({type:'selectClassicSetVariant',kind:'forklift',id:'white'});purchase={type:'purchaseCosmetic',kind:'forklift',id:'white'};}
 s.action(purchase);const modal=getUiControls(s.state,s.view).find(c=>c.action.type===dismiss)!;assert.ok(modal);const p=center(modal.rect);s.input.down(p);s.input.up(p);assert.equal(s.view.confirmation,null);
 const state=structuredClone({preview:s.view.cosmeticPreview,set:s.view.cosmeticSetPreview,section:s.view.shopSection,classic:s.view.classicSetSelection}),stored=[...h.data];
 for(const offset of [0,1,349]){now=1000+offset;s.input.down(p);s.input.up(p);assert.deepEqual([...h.data],stored);assert.deepEqual({preview:s.view.cosmeticPreview,set:s.view.cosmeticSetPreview,section:s.view.shopSection,classic:s.view.classicSetSelection},state);}
 now=1350;const next=getUiControls(s.state,s.view).find(c=>!c.disabled&&c.action.type===(kind==='single'?'previewCosmetic':kind==='classic'?'selectClassicSetVariant':'previewCosmeticSetMember')&&JSON.stringify(c.action)!==JSON.stringify(purchase))!;assert.ok(next);const at=center(next.rect);s.input.down(at);s.input.up(at);
 if(next.action.type==='previewCosmetic')assert.equal(s.view.cosmeticPreview?.[next.action.kind],next.action.id);
 else if(next.action.type==='selectClassicSetVariant')assert.equal(s.view.classicSetSelection?.[next.action.kind],next.action.id);
 else assert.equal(s.view.shopSection,(next.action as {kind:string}).kind);
 assert.deepEqual([...h.data],stored);
});
