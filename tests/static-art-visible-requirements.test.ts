import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {createCanvas} from '@napi-rs/canvas';
import {staticArtRequirementsForView} from '../src/presentation/static-art-requirements.ts';
import {STATIC_ART_RESOURCES} from '../src/presentation/static-art-manifest.ts';
import {COSMETIC_CATALOG} from '../src/application/cosmetics.ts';
import {SHOP_COSMETIC_SETS} from '../src/application/cosmetic-sets.ts';
import {sessionHost} from './helpers/session-fixtures.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {GameRun} from '../src/domain/playable.ts';
import type {ThemeId} from '../src/application/profile.ts';

/** Instrument the actual bundled painter, including all callers; do not infer needs from catalog order. */
test('every image drawn by actual shop pages/details and main screens belongs to the shared requirements',async()=>{
 const bundle=await build({stdin:{contents:"import {render} from './src/presentation/renderer.ts';globalThis.__render=render;",resolveDir:process.cwd()},bundle:true,format:'iife',platform:'neutral',write:false,define:{__PLAYTEST_FREE_SHOP__:'false'},plugins:[{name:'record-images',setup(builder){builder.onLoad({filter:/\/static-art-resources\.ts$/},()=>({contents:'export const getStaticArtImage=key=>({key});export const staticArtKeysStatus=()=>({status:"ready"});',loader:'ts'}));}}]});
 const sandbox:{__render?:(ctx:CanvasRenderingContext2D,state:GameRun,view:ViewState)=>void}={};runInNewContext(bundle.outputFiles[0].text,sandbox);assert.ok(sandbox.__render);
 const host=sessionHost(),canvas=createCanvas(1080,1920),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D,drawn=new Set<string>();ctx.drawImage=((image:{key:string})=>{drawn.add(image.key);}) as unknown as CanvasRenderingContext2D['drawImage'];
 const view=host.session.view;
 const verify=(label:string)=>{drawn.clear();const requirements=staticArtRequirementsForView(view),allowed=new Set([requirements.scene,...requirements.shared,...requirements.previews]);sandbox.__render!(ctx,host.session.state,view);for(const key of drawn){assert.ok(STATIC_ART_RESOURCES[key],`${label}: unknown ${key}`);assert.ok(allowed.has(key),`${label}: unready image ${key}`);}return drawn;};
 for(const screen of ['menu','game','settings','helpMenu','helpDetails','toolsHelp','inboundMenu','colorTiers','shop','prepareTools'] as const){view.screen=screen;verify(screen);}
 Object.assign(view,{screen:'shop',shopTab:'cosmetics',shopSection:'sets'});
 for(let page=0;page<4;page++){view.cosmeticSetPage=page;verify(`set page ${page}`);}
 for(const set of SHOP_COSMETIC_SETS){view.cosmeticSetPreview=set.id;verify(`set ${set.id}`);}
 for(const theme of ['day','night'] as const)for(const forklift of ['yellow','red','blue','white'] as const){view.cosmeticSetPreview='classic';view.classicSetSelection={theme,cargo:'outline',forklift};verify(`classic ${theme}/${forklift}`);}
 view.cosmeticSetPreview=undefined;
 for(const item of COSMETIC_CATALOG){view.shopSection=item.kind;view.cosmeticPreview={[item.kind]:item.id};verify(item.key);}
 view.shopSection='cargo';view.cosmeticPreview={cargo:'classic'};assert.ok(!verify('classic cargo page').has('material.cargo'),'neighboring wood/insulated controls are text-only, not unseen thumbnails');
 for(const item of COSMETIC_CATALOG.filter(item=>item.kind==='theme')){view.account=null;view.profile!.cosmetics={theme:item.id as ThemeId,cargo:'wood',forklift:'heavy'};view.screen='game';verify(`mixed game ${item.id}`);view.screen='shop';verify(`mixed shop ${item.id}`);}
});
