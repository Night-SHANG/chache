import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { cargoBox, forklift } from '../src/presentation/assets.ts';
import * as art from '../src/presentation/cosmetic-art.ts';
import type { CargoStyleId, ForkliftId, ThemeId } from '../src/application/profile.ts';
import type { CargoId, CellTrait } from '../src/domain/types.ts';

const STYLES = ['toy_brick', 'paper_fold', 'space_case'] as const;
const TRUCKS = ['toy', 'paper', 'space'] as const;
const THEMES = ['toy_workshop', 'paper_warehouse', 'space_cargo'] as const;
const CARGOS: CargoId[] = ['cargo.food', 'cargo.machine', 'cargo.chem', 'cargo.electronic', 'cargo.cold'];
const TRAITS: (CellTrait | undefined)[] = [undefined, { kind: 'rush', remaining: 3 }, { kind: 'rush', remaining: 2 }, { kind: 'rush', remaining: 1 }, { kind: 'pallet' }, { kind: 'hazard' }, { kind: 'wildcard' }, { kind: 'waste' }];
function surface(width = 140, height = 140) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  return { canvas, ctx, context: ctx as unknown as CanvasRenderingContext2D };
}
const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
function crate(style: CargoStyleId, cargo: CargoId, trait?: CellTrait, large = false, outline = false, size = 110) {
  const out = surface(); cargoBox(out.context, cargo, 10, 10, size, 1, trait, style, large, outline); return out;
}
function background() {
  assert.ok('drawLogisticsBackground' in art, 'the production backdrop hook must be exported');
  return (art as typeof art & { drawLogisticsBackground: (ctx: CanvasRenderingContext2D, rect: {x:number;y:number;w:number;h:number}, theme: string) => boolean }).drawLogisticsBackground;
}

test('new crate structures visibly differ while keeping every original opaque cargo glyph pixel and five cargo colors', () => {
  for (const style of STYLES) for (const cargo of CARGOS) {
    const old = crate('classic', cargo).ctx.getImageData(0, 0, 140, 140).data;
    const next = crate(style, cargo).ctx.getImageData(0, 0, 140, 140).data;
    const glyph = cargo === 'cargo.chem' ? [255, 242, 172] : [255, 244, 218];
    let changed = 0, preserved = 0, colored = 0, classicColored = 0;
    const palette = [PALETTE[cargo].light, PALETTE[cargo].mid].map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
    for (let i = 0; i < old.length; i += 4) {
      // v0.17 changes the outside silhouette; dedicated material tests retain the original envelope.
      if (old[i] !== next[i] || old[i + 1] !== next[i + 1] || old[i + 2] !== next[i + 2]) changed++;
      if (old[i] === glyph[0] && old[i + 1] === glyph[1] && old[i + 2] === glyph[2] && old[i + 3] === 255) {
        assert.deepEqual([...next.slice(i, i + 4)], [...old.slice(i, i + 4)], `${style}/${cargo}: semantic glyph`); preserved++;
      }
      const x = (i / 4) % 140, y = Math.floor(i / 4 / 140);
      const isCargoColor = (data: Uint8ClampedArray) => {
        const rgb=[data[i],data[i+1],data[i+2]],mid=palette[1],hi=mid.indexOf(Math.max(...mid)),lo=mid.indexOf(Math.min(...mid));
        return data[i+3]>=240 && rgb[hi]-rgb[lo]>45 && rgb[hi]>rgb[(hi+1)%3]-12 && rgb[hi]>rgb[(hi+2)%3]-12;
      };
      if (x > 30 && x < 88 && y > 45 && y < 97) { if (isCargoColor(next)) colored++; if (isCargoColor(old)) classicColored++; }
    }
    assert.ok(changed > 850, `${style}/${cargo}: structural change (${changed})`);
    assert.ok(preserved > 60, `${style}/${cargo}: readable symbol`);
    assert.ok(classicColored > 500 && colored >= classicColored * .65, `${style}/${cargo}: the central face retains its original cargo palette (${colored})`);
  }
});

