"""Read-only verification of the already delivered signed APK. No signing credentials."""
import hashlib,json,os,pathlib,re,subprocess,zipfile
ROOT=pathlib.Path.cwd()
OUT=ROOT/'build/android-runtime-only'
INPUT=OUT/'input'
APK=INPUT/'warehouse-last-slot-1.0.13-vc3-release-candidate.apk'
EXPECTED_HASH='44fec43dbfb4afb77a326dde1e3db574ce82d40280029a3830012601f3264610'
EXPECTED_CERT='0033e1a1078d85c73f4eef88184eba06e039b76d8e311c364a55500686bc1bdb'
def require(v,m):
 if not v:raise ValueError(m)
def main():
 require(APK.is_file() and not APK.is_symlink(),'Delivered APK missing or not a regular file')
 require(hashlib.sha256(APK.read_bytes()).hexdigest()==EXPECTED_HASH,'Delivered APK SHA256 differs')
 r=json.loads((INPUT/'signed-release-receipt.json').read_text())
 require(r['source']=={'commit':'a1a7dec23055b9e1f6a030b864d7e4490c11d189','tree':'e9e9049b293cf65f9f71ac3b9d57cf9b1f7c30a0','runId':'38279507392','runAttempt':'1'},'Wrong source signing run')
 require(r['apk']['sha256']==EXPECTED_HASH and r['apk']['certificateSha256']==EXPECTED_CERT,'Wrong receipt identity')
 sdk=pathlib.Path(os.environ.get('ANDROID_HOME')or os.environ['ANDROID_SDK_ROOT'])/'build-tools/35.0.0'
 signature=subprocess.check_output([str(sdk/'apksigner'),'verify','--verbose','--print-certs',str(APK)],text=True)
 certs=re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})',signature)
 require([x.lower()for x in certs]==[EXPECTED_CERT],'Delivered signing identity differs')
 badging=subprocess.check_output([str(sdk/'aapt'),'dump','badging',str(APK)],text=True)
 require(re.findall(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging,re.M)==[('io.github.nightshang.chache','3','1.0.13')],'Wrong APK package or version')
 require('application-debuggable'not in badging and 'android.permission.INTERNET'not in badging,'Release/offline policy differs')
 subprocess.check_call([str(sdk/'zipalign'),'-c','-P','16','4',str(APK)])
 with zipfile.ZipFile(APK)as z:
  require(not any(n.startswith('/')or'..'in n.split('/') for n in z.namelist()),'Unsafe APK entry')
 (OUT/'apk-verification.json').write_text(json.dumps({'status':'passed','source':r['source'],'apkSha256':EXPECTED_HASH,'certificateSha256':EXPECTED_CERT,'runtimeCommit':os.environ['GITHUB_SHA'],'runtimeRun':os.environ['GITHUB_RUN_ID'],'recompiled':False,'resigned':False},indent=2)+'\n')
 print('Exact delivered signed APK source, hash, certificate, version and alignment verified.')
if __name__=='__main__':main()
