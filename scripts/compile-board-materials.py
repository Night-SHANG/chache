"""Pack imagegen floor tiles; only cell cropping, resampling and PNG encoding."""
from pathlib import Path
import json,hashlib
from PIL import Image
root=Path(__file__).resolve().parent.parent;source=root/'artifacts/v0190-art-source/board-materials-generated.png';im=Image.open(source).convert('RGB');out=Image.new('RGB',(512,512));rects=[]
for i in range(16):
 x=i%4;y=i//4;box=(round(x*im.width/4),round(y*im.height/4),round((x+1)*im.width/4),round((y+1)*im.height/4));rects.append(box);out.paste(im.crop(box).resize((128,128),Image.Resampling.LANCZOS),(x*128,y*128))
dest=root/'assets/board-materials.png';out.quantize(colors=256,method=Image.Quantize.MEDIANCUT).save(dest,optimize=True);data=dest.read_bytes();manifest={'width':512,'height':512,'tileSize':128,'themes':['day','night','harbor','cold_chain','rail_freight','express_sorting','toy_workshop','paper_warehouse','space_cargo','steam_foundry','neon_depot','lava_forge','ocean_vault','royal_store','field_station'],'source':str(source.relative_to(root)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cropRects':rects,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()};dest.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(manifest)
