import './helpers/cargo-atlas-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { cargoBox, forklift, PALETTE } from '../src/presentation/assets.ts';
import type { CargoId, CellTrait } from '../src/domain/types.ts';
import type { CargoStyleId, ForkliftId } from '../src/application/profile.ts';

const CARGOS: CargoId[] = ['cargo.food', 'cargo.machine', 'cargo.chem', 'cargo.electronic', 'cargo.cold'];
const TRAITS: (CellTrait | undefined)[] = [undefined, { kind: 'rush', remaining: 3 }, { kind: 'rush', remaining: 2 },
  { kind: 'rush', remaining: 1 }, { kind: 'pallet' }, { kind: 'hazard' }, { kind: 'wildcard' }, { kind: 'waste' }];
function surface(width = 140, height = 140) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  return { canvas, ctx, context: ctx as unknown as CanvasRenderingContext2D };
}
const digest = (data: Uint8ClampedArray) => createHash('sha256').update(data).digest('hex');
function cargoImage(style: CargoStyleId, cargo: CargoId = 'cargo.food', trait?: CellTrait, large = false, outline = false) {
  const result = surface(); cargoBox(result.context, cargo, 10, 10, 110, 1, trait, style, large, outline); return result;
}

test('classic and legacy outline retain frozen pixels with only the authorized waste label normalized', () => {
  const expected = { classic: '5e9ec506e58688cf8a07d1ea99849ee955ff0cf8b4b3b597ba3d19f2bd15494a',
    outline: '0f81958f0b39efa2cf3e7c26119ece02854b0f4e3e7123a9cb4bf51330bc99f6' };
  for (const style of ['classic', 'outline'] as const) {
    const { ctx, context } = surface(600, 1010);
    // Normalize only the approved text change; keep the historical hashes unchanged.
    const fill=ctx.fillText.bind(ctx);ctx.fillText=(value,x,y)=>fill(value==='废弃箱'?'废弃物':value,x,y);
    TRAITS.forEach((trait, row) => CARGOS.forEach((cargo, col) => cargoBox(context, cargo, 8 + col * 118, 8 + row * 124, 110, 1, trait, style, row % 2 === 1)));
    assert.equal(digest(ctx.getImageData(0, 0, 600, 1010).data), expected[style], style);
  }
});

test('yellow, blue and red retain their pre-v0.11 pixel baselines at all eight headings', () => {
  const expected = { yellow: 'e6f7ee79d89f65e94267d5a4d50d0f8b8a373cf18f11ecb523979160947e7fdf',
    blue: 'b3c58b82cb25093cdb7fb3ff2e75058f3f211dc12a9f01243cf63dcb39ac9c2d',
    red: '165858756c9e5b3a20b945e9f0d545b0f7c9ec2f164bd1c7715d1f45b7420817' };
  for (const paint of ['yellow', 'blue', 'red'] as const) {
    const { ctx, context } = surface(512, 512);
    for (let i = 0; i < 8; i++) forklift(context, 70 + i % 4 * 125, 125 + Math.floor(i / 4) * 230, 110, i * Math.PI / 4, paint);
    assert.equal(digest(ctx.getImageData(0, 0, 512, 512).data), expected[paint], paint);
  }
});

test('wood visibly changes each colored crate while retaining opaque cargo icon pixels', () => {
  for (const cargo of CARGOS) {
    const old = cargoImage('classic', cargo).ctx.getImageData(0, 0, 140, 140).data;
    const wood = cargoImage('wood', cargo).ctx.getImageData(0, 0, 140, 140).data;
    let changed = 0, preservedGlyph = 0;
    const glyph = cargo === 'cargo.chem' ? [255, 242, 172] : [255, 244, 218];
    for (let i = 0; i < old.length; i += 4) {
      // v0.17 changes material silhouettes; the unchanged envelope is covered by material-crate-shells.test.ts.
      if (wood[i] !== old[i] || wood[i + 1] !== old[i + 1] || wood[i + 2] !== old[i + 2]) changed++;
      if (old[i] === glyph[0] && old[i + 1] === glyph[1] && old[i + 2] === glyph[2] && old[i + 3] === 255) {
        assert.deepEqual([...wood.slice(i, i + 4)], [...old.slice(i, i + 4)], `${cargo}: solid glyph at ${i / 4}`); preservedGlyph++;
      }
    }
    assert.ok(changed > 1200, `${cargo}: wood must change materially more than a tiny decal; changed ${changed}`);
    assert.ok(preservedGlyph > 60, `${cargo}: the original symbol must stay visible`);
  }
});

