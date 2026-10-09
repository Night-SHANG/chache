import { artPolygon as poly, artDot as dot, artRect, artLine, roundedPath } from '../src/presentation/assets.ts';

type Context = CanvasRenderingContext2D;
type Paint = string | CanvasGradient;
type Palette = { light: string; mid: string; dark: string; ink: string };
type Point = readonly [number, number];
type Bezier = readonly [number, number, number, number, number, number];
const INK = '#13202a';
function line(c: Context, points: readonly (readonly number[])[], color: string, width = 1): void {
  c.lineJoin = 'round'; c.lineCap = 'round'; artLine(c, points, color, width);
}
function rect(c: Context, x: number, y: number, w: number, h: number, r: number, fill: Paint, stroke?: string, width = 1): void {
  artRect(c, x, y, w, h, fill, r, stroke, width);
}
function grad(c: Context, x: number, y: number, xx: number, yy: number, ...stops: string[]): CanvasGradient {
  const g = c.createLinearGradient(x, y, xx, yy); stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color)); return g;
}
function curve(c: Context, points: readonly [Point, ...Bezier[]], color: string, width: number): void {
  c.beginPath(); c.moveTo(...points[0]); for (let i = 1; i < points.length; i++) c.bezierCurveTo(...points[i] as Bezier);
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}

/** Static whole-body material layers. The caller owns all cargo symbols, traits and outlines. */
function bolt(c: Context,x: number,y: number,r=2.1): void{dot(c,x+.6,y+.9,r+.45,'#172226');dot(c,x,y,r,grad(c,x-r,y-r,x+r,y+r,'#f5f1d9','#a5a9a1','#53636a'),'#263840',.65);line(c,[[x-.65,y-.8],[x+.7,y-.8]],'#fffae4',.65);}
function corner(c: Context,x: number,y: number,flipX=1,flipY=1): void{c.save();c.translate(x,y);c.scale(flipX,flipY);poly(c,[[0,3],[4,0],[17,0],[20,5],[20,17],[16,21],[0,21]],grad(c,0,0,20,21,'#a2a297','#687173','#424c53'),'#202c31',1.3);poly(c,[[1,3],[5,1],[17,1],[18,4],[4,5],[1,9]],'#d0cfc0');line(c,[[1,10],[1,20],[15,20]],'#8b9896',.8);bolt(c,9,11,3.1);c.restore();}
export function drawSteelCrate(c: Context,p: Palette): void{
  // The three planes and recessed face are colored steel; the corners are armor.
  poly(c,[[5,20],[21,4],[99,4],[105,11],[105,88],[90,104],[5,104]],p.dark,INK,2.2);
  poly(c,[[5,20],[21,4],[99,4],[88,20]],grad(c,0,0,100,25,p.light,p.mid),p.ink,1.4);
  poly(c,[[90,20],[105,7],[105,88],[90,104]],grad(c,89,0,110,0,p.mid,p.dark,p.ink),p.ink,1.6);
  poly(c,[[7,21],[20,19],[88,21],[91,29],[91,96],[83,104],[8,104],[4,96],[4,29]],grad(c,5,20,88,106,p.light,p.mid,p.dark),p.ink,2);
  // Raised side uprights and wraparound seams make this a thick assembled shell.
  for(const x of [9,82])rect(c,x,34,7,55,1,grad(c,x,0,x+7,0,p.light,p.mid,p.dark),p.ink,1.2);
  for(const y of [32,89]){line(c,[[94,y],[103,y-9]],p.ink,2.3);line(c,[[94,y+2],[103,y-7]],p.light,.8);}
  line(c,[[96,39],[102,45],[97,81]],p.ink,1.8);line(c,[[97,39],[102,77]],p.light,.85);
  // Large bevelled front panel: the face itself is formed, not a flat stock tile.
  poly(c,[[24,32],[73,32],[81,40],[81,84],[73,93],[24,93],[16,85],[16,40]],p.ink);
  poly(c,[[25,34],[72,34],[78,40],[78,83],[71,90],[25,90],[19,83],[19,41]],grad(c,18,34,77,91,p.light,p.mid,p.dark),p.dark,1);
  line(c,[[22,43],[26,37],[72,37]],'#fff0bc88',1.2);line(c,[[24,87],[71,87],[76,82]],p.light,.8);
  rect(c,25,23,46,7,1,p.dark,p.ink,1.2);rect(c,35,22,27,8,1,grad(c,0,22,0,30,p.light,p.mid,p.dark),p.ink,1);bolt(c,29,26,1.1);bolt(c,68,26,1.1);
  // Recessed top and front vents, visible at shop size, aggregated at board size.
  for(let k=0;k<3;k++){poly(c,[[42,8+k*3],[70,8+k*3],[67,10+k*3],[39,10+k*3]],'#26332b',p.light,.55);}
  for(const xx of [21,67])for(let k=0;k<3;k++){rect(c,xx,78+k*3,10,1.7,.8,p.ink);line(c,[[xx+1,80+k*3],[xx+8,80+k*3]],p.light,.5);}
  for(const x of [12,85])for(const y of [41,80])bolt(c,x,y,1.25);
  // Small loading safety plate; it is shared neutral decoration, not cargo color.
  rect(c,29,95,43,8,1,'#263136','#949c8e',1.2);
  c.save();roundedPath(c,31,96,39,6,0);c.clip();for(let x=26;x<75;x+=10)poly(c,[[x,102],[x+5,96],[x+10,96],[x+5,102]],'#e6b948');c.restore();
  corner(c,3,20);corner(c,93,20,-1,1);corner(c,3,105,1,-1);corner(c,93,105,-1,-1);
  for(const [x,y] of [[18,5],[91,5]]){poly(c,[[x,y],[x+12,y],[x+7,y+5],[x-5,y+5]],'#7c8580','#263239',1);bolt(c,x+4,y+2,1.3);}
  for(const [x,y] of [[26,48],[68,66],[32,88],[72,47],[54,31]]){line(c,[[x,y],[x+2,y-.7]],'#f0dcb866',.5);}
}

