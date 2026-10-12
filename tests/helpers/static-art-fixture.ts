import {loadImage} from '@napi-rs/canvas';
import {STATIC_ART_RESOURCES} from '../../src/presentation/static-art-manifest.ts';
import {configureStaticArt,prepareStaticArt} from '../../src/presentation/static-art-resources.ts';
import type {ThemeId} from '../../src/application/profile.ts';
import type {ViewState} from '../../src/presentation/view-types.ts';
import {staticArtRequirementsForView} from '../../src/presentation/static-art-requirements.ts';
const shared=['cargo.core','tools.core','forklift.base','forklift.styled','frame.classic','material.board','material.cargo','material.scene'];
configureStaticArt(async path=>{
 const resource=Object.values(STATIC_ART_RESOURCES).find(value=>value.src===path);if(!resource)throw Error(`Unknown fixture image ${path}`);
 return await loadImage(new URL('../../'+resource.sourcePath,import.meta.url).pathname) as unknown as CanvasImageSource;
});
export async function prepareArt(theme:ThemeId='day',previews:string[]=[]):Promise<void>{
 const result=await prepareStaticArt({scene:`scene.${theme}`,shared,previews});if(result.status!=='ready')throw Error(`Art fixture not ready: ${JSON.stringify(result)}`);
}
export async function prepareViewArt(view:ViewState):Promise<void>{
 const result=await prepareStaticArt(staticArtRequirementsForView(view));if(result.status!=='ready')throw Error(`View art fixture not ready: ${JSON.stringify(result)}`);
}
await prepareArt();
