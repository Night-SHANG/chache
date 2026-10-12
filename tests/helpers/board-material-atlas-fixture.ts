import { loadImage } from '@napi-rs/canvas';
import { loadBoardMaterialAtlas } from '../../scripts/static-art-authoring/src/presentation/board-material-atlas.ts';

if (!await loadBoardMaterialAtlas(async () => await loadImage(new URL('../../assets/board-materials.png', import.meta.url).pathname) as unknown as CanvasImageSource)) throw Error('Fixture board material atlas did not load');
