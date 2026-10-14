import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname} from 'node:path';
import ts from 'typescript';

function replaceExactly(source,from,to,count=1){
 const parts=source.split(from);if(parts.length!==count+1)throw Error(`Douyin renderer source changed: expected ${count} occurrence(s) of ${from.slice(0,100)}, found ${parts.length-1}`);
 return parts.join(to);
}
function replaceBody(source,name,body){
 const tree=ts.createSourceFile('painter.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const node=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 if(!node?.body)throw Error(`Douyin renderer function missing: ${name}`);
 return source.slice(0,node.body.getStart(tree))+`{\n${body}\n}`+source.slice(node.body.end);
}
// Frozen source fingerprints make even complete function/alias replacements
// fail closed. Review the compatibility proof before updating a fingerprint.
const SOURCE_SHA256={
 'assets.ts':'a419134ac0314ffe3aedfe1f45981529551d57e3e572c138864805511191fe56',
 'board-theme.ts':'34a3f40436a9bc12af5be87c6f8252ece97fdc25fb423f825305e5088cf365e8',
 'board-entry-markers.ts':'9210c63c46dac5e15f5f20963e6497923f6510d4026871b92ebceb06383446a3',
 'cosmetic-art.ts':'75923600c06f8bd95a24f382171caf42b1268fd9d350749f5921b23f467591fb',
 'reference-scenery-art.ts':'231f7265cb0bd6616322cbd8182b42ec2e939386fa527b79239e29bc804a373d',
 'scenery-frame.ts':'7a81b33d18480b4444f1b09a44342af32198077744bb9782467e9abab0549d39',
 'warehouse-art.ts':'8d06d9a26b390175b821415aef9d8274e2404be5cc9baf777cb470df590eef91',
 'shop-art.ts':'b97d2907e2cb12c40ce8c225a113dca107775d73bd448c694c68c36c117e42e9',
 'renderer.ts':'b02a081c47970ec8660e06726e9c5b2c2a9b97f17c6a28ac2572651b2bc82415',
 'color-exit-renderer.ts':'57ab3973e14520f730fc65fb39595b92e4b9613638cedf2356f99ba26ced1b4b',
};
const watched=new Set(['assets.ts','board-theme.ts','board-entry-markers.ts','cosmetic-art.ts','reference-scenery-art.ts','scenery-frame.ts','warehouse-art.ts','shop-art.ts','renderer.ts','color-exit-renderer.ts']);
/** This plugin is attached ONLY to build:Douyin. Shared files are never written.
 * Every surgical replacement is count-checked, so upstream changes fail closed. */
export function douyinRendererPlugin(){
 return {name:'douyin-renderer',setup(build){
  build.onLoad({filter:/\/src\/presentation\/[^/]+\.ts$/},async args=>{
   const name=basename(args.path);if(!watched.has(name))return;
   let source=await readFile(args.path,'utf8');
   if(createHash('sha256').update(source).digest('hex')!==SOURCE_SHA256[name])throw Error(`Douyin renderer source fingerprint changed: ${name}; review compatibility before updating`);
   if(name==='assets.ts'){
    source=replaceBody(source,'hazard','  drawBoundedHazard(ctx,rect,vertical);');
    source=`import {drawBoundedHazard} from './douyin/primitives.ts';\n`+source;
   }
   if(name==='board-theme.ts'){
    // All supported cells are >=840/9. Material stroke hulls lie in
    // [5.25,114.75] of 120, hence inside [4,cell-4] even for the smallest cell.
    source=replaceExactly(source,'ctx.save(); ctx.beginPath(); ctx.rect(px + 4, py + 4, cell - 8, cell - 8); ctx.clip();','ctx.save();');
   }
   if(name==='board-entry-markers.ts'){
    source=replaceExactly(source,"ctx.save();ctx.beginPath();ctx.rect(x+5,y+5,c-10,c-10);ctx.clip();ctx.strokeStyle='rgba(158,223,255,.22)';ctx.lineWidth=7*g.scale;\n  for(let offset=-c;offset<c*2;offset+=24*g.scale){ctx.beginPath();ctx.moveTo(x+offset,y+c);ctx.lineTo(x+offset+c,y);ctx.stroke();}ctx.restore();",'drawBoundedEntryStripes(ctx,x,y,c,g.scale);');
    source="import {drawBoundedEntryStripes} from './douyin/primitives.ts';\n"+source;
   }
   if(name==='reference-scenery-art.ts'){
    source=replaceExactly(source,'drawReferenceBackground','paintReferenceBackground');
    source=replaceExactly(source,'ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();','ctx.save();');
    source="import {withBoundedPainter} from './douyin/bounded-painter.ts';\n"+source+`
export function drawReferenceBackground(ctx:Context,rect:Rect,theme:string):boolean {
 if(!(THEMES as readonly string[]).includes(theme))return false;
 return withBoundedPainter(ctx,rect,c=>paintReferenceBackground(c,rect,theme))??false;
}
`;
   }
   if(name==='cosmetic-art.ts'){
    // Internal background invocations share their outer preview/frame's exact
    // rectangle. Make that contract explicit; none can re-enter the scratch.
    source=replaceExactly(source,'drawHarborBackground','paintHarborBackground',3);
    source=replaceExactly(source,'drawLogisticsBackground','paintLogisticsBackground',3);
    source=replaceExactly(source,'drawReferenceBackground','paintReferenceBackground',2);
    source=replaceExactly(source,'export function drawCosmeticPreview','function paintCosmeticPreview');
    source=replaceExactly(source,'ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();','ctx.save();',4);
    source=replaceExactly(source,"ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();","ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);");
    source=replaceBody(source,'drawCosmeticSetPreview',' if(!validRect(rect))return;\n withBoundedPainter(ctx,rect,c=>paintCosmeticSetPreview(c,rect,options));');
    source="import {withBoundedPainter} from './douyin/bounded-painter.ts';\n"+source+`
export function drawHarborBackground(ctx:Context,rect:Rect):void {
 if(validRect(rect))withBoundedPainter(ctx,rect,c=>paintHarborBackground(c,rect));
}
export function drawLogisticsBackground(ctx:Context,rect:Rect,theme:string):boolean {
 if(!validRect(rect)||!['forest_depot','ice_vault','cold_chain','rail_freight','express_sorting','toy_workshop','paper_warehouse','space_cargo','steam_foundry','neon_depot','lava_forge','ocean_vault','royal_store','field_station'].includes(theme))return false;
 return withBoundedPainter(ctx,rect,c=>paintLogisticsBackground(c,rect,theme))??false;
}
export function drawCosmeticPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions={}):void {
 if(validRect(rect))withBoundedPainter(ctx,rect,c=>paintCosmeticPreview(c,rect,options));
}
`;
   }
   if(name==='warehouse-art.ts')source="export {drawWarehouse} from './douyin/warehouse.ts';\n";
   if(name==='scenery-frame.ts'){
    source=replaceExactly(source,'drawHarborBackground,drawLogisticsBackground','paintHarborBackground,paintLogisticsBackground');
    source=replaceBody(source,'drawThemedSceneryFrame',`
 if(theme==='day'||theme==='night')return false;
 const frame=CLASSIC_SCENERY_FRAME;
 const validViewport=viewport&&[viewport.x,viewport.y,viewport.w,viewport.h,viewport.x+viewport.w].every(Number.isFinite)&&viewport.w>0&&viewport.h>0&&viewport.x<=0&&viewport.x+viewport.w>=L.width;
 const left=validViewport?Math.max(frame.x,viewport.x):frame.x,right=validViewport?Math.min(frame.x+frame.w,viewport.x+viewport.w):frame.x+frame.w;
 return withBoundedPainter(ctx,{x:left,y:0,w:right-left,h:L.height},c=>{
  c.save();c.translate(frame.x,0);c.scale(frame.w/L.width,1);
  const rect={x:0,y:0,w:L.width,h:L.height};
  const painted=theme==='harbor'?(paintHarborBackground(c,rect),true):paintLogisticsBackground(c,rect,theme);
  c.restore();return painted;
 })??false;
`);
    source="import {withBoundedPainter} from './douyin/bounded-painter.ts';\n"+source;
   }
   if(name==='shop-art.ts'){
    source=replaceExactly(source,'export function paintShopItemPreview','function paintShopItemPreviewContents');
    source=replaceExactly(source,"ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.beginPath();ctx.rect(rect.x,rect.y,rect.w,rect.h);ctx.clip();","ctx.save();ctx.lineJoin='round';ctx.lineCap='butt';ctx.setLineDash([]);");
    source="import {withBoundedPainter} from './douyin/bounded-painter.ts';\n"+source+`
export function paintShopItemPreview(ctx:Context,rect:Rect,options:CosmeticPreviewOptions):void {
 if(options.category==='theme'){drawCosmeticSetPreview(ctx,rect,options);return;}
 withBoundedPainter(ctx,rect,c=>paintShopItemPreviewContents(c,rect,options));
}
`;
   }
   if(name==='renderer.ts'){
    source=replaceExactly(source,`  const r=pressed.rect;ctx.save();
  roundedPath(ctx,r.x,r.y,r.w,r.h,Math.min(18,r.h/4));ctx.clip();
  ctx.fillStyle='rgba(5,12,20,.19)';ctx.fillRect(r.x,r.y,r.w,r.h);
  ctx.fillStyle='rgba(2,7,12,.25)';ctx.fillRect(r.x,r.y,r.w,6);
  ctx.fillStyle='rgba(255,244,208,.20)';ctx.fillRect(r.x+9,r.y+r.h-4,r.w-18,2);
  ctx.restore();`,`  drawBoundedPressedOverlay(ctx,pressed.rect,roundedPath);`);
    source=replaceExactly(source,`    ctx.save();
    if(conveyor&&isShipment){ctx.beginPath();ctx.rect(x-30,y-30,size+60,size+60);ctx.clip();}
    ctx.translate(pose.x, pose.y);`,`    const paint=(ctx:Context):void=>{
    ctx.save();
    ctx.translate(pose.x, pose.y);`);
    source=replaceExactly(source,`    ctx.restore();
  };
  board.forEach`,`    ctx.restore();
    };
    if(conveyor&&isShipment){
     const rx=boxSize*Math.abs(pose.scale*cleanupScale*placed.x*failure.x),ry=boxSize*Math.abs(pose.scale*cleanupScale*placed.y*failure.y);
     withTransportCargoBounds(ctx,{x:x-30,y:y-30,w:size+60,h:size+60},{x:pose.x-rx,y:pose.y-ry,w:rx*2,h:ry*2},paint);
    }else paint(ctx);
  };
  board.forEach`);
    source=replaceExactly(source,'ctx.save(); ctx.beginPath(); ctx.rect(L.board.x - 30, L.board.y - 30, L.board.size + 60, L.board.size + 60); ctx.clip();',`withBoundedPainter(ctx,{x:L.board.x-30,y:L.board.y-30,w:L.board.size+60,h:L.board.size+60},(ctx)=>{
    ctx.save();`);
    source=replaceExactly(source,`    ctx.restore();
  }
  if (target && (reduced || frame.stage === 'exit'))`,`    ctx.restore();
    });
  }
  if (target && (reduced || frame.stage === 'exit'))`);
    source="import {withBoundedPainter,withTransportCargoBounds} from './douyin/bounded-painter.ts';\nimport {drawBoundedPressedOverlay} from './douyin/primitives.ts';\n"+source;
   }
   if(name==='color-exit-renderer.ts'){
    source=replaceExactly(source,'ctx.save();ctx.beginPath();ctx.rect(geometry.x-30*scale,geometry.y-30*scale,geometry.size+60*scale,geometry.size+60*scale);ctx.clip();ctx.globalAlpha*=pose.alpha;',`withBoundedPainter(ctx,{x:geometry.x-30*scale,y:geometry.y-30*scale,w:geometry.size+60*scale,h:geometry.size+60*scale},(ctx)=>{
    ctx.save();ctx.globalAlpha*=pose.alpha;`);
    source=replaceExactly(source,`    ctx.restore();
  }
  if(!reduced&&(!frame`,`    ctx.restore();
    });
  }
  if(!reduced&&(!frame`);
    source="import {withBoundedPainter} from './douyin/bounded-painter.ts';\n"+source;
   }
   if(/\.clip\s*\(|\.lineDashOffset\s*=/.test(source))throw Error(`Douyin renderer left an unsupported operation in ${name}`);
   return {contents:source,loader:'ts',resolveDir:dirname(args.path)};
  });
 }};
}
