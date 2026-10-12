// Historical v112 renderer evidence. Frozen painters preserve original pixel contracts; this is not v113 runtime validation.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { boardGeometry } from '../src/presentation/board-geometry.ts';
import { drawThemedBoard } from './static-art-authoring/src/presentation/board-theme.ts';
import { loadBoardMaterialAtlas } from './static-art-authoring/src/presentation/board-material-atlas.ts';

const out = 'artifacts/v0200-scene-source/protected-baseline';
await mkdir(out, { recursive: true });
const entries = [];
for (const loaded of [false, true]) {
 await loadBoardMaterialAtlas(loaded ? loadImage : async () => { throw Error('fallback capture'); });
 for (const theme of ['day', 'night']) for (const dimension of [7, 9]) {
  const canvas = createCanvas(1080, 1920), ctx = canvas.getContext('2d');
  drawThemedBoard(ctx, boardGeometry({ boardSize: dimension }), theme);
  const name = `${theme}-${dimension}-${loaded ? 'loaded' : 'fallback'}`;
  entries.push({ name, theme, dimension, loaded, pixelSha256: createHash('sha256').update(ctx.getImageData(0, 0, 1080, 1920).data).digest('hex') });
  await writeFile(`${out}/${name}.png`, canvas.toBuffer('image/png'));
 }
}
await writeFile(`${out}/manifest.json`, JSON.stringify({ source: 'c837a00 before v0.20 scene edits', canvas: [1080, 1920], entries }, null, 2) + '\n');
console.log(entries);
