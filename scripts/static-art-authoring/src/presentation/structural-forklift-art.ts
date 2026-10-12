import type { ForkliftId } from '../application/profile.ts';

type Context = CanvasRenderingContext2D;
type Point = readonly [number, number];
const GLASS = '#263d49', SEAT = '#112633';
function polygon(c: Context, points: readonly Point[], fill: string, stroke: string, width = 2.5): void {
 c.beginPath(); c.moveTo(...points[0]); for (const p of points.slice(1)) c.lineTo(...p); c.closePath();
 c.fillStyle = fill; c.fill(); c.strokeStyle = stroke; c.lineWidth = width; c.stroke();
}
function rect(c: Context, x: number, y: number, w: number, h: number, fill: string, stroke?: string, radius = 0, width = 2): void {
 const r=Math.min(radius,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);
 c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
 c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
 c.fillStyle=fill; c.fill();
 if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}
}
function line(c: Context, points: readonly Point[], color: string, width = 2): void {
 c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function circle(c: Context,x:number,y:number,r:number,fill:string,stroke:string,width=2):void{
 c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=width;c.stroke();
}

/** Wide square counterweight, separate wheel wings and two substantial overhead cross-beams. */
function heavy(c: Context): void {
 polygon(c,[[-41,-19],[-35,-26],[-15,-26],[-15,-23],[29,-23],[33,-16],[33,16],[29,23],[-15,23],[-15,26],[-35,26],[-41,19]],'#b59b68','#584d3c');
 rect(c,-38,-21,22,42,'#dfc38b','#87704c',1);
 for(const y of [-13,-4,5,14])line(c,[[-34,y],[-20,y]],'#8b724e',2);
 for(const y of [-33,24]){rect(c,-31,y,27,9,'#7c8778','#394b49',1);rect(c,16,y,18,9,'#7c8778','#394b49',1);line(c,[[-28,y+2],[-8,y+2]],'#c8d0b5',2);}
 rect(c,-11,-24,33,48,GLASS,'#ecd6a0',1,4);rect(c,-5,-16,18,32,SEAT,undefined,3);
 for(const y of [-13,13])line(c,[[-10,y],[21,y]],'#b9c6b3',4);
 line(c,[[-15,-26],[-15,26]],'#705b3e',3);
}
/** Rectangular boiler behind an open brass cage; two longitudinal exposed pipes. */
function steam(c: Context): void {
 polygon(c,[[-40,-19],[-30,-24],[-15,-24],[-15,-29],[25,-29],[32,-20],[32,20],[25,29],[-15,29],[-15,24],[-30,24],[-40,19]],'#7f6754','#3e4545');
 rect(c,-39,-19,23,38,'#9f754f','#4d4237',5,3);
 rect(c,-36,-17,17,34,'#be9564',undefined,4);
 for(const x of [-35,-20])line(c,[[x,-18],[x,18]],'#e0bb7d',4);
 for(const y of [-27,27]){line(c,[[-32,y],[-19,y],[-19,y*.66]],'#4c5550',7);line(c,[[-32,y],[-19,y],[-19,y*.66]],'#c7b07e',3);}
 rect(c,-11,-24,32,48,GLASS,'#ddb77c',0,4);rect(c,-5,-14,19,28,SEAT,undefined,2);
 line(c,[[-13,-28],[24,-28],[24,28],[-13,28]],'#e5c78f',3);
 circle(c,-27,0,7,'#d3b479','#655a45');line(c,[[-27,-4],[-27,3]],'#6c6450',2);
 rect(c,15,-31,10,8,'#5a6b69','#c2ccba',1);rect(c,15,23,10,8,'#5a6b69','#c2ccba',1);
}
/** Tapered rear and swept-back fender wings, with an oblique panoramic cockpit. */
function neon(c: Context): void {
 polygon(c,[[-44,0],[-32,-22],[-19,-22],[-13,-31],[21,-31],[32,-19],[32,19],[21,31],[-13,31],[-19,22],[-32,22]],'#526387','#2f3e54');
 polygon(c,[[-40,0],[-29,-16],[-17,-13],[-17,13],[-29,16]],'#8ba6be','#354e63',2);
 for(const s of [-1,1])polygon(c,[[-28,s*22],[-18,s*31],[12,s*31],[2,s*24]],'#788bac','#abc4cf',1.5);
 polygon(c,[[-12,-15],[-3,-25],[19,-25],[24,-17],[24,17],[19,25],[-3,25],[-12,15]],'#b5d6d3','#344f66',2.5);
 polygon(c,[[-7,-13],[0,-19],[16,-19],[18,-13],[18,13],[16,19],[0,19],[-7,13]],GLASS,'#76e3d0',2);
 polygon(c,[[-2,-10],[11,-13],[12,13],[-2,10]],SEAT,'#42576f',1);
 line(c,[[-32,-5],[-24,0],[-32,5]],'#b5f4d9',2.5);
}
/** Broad broken-stone shoulders and a thick, visibly inset rectangular safety frame. */
function lava(c: Context): void {
 polygon(c,[[-43,-11],[-37,-24],[-24,-29],[-14,-24],[-4,-30],[23,-27],[34,-14],[30,0],[34,14],[23,27],[-4,30],[-14,24],[-24,29],[-37,24],[-43,11]],'#514e50','#302f35',3);
 polygon(c,[[-39,-10],[-32,-21],[-20,-23],[-17,-7],[-24,2],[-19,20],[-32,21],[-39,10]],'#77716e','#36383d',2);
 line(c,[[-31,-20],[-27,-7],[-33,1],[-25,10],[-26,21]],'#e69a65',3);
 for(const s of [-1,1])polygon(c,[[-12,s*25],[-8,s*32],[17,s*31],[25,s*24]],'#69676b','#35343c',2);
 rect(c,-10,-24,33,48,'#b58e75','#39383b',3,3);rect(c,-5,-18,23,36,GLASS,'#726660',2);rect(c,0,-12,13,24,SEAT,undefined,1);
 line(c,[[-9,-24],[22,-24]],'#e9ae79',3);
}
/** Twin pressure tanks flank a trapezoid cabin, with one small functional rear inspection port. */
function diving(c: Context): void {
 polygon(c,[[-42,-12],[-34,-23],[-14,-23],[-7,-29],[21,-24],[32,-15],[32,15],[21,24],[-7,29],[-14,23],[-34,23],[-42,12]],'#688f95','#345562',3);
 rect(c,-38,-17,22,34,'#98b9af','#416d73',6,2.5);
 for(const s of [-1,1]){rect(c,-31,s<0?-32:23,38,9,'#b9ccba','#43676c',4);line(c,[[-22,s*31],[-22,s*24]],'#67867f',2);}
 polygon(c,[[-12,-23],[16,-26],[25,-16],[25,16],[16,26],[-12,23]],'#d9d6a8','#4b7172',3);
 polygon(c,[[-6,-17],[12,-19],[18,-13],[18,13],[12,19],[-6,17]],GLASS,'#86a7a2',2);
 rect(c,-1,-11,12,22,SEAT,undefined,3);circle(c,-27,0,6,'#304d5a','#dfce96',3);
}
/** Shield-point counterweight, stepped canopy and broad gilded corner brackets. */
function royal(c: Context): void {
 polygon(c,[[-44,0],[-35,-24],[-21,-27],[-12,-23],[24,-23],[33,-15],[33,15],[24,23],[-12,23],[-21,27],[-35,24]],'#846a80','#4b3d51',3);
 polygon(c,[[-40,0],[-31,-19],[-18,-19],[-18,19],[-31,19]],'#c3a18c','#e1c48d',2);
 line(c,[[-33,-12],[-28,0],[-33,12]],'#876672',3);
 polygon(c,[[-12,-19],[-7,-19],[-7,-28],[17,-28],[17,-23],[24,-23],[24,23],[17,23],[17,28],[-7,28],[-7,19],[-12,19]],'#e8cf97','#7f684f',2);
 rect(c,-6,-18,24,36,GLASS,'#baac88',2);rect(c,-1,-12,13,24,SEAT,undefined,3);
 for(const s of [-1,1]){line(c,[[-31,s*25],[-31,s*30],[-17,s*30]],'#e2c48a',4);line(c,[[17,s*30],[29,s*30],[29,s*24]],'#d2b27e',4);}
}
/** Stepped armored rear, broad straps and square external guard rails. */
function field(c: Context): void {
 polygon(c,[[-42,-16],[-36,-16],[-36,-27],[-15,-27],[-15,-23],[24,-23],[32,-17],[32,17],[24,23],[-15,23],[-15,27],[-36,27],[-36,16],[-42,16]],'#899674','#425448',3);
 rect(c,-36,-21,20,42,'#b8bc91','#69785a',1);for(const y of [-13,11])rect(c,-38,y,24,4,'#4d6253');
 for(const s of [-1,1])line(c,[[-33,s*31],[-11,s*31],[-11,s*26],[28,s*26],[28,s*31]],'#c8cbb0',4);
 polygon(c,[[-10,-23],[16,-23],[24,-14],[24,14],[16,23],[-10,23]],'#c4c5a1','#506050',3);
 polygon(c,[[-4,-16],[12,-16],[17,-10],[17,10],[12,16],[-4,16]],GLASS,'#879981',2);
 rect(c,0,-10,11,20,SEAT,undefined,2);line(c,[[-8,-24],[-8,24]],'#566b55',3);
}
/** Wide timber bumper, three real planks and paired open guard rails around the roof. */
function timber(c: Context): void {
 polygon(c,[[-40,-21],[-14,-21],[-14,-19],[29,-19],[32,-12],[32,12],[29,19],[-14,19],[-14,21],[-40,21]],'#99714a','#594735',3);
 for(const y of [-20,-7,6])rect(c,-39,y,23,13,y===-7?'#d2b07b':'#b99360','#6b5339',1,1.5);
 line(c,[[-34,-19],[-34,20]],'#77664b',3);
 for(const s of [-1,1]){line(c,[[-30,s*28],[26,s*28],[26,s*19]],'#acb6a0',5);line(c,[[-29,s*32],[-10,s*32]],'#566658',3);}
 rect(c,-10,-22,31,44,'#d6c292','#5a6454',1,3);rect(c,-5,-17,21,34,GLASS,'#95a38b',1);rect(c,0,-10,11,20,SEAT,undefined,2);
 line(c,[[-10,-9],[21,-9]],'#b9c1a3',3);
}
/** Faceted low rear, separate crystal shoulders and an elongated hexagonal roof. */
function ice(c: Context): void {
 polygon(c,[[-43,-8],[-32,-22],[-16,-18],[-6,-27],[18,-27],[33,-12],[33,12],[18,27],[-6,27],[-16,18],[-32,22],[-43,8]],'#8caebc','#47687b',3);
 polygon(c,[[-40,-6],[-31,-18],[-18,-13],[-18,13],[-31,18],[-40,6]],'#d5e3dc','#819eaa',2);
 line(c,[[-40,0],[-25,-4],[-18,-13]],'#97b9c5',2);line(c,[[-25,-4],[-28,16]],'#b2ced2',2);
 for(const s of [-1,1])polygon(c,[[-31,s*25],[-23,s*33],[-9,s*28],[-17,s*20]],'#cee4de','#6e92a2',2);
 polygon(c,[[-12,-13],[-4,-27],[14,-27],[24,-13],[24,13],[14,27],[-4,27],[-12,13]],'#e0ede1','#6e94a4',2.5);
 polygon(c,[[-6,-11],[0,-20],[11,-20],[18,-11],[18,11],[11,20],[0,20],[-6,11]],GLASS,'#a5c9ce',2);
 polygon(c,[[0,-8],[11,-11],[11,11],[0,8]],SEAT,'#466779',1);
}
/** Corrugated steel counterweight, separate long side beams and an overhead gantry roof. */
function harbor(c: Context): void {
 polygon(c,[[-39,-23],[-15,-23],[-15,-20],[31,-20],[34,-13],[34,13],[31,20],[-15,20],[-15,23],[-39,23]],'#6d9ca5','#3e606d',3);
 rect(c,-37,-21,20,42,'#a8c6c2','#588089',0,2);
 for(const y of [-15,-7,1,9,17])line(c,[[-34,y],[-21,y]],'#638e96',2.5);
 for(const s of [-1,1]){rect(c,-30,s<0?-32:26,57,6,'#d0c7a0','#526d70',0,1.5);rect(c,-28,s<0?-30:21,9,9,'#76958e','#415f66',1);}
 rect(c,-10,-24,31,48,GLASS,'#d3d7b8',0,3);rect(c,-4,-16,18,32,SEAT,undefined,1);
 for(const x of [-12,21])rect(c,x,-29,5,58,'#c4cdb3','#657f7a',0,1.5);
 line(c,[[-10,-18],[24,-18]],'#e5d5aa',4);line(c,[[-10,18],[24,18]],'#9cb7a9',3);
}

const bodies: Partial<Record<ForkliftId, (ctx: Context) => void>> = { heavy, steam, neon, lava, diving, royal, field, timber, ice, harbor };
/** Native body-only artwork. Existing physics, wheel centers, mast, fork tips and cargo anchors remain in assets.ts. */
export function drawStructuralForkliftBody(ctx: Context, paint: ForkliftId): boolean {
 const draw = bodies[paint]; if (!draw) return false;
 ctx.save(); ctx.lineJoin='round'; ctx.lineCap='butt'; draw(ctx); ctx.restore(); return true;
}