test('wood keeps all rush numbers, warning labels and secondary warning symbols above its slats', () => {
  for (const trait of TRAITS.slice(1)) for (const large of [false, true]) {
    const a = cargoImage('classic', 'cargo.machine', trait, large), b = cargoImage('wood', 'cargo.machine', trait, large);
    const crop = trait?.kind === 'waste' ? [16, 20, 95, 91] : trait?.kind === 'rush' && large ? [45, 17, 40, 34] : [27, 20, 78, 22];
    const [x, y, w, h] = crop;
    assert.deepEqual(b.ctx.getImageData(x, y, w, h).data, a.ctx.getImageData(x, y, w, h).data, `${trait?.kind} ${trait?.remaining ?? ''} large=${large}`);
    if (trait?.kind === 'hazard' || trait?.kind === 'wildcard') {
      assert.deepEqual(b.ctx.getImageData(91, 90, 14, 9).data, a.ctx.getImageData(91, 90, 14, 9).data, `${trait.kind} secondary marker`);
    }
    if (trait?.kind === 'pallet') assert.deepEqual(b.ctx.getImageData(15, 103, 96, 13).data, a.ctx.getImageData(15, 103, 96, 13).data, 'pallet feet');
  }
});

test('free outline overlays classic and wood and is exactly compatible with the legacy outline including waste', () => {
  for (const trait of TRAITS) {
    const legacy = cargoImage('outline', 'cargo.cold', trait).ctx.getImageData(0, 0, 140, 140).data;
    const overlay = cargoImage('classic', 'cargo.cold', trait, false, true).ctx.getImageData(0, 0, 140, 140).data;
    assert.equal(digest(overlay), digest(legacy), `legacy ${trait?.kind ?? 'normal'}`);
    const wood = cargoImage('wood', 'cargo.cold', trait, false, true).ctx;
    const plainWood = cargoImage('wood', 'cargo.cold', trait).ctx;
    assert.notEqual(digest(wood.getImageData(0, 0, 140, 140).data), digest(plainWood.getImageData(0, 0, 140, 140).data));
    assert.deepEqual(wood.getImageData(14, 10, 100, 4).data, cargoImage('outline', 'cargo.cold', trait).ctx.getImageData(14, 10, 100, 4).data);
  }
});

test('white engineering paint preserves forklift geometry, forks and +x load anchor at 32 headings and three sizes', () => {
  for (const size of [44, 80, 110]) for (let i = 0; i < 32; i++) {
    function vehicle(paint: ForkliftId) {
      const { ctx, context } = surface(200, 200); forklift(context, 100, 100, size, i * Math.PI / 16, paint); return ctx.getImageData(0, 0, 200, 200).data;
    }
    const yellow = vehicle('yellow'), white = vehicle('white'); let changed = 0;
    for (let j = 0; j < yellow.length; j += 4) {
      assert.equal(white[j + 3], yellow[j + 3], `size ${size}, heading ${i}, alpha ${j / 4}`);
      if (white[j] !== yellow[j] || white[j + 1] !== yellow[j + 1] || white[j + 2] !== yellow[j + 2]) changed++;
    }
    assert.ok(changed > size * size / 15, `white should visibly change the body at size ${size}, heading ${i}`);
  }
  const a = surface(), b = surface(); forklift(a.context, 60, 70, 110, 0, 'yellow'); forklift(b.context, 60, 70, 110, 0, 'white');
  assert.equal(digest(b.ctx.getImageData(98, 35, 28, 70).data), digest(a.ctx.getImageData(98, 35, 28, 70).data), 'fork assembly and cargo anchor region beyond body paint');
});

test('cosmetics never change the five semantic cargo colors', () => {
  assert.deepEqual(Object.fromEntries(CARGOS.map(id => [id, PALETTE[id].mid])), {
    'cargo.food': '#e9584b', 'cargo.machine': '#76a74d', 'cargo.chem': '#efb938',
    'cargo.electronic': '#8f70d1', 'cargo.cold': '#59b5e7',
  });
});

