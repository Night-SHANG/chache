import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { forklift } from '../src/presentation/assets.ts';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { loadThemedForkliftAtlas, THEMED_FORKLIFT_ATLAS } from '../src/presentation/themed-forklift-art.ts';

const out = process.argv[2] ?? 'artifacts/v0190-themes';
await mkdir(out, { recursive: true });
if (!await loadThemedForkliftAtlas(loadImage)) throw Error('Could not load the real generated forklift atlas');
const paints = ['yellow', ...THEMED_FORKLIFT_ATLAS.paints];
const canvas = createCanvas(1400, paints.length * 185 + 60), ctx = canvas.getContext('2d');
ctx.fillStyle = '#20323d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#edf0de'; ctx.font = '20px "Noto Sans CJK SC", sans-serif';
for (const [x, title] of [[170, '44 px'], [273, '80 px'], [403, '110 px'], [604, '大图'], [809, '四向 + 前叉']]) ctx.fillText(title, x, 36);
for (const [row, paint] of paints.entries()) {
 const y = 60 + row * 185;
 ctx.fillStyle = row % 2 ? '#263c48' : '#20323d'; ctx.fillRect(0, y, 1400, 185);
 ctx.fillStyle = '#edf0de'; ctx.font = '20px "Noto Sans CJK SC", sans-serif'; ctx.fillText(COSMETIC_CATALOG.find(item => item.kind === 'forklift' && item.id === paint).name, 20, y + 89);
 for (const [x, size] of [[187, 44], [300, 80], [438, 110], [650, 195]]) forklift(ctx, x, y + 90, size, 0, paint);
 for (const [index, angle] of [0, Math.PI / 2, Math.PI, Math.PI * 1.5].entries()) forklift(ctx, 860 + index * 140, y + 90, 100, angle, paint);
}
await writeFile(join(out, 'six-generated-forklifts-full-comparison.png'), canvas.toBuffer('image/png'));
process.stdout.write(`Rendered complete forklifts including original wheels, mast, lights and forks to ${out}\n`);