function crystal(c: Context,x: number,y: number,angle=0,s=1): void{c.save();c.translate(x,y);c.rotate(angle);c.scale(s,s);poly(c,[[0,0],[-4,-9],[-2,-25],[5,-16],[7,-6]],'#a9ecfb','#eaffff',.85);poly(c,[[0,0],[-2,-25],[1,-11]],'#efffff');poly(c,[[1,-11],[-2,-25],[5,-16],[7,-6]],'#57b7d3');poly(c,[[0,0],[1,-11],[7,-6]],'#91dfea');c.restore();}
export function drawIceCrate(c: Context,p: Palette): void{
  // Entire colored crystal volume. The facet network crosses top, face, and side.
  poly(c,[[4,22],[20,5],[96,3],[105,13],[104,89],[90,104],[10,104],[3,95]],p.dark,'#bbeafb',1.5);
  poly(c,[[5,21],[21,5],[97,5],[89,22]],grad(c,0,3,0,24,p.light,p.mid),'#e5fcff',1.3);
  poly(c,[[90,21],[103,9],[103,87],[90,103]],grad(c,90,0,105,0,p.mid,p.dark),'#b5ecff',1.2);
  poly(c,[[6,23],[88,23],[91,37],[89,102],[9,102],[4,89]],grad(c,0,23,92,105,p.light,p.mid,p.dark),'#dbffff',1.5);
  const facets: readonly [readonly Point[], string][] = [
    [[[6,23],[39,25],[18,49]],'#ffffff24'], [[[39,25],[62,35],[88,23]],'#ffffff39'],
    [[[6,23],[18,49],[8,76]],'#ffffff59'], [[[18,49],[39,25],[45,61]],'#173b4223'],
    [[[39,25],[62,35],[45,61]],'#ffffff16'], [[[62,35],[88,23],[72,65]],'#ffffff20'],
    [[[88,23],[89,72],[72,65]],'#ffffff50'], [[[18,49],[45,61],[9,102]],'#d5fffa17'],
    [[[45,61],[72,65],[89,102]],'#ffffff12'], [[[9,102],[45,61],[51,101]],'#08395a3e'],
    [[[45,61],[51,101],[89,102]],'#ecffff30'], [[[72,65],[89,72],[89,102]],'#072c5530']
  ];for(const [pts,f] of facets)poly(c,pts,f);
  for(const [pts,col] of [
    [[[6,23],[18,49],[9,101]],'#e3ffffbb'],[[[6,23],[39,25],[62,35],[88,23]],'#eaffffb8'],
    [[[18,49],[39,25]],'#dbffff88'],[[[18,49],[45,61],[89,102]],'#e7ffffa0'],
    [[[9,102],[45,61]],'#d4ffffbb'],[[[88,23],[72,65],[89,72]],'#e9ffffb0']
  ] as const)line(c,pts,col,.65);
  poly(c,[[20,6],[39,7],[30,14],[9,20]],'#ffffff38');poly(c,[[39,7],[68,6],[75,17],[30,14]],'#ffffff12');poly(c,[[68,6],[96,6],[86,18],[75,17]],'#173c642b');
  line(c,[[20,6],[30,14],[75,17],[96,6]],'#e8ffffd0',.65);
  for(const y of [33,61,84]){poly(c,[[91,y],[103,y-12],[98,y+12]],'#b6ffff44');line(c,[[91,y],[103,y-12],[98,y+12],[91,y]],'#ddffffaa',.7);}
  // Carved bevels reveal depth without covering the cargo's semantic hue.
  poly(c,[[11,28],[21,35],[21,88],[11,97]],'#e0ffff44');poly(c,[[80,31],[87,26],[86,94],[77,86]],'#e8ffff38');
  line(c,[[20,34],[74,34],[80,41],[78,87],[23,89],[20,34]],'#e0ffff99',1.1);
  // Snow cap and distinct icy silhouette; all remain inside the 110px cell box.
  poly(c,[[4,21],[10,18],[23,20],[46,20],[70,19],[88,20],[98,7],[103,6],[105,11],[101,19],[97,24],[93,29],[91,40],[88,34],[86,27],[79,25],[69,26],[64,25],[60,29],[57,24],[42,25],[37,24],[30,28],[25,24],[18,26],[15,37],[13,29],[10,27],[7,40],[5,33]],'#efffff','#b7eaff',.8);
  poly(c,[[6,22],[10,21],[8,34],[7,40],[6,31]],'#a8dffa');poly(c,[[90,24],[94,23],[91,40],[89,33]],'#a2dcf6');
  line(c,[[20,6],[39,4],[61,6],[80,4],[97,5]],'#f4ffff',2);
  crystal(c,12,103,-.43,.76);crystal(c,12,103,-.7,.55);crystal(c,18,103,.2,.5);
  crystal(c,88,104,.24,.8);crystal(c,96,99,.52,.64);crystal(c,83,104,-.18,.45);
  for(const [x,y] of [[18,32],[81,31],[20,91],[80,91]]){dot(c,x,y,2.5,'#e0ffff','#609daf',.7);dot(c,x-.6,y-.7,1.1,'#ffffff');}
}

