"""Independent runtime, v121 media preservation, and bounded offline mixing review.
Requires Node 24, Python, NumPy and SciPy. No builds or product mutations.
After staging, run from v122 checkout:
  python qa/v122/verify-independent-audio.py --root . --baseline /path/to/built-v121 --output qa/v122/independent-audio-verification.json
The optional preliminary-volume path is an explicit hypothetical analysis, never final verification.
"""
import argparse,hashlib,json,math,pathlib,subprocess,wave
import numpy as np
from scipy.signal import resample_poly
p=argparse.ArgumentParser();p.add_argument('--root',type=pathlib.Path,required=True);p.add_argument('--baseline',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--preliminary-volume',type=float);a=p.parse_args()
base=a.baseline.resolve();root=a.root.resolve();rate=44100
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
if a.preliminary_volume is None:
 js="""import {androidFixture} from './tests/helpers/android-platform-fixture.ts';
import {SOUND_NAMES} from './src/platform/types.ts';
import {legacyTutorial,storeLegacyRun,resumeStoredLegacy} from './tests/helpers/legacy-session-fixtures.ts';
const f=androidFixture();let runtime;try{for(let i=0;i<30;i++)for(const n of SOUND_NAMES)f.platform.playSound(n);runtime=Object.fromEntries(f.audio.map(x=>[x.src.split('/').pop().slice(0,-4),{volume:x.volume,plays:x.plays,currentTime:x.currentTime}]));}finally{f.restore();}
const observedSessionTraces=[];
for(const reduced of [false,true]){const f=androidFixture();try{let now=0;f.platform.now=()=>now;const saved=new Map();storeLegacyRun(saved,legacyTutorial(),true);for(const [k,v] of saved)f.storage.set(k,v);const session=resumeStoredLegacy(f.platform,{seed:123,mode:'tutorial'});if(reduced)session.action({type:'toggleMotion'});const events=[],play=f.platform.playSound;f.platform.playSound=name=>{play(name);events.push({name,time:now,volume:f.audio.find(x=>x.src===`assets/${name}.wav`)?.volume});};session.dispatch({type:'place',pieceId:session.state.candidates[0].id,origin:{x:1,y:1}});now=100;session.dispatch({type:'place',pieceId:session.state.candidates[0].id,origin:{x:3,y:1}});for(let t=116;t<=1124;t+=16){now=t;session.tick(t);}observedSessionTraces.push({reducedMotion:reduced,events,animationSettled:session.view.animation===null});}finally{f.restore();}}
console.log(JSON.stringify({runtime,observedSessionTraces}));"""
 proof=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=root,text=True))
 runtime=proof['runtime'];observed=proof['observedSessionTraces']
 assert len(observed)==2 and all(x['animationSettled'] for x in observed)
 for trace in observed:
  assert [x['name'] for x in trace['events']]==(['place','place','route_ready','ship'] if trace['reducedMotion'] else ['place','place','route_ready','forklift','ship'])
 volume=runtime['place']['volume'];expected=.45*10**((9.5+1-6)/20)
 assert abs(volume-expected)<1e-14
 for name,x in runtime.items():
  assert x['plays']==30 and x['currentTime']==0
  assert abs(x['volume']-(expected if name=='place' else .45*(.2428740327036814*10**(6/20)) if name=='ui_click' else .45))<1e-14
 manifest=json.loads((root/'build/android/build-manifest.json').read_text())
 assert manifest['placeSound']['playbackVolume']==volume and manifest['soundEffects']['androidVolumeOverrides']=={'place':volume}
 assert manifest['version']=='1.0.22' and manifest['placeSound']['androidAdditionalAssetGainDb']==6
else:volume=a.preliminary_volume;runtime=None;observed=[]
all_assets=[]
for platform in ['browser','wechat','android']:
 before_dir=base/f'build/{platform}/assets';after_dir=root/f'build/{platform}/assets'
 before_names=sorted(str(p.relative_to(before_dir)) for p in before_dir.rglob('*') if p.is_file())
 after_names=sorted(str(p.relative_to(after_dir)) for p in after_dir.rglob('*') if p.is_file())
 assert before_names==after_names,f'Asset file set changed: {platform}'
 for name in before_names:
  assert sha(before_dir/name)==sha(after_dir/name),f'Asset bytes changed: {platform}/{name}'
  all_assets.append({'platform':platform,'name':name,'sha256':sha(after_dir/name)})
inventory=[]
for platform in ['browser','wechat','android']:
 files=sorted((base/f'build/{platform}/assets').glob('*.wav'))+sorted((base/f'build/{platform}/assets').glob('*.mp3'))
 assert len(files)==14
 for before in files:
  after=root/f'build/{platform}/assets'/before.name
  assert sha(before)==sha(after),f'Changed media: {after}'
  inventory.append({'platform':platform,'name':before.name,'sha256':sha(after)})
