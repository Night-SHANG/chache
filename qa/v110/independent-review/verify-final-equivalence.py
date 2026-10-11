"""Verify reviewed candidate and final build equivalence without executing or modifying either."""
import hashlib,json,pathlib,sys
if len(sys.argv)!=6:raise SystemExit('Usage: python verify-final-equivalence.py SOURCE CANDIDATE_BUILD FINAL_BUILD CANDIDATE_INVENTORY OUTPUT')
source,candidate,final,inventory,out=map(pathlib.Path,sys.argv[1:]);sha=lambda b:hashlib.sha256(b).hexdigest();baseline=json.loads(inventory.read_text());files=[p for d in ['src','scripts','assets'] for p in (source/d).rglob('*') if p.is_file() and '__pycache__' not in p.parts and not p.name.endswith('.pyc')]+[source/'package.json',source/'package-lock.json'];h=hashlib.sha256();current={}
for p in sorted(files,key=lambda p:str(p.relative_to(source))):
 rel=str(p.relative_to(source));b=p.read_bytes();h.update(rel.encode());h.update(b);current[rel]=sha(b)
changes=[p for p in sorted(set(current)|set(baseline['files'])) if current.get(p)!=baseline['files'].get(p)]
assert changes==['package-lock.json','src/presentation/overlay.ts','src/presentation/renderer.ts'],changes
rows=[];manifests=[];changedBundles=[]
for target in ['browser','wechat']:
 old={str(p.relative_to(candidate/target)):p for p in (candidate/target).rglob('*') if p.is_file()};new={str(p.relative_to(final/target)):p for p in (final/target).rglob('*') if p.is_file()};assert old.keys()==new.keys(),target
 for name in sorted(old):
  b1,b2=old[name].read_bytes(),new[name].read_bytes()
  if name=='build-manifest.json':
   a,b=json.loads(b1),json.loads(b2);d=[k for k in sorted(set(a)|set(b)) if a.get(k)!=b.get(k)];assert set(d)<=set(['builtAt','commit','sourceSha256']),(target,d);assert b['sourceSha256']==h.hexdigest();manifests.append({'target':target,'candidateCommit':a['commit'],'productCommit':b['commit'],'candidateSourceSha256':a['sourceSha256'],'finalSourceSha256':b['sourceSha256'],'changedManifestFields':d,'manifestSha256':sha(b2)})
  elif name in ['app.js','game.js']:
   if b1!=b2:changedBundles.append({'file':f'{target}/{name}','candidateSha256':sha(b1),'finalSha256':sha(b2)})
  else:assert b1==b2,(target,name)
  rows.append({'file':f'{target}/{name}','sha256':sha(b2),'sameBytesAsCandidate':b1==b2})
r={'status':'PASS','candidateSourceSha256':baseline['sourceSha256'],'finalSourceSha256':h.hexdigest(),'sourceFileChangesSinceCandidate':changes,'manifests':manifests,'sameRuntimeAssetsAsCandidate':True,'changedBundles':changedBundles,'uiEquivalenceRequiresSeparateFinalPixelEvidence':True,'files':rows};out.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'status':'PASS','sourceChanges':changes,'finalSourceSha256':h.hexdigest(),'checkedFiles':len(rows)}))
