"""Decode the packaged track and two loops; this does not test a browser's audio device."""
from pathlib import Path
import array,hashlib,json,math,subprocess,sys
root=Path(__file__).resolve().parents[1]
p=root/'assets/audio/bgm.mp3';raw=p.read_bytes();expected='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da'
assert hashlib.sha256(raw).hexdigest()==expected

def decode(loops):
 command=['ffmpeg','-v','error','-stream_loop',str(loops),'-i',str(p),'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','pipe:1']
 result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
 samples=array.array('f');samples.frombytes(result.stdout)
 if sys.byteorder!='little':samples.byteswap()
 assert len(samples)%2==0 and all(math.isfinite(x) for x in samples)
 return samples
one=decode(0);two=decode(1);frames=len(one)//2;double=len(two)//2
assert frames==5740475,(frames,frames/44100)
assert double==2*frames,(frames,double)
assert max(abs(x) for x in one)<0.5
assert two[:len(one)]==one and two[len(one):]==one,'Every decoded loop must reproduce identical samples'
edge=[one[-2+i]-one[i] for i in range(2)]
report={'status':'PASS','source':'assets/audio/bgm.mp3','sha256':expected,'bytes':len(raw),'sampleRate':44100,'channels':2,'framesPerLoop':frames,'decodedSecondsPerLoop':frames/44100,'decodedTwoLoopFrames':double,'decodedTwoLoopSeconds':double/44100,'identicalDecodedCycles':True,'samplePeak':max(abs(x) for x in one),'boundaryDelta':edge,'limitations':'FFmpeg decoding and exact PCM concatenation only. Does not establish browser/WeChat playback, device volume, auditory seam quality, or human listening.'}
out=root/'artifacts/v0160-audio/decoder-validation.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