test('new crates preserve all small and large rush digits, warning badges, pallet feet and waste, with free outline', () => {
  for (const style of STYLES) for (const cargo of CARGOS) for (const trait of TRAITS) for (const large of [false, true]) for (const outline of [false, true]) {
    const base = crate('classic', cargo, trait, large, outline), next = crate(style, cargo, trait, large, outline);
    if (trait) {
      const crop = trait.kind === 'waste' ? [16, 20, 95, 91] : trait.kind === 'rush' && large ? [45, 17, 40, 34] : [27, 20, 78, 22];
      const [x, y, w, h] = crop;
      assert.deepEqual(next.ctx.getImageData(x, y, w, h).data, base.ctx.getImageData(x, y, w, h).data, `${style}/${cargo}/${trait.kind}/${trait.remaining}/${large}/${outline}`);
      if (trait.kind === 'pallet') assert.deepEqual(next.ctx.getImageData(15, 103, 96, 13).data, base.ctx.getImageData(15, 103, 96, 13).data);
      if (trait.kind === 'hazard' || trait.kind === 'wildcard') assert.deepEqual(next.ctx.getImageData(91, 90, 14, 9).data, base.ctx.getImageData(91, 90, 14, 9).data);
    }
    if (outline) assert.deepEqual(next.ctx.getImageData(14, 10, 100, 4).data, base.ctx.getImageData(14, 10, 100, 4).data, `${style}: common overlay`);
  }
});

test('engineering white retains its original eight-heading pixel baseline', () => {
  const { ctx, context } = surface(512, 512);
  for (let i = 0; i < 8; i++) forklift(context, 70 + i % 4 * 125, 125 + Math.floor(i / 4) * 230, 110, i * Math.PI / 4, 'white');
  assert.equal(digest(ctx.getImageData(0, 0, 512, 512).data), '204241e8cceff5776e5feb32cdc13397a5cc6a660013f5d0377171ad735cedbb');
});

function vehicle(paint: ForkliftId, size = 110, angle = 0) {
  const out = surface(200, 200); forklift(out.context, 100, 100, size, angle, paint); return out;
}
function bounds(data: Uint8ClampedArray) {
  let left = 200, top = 200, right = -1, bottom = -1;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) if (data[(y * 200 + x) * 4 + 3]) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  return { left, top, right, bottom };
}

test('three new forklift bodies have distinct physical masks rather than color-only variations', () => {
  for (const [a, b] of [['yellow', 'toy'], ['yellow', 'paper'], ['yellow', 'space'], ['toy', 'paper'], ['toy', 'space'], ['paper', 'space']] as const) {
    const left = vehicle(a).ctx.getImageData(0, 0, 200, 200).data, right = vehicle(b).ctx.getImageData(0, 0, 200, 200).data;
    let physical = 0;
    for (let i = 0; i < left.length; i += 4) if ((left[i + 3] === 255) !== (right[i + 3] === 255)) physical++;
    assert.ok(physical > 40, `${a}/${b}: at least 40 pixels must change body silhouette, got ${physical}`);
  }
});

test('new forklift envelopes and the exact forward fork assembly remain safe at 32 angles and three transport sizes', () => {
  for (const size of [44, 80, 110]) for (let step = 0; step < 32; step++) {
    const angle = step * Math.PI / 16, original = vehicle('yellow', size, angle).ctx.getImageData(0, 0, 200, 200).data, limit = bounds(original);
    for (const paint of TRUCKS) {
      const next = vehicle(paint, size, angle).ctx.getImageData(0, 0, 200, 200).data, extent = bounds(next);
      assert.ok(extent.left >= limit.left && extent.right <= limit.right && extent.top >= limit.top && extent.bottom <= limit.bottom, `${paint}/${size}/${step}: enlarged bounds`);
      let forkPixels = 0;
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
        const localX = ((x + .5 - 100) * Math.cos(angle) + (y + .5 - 100) * Math.sin(angle)) * 110 / size;
        // Exclude the body/mast joint and its subpixel filtering at the smallest scale.
        if (localX < 39) continue;
        const index = (y * 200 + x) * 4;
        assert.deepEqual([...next.slice(index, index + 4)], [...original.slice(index, index + 4)], `${paint}/${size}/${step}: fork/load space`);
        if (original[index + 3] === 255) forkPixels++;
      }
      assert.ok(forkPixels > 10, 'the comparison must include fork pixels');
    }
  }
});

