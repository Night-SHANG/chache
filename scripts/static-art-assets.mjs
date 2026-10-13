/** Fast source/preflight and packaged-output checks. Never renders artwork or allocates canvases. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestSource } from './static-art-authoring/manifest-source.mjs';
import { COSMETIC_CATALOG } from '../src/application/cosmetics.ts';
import { decodePng, sha256 } from './static-art-authoring/png.mjs';

const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
export async function verifyStaticArtAssets(root=process.cwd(),{verifySources=true,runtimePaths=false}={}) {
 const manifestRoot=runtimePaths?sourceRoot:resolve(root);
 const manifest=JSON.parse(await readFile(resolve(manifestRoot,'scripts/static-art-authoring/resources.json'),'utf8'));
 if(await readFile(resolve(manifestRoot,'src/presentation/static-art-manifest.ts'),'utf8')!==manifestSource(manifest))throw Error('Static art runtime manifest mismatch');
 const resources=Object.values(manifest.resources);let bytes=0,mainBytes=0,cosmeticsBytes=0;
 const themes=COSMETIC_CATALOG.filter(item=>item.kind==='theme').map(item=>item.id),forklifts=COSMETIC_CATALOG.filter(item=>item.kind==='forklift').map(item=>item.id);
 const sameKeys=(value,expected)=>JSON.stringify(Object.keys(value).sort())===JSON.stringify([...expected].sort());
 const expectedKeys=[...themes.map(id=>`scene.${id}`),'forklift.base','forklift.styled','cargo.core','tools.core','frame.classic','material.board','material.cargo','material.scene'];
 if(!sameKeys(manifest.resources,expectedKeys)||!sameKeys(manifest.scenes,themes)||!sameKeys(manifest.previews,[])||!sameKeys(manifest.forklifts,forklifts))throw Error('Static art active catalog coverage mismatch');
 for(const resource of resources){
  if(resource.package!=='main'||resource.src!==resource.sourcePath||!resource.src.startsWith('assets/'))throw Error(`Static art single-package path mismatch: ${resource.key}`);
  const path=resolve(root,runtimePaths?resource.src:resource.sourcePath),encoded=await readFile(path);
  if(encoded.length!==resource.bytes||sha256(encoded)!==resource.sha256)throw Error(`Static art hash mismatch: ${resource.key}`);
  const decoded=decodePng(encoded);
  if(decoded.width!==resource.width||decoded.height!==resource.height)throw Error(`Static art dimensions mismatch: ${resource.key}`);
  if(sha256(decoded.pixels)!==resource.pixelSha256)throw Error(`Static art decoded pixels mismatch: ${resource.key}`);
  bytes+=encoded.length;if(resource.package==='main')mainBytes+=encoded.length;else cosmeticsBytes+=encoded.length;
 }
 const sprites=[...Object.values(manifest.scenes),...Object.values(manifest.previews).flatMap(Object.values),...Object.values(manifest.forklifts),...Object.values(manifest.cargo),...Object.values(manifest.tools),...Object.values(manifest.frames).flat()];
 for(const sprite of sprites){const image=manifest.resources[sprite.resource],r=sprite.source,d=sprite.destination;if(!image||![r.x,r.y,r.w,r.h,d.x,d.y,d.w,d.h].every(Number.isFinite)||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>image.width||r.y+r.h>image.height||d.w<=0||d.h<=0)throw Error(`Static art source rectangle mismatch: ${sprite.resource}`);}
 if(verifySources){
  const sourceManifestBytes=await readFile(resolve(manifestRoot,'scripts/static-art-authoring/sources.json'));
  if(sha256(sourceManifestBytes)!==manifest.source.sourceManifestSha256)throw Error('Static art source manifest mismatch');
  const frozen=JSON.parse(sourceManifestBytes.toString());
  for(const input of manifest.source.generatorInputs)if(sha256(await readFile(resolve(manifestRoot,input.path)))!==input.sha256)throw Error(`Static art generator source mismatch: ${input.path}`);
  for(const asset of frozen.sourceAssets)if(sha256(await readFile(resolve(manifestRoot,asset.path)))!==asset.sha256)throw Error(`Original static image mismatch: ${asset.path}`);
  for(const source of frozen.sources)if(sha256(await readFile(resolve(manifestRoot,'scripts/static-art-authoring',source.path)))!==source.sha256)throw Error(`Frozen artwork source mismatch: ${source.path}`);
 }
 return {resources:resources.length,bytes,mainBytes,cosmeticsBytes,sourceCommit:manifest.source.sourceCommit};
}
