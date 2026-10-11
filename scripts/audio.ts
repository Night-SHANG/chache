import {Buffer} from 'node:buffer';
import type {SoundName} from '../src/platform/types.ts';

// Original deterministic additive synthesis, rendered only at build time.
// Shared bell partials teach the ascending chain family without a runtime pitch API.
const RATE=22050;
type Voice={frequency:number;endFrequency?:number;start?:number;gain?:number;partials?:readonly number[];tremolo?:number};
type Cue={duration:number;peak:number;voices:readonly Voice[]};
const BELL=[1,0.22,0.05] as const;
const SOFT=[1,0.16,0.04] as const;
const CUES:Record<Exclude<SoundName,'ui_click'>,Cue>={
 pick:{duration:0.085,peak:0.16,voices:[{frequency:620,endFrequency:740}]},
 place:{duration:0.115,peak:0.22,voices:[{frequency:250,endFrequency:165,partials:SOFT}]},
 invalid:{duration:0.14,peak:0.17,voices:[{frequency:190,endFrequency:135,partials:SOFT}]},
 route_ready:{duration:0.17,peak:0.18,voices:[{frequency:523.25,gain:0.75},{frequency:659.25,start:0.055}]},
 forklift:{duration:0.27,peak:0.065,voices:[{frequency:105,endFrequency:125,partials:SOFT,tremolo:9}]},
 ship:{duration:0.26,peak:0.26,voices:[{frequency:659.25,partials:BELL},{frequency:880,start:0.075,gain:0.8,partials:BELL}]},
 chain2:{duration:0.28,peak:0.24,voices:[{frequency:660,partials:BELL}]},
 chain3:{duration:0.28,peak:0.26,voices:[{frequency:880,partials:BELL},{frequency:1100,start:0.035,gain:0.5,partials:BELL}]},
 chain4:{duration:0.28,peak:0.28,voices:[{frequency:1100,partials:BELL},{frequency:1375,start:0.035,gain:0.5,partials:BELL},{frequency:1650,start:0.07,gain:0.4,partials:BELL}]},
 upgrade:{duration:0.3,peak:0.25,voices:[{frequency:659.25,partials:BELL},{frequency:830.61,start:0.065,partials:BELL},{frequency:987.77,start:0.13,partials:BELL}]},
 shift:{duration:0.38,peak:0.27,voices:[{frequency:523.25,partials:BELL},{frequency:659.25,start:0.07,partials:BELL},{frequency:783.99,start:0.14,partials:BELL},{frequency:1046.5,start:0.21,gain:0.6,partials:BELL}]},
 fail:{duration:0.25,peak:0.17,voices:[{frequency:260,endFrequency:180,partials:SOFT},{frequency:130,start:0.085,gain:0.35,partials:SOFT}]},
};
function smooth(value:number):number{const x=Math.max(0,Math.min(1,value));return x*x*(3-2*x);}

export function generateSound(name:Exclude<SoundName,'ui_click'>):Buffer {
 const cue=CUES[name];if(!cue)throw Error(`Unknown audio cue: ${name}`);
 const count=Math.round(RATE*cue.duration),samples=new Float64Array(count),end=(count-1)/RATE;
 let maximum=0;
 for(let i=0;i<count;i++){
  const t=i/RATE;let sample=0;
  for(const voice of cue.voices){
   const local=t-(voice.start??0);if(local<0)continue;
   const duration=end-(voice.start??0),progress=local/duration;
   const envelope=smooth(local/0.009)*Math.pow(Math.max(0,1-progress),1.4);
   const phase=2*Math.PI*(voice.frequency*local+((voice.endFrequency??voice.frequency)-voice.frequency)*local*local/(2*duration));
   const partials=voice.partials??SOFT;let tone=0;
   for(let harmonic=0;harmonic<partials.length;harmonic++)tone+=partials[harmonic]*Math.sin(phase*(harmonic+1));
   const motor=voice.tremolo?0.8+0.2*Math.sin(2*Math.PI*voice.tremolo*local):1;
   sample+=tone*envelope*(voice.gain??1)*motor;
  }
  sample*=smooth(t/0.009)*smooth((end-t)/0.024);
  samples[i]=sample;maximum=Math.max(maximum,Math.abs(sample));
 }
 const wav=Buffer.alloc(44+count*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(RATE,24);wav.writeUInt32LE(RATE*2,28);
 wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
 const gain=maximum>0?cue.peak*32767/maximum:0;
 for(let i=0;i<count;i++)wav.writeInt16LE(Math.round(samples[i]*gain),44+i*2);
 return wav;
}