test('playful background hook draws only valid new themes, clips all pixels and restores caller state', () => {
  const draw = background(), images = [];
  for (const theme of THEMES) {
    const { ctx, context } = surface(320, 220); ctx.fillStyle = '#fff'; ctx.globalAlpha = .8; ctx.lineWidth = 7;
    assert.equal(draw(context, { x: 30, y: 25, w: 250, h: 150 }, theme), true);
    assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.lineWidth, 7);
    const pixels = ctx.getImageData(0, 0, 320, 220).data, colors = new Set<string>();
    for (let y = 0; y < 220; y++) for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      if (x < 30 || x >= 280 || y < 25 || y >= 175) assert.equal(pixels[i + 3], 0, `${theme}: spill ${x},${y}`);
      else { assert.ok(pixels[i + 3] > 0, `${theme}: uncovered scene`); colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); }
    }
    assert.ok(colors.size > 80, `${theme}: shaded physical structures`); images.push(digest(pixels));
    for (const rect of [{x:0,y:0,w:0,h:5}, {x:0,y:0,w:20,h:-5}, {x:NaN,y:0,w:10,h:10}]) assert.equal(draw(context, rect, theme), false);
    for (const old of ['day', 'night', 'harbor', 'missing']) assert.equal(draw(context, {x:0,y:0,w:320,h:220}, old), false);
    assert.equal(digest(ctx.getImageData(0, 0, 320, 220).data), images[images.length - 1]);
    ctx.fillRect(0, 0, 1, 1); assert.deepEqual([...ctx.getImageData(0, 0, 1, 1).data], [255, 255, 255, 204]);
  }
  assert.equal(new Set(images).size, 3);
});

test('every new shop subject reuses production crates, forklifts and the identical bounded theme background', () => {
  const draw = background();
  for (const theme of THEMES) {
    const actual = surface(720, 250), expected = surface(720, 250);
    art.drawCosmeticPreview(actual.context, { x: 0, y: 0, w: 720, h: 250 }, { category: 'theme', theme });
    draw(expected.context, {x:0,y:0,w:720,h:250}, theme);
    assert.deepEqual(actual.ctx.getImageData(0, 0, 720, 24).data, expected.ctx.getImageData(0, 0, 720, 24).data);
  }
  for (let i = 0; i < 3; i++) for (const category of ['cargo', 'forklift'] as const) {
    const actual = surface(720, 250), expected = surface(720, 250);
    art.drawCosmeticPreview(actual.context, {x:0,y:0,w:720,h:250}, {category, cargoStyle: STYLES[i], forklift: TRUCKS[i], theme: THEMES[i] as ThemeId, cargoOutline: true});
    if (category === 'cargo') cargoBox(expected.context, 'cargo.food', 285, 28, 178, 1, undefined, STYLES[i], false, true);
    else forklift(expected.context, 340, 124, 257, 0, TRUCKS[i]);
    const a = actual.ctx.getImageData(0, 0, 720, 250).data, b = expected.ctx.getImageData(0, 0, 720, 250).data;
    let count = 0; for (let n = 0; n < b.length; n += 4) if (b[n + 3] === 255) { assert.deepEqual([...a.slice(n, n + 4)], [...b.slice(n, n + 4)]); count++; }
    assert.ok(count > 5000);
  }
});

const OLD_PREVIEW_HASHES:Record<string,string>={
 'theme.day':'9101e513e346c21157017634aee4bc7655379d0b63dc1903a47f2a090b660549',
 'theme.night':'fcee7a09ed481751117dd2f24e73e7154569fea0e66e43409d788e4ad8770c71',
 'theme.harbor':'1dc595448c0c2394f5d084187bf49a3c86158d8c284e48c26d23e9f816052d9b',
 'theme.cold_chain':'0a0837d7bc80499c5b5e24b06cd6633cdb1425031acdb21a041f74fc0dade151',
 'theme.rail_freight':'8696c75086dd2286c2631e7a6edb7322b775995eabbfb0ecb9925f74b7f2294e',
 'theme.express_sorting':'a59e339b03759d0876ec40b11c42915254565ac54c7b81132fe4412d78161ccc',
 'cargo.classic':'13179115567c94cc45d24e189efd4f346a8a3c857dae71a8e1ee7d2f2b431279',
 'cargo.outline':'a7324b42511065b71187e6d147ed05bd88416e0c58227cc35dc570418f18908a',
 'cargo.wood':'7911ce155a40846f55ba8546d1a7d80aa2096b2d69b05edb9e2917de30f73254',
 'cargo.insulated':'8d9b8df77533870b1eda4ec4f0c148bcc36534673f95223b1dbddc5ce8850ac0',
 'cargo.reinforced':'10a09f2cba5db7aa8d09edc0ea7e40d6b071e4e3b1d2cc59b7ea2d8936940fbf',
 'cargo.taped':'46224b2962048c93fed97bb4fe5270e1c758dbdfe08078a6f43a0ddb62413151',
 'forklift.yellow':'95a1394490ccb874574374d385da7fb5e6754a45cd6ba85c8e8d0488531b8605',
 'forklift.blue':'71d2bacf2956ef37fd8c0f7a1f67a3ebd8ee0efd933675f59a9d1b11fcecec75',
 'forklift.red':'51216c3ba631d81399ee24ed5225932b24dad05dbad8c69abd94e813a3ac2b66',
 'forklift.white':'171857cdbd0ead0614af48d42c69d5c7f239c4f898db419061c20284e2f78395',
 'forklift.electric':'6483f61ca7056780c892225e15c34ec8fdc7ec80efa1719c930012126adb7bd0',
 'forklift.heavy':'8adbd6686830b445b42ed3a980bef49f15dacd500eb8327607dd3915438abb68',
 'forklift.compact':'e00554e8191c7dcfca263d3c37b713c193aca44e12b25f87a20e680e19b6ac7d',
};
test('retained vehicle previews stay exact while approved material, theme and v024 heavy previews change',()=>{
 for(const [key,hash] of Object.entries(OLD_PREVIEW_HASHES)){
  const [kind,id]=key.split('.'),out=surface(720,250);
  art.drawCosmeticPreview(out.context,{x:0,y:0,w:720,h:250},{category:kind as 'cargo'|'theme'|'forklift',[kind==='cargo'?'cargoStyle':kind]:id});
  const actual = digest(out.ctx.getImageData(0,0,720,250).data);
  if (key === 'forklift.heavy' || key.startsWith('theme.') || ['cargo.wood', 'cargo.insulated', 'cargo.reinforced', 'cargo.taped'].includes(key)) assert.notEqual(actual, hash, key);
  else assert.equal(actual,hash,key);
 }
});

