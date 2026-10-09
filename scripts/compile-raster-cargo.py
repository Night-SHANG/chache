"""Compile original imagegen sprites without repainting or hue changes.
Authoring-only tool: Python3 + Pillow + scipy. Runtime/build use the verified committed PNG.
"""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image
from scipy import ndimage
import numpy as np
ROOT=Path(__file__).resolve().parent.parent
STYLES=['wood','insulated','reinforced','taped','toy_brick','paper_fold','space_case','ice_crystal','steam_brass','neon_circuit','lava_core','ocean_relic','royal_gold','field_supply','harbor_container']
REFINED={'wood','neon_circuit','lava_core','ocean_relic'}
SIZE=128;PAD=3;STRIDE=SIZE+PAD*2

def source_path(style):
    if style == 'harbor_container':
        return ROOT/'artifacts/v0210-art-source/cargo-harbor_container-generated.png'
    # Explicit reviewed overrides; never overwrite the private v0.19 masters.
    if style in REFINED:
        return ROOT/f'artifacts/v0200-art-source/cargo-{style}-generated.png'
    return ROOT/f'artifacts/v0190-art-source/{style}-generated.png'

def slices(path):
    im=Image.open(path).convert('RGBA'); alpha=np.asarray(im.getchannel('A'))
    labels,n=ndimage.label(alpha>=128)
    areas=np.bincount(labels.ravel()); chosen=[i for i in range(1,n+1) if areas[i]>im.width*im.height*.025]
    if len(chosen)!=5: raise ValueError(f'{path.name}: expected five substantial distinct crates, found {len(chosen)}')
    rects=[]
    objects=ndimage.find_objects(labels)
    for i in chosen:
        yy,xx=objects[i-1];rects.append((max(0,xx.start-2),max(0,yy.start-2),min(im.width,xx.stop+2),min(im.height,yy.stop+2)))
    rects.sort(key=lambda r:(r[1]+r[3])/2)
    rects=sorted(rects[:3],key=lambda r:r[0])+sorted(rects[3:],key=lambda r:r[0])
    tiles=[]
    for r in rects:
        crop=im.crop(r); ratio=crop.width/crop.height
        if not .83<=ratio<=1.18: raise ValueError(f'{path.name}: non-square body {r} ratio {ratio}')
        crop.thumbnail((SIZE,SIZE),Image.Resampling.LANCZOS)
        tile=Image.new('RGBA',(SIZE,SIZE));tile.alpha_composite(crop,((SIZE-crop.width)//2,(SIZE-crop.height)//2));tiles.append(tile)
    return tiles,rects

def quantize_with_frozen_palette(rgba, baseline):
    # Palette encoding only: the existing 256 RGBA colors are immutable. Preserve
    # the original index buffer; map only appended art to its nearest RGBA color.
    from scipy.spatial import cKDTree
    palette=np.asarray(baseline.getpalette(),dtype=np.uint8).reshape(-1,3)
    alpha=np.array(list(baseline.info['transparency']),dtype=np.uint8)
    colors=np.column_stack((palette,alpha)).astype(float)
    pixels=np.asarray(rgba).reshape(-1,4).astype(float)
    for values in (colors,pixels):
        values[:,:3]*=values[:,3:4]/255
        values[:,3]*=1.5
    indices=cKDTree(colors).query(pixels)[1].astype(np.uint8).reshape(rgba.height,rgba.width)
    out=Image.fromarray(indices,'P');out.putpalette(baseline.getpalette())
    out.info['transparency']=baseline.info['transparency']
    return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--available',action='store_true');args=ap.parse_args()
    frozen=ROOT/'artifacts/v0210-art-source/cargo-v020-protected.png'
    baseline=Image.open(frozen)
    manifest=json.loads(frozen.with_suffix('.manifest.json').read_text())
    if hashlib.sha256(frozen.read_bytes()).hexdigest()!=manifest['sha256']:
        raise ValueError('Frozen v0.20 cargo atlas changed')
    path=source_path('harbor_container');tiles,rects=slices(path)
    if any(not 1 <= (box[2]-box[0])/(box[3]-box[1]) <= 1.04 for box in rects):
        raise ValueError('Harbor cargo requires near-square 1.00–1.04 source silhouettes; regenerate, never stretch')
    row=Image.new('RGBA',(5*STRIDE,STRIDE))
    for col,tile in enumerate(tiles):row.alpha_composite(tile,(col*STRIDE+PAD,PAD))
    encoded=quantize_with_frozen_palette(row,baseline)
    atlas=Image.new('P',(baseline.width,baseline.height+STRIDE))
    atlas.putpalette(baseline.getpalette());atlas.info['transparency']=baseline.info['transparency']
    atlas.paste(baseline,(0,0));atlas.paste(encoded,(0,baseline.height))
    dest=ROOT/('artifacts/v0210-art-source/cargo-available-atlas.png' if args.available else 'assets/cargo-materials.png')
    atlas.save(dest,optimize=True)
    if atlas.crop((0,0,baseline.width,baseline.height)).convert('RGBA').tobytes()!=baseline.convert('RGBA').tobytes():
        raise ValueError('Protected cargo pixels changed')
    data=dest.read_bytes()
    if len(data)-len(frozen.read_bytes())>30*1024:raise ValueError('Added cargo exceeds 30 KiB')
    manifest.update({'width':atlas.width,'height':atlas.height,'styles':STYLES,'bytes':len(data),
       'sha256':hashlib.sha256(data).hexdigest(),
       'preservation':{'path':str(frozen.relative_to(ROOT)),'sha256':hashlib.sha256(frozen.read_bytes()).hexdigest(),
        'rows':14,'encoding':'Original palette/index buffer retained; appended row nearest premultiplied RGBA palette encoding only'}})
    manifest['sources'].append({'style':'harbor_container','path':str(path.relative_to(ROOT)),
       'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'cropRects':rects})
    dest.with_suffix('.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'styles':STYLES,'bytes':len(data),'addedBytes':len(data)-len(frozen.read_bytes()),'dimensions':atlas.size,'cropRects':rects},ensure_ascii=False))
if __name__=='__main__':main()
