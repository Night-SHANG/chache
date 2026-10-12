import type { ForkliftId } from '../application/profile.ts';

export const THEMED_FORKLIFT_ATLAS = Object.freeze({
 src: 'assets/themed-forklifts.png', width: 2048, height: 128, tileSize: 128,
 // Column 12 isolates the former right image edge from appended sprites.
 tileColumns: Object.freeze([0,1,2,3,4,5,6,7,8,9,10,11,13,14,15]),
 paints: Object.freeze(['electric', 'heavy', 'compact', 'toy', 'paper', 'space', 'steam', 'neon', 'lava', 'diving', 'royal', 'field', 'timber', 'ice', 'harbor'] as readonly ForkliftId[]),
});
let image: CanvasImageSource | undefined;

/** Optional packaged artwork never gates input or writes player data. */
export async function loadThemedForkliftAtlas(load: (path: string) => Promise<CanvasImageSource>): Promise<boolean> {
 try {
  const next = await load(THEMED_FORKLIFT_ATLAS.src), size = next as { width?: number; height?: number };
  if (size.width !== THEMED_FORKLIFT_ATLAS.width || size.height !== THEMED_FORKLIFT_ATLAS.height) throw Error('Forklift atlas dimensions do not match');
  image = next; return true;
 } catch { image = undefined; return false; }
}

/** Square sampling preserves generated proportions. Transparent padding confines the body to the old footprint. */
export function drawThemedForkliftBody(ctx: CanvasRenderingContext2D, paint: ForkliftId): boolean {
 const index = THEMED_FORKLIFT_ATLAS.paints.indexOf(paint);
 if (!image || index < 0) return false;
 const tile = THEMED_FORKLIFT_ATLAS.tileSize;
 ctx.drawImage(image, THEMED_FORKLIFT_ATLAS.tileColumns[index] * tile, 0, tile, tile, -44, -40, 80, 80);
 return true;
}
