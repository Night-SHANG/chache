import pathlib,json,hashlib,numpy as np,wave,subprocess,sys
if len(sys.argv)!=5:raise SystemExit('Usage: python independent-click-mix-dsp.py SOURCE_ROOT PRODUCTION_BUILD_ROOT V108_BUILD_ROOT OUTPUT_DIR')
source,build,old,out=map(pathlib.Path,sys.argv[1:]);adir=source/'assets/audio/ui-click';meta=json.loads((adir/'provenance.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();gain=.2428740327036814
assert meta['processing']['gainLinear']==1 and meta['playback']['clickOnlyGainLinear']==gain
assert sha(adir/'DM-CGS-32.wav')=='718a8f04c9eecc0466dd865fcc64884988df66e18f3fd96ad7e291f2b9b0bd9a'
assert sha(adir/'LICENSE.pdf')=='fa3693afc38aac134361b33d0b73cd7bc1300fdca8c87af813c64fa91b218cca'
with wave.open(str(adir/'DM-CGS-32.wav')) as w:
 assert w.getsampwidth()==3 and w.getnchannels()==2 and w.getframerate()==44100 and w.getnframes()==8253
 raw=np.frombuffer(w.readframes(w.getnframes()),dtype='uint8').reshape(-1,3).astype('int32');ints=raw[:,0]+(raw[:,1]<<8)+(raw[:,2]<<16);ints=np.where(ints>=8388608,ints-16777216,ints);orig=ints.reshape(-1,2).astype('float64')/8388608

def read(p):
 with wave.open(str(p)) as w:
  assert w.getsampwidth()==2
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,w.getnchannels()).astype('float64')/32768,w.getframerate()
waveform,sr=read(adir/'ui_click.wav');assert waveform.shape==orig.shape and sr==44100
expected=np.floor(orig*32768+.5).astype('<i2');assert np.array_equal(waveform*32768,expected);assert np.max(abs(waveform-orig))<=.5/32768
assert sha(adir/'ui_click.wav')==meta['output']['sha256']=='64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512'
for target in ['browser','wechat']:
 assert (build/target/'assets/ui_click.wav').read_bytes()==(adir/'ui_click.wav').read_bytes()
 for pack,src in [('UI_SOUND_NOTICE.txt','NOTICE.txt'),('UI_SOUND_LICENSE.pdf','LICENSE.pdf'),('UI_SOUND_CC0.txt','CC0-1.0.txt')]:assert (build/target/pack).read_bytes()==(adir/src).read_bytes()
 manifest=json.loads((build/target/'build-manifest.json').read_text());assert manifest['uiClick']['sha256']==meta['output']['sha256'] and manifest['uiClick']['license']=='CC0-1.0';assert manifest['uiClick']['assetGain']==1 and manifest['uiClick']['playbackGain']==gain

def stats(x,rate):
 spec=np.sum(abs(np.fft.rfft(x,n=131072,axis=0))**2,axis=1);freq=np.fft.rfftfreq(131072,1/rate);energy=np.sum(x*x,axis=1);cum=np.cumsum(energy)/np.sum(energy);a=np.searchsorted(cum,.025);b=np.searchsorted(cum,.975)
 return {'frames':len(x),'durationMs':1000*len(x)/rate,'channels':x.shape[1],'sampleRate':rate,'peak':float(np.max(abs(x))),'rms':float(np.sqrt(np.mean(x*x))),'energySecondsMeanChannels':float(np.sum(x*x)/rate/x.shape[1]),'firstFrame':x[0].tolist(),'lastFrame':x[-1].tolist(),'maxAdjacentDeltaPerChannel':float(np.max(abs(np.diff(x,axis=0)))),'powerCentroidHz':float(np.sum(freq*spec)/np.sum(spec)),'middle95EnergyDurationMs':float((b-a)/rate*1000),'clippedSamples':int(np.count_nonzero(abs(x)>=1))}
assetstats=stats(waveform,sr);played=waveform*gain;newstats=stats(played,sr);legacy,rate=read(old/'browser/assets/ui_click.wav');oldstats=stats(legacy,rate);assert assetstats['clippedSamples']==0 and abs(newstats['peak']-.24)<.00001
comparisons={}
for p in (old/'browser/assets').glob('*.wav'):
 if p.name=='ui_click.wav':continue
 assert sha(p)==sha(build/'browser/assets'/p.name)==sha(build/'wechat/assets'/p.name)
 x,r=read(p);s=stats(x,r);comparisons[p.stem]={'sha256':sha(p),'peak':s['peak'],'energySecondsMeanChannels':s['energySecondsMeanChannels'],'uiPeakRatio':newstats['peak']/s['peak'],'uiIntegratedEnergyRatio':newstats['energySecondsMeanChannels']/s['energySecondsMeanChannels']}
assert len(comparisons)==12
assert sha(old/'browser/assets/bgm.mp3')==sha(build/'browser/assets/bgm.mp3')==sha(build/'wechat/assets/bgm.mp3')=='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da'
bgm=np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',str(build/'browser/assets/bgm.mp3'),'-f','f32le','-c:a','pcm_f32le','-'],stdout=subprocess.PIPE,check=True).stdout,dtype='<f4');bgmpeak=float(np.max(abs(bgm)))*.18
tail=played[round(.060*sr):];tailEnergy=float(np.sum(tail*tail)/np.sum(played*played));tailPeak=float(np.max(abs(tail)));jump=float(np.max(abs(tail-played[0])));assert tailEnergy<1e-5 and tailPeak<.001 and jump<.001
spacing=round(.060*sr);render=np.concatenate([played[:spacing] for _ in range(7)]+[played]);boundaries=[float(np.max(abs(render[i*spacing]-render[i*spacing-1]))) for i in range(1,8)];assert max(boundaries)<.001
platforms=[]
for target,master in [('browser',.45),('wechat',1)]:
 bound=bgmpeak+newstats['peak']*master;assert bound<1;platforms.append({'target':target,'master':master,'assignedPlayVolume':master*gain,'effectiveClickPeak':newstats['peak']*master,'normalBgmPlusOneClickConservativePeakBound':bound,'headroomDb':float(-20*np.log10(bound))})
r={'status':'PASS','sourceSha256':meta['source']['sha256'],'outputSha256':meta['output']['sha256'],'originalPcmAmplitudePreserved':True,'conversionAllSamplesExactlyMatchIndependentPcm24Math':True,'quantizationErrorMaxPcm16Units':float(np.max(abs(waveform-orig))*32768),'assetGain':1,'clickOnlyPlaybackGain':gain,'rawAsset':assetstats,'effectiveClickBeforePlatformMaster':newstats,'oldV108ClickBeforePlatformMaster':oldstats,'effectivePeakIncreaseDb':float(20*np.log10(newstats['peak']/oldstats['peak'])),'effectiveRmsIncreaseDb':float(20*np.log10(newstats['rms']/oldstats['rms'])),'tailAfter60ms':{'remainingEnergyFraction':tailEnergy,'maxPeak':tailPeak,'worstPossibleRestartJumpAfter60ms':jump,'exact60ms8TapsBoundaryMax':max(boundaries),'noSelfOverlapInCachedHandleModel':True},'platforms':platforms,'original12EffectsUnchanged':comparisons,'bgmUnchanged':True,'normalBgmMixedPeak':bgmpeak,'limitations':['Offline PCM and peak-bound calculations only, not real-browser, WeChat developer-tool or physical-device listening.','Click is intentionally louder and can exceed pick/place peaks. Same-event business-sound priority remains a separate runtime requirement.','One-click+BGM conservative bounds do not certify arbitrary concurrent business-effect combinations.']}
(out/'independent-click-mix-dsp.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2))
