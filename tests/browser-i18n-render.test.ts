import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanvas} from '@napi-rs/canvas';
import {render} from '../src/presentation/renderer.ts';
import {configureLocale,untranslatedText,translate,wrapLocalizedText} from '../src/presentation/i18n.ts';
import {EN} from '../src/presentation/en.ts';
import {sessionHost,startInbound} from './helpers/session-fixtures.ts';
import {prepareViewArt} from './helpers/static-art-fixture.ts';
import type {ViewState} from '../src/presentation/view-types.ts';

test('English production screens paint no Chinese or horizontally off-canvas labels',async()=>{
 const {session}=sessionHost({wallet:99999,inventory:{rotate:9,clear:9,wildcard:9}});startInbound(session);
 const variants:Partial<ViewState>[]=[{screen:'menu'},{screen:'game'},{screen:'settings'},{screen:'inboundMenu'},{screen:'colorTiers'},{screen:'toolsHelp'},{screen:'helpDetails',helpFromHome:true},{screen:'colorIntro',helpTopic:'inbound',helpFromHome:true},{screen:'colorIntro',helpTopic:'outbound',helpFromHome:true},{screen:'shop',shopTab:'tools'},...(['theme','cargo','forklift'] as const).map(shopSection=>({screen:'shop' as const,shopTab:'cosmetics' as const,shopSection}))];
 try{for(const patch of variants){configureLocale('en',EN);const view={...session.view,...patch};await prepareViewArt(view);const ctx=createCanvas(1080,1920).getContext('2d'),draw=ctx.fillText.bind(ctx);ctx.fillText=(value:string,x:number,y:number,maxWidth?:number)=>{assert.doesNotMatch(value,/[\u4e00-\u9fff]/,`${patch.screen}: ${value}`);const width=Math.min(ctx.measureText(value).width,maxWidth??Infinity),left=x-(ctx.textAlign==='center'?width/2:ctx.textAlign==='right'||ctx.textAlign==='end'?width:0),t=ctx.getTransform();assert.ok(t.a*left+t.c*y+t.e>=-2&&t.a*(left+width)+t.c*y+t.e<=1082,`${patch.screen}: ${value} exceeds horizontal canvas bounds`);draw(value,x,y,maxWidth);};render(ctx as unknown as CanvasRenderingContext2D,session.state,view);assert.deepEqual(untranslatedText(),[]);}}finally{configureLocale('zh');}
});
test('English words wrap at word boundaries and crate terminology differs from title',()=>{configureLocale('en',EN);try{assert.equal(translate('货箱'),'Crates');assert.deepEqual(wrapLocalizedText('Keep a clear path',s=>s.length,8),['Keep a','clear','path']);}finally{configureLocale('zh');}});
