import pathlib,json,hashlib,numpy as np,wave,subprocess,sys
if len(sys.argv)!=5:raise SystemExit('Usage: python independent-audio-dsp.py SOURCE_ROOT PRODUCTION_BUILD_ROOT V109_BUILD_ROOT OUTPUT_DIR')
source,build,old,out=map(pathlib.Path,sys.argv[1:]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();musicGain=10**(-2/20);placeGain=10**(2/20);clickGain=.2428740327036814

def read(p):
 with wave.open(str(p)) as w:
  assert w.getsampwidth()==2
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype('int64').reshape(-1,w.getnchannels()),w.getframerate()
legacy,sr=read(old/'browser/assets/place.wav');place,rate=read(build/'browser/assets/place.wav');assert rate==sr and place.shape==legacy.shape
expected=np.floor(legacy*placeGain+.5).astype('int64');assert np.array_equal(place,expected);assert np.max(abs(place))<32768
assert (build/'browser/assets/place.wav').read_bytes()==(build/'wechat/assets/place.wav').read_bytes();assert (build/'browser/assets/place.wav').read_bytes()[:44]==(old/'browser/assets/place.wav').read_bytes()[:44]
original12={}
for p in sorted((old/'browser/assets').glob('*.wav')):
 if p.name=='place.wav':continue
 assert sha(p)==sha(build/'browser/assets'/p.name)==sha(build/'wechat/assets'/p.name)
 original12[p.stem]=sha(p)
assert len(original12)==12 and original12['ui_click']=='64417ece36e1f91639f61ebac38634245cd251829bc0ee67805c42c41b9ce512'
assert sha(old/'browser/assets/bgm.mp3')==sha(build/'browser/assets/bgm.mp3')==sha(build/'wechat/assets/bgm.mp3')=='63ae1249b7da1931cc536cac435ff2738ec55718eee0d10e579c8c650b88c1da'
pcm=place/32768;oldpcm=legacy/32768
stats={'assetSha256':sha(build/'browser/assets/place.wav'),'frames':len(place),'sampleRate':rate,'channels':place.shape[1],'gainLinear':placeGain,'peak':float(np.max(abs(pcm))),'peakIncreaseDb':float(20*np.log10(np.max(abs(place))/np.max(abs(legacy)))),'rmsIncreaseDb':float(20*np.log10(np.sqrt(np.mean(pcm*pcm))/np.sqrt(np.mean(oldpcm*oldpcm)))),'clippedSamples':int(np.count_nonzero(abs(place)>=32768)),'maxQuantizationErrorLsb':float(np.max(abs(place-legacy*placeGain))),'allPcmSamplesMatchOnceAppliedGain':True}
assert abs(stats['peakIncreaseDb']-2)<.001 and abs(stats['rmsIncreaseDb']-2)<.001
bgm=np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',str(build/'browser/assets/bgm.mp3'),'-f','f32le','-c:a','pcm_f32le','-'],stdout=subprocess.PIPE,check=True).stdout,dtype='<f4');bgmpeak=float(np.max(abs(bgm)))*.18*musicGain
ui,_=read(build/'browser/assets/ui_click.wav');uipeak=float(np.max(abs(ui))/32768)*clickGain
platforms=[]
for target,master in [('browser',.45),('wechat',1)]:
 manifest=json.loads((build/target/'build-manifest.json').read_text());assert manifest['version']=='1.0.10';assert manifest['backgroundMusic']['defaultVolume']==.18*musicGain;assert manifest['uiClick']['playbackGain']==clickGain and manifest['uiClick']['assetGain']==1
 platforms.append({'target':target,'effectMaster':master,'placePlaybackVolume':master,'effectivePlacePeak':stats['peak']*master,'clickPlaybackVolume':master*clickGain,'effectiveClickPeak':uipeak*master,'normalBgmPlusOnePlaceConservativeSamplePeakBound':bgmpeak+stats['peak']*master,'normalBgmPlusOneClickConservativeSamplePeakBound':bgmpeak+uipeak*master})
r={'status':'PASS','place':stats,'music':{'gainLinear':musicGain,'normalVolume':.18*musicGain,'pausedVolume':.12*musicGain,'normalChangeDb':float(20*np.log10(musicGain)),'pausedChangeDb':float(20*np.log10(musicGain)),'normalPausedRatioPreserved':True,'assetUnchanged':True},'unchanged11BusinessEffectsAndClick':original12,'platforms':platforms,'limitations':['Offline PCM and conservative sample-peak bounds, not physical-device listening.','Bounds cover one effect plus BGM, not arbitrary concurrent sound combinations.']}
(out/'independent-audio-dsp.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
