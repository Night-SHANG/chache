// Historical authoring contract: hashes and assertions remain unchanged; runtime textures are covered separately.
import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { cargoBox, forklift, PALETTE } from '../scripts/static-art-authoring/src/presentation/assets.ts';
import * as art from '../scripts/static-art-authoring/src/presentation/cosmetic-art.ts';
import type { CargoStyleId, ForkliftId, ThemeId } from '../scripts/static-art-authoring/src/application/profile.ts';
import type { CargoId, CellTrait } from '../scripts/static-art-authoring/src/domain/types.ts';

const STYLES = ['insulated', 'reinforced', 'taped'] as const;
const TRUCKS = ['electric', 'heavy', 'compact'] as const;
const THEMES = ['cold_chain', 'rail_freight', 'express_sorting'] as const;
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
    // The whole-body steel embossing shades to the cargo's existing dark value.
    const palette = [PALETTE[cargo].light, style==='reinforced'?PALETTE[cargo].dark:PALETTE[cargo].mid].map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
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
  for (const [a, b] of [['yellow', 'electric'], ['yellow', 'heavy'], ['yellow', 'compact'], ['electric', 'heavy'], ['electric', 'compact'], ['heavy', 'compact']] as const) {
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

test('logistics background hook draws only valid new themes, clips all pixels and restores caller state', () => {
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
