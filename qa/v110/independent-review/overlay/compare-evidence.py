"""Compare immutable candidate screenshots with independently re-rendered final UI pixels."""
from pathlib import Path
from PIL import Image
import argparse,hashlib,json
p=argparse.ArgumentParser()
for n in ['old-host','new-host','old-matrix','new-matrix','approved','replayed','out']:p.add_argument('--'+n,required=True,type=Path)
a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
load=lambda d:json.loads((d/'report.json').read_text())
oh,nh,om,nm,ap,rp=map(load,[a.old_host,a.new_host,a.old_matrix,a.new_matrix,a.approved,a.replayed])
assert all(r['status']=='PASS' for r in [oh,nh,om,nm,ap,rp]);assert nh['initial']==nh['ending'];assert nm['initial']==nm['ending']==nh['initial']['sourceSha256'];assert oh['initial']==oh['ending'];assert om['initial']==oh['initial']['sourceSha256']
report={'status':'RUNNING','kind':'Unmodified original bundles re-rendered in native Canvas/DOM-event/wx hosts; not real GUI or physical device.','candidate':oh['initial'],'final':nh['initial'],'hostCases':nh['counts'],'matrixCases':nm['counts'],'comparisons':[]}
def compare(group,oldroot,newroot,old,new,name):
 op=oldroot/Path(old['path']).name;np=newroot/Path(new['path']).name
 ob,nb=op.read_bytes(),np.read_bytes();os=hashlib.sha256(ob).hexdigest();ns=hashlib.sha256(nb).hexdigest();assert os==old['sha256'];assert ns==new['sha256']
 oi,ni=Image.open(op).convert('RGBA'),Image.open(np).convert('RGBA');same=oi.size==ni.size and oi.tobytes()==ni.tobytes()
 report['comparisons'].append({'group':group,'name':name,'candidateFile':op.name,'finalFile':np.name,'candidateSha256':os,'finalSha256':ns,'dimensions':list(ni.size),'pngBytesIdentical':ob==nb,'rgbaPixelsIdentical':same})
for group,oldr,newr,orr,nrr in [('independent-host',a.old_host,a.new_host,oh,nh),('source-matrix',a.old_matrix,a.new_matrix,om,nm)]:
 old={i['name']:i for i in orr['images']};new={i['name']:i for i in nrr['images']};assert set(old)==set(new)
 for name in sorted(old):compare(group,oldr,newr,old[name],new[name],name)
old={i['name']:i for i in ap['cases']};new={i['name']:i for i in rp['cases']};assert set(old)==set(new)
for name in sorted(old):
 assert old[name]['bundleSha256']==oh['initial'][old[name]['target']]
 assert new[name]['bundleSha256']==nh['initial'][new[name]['target']]
 for kind in ['active','before','after']:compare('approved-scene-replay',a.approved,a.replayed,old[name][kind],new[name][kind],name+'-'+kind)
report['counts']={'totalPngs':len(report['comparisons']),'identicalPngBytes':sum(c['pngBytesIdentical'] for c in report['comparisons']),'identicalPixelBuffers':sum(c['rgbaPixelsIdentical'] for c in report['comparisons'])}
report['status']='PASS' if all(c['rgbaPixelsIdentical'] for c in report['comparisons']) else 'FAIL'
report['approvedFourAfter']=[c for c in report['comparisons'] if c['group']=='approved-scene-replay' and c['name'] in [n+'-after' for n in ['inbound-normal-five','inbound-infinite-six','outbound-normal-five','outbound-infinite-six']]]
assert len(report['approvedFourAfter'])==4
(a.out/'visual-equivalence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':report['status'],**report['counts'],'candidate':report['candidate'],'final':report['final']}))
if report['status']!='PASS':raise SystemExit(1)