function leaf(c: Context,x: number,y: number,s=1,a=0): void{c.save();c.translate(x,y);c.rotate(a);c.scale(s,s);c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-7,-1,-9,-9,-6,-16);c.bezierCurveTo(3,-15,6,-4,0,0);c.fillStyle=grad(c,-7,-16,2,0,'#a8c744','#628522','#355e27');c.fill();c.strokeStyle='#36501f';c.lineWidth=1;c.stroke();curve(c,[[0,-1],[-3,-6,-5,-9,-5,-13]],'#c1d66a',.8);c.restore();}
function logBeam(c: Context,x: number,y: number,w: number,h: number): void{rect(c,x,y,w,h,5,grad(c,x,y,x,y+h,'#dca665','#a86c39','#835029','#b6834b'),'#553920',1.5);curve(c,[[x+3,y+3],[x+w*.3,y+1,x+w*.5,y+6,x+w-3,y+3]],'#efd09a',1);curve(c,[[x+3,y+h-4],[x+w*.3,y+h-6,x+w*.65,y+h-1,x+w-3,y+h-5]],'#633f23',1);}
function logEnd(c: Context,x: number,y: number,rx=6,ry=8): void{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=grad(c,x-rx,y-ry,x+rx,y+ry,'#e0ad6d','#b27843','#87562d');c.fill();c.strokeStyle='#604023';c.lineWidth=1.3;c.stroke();c.beginPath();c.ellipse(x-.5,y,rx*.55,ry*.62,0,0,Math.PI*2);c.strokeStyle='#855029';c.lineWidth=.9;c.stroke();curve(c,[[x,y+3],[x+3,y+1,x+1,y-4,x-1,y-3],[x-3,y-2,x-2,y+1,x-1,y+1]],'#714522',.8);}
export function drawTimberCrate(c: Context,p: Palette): void{
  // Colored timber planks retain all five cargo hues; real rounded logs form the shell.
  poly(c,[[8,21],[21,6],[99,6],[105,16],[103,88],[89,104],[9,104]],'#704528','#352e1e',2);
  poly(c,[[8,21],[22,7],[99,7],[89,22]],grad(c,0,3,0,24,p.light,p.mid),p.ink,1.4);
  poly(c,[[90,22],[104,10],[103,87],[90,102]],p.dark,p.ink,1.2);
  rect(c,10,25,79,74,2,grad(c,10,25,89,98,p.light,p.mid,p.dark),p.ink,1.5);
  // Wide planks and irregular grain cover the whole colored wooden body.
  for(let i=0;i<4;i++){
    const x=14+i*18;
    poly(c,[[x,30],[x+15,29],[x+16,94],[x+1,96]],i%2?'#00000008':'#fff7ce13');
    curve(c,[[x,31],[x-1,52,x+3,63,x+1,93]],p.dark,.85);
    curve(c,[[x+4,31],[x+8,46,x+4,59,x+6,73],[x+8,87,x+3,88,x+5,94]],'#fff4c126',.6);
    curve(c,[[x+11,32],[x+8,43,x+13,60,x+10,89]],p.ink+'44',.55);
  }
  for(const [x,y] of [[24,74],[68,43]]){c.beginPath();c.ellipse(x,y,2.8,7,-.1,0,Math.PI*2);c.strokeStyle=p.dark;c.lineWidth=.65;c.stroke();curve(c,[[x,y-9],[x-8,y-1,x-7,y+6,x,y+12]],p.light,.55);}
  line(c,[[17,34],[28,44]],p.dark,1.5);line(c,[[79,34],[68,44]],p.dark,1.5);line(c,[[17,91],[29,79]],p.dark,1.5);line(c,[[78,91],[69,82]],p.dark,1.5);
  for(const y of [11,16])curve(c,[[20,y],[42,y-2,61,y+2,91,y-1]],p.dark,1);
  for(const y of [39,62,83])line(c,[[94,y],[102,y-9]],'#2b311b66',1.4);
  // Cylindrical cross beams and four exposed growth-ring end sections.
  logBeam(c,13,21,72,12);logBeam(c,12,92,74,13);
  for(const x of [7,81]){logBeam(c,x,25,12,73);curve(c,[[x+5,29],[x+10,44,x+1,54,x+5,71],[x+7,79,x+2,87,x+4,96]],'#edbb77',1.6);curve(c,[[x+9,30],[x+5,42,x+11,61,x+8,88]],'#593920',1.5);}
  // Top-side logs finish the cuboid rather than stopping at the front trim.
  for(const x of [12,85]){poly(c,[[x,23],[x+11,9],[x+20,8],[x+10,24]],grad(c,0,7,0,26,'#db9e5f','#92552f'),'#553b22',1.1);line(c,[[x+3,22],[x+14,10]],'#edba7b',1.1);}
  for(const [x,y] of [[12,27],[86,27],[12,98],[86,98]])logEnd(c,x,y,6.6,7.7);
  // Sinuous climbing stems change the external read; leaves gather at corners.
  curve(c,[[12,34],[5,44,22,54,11,66],[3,76,15,83,11,92]],'#385024',3.5);
  curve(c,[[12,34],[5,44,22,54,11,66],[3,76,15,83,11,92]],'#94a947',1.65);
  curve(c,[[89,34],[79,45,92,55,84,67],[78,81,91,85,87,95]],'#365522',3.4);
  curve(c,[[89,34],[79,45,92,55,84,67],[78,81,91,85,87,95]],'#92b44b',1.55);
  leaf(c,12,79,.7,-.62);leaf(c,13,47,.48,.6);leaf(c,89,67,.73,.77);leaf(c,87,40,.48,-.2);
  leaf(c,78,19,.83,.72);leaf(c,76,19,.62,-.47);leaf(c,49,29,.63,0);leaf(c,49,29,.5,-.72);leaf(c,50,29,.45,.75);
  leaf(c,49,103,.73,-.1);leaf(c,49,103,.45,.6);leaf(c,23,22,.45,-.55);
}
