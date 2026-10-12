import { loadImage } from '@napi-rs/canvas';
import { loadCargoAtlas } from '../../scripts/static-art-authoring/src/presentation/cargo-atlas.ts';

// Exercise the same image installation API as both application entry points.
if(!await loadCargoAtlas(async()=>await loadImage(new URL('../../assets/cargo-materials.png',import.meta.url).pathname) as unknown as CanvasImageSource))throw Error('Fixture cargo atlas did not load');