import {icon,PALETTE} from '../src/presentation/assets.ts';
// Full opaque glyph masks include dark strokes, centers and food leaves, not only light fill.
test('all new crate sizes retain the full glyph masks and opaque badge pixels over every trait and outline',()=>{
 for(const size of [44,80,110])for(const cargo of CARGOS){
  const mask=surface();mask.ctx.translate(10,10);mask.ctx.scale(size/110,size/110);icon(mask.context,cargo,48,60,54,cargo==='cargo.chem'?'#fff2ac':'#fff4da',PALETTE[cargo].ink);
  const glyph=mask.ctx.getImageData(0,0,140,140).data;
  for(const trait of TRAITS)for(const large of [false,true])for(const outline of [false,true]){
   const base=crate('classic',cargo,trait,large,outline,size).ctx.getImageData(0,0,140,140).data;
   for(const style of STYLES){const next=crate(style,cargo,trait,large,outline,size).ctx.getImageData(0,0,140,140).data;let pixels=0;
    for(let i=0;i<base.length;i+=4){const x=(i/4%140-10)*110/size,y=(Math.floor(i/4/140)-10)*110/size;
     const label=trait&&trait.kind!=='waste'&&(trait.kind==='rush'&&large?x>=36&&x<=76&&y>=8&&y<=40:x>=18&&x<=94&&y>=11&&y<=32);
     if(glyph[i+3]!==255&&!label)continue;
     assert.equal(next[i],base[i],`${style}/${cargo}/${trait?.kind}/${large}/${outline}/${size}: red ${x},${y}`);assert.equal(next[i+1],base[i+1]);assert.equal(next[i+2],base[i+2]);assert.equal(next[i+3],base[i+3]);pixels++;
    }assert.ok(pixels>30);
   }
  }
 }
});

import {render} from '../src/presentation/renderer.ts';
import {makeAccountFixture} from './helpers/account-fixtures.ts';
import {FREE_COSMETICS} from '../src/application/cosmetics.ts';
import {createProfile} from '../src/application/profile.ts';
import {createRunV20,applyCommandV20} from '../src/domain/v20/engine.ts';
import {fromV20} from '../src/domain/v21/engine.ts';
import {createRun} from '../src/domain/engine.ts';
import {playableChecksum} from '../src/domain/playable.ts';
import type {GameRun,GameShipment} from '../src/domain/playable.ts';
import type {ViewState} from '../src/presentation/view-types.ts';
import type {Cell,Shipment} from '../src/domain/types.ts';
import {shipmentFrame,shipmentPose} from '../src/presentation/motion.ts';
import {buildOutboundTransport} from '../src/presentation/outbound-transport.ts';
import {drawColorExitShipment} from '../src/presentation/color-exit-renderer.ts';
const gameView=(patch:Partial<ViewState>={}):ViewState=>({screen:'game',selectedPieceId:null,hoverOrigin:null,preview:null,dragPoint:null,paused:false,message:'',saveStatus:'',elapsed:0,animation:null,debug:false,needsResume:false,profile:createProfile(),...patch});
function appearanceAccount(profile:ReturnType<typeof createProfile>,outline:boolean){const account=makeAccountFixture();account.profile.cosmetics={...profile.cosmetics};account.profile.cargoOutline=outline;account.profile.ownedCosmetics=[...new Set([...FREE_COSMETICS,...Object.entries(profile.cosmetics).map(([kind,id])=>`${kind}.${id}`)])].sort();return account;}
function gamePixels(run:GameRun,view:ViewState,region={x:0,y:0,w:1080,h:1920}){const out=surface(1080,1920);render(out.context,run,view);return out.ctx.getImageData(region.x,region.y,region.w,region.h).data;}

