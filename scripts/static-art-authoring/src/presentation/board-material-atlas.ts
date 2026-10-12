import type { ThemeId } from '../application/profile.ts';
import { drawSceneMaterialTile } from './scene-frame-atlas.ts';

export const BOARD_MATERIAL_ATLAS = Object.freeze({
 src: 'assets/board-materials.png', width: 512, height: 512, tileSize: 128,
 themes: Object.freeze(['day', 'night', 'harbor', 'cold_chain', 'rail_freight', 'express_sorting', 'toy_workshop', 'paper_warehouse', 'space_cargo', 'steam_foundry', 'neon_depot', 'lava_forge', 'ocean_vault', 'royal_store', 'field_station'] as readonly ThemeId[]),
});
let image: CanvasImageSource | undefined;

/** Packaged texture loading is optional; a decode failure retains the complete drawn floor. */
export async function loadBoardMaterialAtlas(load: (path: string) => Promise<CanvasImageSource>): Promise<boolean> {
 try {
  const next = await load(BOARD_MATERIAL_ATLAS.src), size = next as { width?: number; height?: number };
  if (size.width !== BOARD_MATERIAL_ATLAS.width || size.height !== BOARD_MATERIAL_ATLAS.height) throw Error('Board material atlas dimensions do not match');
  image = next; return true;
 } catch { image = undefined; return false; }
}

/** Samples one exact cell, leaving seams, lighting, doors and reserved-entry overlays to their existing layers. */
export function drawBoardMaterialTile(ctx: CanvasRenderingContext2D, theme: ThemeId, x: number, y: number, size: number): boolean {
 const index = BOARD_MATERIAL_ATLAS.themes.indexOf(theme);
 if (!image || index < 0 || ![x, y, size].every(Number.isFinite) || size <= 0) return false;
 const tile = BOARD_MATERIAL_ATLAS.tileSize;
 ctx.drawImage(image, index % 4 * tile, Math.floor(index / 4) * tile, tile, tile, x, y, size, size);
 return true;
}

/** Stable integer coordinates choose three quiet crops without per-frame randomness. */
export function drawBoardMaterialVariant(ctx: CanvasRenderingContext2D, theme: ThemeId, x: number, y: number, size: number, row: number, col: number): boolean {
 if (![row, col].every(Number.isInteger)) return false;
 const variant = ((row * 7 + col * 11 + Math.floor(row / 2) * 5 + Math.floor(col / 3)) % 3 + 3) % 3;
 return drawSceneMaterialTile(ctx, theme, x, y, size, variant);
}
