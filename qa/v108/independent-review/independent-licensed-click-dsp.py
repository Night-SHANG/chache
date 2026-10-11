import pathlib,json,hashlib,numpy as np,wave,sys
if len(sys.argv)!=5:raise SystemExit('Usage: python independent-licensed-click-dsp.py SOURCE_ROOT PRODUCTION_BUILD_ROOT V107_BUILD_ROOT OUTPUT_DIR')
source,build,old,out=map(pathlib.Path,sys.argv[1:]);adir=source/'assets/audio/ui-click';meta=json.loads((adir/'provenance.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(adir/'DM-CGS-32.wav')==meta['source']['sha256']=='718a8f04c9eecc0466dd865fcc64884988df66e18f3fd96ad7e291f2b9b0bd9a'
assert sha(adir/'LICENSE.pdf')==meta['license']['originalLicenseSha256']=='fa3693afc38aac134361b33d0b73cd7bc1300fdca8c87af813c64fa91b218cca'
with wave.open(str(adir/'DM-CGS-32.wav')) as w:
 assert w.getsampwidth()==3 and w.getnchannels()==2 and w.getframerate()==44100 and w.getnframes()==8253
 raw=np.frombuffer(w.readframes(w.getnframes()),dtype='uint8').reshape(-1,3).astype('int32');ints=raw[:,0]+(raw[:,1]<<8)+(raw[:,2]<<16);ints=np.where(ints>=8388608,ints-16777216,ints);orig=ints.reshape(-1,2).astype('float64')/8388608

def read(p):
 with wave.open(str(p)) as w:
  assert w.getsampwidth()==2
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,w.getnchannels()).astype('float64')/32768,w.getframerate()
waveform,sr=read(adir/'ui_click.wav');assert waveform.shape==orig.shape and sr==44100
gain=.06/np.max(abs(orig));assert gain==meta['processing']['gainLinear'];expected=np.floor(orig*gain*32768+.5).astype('<i2');assert np.array_equal(waveform*32768,expected);assert np.max(abs(waveform-orig*gain))<=.5/32768
assert sha(adir/'ui_click.wav')==meta['output']['sha256']=='539e8b026387c21867af9beb295c5dc018bc7078aec7c5d7f4901c34307e9e88'
for target in ['browser','wechat']:
 assert (build/target/'assets/ui_click.wav').read_bytes()==(adir/'ui_click.wav').read_bytes()
 for pack,src in [('UI_SOUND_NOTICE.txt','NOTICE.txt'),('UI_SOUND_LICENSE.pdf','LICENSE.pdf'),('UI_SOUND_CC0.txt','CC0-1.0.txt')]:assert (build/target/pack).read_bytes()==(adir/src).read_bytes()
 manifest=json.loads((build/target/'build-manifest.json').read_text());assert manifest['uiClick']['sha256']==meta['output']['sha256'] and manifest['uiClick']['license']=='CC0-1.0'

def stats(x,rate):
 spec=np.sum(abs(np.fft.rfft(x,n=131072,axis=0))**2,axis=1);freq=np.fft.rfftfreq(131072,1/rate);energy=np.sum(x*x,axis=1);cum=np.cumsum(energy)/np.sum(energy);a=np.searchsorted(cum,.025);b=np.searchsorted(cum,.975)
 return {'frames':len(x),'durationMs':1000*len(x)/rate,'channels':x.shape[1],'sampleRate':rate,'peak':float(np.max(abs(x))),'rms':float(np.sqrt(np.mean(x*x))),'energySecondsMeanChannels':float(np.sum(x*x)/rate/x.shape[1]),'firstFrame':x[0].tolist(),'lastFrame':x[-1].tolist(),'maxAdjacentDeltaPerChannel':float(np.max(abs(np.diff(x,axis=0)))),'powerCentroidHz':float(np.sum(freq*spec)/np.sum(spec)),'energyAbove4kFraction':float(np.sum(spec[freq>4000])/np.sum(spec)),'middle95EnergyDurationMs':float((b-a)/rate*1000),'clippedSamples':int(np.count_nonzero(abs(x)>=1))}
newstats=stats(waveform,sr);legacy,rate=read(old/'browser/assets/ui_click.wav');oldstats=stats(legacy,rate);comparisons={}
for p in (old/'browser/assets').glob('*.wav'):
 if p.name=='ui_click.wav':continue
 assert sha(p)==sha(build/'browser/assets'/p.name)==sha(build/'wechat/assets'/p.name)
 x,r=read(p);s=stats(x,r);comparisons[p.stem]={'peak':s['peak'],'rms':s['rms'],'energySecondsMeanChannels':s['energySecondsMeanChannels'],'uiPeakRatio':newstats['peak']/s['peak'],'uiIntegratedEnergyRatio':newstats['energySecondsMeanChannels']/s['energySecondsMeanChannels']}
assert len(comparisons)==12
for key in ['pick','place','invalid','route_ready','forklift','ship','chain2','chain3','chain4','upgrade','shift','fail']:
 assert comparisons[key]['uiPeakRatio']<1 and comparisons[key]['uiIntegratedEnergyRatio']<1
assert sha(old/'browser/assets/bgm.mp3')==sha(build/'browser/assets/bgm.mp3')==sha(build/'wechat/assets/bgm.mp3')
tail=waveform[round(.060*sr):];tailEnergy=float(np.sum(tail*tail)/np.sum(waveform*waveform));tailPeak=float(np.max(abs(tail)));jump=float(np.max(abs(tail-waveform[0])))
assert tailEnergy<1e-5 and tailPeak<=.00025 and jump<=.00025
# Offline model: one cached cue is restarted at 60ms, never layered with itself.
spacing=round(.060*sr);render=np.concatenate([waveform[:spacing] for _ in range(7)]+[waveform]);boundaries=[float(np.max(abs(render[i*spacing]-render[i*spacing-1]))) for i in range(1,8)];assert max(boundaries)<=.00025
r={'status':'PASS','sourceSha256':meta['source']['sha256'],'outputSha256':meta['output']['sha256'],'licensedSourceAndBothTargetsMatch':True,'conversionAllSamplesExactlyMatchIndependentPcm24Math':True,'constantGainLinear':gain,'constantGainDb':float(20*np.log10(gain)),'newClick':newstats,'oldV107Click':oldstats,'newToOldPeakDb':float(20*np.log10(newstats['peak']/oldstats['peak'])),'newToOldIntegratedEnergyDb':float(10*np.log10(newstats['energySecondsMeanChannels']/oldstats['energySecondsMeanChannels'])),'browserAppliedClickPeak':newstats['peak']*.45,'wechatAppliedClickPeak':newstats['peak'],'tailAfter60ms':{'remainingEnergyFraction':tailEnergy,'maxPeak':tailPeak,'worstPossibleRestartJumpAfter60ms':jump,'exact60ms8TapsBoundaryMax':max(boundaries),'noSelfOverlapInCachedHandleModel':True},'original12EffectsUnchanged':comparisons,'bgmUnchanged':True,'limitations':['No physical-device listening. Energy/peak margins and same-event business-cue precedence support the mix but do not guarantee subjective non-masking.','Full source retained. The original 60ms cached-cue restart discards only near-silent residual tail; lifecycle stops retain prior behavior.']}
(out/'independent-licensed-click-dsp.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