test('all three equipped families render on inbound and outbound boards, trays and drag with unchanged state and theme-specific empty-cell materials',()=>{
 for(const run of [fromV20(applyCommandV20(createRunV20({seed:17,mode:'rush'}),{type:'chooseCleanup',branch:'orders'}).state),createRun(7,'color_exit',8,'expert')]){
  run.board[10]='cargo.food';const before=playableChecksum(run),base=gameView(),board={x:160,y:540,w:730,h:850},tray={x:48,y:1530,w:984,h:272};
  const baseBoard=digest(gamePixels(run,base,board)),baseTray=digest(gamePixels(run,base,tray));
  for(let family=0;family<3;family++){
   const profile=createProfile();profile.cosmetics={theme:THEMES[family],cargo:STYLES[family],forklift:TRUCKS[family]};const selected=gameView({profile});
   assert.notEqual(digest(gamePixels(run,selected,board)),baseBoard);assert.notEqual(digest(gamePixels(run,selected,tray)),baseTray);
   const drag={selectedPieceId:run.candidates[0].id,dragPoint:{x:520,y:1050}},region={x:420,y:950,w:420,h:420};assert.notEqual(digest(gamePixels(run,{...selected,...drag},region)),digest(gamePixels(run,{...base,...drag},region)));
   const empty={x:126,y:566,w:24,h:24};assert.notEqual(digest(gamePixels(run,selected,empty)),digest(gamePixels(run,base,empty)),'theme also changes the board floor');assert.equal(playableChecksum(run),before);
  }
 }
});

test('real inbound board, pending tray and drag preserve normalized 3 2 1 foreground pixels for all new crates, colors and outlines',()=>{
 for(const [family,style] of STYLES.entries())for(const cargo of CARGOS)for(const outline of [false,true]){
  const run=fromV20(applyCommandV20(createRunV20({seed:17,mode:'rush'}),{type:'chooseCleanup',branch:'orders'}).state);
  run.board.fill(null);run.cellTraits.fill(null);run.candidates=[1,2,3].map(turns=>({id:`rush.${turns}`,shapeId:'shape.single',cargo,trait:'rush' as const,rushTurns:turns,quarterTurns:0 as const}));
  [1,2,3].forEach(turns=>{run.board[7+turns]=cargo;run.cellTraits[7+turns]={kind:'rush',remaining:turns,bornAtPlacement:0};});
  const profile=createProfile();profile.cosmetics={theme:THEMES[family],cargo:style,forklift:TRUCKS[family]};const out=surface(1080,1920),fill=out.ctx.fillText.bind(out.ctx),labels:{digit:number;a:number;d:number;e:number;f:number;alpha:number}[]=[];
  out.ctx.fillText=(value,x,y)=>{if(/^[123]$/.test(value)&&x===56&&y===25&&out.ctx.font.includes('34px')){const t=out.ctx.getTransform();labels.push({digit:Number(value),a:t.a,d:t.d,e:t.e,f:t.f,alpha:out.ctx.globalAlpha});}fill(value,x,y);};
  const before=playableChecksum(run);render(out.context,run,gameView({profile,account:appearanceAccount(profile,outline),selectedPieceId:'rush.3',dragPoint:{x:520,y:1050}}));
  assert.equal(labels.filter(label=>label.f>1500).length,3,'each pending cargo keeps its actual numeral');assert.ok(labels.length>=7,'board, pending tray and dragged cargo all retain badges');
  for(const label of labels){
   const ref=surface(1080,1920);ref.ctx.setTransform(label.a,0,0,label.d,label.e,label.f);ref.ctx.globalAlpha=label.alpha;cargoBox(ref.context,cargo,0,0,110,1,{kind:'rush',remaining:label.digit},style,true,outline);
   const x=Math.ceil(label.e+36*label.a),y=Math.ceil(label.f+8*label.d),w=Math.floor(40*label.a),h=Math.floor(32*label.d),actual=out.ctx.getImageData(x,y,w,h).data,expected=ref.ctx.getImageData(x,y,w,h).data;
   let count=0,delta=0,max=0;for(let i=0;i<expected.length;i+=4)if(expected[i+3]===255){for(let channel=0;channel<3;channel++){const difference=Math.abs(actual[i+channel]-expected[i+channel]);delta+=difference;max=Math.max(max,difference);}count++;}assert.ok(count>(label.alpha===1?30:10),`${style}/${cargo}: label ${JSON.stringify(label)}, opaque count ${count}`);assert.ok(delta/count/3<1&&max<=3,`${style}/${cargo}/${outline}/${label.digit}: normalized average ${delta/count/3}, max ${max}`);
  }assert.equal(playableChecksum(run),before);
 }
});