async function cosmeticArt() {
  try { return await import('../src/presentation/cosmetic-art.ts'); }
  catch { assert.fail('bounded harbor background and category previews must be implemented'); }
}

test('harbor backdrop clips every pixel to its rectangle and restores drawing state', async () => {
  const { drawHarborBackground } = await cosmeticArt(), { ctx, context } = surface(320, 220);
  ctx.fillStyle = '#fff'; ctx.globalAlpha = .8; ctx.lineWidth = 7;
  drawHarborBackground(context, { x: 30, y: 25, w: 250, h: 150 });
  assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.lineWidth, 7);
  const pixels = ctx.getImageData(0, 0, 320, 220).data, colors = new Set<string>();
  for (let y = 0; y < 220; y++) for (let x = 0; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    if (x < 30 || x >= 280 || y < 25 || y >= 175) assert.equal(pixels[i + 3], 0, `spill ${x},${y}`);
    else { assert.ok(pixels[i + 3] > 0, `unpainted ${x},${y}`); colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); }
  }
  assert.ok(colors.size > 80, 'steel, crane, container and water silhouettes must be visibly rendered');
  const before = digest(pixels);
  for (const rect of [{ x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 20, h: -5 }, { x: NaN, y: 0, w: 10, h: 10 }]) drawHarborBackground(context, rect);
  assert.equal(digest(ctx.getImageData(0, 0, 320, 220).data), before, 'degenerate bounds are a no-op');
  // napi-rs exposes a stale fillStyle getter after restore; the painted pixel is authoritative.
  ctx.fillRect(0, 0, 1, 1);
  assert.deepEqual([...ctx.getImageData(0, 0, 1, 1).data], [255, 255, 255, 204], 'fill, alpha, transform and clipping state restored');
});

test('shop previews isolate a category and use the same actual selected cargo and forklift drawings', async () => {
  const { drawCosmeticPreview } = await cosmeticArt();
  const images: string[] = [];
  for (const category of ['theme', 'cargo', 'forklift'] as const) {
    const a = surface(820, 340), b = surface(820, 340), bounds = { x: 20, y: 20, w: 780, h: 300 };
    drawCosmeticPreview(a.context, bounds, { category, theme: 'day', cargoStyle: 'classic', forklift: 'yellow' });
    drawCosmeticPreview(b.context, bounds, { category, theme: 'harbor', cargoStyle: 'wood', forklift: 'white', cargoOutline: true });
    const base = a.ctx.getImageData(0, 0, 820, 340).data, selected = b.ctx.getImageData(0, 0, 820, 340).data;
    assert.notEqual(digest(selected), digest(base), `${category} selection must be visible`);
    assert.equal(selected[3], 0); assert.equal(selected[(339 * 820 + 819) * 4 + 3], 0);
    images.push(digest(selected));
  }
  assert.equal(new Set(images).size, 3, 'category previews must use distinct subject compositions');
});

test('large shop subjects preserve the real asset pixels rather than substituting schematic icons', async () => {
  const { drawCosmeticPreview } = await cosmeticArt();
  for (const category of ['cargo', 'forklift', 'theme'] as const) {
    const preview = surface(720, 250), reference = surface(720, 250);
    drawCosmeticPreview(preview.context, { x: 0, y: 0, w: 720, h: 250 }, { category, cargoStyle: 'wood', forklift: 'white', cargoOutline: true });
    if (category === 'cargo') cargoBox(reference.context, 'cargo.food', 285, 28, 178, 1, undefined, 'wood', false, true);
    else if (category === 'forklift') forklift(reference.context, 340, 124, 257, 0, 'white');
    else cargoBox(reference.context, 'cargo.food', 98, 98, 107, 1, undefined, 'wood', false, true);
    const actual = preview.ctx.getImageData(0, 0, 720, 250).data, expected = reference.ctx.getImageData(0, 0, 720, 250).data;
    let compared = 0;
    for (let i = 0; i < expected.length; i += 4) if (expected[i + 3] === 255) {
      assert.deepEqual([...actual.slice(i, i + 4)], [...expected.slice(i, i + 4)], `${category} opaque asset pixel ${i / 4}`); compared++;
    }
    assert.ok(compared > 5000, `${category} requires a large readable subject`);
  }
});
