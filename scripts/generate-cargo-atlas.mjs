import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {CARGO_ATLAS} from '../src/presentation/cargo-atlas.ts';
const root=new URL('../',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Production builds verify the encoded atlas. Source audit additionally checks every generated master. Authoring regeneration:
 * python3 scripts/compile-raster-cargo.py (Pillow + scipy). No painting or hue changes. */
export function generateCargoAtlas({verifySources=false}={}){
 const manifest=JSON.parse(readFileSync(new URL('assets/cargo-materials.manifest.json',root),'utf8'));
 for(const key of ['width','height','tileSize','padding','bodySize'])if(manifest[key]!==CARGO_ATLAS[key])throw Error(`Cargo atlas ${key} mismatch`);
 if(JSON.stringify(manifest.styles)!==JSON.stringify(CARGO_ATLAS.styles))throw Error('Cargo atlas material ordering mismatch');
 if(manifest.sources.length!==CARGO_ATLAS.styles.length)throw Error('Cargo atlas source count mismatch');
 if(verifySources)for(const source of manifest.sources)if(digest(readFileSync(new URL(source.path,root)))!==source.sha256)throw Error(`Cargo source changed: ${source.style}`);
 const bytes=readFileSync(new URL(CARGO_ATLAS.src,root));
 if(bytes.length!==manifest.bytes||digest(bytes)!==manifest.sha256)throw Error('Cargo atlas content mismatch');
 return bytes;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Verified imagegen cargo atlas: ${generateCargoAtlas().length} bytes`);
