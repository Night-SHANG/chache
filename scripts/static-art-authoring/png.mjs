/** Build-only lossless PNG codec. Refilters/recompresses RGBA; never resizes or quantizes. */
import { constants, deflateSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable = Array.from({length:256}, (_, i) => { let c=i; for(let j=0;j<8;j++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
function crc32(bytes) { let c=0xffffffff; for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
function chunk(name, bytes) { const tag=Buffer.from(name), result=Buffer.alloc(bytes.length+12); result.writeUInt32BE(bytes.length); tag.copy(result,4); bytes.copy(result,8); result.writeUInt32BE(crc32(Buffer.concat([tag,bytes])),bytes.length+8); return result; }
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
export function decodePng(bytes) {
 if(!bytes.subarray(0,8).equals(signature))throw Error('Not a PNG');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],color=bytes[25];
 if(depth!==8||![2,3,6].includes(color)||bytes[28]!==0)throw Error(`Unsupported lossless authoring PNG ${depth}/${color}`);
 const channels=color===6?4:color===3?1:3,parts=[];let offset=8,palette,alpha;
 while(offset<bytes.length){const length=bytes.readUInt32BE(offset),name=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);if(crc32(bytes.subarray(offset+4,offset+8+length))!==bytes.readUInt32BE(offset+8+length))throw Error('PNG CRC mismatch');if(name==='IDAT')parts.push(data);if(name==='PLTE')palette=data;if(name==='tRNS')alpha=data;offset+=length+12;}
 const filtered=inflateSync(Buffer.concat(parts)),stride=width*channels,raw=Buffer.alloc(stride*height);
 if(filtered.length!==(stride+1)*height)throw Error('PNG scanline size mismatch');
 for(let y=0;y<height;y++){const type=filtered[y*(stride+1)];if(type>4)throw Error('PNG filter mismatch');for(let x=0;x<stride;x++){const at=y*stride+x,a=x>=channels?raw[at-channels]:0,b=y?raw[at-stride]:0,c=y&&x>=channels?raw[at-stride-channels]:0;const predict=type===0?0:type===1?a:type===2?b:type===3?Math.floor((a+b)/2):paeth(a,b,c);raw[at]=(filtered[y*(stride+1)+1+x]+predict)&255;}}
 if(channels===4)return {width,height,pixels:raw};
 const pixels=Buffer.alloc(width*height*4);for(let i=0;i<width*height;i++){if(color===3){if(!palette)throw Error('PNG palette missing');const index=raw[i];palette.copy(pixels,i*4,index*3,index*3+3);pixels[i*4+3]=alpha?.[index]??255;}else{raw.copy(pixels,i*4,i*3,i*3+3);pixels[i*4+3]=255;}}return {width,height,pixels};
}
export function encodePng({width,height,pixels}) {
 if(pixels.length!==width*height*4)throw Error('RGBA length mismatch');
 const stride=width*4,filtered=Buffer.alloc((stride+1)*height),rows=Array.from({length:5},()=>Buffer.alloc(stride));
 for(let y=0;y<height;y++){const scores=[0,0,0,0,0];for(let x=0;x<stride;x++){const at=y*stride+x,v=pixels[at],a=x>=4?pixels[at-4]:0,b=y?pixels[at-stride]:0,c=y&&x>=4?pixels[at-stride-4]:0,predictions=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)];for(let type=0;type<5;type++){const d=(v-predictions[type])&255;rows[type][x]=d;scores[type]+=Math.min(d,256-d);}}let type=0;for(let i=1;i<5;i++)if(scores[i]<scores[type])type=i;filtered[y*(stride+1)]=type;rows[type].copy(filtered,y*(stride+1)+1);}
 const candidates=[constants.Z_DEFAULT_STRATEGY,constants.Z_FILTERED].map(strategy=>deflateSync(filtered,{level:9,strategy}));candidates.sort((a,b)=>a.length-b.length);const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;return Buffer.concat([signature,chunk('IHDR',header),chunk('sBIT',Buffer.from([8,8,8,8])),chunk('sRGB',Buffer.from([0])),chunk('IDAT',candidates[0]),chunk('IEND',Buffer.alloc(0))]);
}
export function optimizePng(bytes) { const decoded=decodePng(bytes),optimized=encodePng(decoded);if(!decodePng(optimized).pixels.equals(decoded.pixels))throw Error('Lossless optimization changed pixels');return optimized.length<bytes.length?optimized:bytes; }
/** A byte-copy crop, with optional clockwise quarter-turn. No canvas filtering/alpha conversion. */
export function copyPixels(source, target, rect, x, y, clockwise=false) {
 for(let sy=0;sy<rect.h;sy++)for(let sx=0;sx<rect.w;sx++){const tx=x+(clockwise?rect.h-1-sy:sx),ty=y+(clockwise?sx:sy);if(tx<0||ty<0||tx>=target.width||ty>=target.height)throw Error('Packed artwork exceeds atlas');const from=((rect.y+sy)*source.width+rect.x+sx)*4,to=(ty*target.width+tx)*4;source.pixels.copy(target.pixels,to,from,from+4);}
}
