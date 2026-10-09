import type { ThemeId } from '../application/profile.ts';

/** Separate artwork keeps all original day/night source pixels untouched. */
export const SCENE_MATERIAL_ATLAS = Object.freeze({
 src: 'assets/scene-materials.png', width: 512, height: 960, tileSize: 64, frameSize: 128, variants: 3,
 tileBaseY: 512, tileColumns: 8, frameColumns: 4, extensionThemeStart: 13, extensionTileBaseY: 896,
 themes: Object.freeze(['harbor', 'cold_chain', 'rail_freight', 'express_sorting', 'toy_workshop', 'paper_warehouse', 'space_cargo', 'steam_foundry', 'neon_depot', 'lava_forge', 'ocean_vault', 'royal_store', 'field_station', 'forest_depot', 'ice_vault'] as readonly ThemeId[]),
});
export interface SceneFrameRect { x: number; y: number; w: number; h: number }
let image: CanvasImageSource | undefined;

/** Optional, bounded static image. A missing or malformed atlas never blocks play. */
export async function loadSceneMaterialAtlas(load: (path: string) => Promise<CanvasImageSource>): Promise<boolean> {
 try {
  const next = await load(SCENE_MATERIAL_ATLAS.src), size = next as { width?: number; height?: number };
  if (size.width !== SCENE_MATERIAL_ATLAS.width || size.height !== SCENE_MATERIAL_ATLAS.height) throw Error('Scene material atlas dimensions do not match');
  image = next; return true;
 } catch { image = undefined; return false; }
}

/** Each sample is an actual quiet source crop, with its original lighting orientation. */
export function drawSceneMaterialTile(ctx: CanvasRenderingContext2D, theme: ThemeId, x: number, y: number, size: number, variant = 0): boolean {
 const themeIndex = SCENE_MATERIAL_ATLAS.themes.indexOf(theme);
 if (!image || themeIndex < 0 || ![x, y, size, variant].every(Number.isFinite) || size <= 0) return false;
 const extension = themeIndex >= SCENE_MATERIAL_ATLAS.extensionThemeStart;
 const index = (extension ? themeIndex - SCENE_MATERIAL_ATLAS.extensionThemeStart : themeIndex) * 3 + ((Math.trunc(variant) % 3 + 3) % 3), tile = SCENE_MATERIAL_ATLAS.tileSize;
 const baseY = extension ? SCENE_MATERIAL_ATLAS.extensionTileBaseY : SCENE_MATERIAL_ATLAS.tileBaseY;
 ctx.drawImage(image, index % SCENE_MATERIAL_ATLAS.tileColumns * tile, baseY + Math.floor(index / SCENE_MATERIAL_ATLAS.tileColumns) * tile, tile, tile, x, y, size, size);
 return true;
}

/** Nine-slice the actual perimeter, leaving its center completely untouched. */
export function drawSceneFrame(ctx: CanvasRenderingContext2D, theme: ThemeId, rect: Readonly<SceneFrameRect>, thickness = 28): boolean {
 const index = SCENE_MATERIAL_ATLAS.themes.indexOf(theme), { x, y, w, h } = rect;
 if (!image || index < 0 || ![x, y, w, h, thickness].every(Number.isFinite) || w <= 0 || h <= 0 || thickness <= 0) return false;
 const size = SCENE_MATERIAL_ATLAS.frameSize, sourceBorder = 28, inner = size - sourceBorder * 2;
 const edge = Math.min(thickness, w / 3, h / 3), sx = index % SCENE_MATERIAL_ATLAS.frameColumns * size, sy = Math.floor(index / SCENE_MATERIAL_ATLAS.frameColumns) * size;
 const widths = [edge, w - edge * 2, edge], heights = [edge, h - edge * 2, edge];
 const dx = [x, x + edge, x + w - edge], dy = [y, y + edge, y + h - edge];
 const sourceOffsets = [0, sourceBorder, size - sourceBorder], sourceSizes = [sourceBorder, inner, sourceBorder];
 ctx.save();
 for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
  if (row === 1 && col === 1) continue;
  ctx.drawImage(image, sx + sourceOffsets[col], sy + sourceOffsets[row], sourceSizes[col], sourceSizes[row], dx[col], dy[row], widths[col], heights[row]);
 }
 ctx.restore(); return true;
}

/** Call after the existing gate translation/rotation and before semantic face/arrow.
 * The board-facing edge stops at the original gate boundary, preserving reserved-cell paint.
 * Protected initial themes and delayed images return false for the existing panel.
 */
export function drawThemedGateShell(ctx: CanvasRenderingContext2D, theme: ThemeId, rect: Readonly<SceneFrameRect> = { x: -31, y: -46, w: 49, h: 92 }): boolean {
 return drawSceneFrame(ctx, theme, rect, 11);
}
