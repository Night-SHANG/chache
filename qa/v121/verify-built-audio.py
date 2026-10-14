#!/usr/bin/env python3
"""Read-only verification of staged v121 audio, independent of the source generator.
Usage: python verify-built-audio.py --root /path/to/checkout --output report.json
Needs Python, NumPy, SciPy and Node >=24. No product writes or rebuilds performed.
"""
import argparse, hashlib, json, math, pathlib, subprocess, wave
import numpy as np
from scipy.signal import resample_poly
parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path.cwd());parser.add_argument('--output',type=pathlib.Path,required=True);args=parser.parse_args();root=args.root.resolve()
GAIN_DB={'pick':9.5,'place':6,'invalid':9,'route_ready':9,'forklift':14.5,'ship':5.5,'chain2':3.5,'chain3':4.5,'chain4':4,'upgrade':6,'shift':7,'fail':8,'ui_click':0}
BGM_SHA='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da'
# Measured baseline values apply only to the exact BGM SHA above.
BGM_RUNTIME=.18*10**(-2/20);BGM_PEAK=.453825443983078*BGM_RUNTIME;BGM_TP=.4543777980632631*BGM_RUNTIME
CLICK_RUNTIME=.45*.2428740327036814*10**(6/20);RATE=44100
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def db(x):return 20*math.log10(max(float(x),1e-20))
def read_wav(p):
 with wave.open(str(p)) as f:
  assert f.getsampwidth()==2 and f.getcomptype()=='NONE'
  raw=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,f.getnchannels()).copy();rate=f.getframerate()
 return raw,rate
fixture=root/'tests/fixtures/android-audio-v120-sha256.json'
EXPECTED_FIXTURE_SHA='26b163f039f15304c1cd816bdff96d82129fc24feb9a168407ca152e6af3999c'
assert sha(fixture)==EXPECTED_FIXTURE_SHA,'The independent frozen v120 hash fixture changed'
old=json.loads(fixture.read_text());inventory=[];arrays={};metrics={}
for platform in ['browser','wechat','android']:
 files=sorted((root/'build'/platform/'assets').glob('*.wav'))+sorted((root/'build'/platform/'assets').glob('*.mp3'))
 assert len(files)==14,(platform,'unexpected audio file count',len(files))
 for p in files:
  n=p.stem;h=sha(p);expected=BGM_SHA if n=='bgm' else old[platform][n] if platform!='android' else old['browser']['ui_click'] if n=='ui_click' else None
  if expected is not None:assert h==expected,('platform isolation failed',platform,n)
  inventory.append({'platform':platform,'name':n,'sha256':h,'baselineUnchanged':h==expected if expected is not None else False,'bytes':p.stat().st_size})
