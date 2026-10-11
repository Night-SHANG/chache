/** Offline PCM adaptation only: retain every source frame/channel, preserve original amplitude, quantize to PCM16. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SOURCE_SHA='718a8f04c9eecc0466dd865fcc64884988df66e18f3fd96ad7e291f2b9b0bd9a';
export function prepareUiClick(source){
 if(createHash('sha256').update(source).digest('hex')!==SOURCE_SHA)throw Error('Unverified original UI recording');
 let fmt,data;for(let offset=12;offset+8<=source.length;){const size=source.readUInt32LE(offset+4),chunk=source.subarray(offset+8,offset+8+size);if(chunk.length!==size)throw Error('Truncated source WAV');const id=source.toString('ascii',offset,offset+4);if(id==='fmt ')fmt=chunk;if(id==='data')data=chunk;offset+=8+size+(size%2);}
 if(!fmt||!data||fmt.readUInt16LE(0)!==1||fmt.readUInt16LE(2)!==2||fmt.readUInt32LE(4)!==44100||fmt.readUInt16LE(14)!==24||data.length!==8253*2*3)throw Error('Unexpected original PCM format');
 const values=Array.from({length:data.length/3},(_,i)=>data.readIntLE(i*3,3));let maximum=0;for(const sample of values)maximum=Math.max(maximum,Math.abs(sample));
 const gain=1,out=Buffer.alloc(44+values.length*2);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(44100,24);out.writeUInt32LE(176400,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(values.length*2,40);
 for(let i=0;i<values.length;i++)out.writeInt16LE(Math.round(values[i]/8388608*gain*32768),44+i*2);
 return {wav:out,gain,sourcePeak:maximum/8388608};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=prepareUiClick(await readFile('assets/audio/ui-click/DM-CGS-32.wav'));await writeFile('assets/audio/ui-click/ui_click.wav',result.wav);
 console.log(JSON.stringify({sha256:createHash('sha256').update(result.wav).digest('hex'),gain:result.gain,sourcePeak:result.sourcePeak,samples:8253,sampleRate:44100,channels:2,bytes:result.wav.length}));
}