bgmsha='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da'
assert sha(root/'build/android/assets/bgm.mp3')==bgmsha
bgm=.453825443983078*.18*10**(-2/20);bgmtp=.4543777980632631*.18*10**(-2/20)
prior=json.loads((base/'qa/v121/built-audio-verification.json').read_text());arrays={};metrics={}
for name in prior['assets']:
 with wave.open(str(root/f'build/android/assets/{name}.wav')) as f:
  pcm=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,f.getnchannels()).astype(float)/32768;sr=f.getframerate()
 level=volume if name=='place' else .45*(.2428740327036814*10**(6/20)) if name=='ui_click' else .45
 eff=pcm*level
 metrics[name]={'runtimeVolume':level,'samplePeak':float(np.max(abs(eff))),'estimated4xTruePeak':float(np.max(abs(resample_poly(eff,4,1,axis=0))))}
 if sr!=rate:eff=resample_poly(eff,rate//math.gcd(sr,rate),sr//math.gcd(sr,rate),axis=0)
 arrays[name]=np.repeat(eff,2,axis=1) if eff.shape[1]==1 else eff
scenarios=[{'scenario':x['scenario'],'events':x['events'],'coverage':'fixed source-informed schedule; not universal phase or physical-device verification'} for x in prior['scheduledMixes']]
for trace in observed:
 scenarios.append({'scenario':f'actual GameSession tutorial two-placement trace, reducedMotion={trace["reducedMotion"]}','events':[[x['name'],x['time']] for x in trace['events']],'coverage':'Actual GameSession dispatch through Android adapter with 16ms ticks; simulated HTMLAudio host, not physical listening'})
scenarios.append({'scenario':'constructed unproven-reachable 328.9ms failure negative control','events':[['place',0],['route_ready',0],['ship',16],['chain2',96],['chain3',176],['route_ready',240],['chain4',256],['pick',320],['place',328.9],['fail',328.9]],'coverage':'constructed timing-sensitivity check; existing four-chain fixture ends in upgrade and cannot validate immediate next placement'})
for sc in scenarios:
 events=sc['events'];length=max(round(t*rate/1000)+len(arrays[n]) for n,t in events);mix=np.zeros((length,2));bound=np.zeros(length)
 for name,t in events:
  eff=arrays[name];start=round(t*rate/1000);later=[t2 for n2,t2 in events if n2==name and t2>t]
  if later:eff=eff[:round((min(later)-t)*rate/1000)]
  mix[start:start+len(eff)]+=eff;bound[start:start+len(eff)]+=np.max(abs(eff),axis=1)
 tp=float(np.max(abs(resample_poly(mix,4,1,axis=0)))+bgmtp)
 sc.update({'sampleSfxPeak':float(np.max(abs(mix))),'peakPlusAnyBgmBound':float(np.max(abs(mix))+bgm),'estimated4xTruePeakPlusAnyBgmBound':tp,'headroomDbFor4xBound':-20*math.log10(tp),'absoluteSumPlusBgmBound':float(bound.max()+bgm),'clippedSfxSamples':int((abs(mix)>=1).sum())})
for checked in scenarios[:12]+[x for x in scenarios if x['scenario'].startswith('actual ')]:
 assert checked['clippedSfxSamples']==0 and checked['estimated4xTruePeakPlusAnyBgmBound']<1,checked['scenario']
result={'root':str(root),'preliminary':a.preliminary_volume is not None,'placeRuntimeVolume':volume,'netGainDbVsCommonPreAndroid':6+20*math.log10(volume),'gainAbovePickDb':6+20*math.log10(volume)-(9.5+20*math.log10(.45)),'actualAndroidAdapterRuntime':runtime,'observedSessionTraces':observed,'audioFilesCompared':len(inventory),'allAudioUnchangedFromV121':True,'allAssetFilesCompared':len(all_assets),'allAssetsUnchangedFromV121':True,'allAssetInventory':all_assets,'inventory':inventory,'metrics':metrics,'scenarios':scenarios,'limits':['No phone listening or perceived loudness verification.','BGM bound exceeding full scale is not proof of actual decoded BGM-phase clipping.','Constructed timing checks do not establish gameplay reachability.','Not a guarantee for arbitrary mix phases or host latency.']}
a.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'output':str(a.output),'volume':volume,'netGainDb':result['netGainDbVsCommonPreAndroid'],'gainAbovePickDb':result['gainAbovePickDb'],'audioFilesCompared':len(inventory),'allAssetFilesCompared':len(all_assets),'worstOriginalNonExtreme4xBound':max(x['estimated4xTruePeakPlusAnyBgmBound'] for x in scenarios[:12]),'negativeControl':scenarios[-1]},indent=2))