test('all new crates and forklifts use existing inbound and outbound loaded transport anchors',()=>{
 const run=fromV20(applyCommandV20(createRunV20({seed:17,mode:'rush'}),{type:'chooseCleanup',branch:'orders'}).state);run.board.fill(null);run.board[24]='cargo.food';
 const shipment:GameShipment={type:'shipment',boardSize:7,gateId:'dock.north',units:1,extraClearedCells:[],dockId:'dock.north',orderId:'order.old',cargo:'cargo.food',cells:[24],path:[{x:3,y:0},{x:3,y:1},{x:3,y:2}],score:450,chain:1};
 const pose=shipmentPose(shipment,shipmentFrame(.65,false));assert.ok(pose?.loaded);const region={x:Math.floor(pose.cargo.x-34),y:Math.floor(pose.cargo.y-35),w:70,h:55};
 const base=gameView({animation:{shipment,progress:.65,board:run.board}}),classic=digest(gamePixels(run,base,region)),before=playableChecksum(run);
 for(let i=0;i<3;i++){const profile=createProfile();profile.cosmetics={theme:THEMES[i],cargo:STYLES[i],forklift:TRUCKS[i]};const next=gameView({profile,animation:base.animation});assert.notEqual(digest(gamePixels(run,next,region)),classic);assert.notEqual(digest(gamePixels(run,{...next,account:appearanceAccount(profile,true)},region)),digest(gamePixels(run,next,region)));}
 assert.equal(playableChecksum(run),before);
 for(const size of [7,9] as const){const middle=Math.floor(size/2),cells=[middle,middle+size,middle+size*2],board:Array<Cell>=Array(size*size).fill(null);cells.forEach(cell=>board[cell]='cargo.food');
  const outbound:Shipment={type:'shipment',...(size===9?{boardSize:9}:{}),transport:'conveyor',dockId:'dock.north',orderId:'exit.food',cargo:'cargo.food',cells,path:Array.from({length:size-3},(_,i)=>({x:middle,y:size-1-i})),cargoPaths:cells.map((cell,i)=>({cell,path:Array.from({length:i+1},(_,n)=>({x:middle,y:i-n}))})),score:30,chain:1};
  const plan=buildOutboundTransport(outbound,board)!;const step=plan.steps.find(s=>s.loadedCount>0&&s.kind==='move')!;assert.ok(step);const progress=(step.startMs+step.endMs)/2/plan.durationMs,snapshot=JSON.stringify({outbound,plan,board});
  const draw=(style:CargoStyleId,paint:ForkliftId,outline:boolean)=>{const out=surface(1080,1920),profile=createProfile();profile.cosmetics.cargo=style;profile.cosmetics.forklift=paint;drawColorExitShipment(out.context,outbound,progress,gameView({profile,account:appearanceAccount(profile,outline),animation:{shipment:outbound,progress,board,transportPlan:plan}}));return digest(out.ctx.getImageData(0,0,1080,1920).data);};
  const standard=draw('classic','yellow',false);for(let i=0;i<3;i++){const selected=draw(STYLES[i],TRUCKS[i],false);assert.notEqual(selected,standard);assert.notEqual(draw(STYLES[i],TRUCKS[i],true),selected);assert.notEqual(draw(STYLES[i],'yellow',false),selected);}assert.equal(JSON.stringify({outbound,plan,board}),snapshot);
 }
});
