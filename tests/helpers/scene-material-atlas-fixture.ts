import { loadImage } from '@napi-rs/canvas';
import { loadSceneMaterialAtlas } from '../../scripts/static-art-authoring/src/presentation/scene-frame-atlas.ts';

if (!await loadSceneMaterialAtlas(async () => await loadImage(new URL('../../assets/scene-materials.png', import.meta.url).pathname) as unknown as CanvasImageSource)) throw Error('Fixture coherent scene material atlas did not load');