for n,boost in GAIN_DB.items():
 before_path=root/'build/browser/assets'/f'{n}.wav';after_path=root/'build/android/assets'/f'{n}.wav'
 raw,rate=read_wav(after_path);before,before_rate=read_wav(before_path);gain=10**(boost/20)
 assert rate==before_rate and raw.shape==before.shape
 assert after_path.read_bytes()[:44]==before_path.read_bytes()[:44]
 expected=np.floor(before.astype(np.float64)*gain+.5).astype(np.int32)
 assert np.array_equal(raw,expected),(n,'not exactly the reviewed gain-only PCM16 change')
 assert np.max(expected)<=32767 and np.min(expected)>=-32768
 a=raw.astype(np.float64)/32768;runtime=CLICK_RUNTIME if n=='ui_click' else .45;ef=a*runtime
 power=np.mean(ef*ef,axis=1);cs=np.r_[0,np.cumsum(power)];win=int(rate*.05)
 tp=float(np.max(abs(resample_poly(a,4,1,axis=0))))
 m={'gainDb':boost,'gain':gain,'sourceRate':rate,'channels':a.shape[1],'durationMs':len(a)/rate*1000,'sourceSamplePeak':float(np.max(abs(a))),'source4xTruePeakEstimate':tp,'effectiveSamplePeak':float(np.max(abs(ef))),'effectiveFullRmsDbfs':db(np.sqrt(np.mean(ef*ef))),'effectiveMax50msRmsDbfs':db(np.sqrt(np.max((cs[win:]-cs[:-win])/win))),'pcm16FullscaleSamples':int(((raw==32767)|(raw==-32768)).sum()),'exactScalarMatch':True,'headerAndDurationUnchanged':True}
 if n!='ui_click':assert tp<10**(-1/20)
 metrics[n]=m
 b=ef if rate==RATE else resample_poly(ef,RATE//math.gcd(RATE,rate),rate//math.gcd(RATE,rate),axis=0)
 arrays[n]=b if b.shape[1]==2 else np.repeat(b,2,axis=1)
reference=metrics['ui_click']['effectiveMax50msRmsDbfs']
for n,m in metrics.items():
 m['loudest50msDeltaFromButtonDb']=m['effectiveMax50msRmsDbfs']-reference
 if n!='ui_click':assert 0<=m['loudest50msDeltaFromButtonDb']<3
scenarios={
'ordinary placement and route':[('place',0),('route_ready',0)],
'ordinary full shipment':[('place',0),('route_ready',0),('forklift',100),('ship',860)],
'ordinary two shipments':[('place',0),('route_ready',0),('forklift',100),('ship',860),('route_ready',1000),('forklift',1100),('chain2',1860)],
'reduced first frame at 16ms':[('place',0),('route_ready',0),('ship',16)],
'reduced four chain at 16ms ticks':[('place',0),('route_ready',0),('ship',16),('chain2',96),('chain3',176),('route_ready',240),('chain4',256),('shift',320)],
'place then immediate fail':[('place',0),('fail',0)],
'ordinary chain4 stage end':[('chain4',0),('shift',140)],
'ordinary conveyor chain4 stage end':[('chain4',0),('shift',39.2)],
'observed ordinary shipment at 16ms frames':[('place',0),('route_ready',0),('forklift',112),('ship',864)],
'reduced chain tail then immediate next input stress':[('place',0),('route_ready',0),('ship',16),('chain2',96),('chain3',176),('route_ready',240),('chain4',256),('pick',320),('place',336),('ship',352)],
'reduced chain shift then upgrade stress':[('place',0),('route_ready',0),('ship',16),('chain2',96),('chain3',176),('route_ready',240),('chain4',256),('shift',320),('upgrade',336)],
'reduced chain tail then failed placement stress':[('place',0),('route_ready',0),('ship',16),('chain2',96),('chain3',176),('route_ready',240),('chain4',256),('pick',320),('place',336),('fail',336)],
'extreme all 13 voices, not claimed reachable':[(n,0) for n in GAIN_DB],
}
mixes=[]
for name,events in scenarios.items():
 length=max(round(t/1000*RATE)+len(arrays[n]) for n,t in events);mix=np.zeros((length,2));bound=np.zeros(length)
 for n,t in events:
  a=arrays[n];start=round(t/1000*RATE);later=[t1 for n1,t1 in events if n1==n and t1>t]
  if later:a=a[:max(0,round((min(later)-t)/1000*RATE))]
  mix[start:start+len(a)]+=a;bound[start:start+len(a)]+=np.max(abs(a),axis=1)
 absolute=float(bound.max())+BGM_PEAK;peak=float(np.max(abs(mix)));tp=float(np.max(abs(resample_poly(mix,4,1,axis=0))))+BGM_TP;clips=int((abs(mix)>=1).sum())
 if not name.startswith('extreme'):assert clips==0 and absolute<1 and tp<1
 mixes.append({'scenario':name,'events':events,'alignedSfxSamplePeak':peak,'fixedScheduleAbsoluteSampleSumPlusBgmBound':absolute,'boundHeadroomDb':-db(absolute),'aligned4xTruePeakEstimatePlusBgmBound':tp,'clippedSfxSamples':clips,'regularSafetyAssertion':not name.startswith('extreme')})
# Load each target repeatedly in alternating order and compare every result to
# actual staged files. No shared output buffers may mutate between calls.
node=r'''import {loadSoundAsset} from './scripts/sound-assets.ts';
import {SOUND_NAMES} from './src/platform/types.ts';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const hash=x=>createHash('sha256').update(x).digest('hex');const held=[];let checks=0;
for(let pass=0;pass<5;pass++)for(const target of (pass%2?['android','wechat','browser']:['browser','android','wechat']))for(const name of SOUND_NAMES){
const bytes=loadSoundAsset(name,target),expected=readFileSync(`build/${target}/assets/${name}.wav`);assert.deepEqual(bytes,expected);held.push({bytes,sha:hash(bytes)});checks++;}
for(const record of held)assert.equal(hash(record.bytes),record.sha);
console.log(JSON.stringify({passes:5,targetCueComparisons:checks,heldBuffersUnchanged:held.length,allMatchStagedAssets:true}));'''
regeneration=json.loads(subprocess.check_output(['node','--input-type=module','-e',node],cwd=root,text=True))
result={'method':'Actual staged WAVs; exact PCM16 scalar compare to hash-frozen browser baseline; 4x polyphase TP estimate; 44.1kHz scheduled mixes; BGM conservative maximum applies only to verified frozen BGM hash. No speaker, OS, host-latency or perceived-loudness model.','gainDb':GAIN_DB,'buttonEffective50msReferenceDbfs':reference,'baselineFixtureSha256':EXPECTED_FIXTURE_SHA,'platformIsolation':{'audioFilesChecked':len(inventory),'unchangedFiles':sum(r['baselineUnchanged'] for r in inventory),'onlyChangedFiles':['android/'+n+'.wav' for n in GAIN_DB if n!='ui_click']},'assets':metrics,'inventory':inventory,'scheduledMixes':mixes,'loaderRegenerationIdempotence':regeneration,'scopeLimits':['The artificial all-13-voices fixture clips and is not claimed reachable through the ordinary UI.','Source-informed rapid-input schedules are constructed stress tests, not full gameplay replays.','Loader regeneration is tested here; repeated whole-build hash comparison is separately recorded by the build owner.','No device listening test is performed.']}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'output':str(args.output),'platformIsolation':result['platformIsolation'],'loaderRegenerationIdempotence':regeneration,'minRegularBoundHeadroomDb':min(x['boundHeadroomDb'] for x in mixes if x['regularSafetyAssertion'])},indent=2))
