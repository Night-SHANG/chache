"""Compile fifteen generated bodies without repainting, rotation or distortion.

The master and prompt belong to the private art checkpoint. Crop rectangles,
source/output hashes, alpha statistics and the exact sampling policy are recorded
in the packaged manifest. Re-running this script reproduces the shipped atlas.
"""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'artifacts/v0200-art-source/themed-forklifts-generated.png'
DEST = ROOT / 'assets/themed-forklifts.png'
PAINTS = [
    'electric', 'heavy', 'compact', 'toy', 'paper', 'space',
    'steam', 'neon', 'lava', 'diving', 'royal', 'field',
]
TILE = 128
MAX_BYTES = 100 * 1024


def main():
    from importlib.util import spec_from_file_location,module_from_spec
    spec=spec_from_file_location('cargo_compiler',ROOT/'scripts/compile-raster-cargo.py')
    compiler=module_from_spec(spec);spec.loader.exec_module(compiler)
    frozen=ROOT/'artifacts/v0210-art-source/forklifts-v020-protected.png'
    baseline=Image.open(frozen)
    manifest=json.loads(frozen.with_suffix('.manifest.json').read_text())
    if hashlib.sha256(frozen.read_bytes()).hexdigest()!=manifest['sha256']:
        raise ValueError('Frozen v0.20 forklift atlas changed')
    source=ROOT/'artifacts/v0210-art-source/forklifts-timber-ice-harbor-generated.png'
    master=Image.open(source).convert('RGBA');alpha=np.asarray(master.getchannel('A'))
    if (alpha==0).mean()<.25:raise ValueError('Generated master must retain genuine alpha gutters')
    labels,count=ndimage.label(alpha>=128);areas=np.bincount(labels.ravel());objects=ndimage.find_objects(labels)
    boxes=[]
    for label in range(1,count+1):
        if areas[label]<master.width*master.height*.025:continue
        yy,xx=objects[label-1]
        boxes.append((max(0,xx.start-2),max(0,yy.start-2),min(master.width,xx.stop+2),min(master.height,yy.stop+2)))
    if len(boxes)!=3:raise ValueError(f'Expected three body silhouettes, got {len(boxes)}')
    boxes.sort(key=lambda box:box[1]);paints=['timber','ice','harbor']
    extension=Image.new('RGBA',(3*TILE,TILE));placements=[]
    for index,box in enumerate(boxes):
        crop=master.crop(box)
        if not 1.4<=crop.width/crop.height<=1.8:raise ValueError('Unexpected body aspect ratio')
        crop.thumbnail((124,124),Image.Resampling.LANCZOS)
        offset=(index*TILE+(TILE-crop.width)//2,(TILE-crop.height)//2)
        extension.alpha_composite(crop,offset)
        placements.append({'paint':paints[index],'sourceRect':list(box),'atlasRect':[offset[0]+baseline.width+TILE,offset[1],crop.width,crop.height]})
    encoded=compiler.quantize_with_frozen_palette(extension,baseline)
    # A full transparent separator retains the old right-edge sampling clamp at
    # small board sizes. The former last tile must not see newly appended art.
    transparent_index=list(baseline.info['transparency']).index(0)
    atlas=Image.new('P',(baseline.width+4*TILE,TILE),transparent_index);atlas.putpalette(baseline.getpalette())
    atlas.info['transparency']=baseline.info['transparency'];atlas.paste(baseline,(0,0));atlas.paste(encoded,(baseline.width+TILE,0))
    atlas.save(DEST,optimize=True);data=DEST.read_bytes()
    if len(data)>MAX_BYTES or len(data)-len(frozen.read_bytes())>25*1024:raise ValueError('Forklift byte budget exceeded')
    if atlas.crop((0,0,baseline.width,TILE)).convert('RGBA').tobytes()!=baseline.convert('RGBA').tobytes():
        raise ValueError('Protected forklift pixels changed')
    output_alpha=np.asarray(atlas.convert('RGBA').getchannel('A'))
    manifest.update({'width':atlas.width,'paints':PAINTS+paints,'tileColumns':list(range(12))+[13,14,15],'cropRects':manifest['cropRects']+boxes,
        'placements':manifest['placements']+placements,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
        'newSource':{'path':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'dimensions':list(master.size),'paints':paints,'cropRects':boxes},
        'preservation':{'path':str(frozen.relative_to(ROOT)),'sha256':hashlib.sha256(frozen.read_bytes()).hexdigest(),
            'tiles':12,'separatorRect':[1536,0,128,128],'separatorReason':'Preserve former image-edge filtering for the field body at every runtime size','encoding':'Original palette/index buffer retained; appended tiles nearest premultiplied RGBA palette encoding only'},
        'sampling':{**manifest['sampling'],'quantization':'Frozen v0.20 256-color palette; nearest premultiplied RGBA for appended tiles'},
        'alpha':{'transparentPixels':int((output_alpha==0).sum()),'translucentPixels':int(((output_alpha>0)&(output_alpha<255)).sum()),'opaquePixels':int((output_alpha==255).sum())}})
    DEST.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'bytes':len(data),'addedBytes':len(data)-len(frozen.read_bytes()),'cropRects':boxes,'dimensions':atlas.size}))


if __name__ == '__main__':
    main()
