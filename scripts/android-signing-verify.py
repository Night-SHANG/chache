"""Verify the isolated same-run unsigned handoff and signed candidate; never load credentials."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import zipfile

ROOT = pathlib.Path.cwd()
INPUT = ROOT / 'build/android-ci/release-unsigned'
OUTPUT = ROOT / 'build/android-ci/signed-release'
APK = INPUT / 'app-release-unsigned.apk'
RECEIPT = INPUT / 'unsigned-release-receipt.json'
SIGNED = OUTPUT / 'warehouse-last-slot-1.0.20-vc10-release-candidate.apk'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def require(value, message):
    if not value:
        raise ValueError(message)

def command(*args):
    return subprocess.check_output(args, text=True)

def validate_archive_entries(names):
    require(len(names) == len(set(names)) and not any(p.startswith('/') or '..' in p.split('/') or re.search(r'(?:^|/)(?:acceptance\.js|bundle-inputs\.json)$', p) or re.search(r'\.(?:p12|pfx|jks|keystore|pem|key|pk8|p8)$', p, re.I) for p in names), 'Invalid ZIP, acceptance controls or private material')

def validate_identity(badging):
    identities = re.findall(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging, re.M)
    require(identities == [('io.github.nightshang.chache', '10', '1.0.20')], 'Wrong release identity')

def main():
    mode = sys.argv[1]
    require(mode in ('unsigned', 'signed'), 'Unknown verification mode')
    require(os.environ['GITHUB_REPOSITORY'] == 'Night-SHANG/chache', 'Unexpected repository')
    require(os.environ['GITHUB_REF'] == 'refs/heads/dev/android-v114-startup', 'Unexpected branch')
    require(os.environ['GITHUB_EVENT_NAME'] == 'push', 'Unexpected trigger')
    require(APK.is_file() and not APK.is_symlink() and RECEIPT.is_file() and not RECEIPT.is_symlink(), 'Missing regular input files')
    require(sha(RECEIPT) == os.environ['UNSIGNED_RECEIPT_SHA256'], 'Unsigned receipt checksum mismatch')
    receipt = json.loads(RECEIPT.read_text())
    source = receipt['source']
    require(source['commit'] == os.environ['GITHUB_SHA'] and source['runId'] == os.environ['GITHUB_RUN_ID'] and source['runAttempt'] == os.environ['GITHUB_RUN_ATTEMPT'], 'Cross-run/source handoff rejected')
    require(re.fullmatch('[a-f0-9]{40}', source['tree']), 'Invalid source tree')
    require(sha(APK) == receipt['apkSha256'], 'Unsigned APK hash mismatch')
    require(receipt['verification']['node']['accepted'] is True and receipt['verification']['unit']['status'] == 'passed' and receipt['publicationApproved'] is False, 'Incomplete build evidence')
    sdk = pathlib.Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT']) / 'build-tools/35.0.0'
    target = APK if mode == 'unsigned' else SIGNED
    require(target.is_file() and not target.is_symlink(), 'Missing regular APK')
    badging = command(str(sdk / 'aapt'), 'dump', 'badging', str(target))
    manifest = command(str(sdk / 'aapt'), 'dump', 'xmltree', str(target), 'AndroidManifest.xml')
    validate_identity(badging)
    require("application-label:'货箱最后一格'" in badging, 'Wrong release label')
    require('application-debuggable' not in badging and not re.search(r'android:(?:debuggable|testOnly)[^\n]*(?:0xffffffff|true)', manifest), 'Debug/test-only release rejected')
    require('android.permission.INTERNET' not in badging, 'Offline permission violated')
    with zipfile.ZipFile(target) as archive:
        names = archive.namelist()
        validate_archive_entries(names)
        actual = {p[14:]: hashlib.sha256(archive.read(p)).hexdigest() for p in names if p.startswith('assets/public/') and not p.endswith('/')}
        require(actual == receipt['facts']['expectedAssets'], 'Bundled release assets mismatch')
        require(not any(re.search(rb'WarehouseAcceptance(?:Control|Storage)|DeviceAcceptanceTest|__ANDROID_ACCEPTANCE_', archive.read(p)) for p in names if re.fullmatch(r'classes\d*\.dex', p) or p == 'assets/public/app.js'), 'Acceptance controls leaked')
        if mode == 'signed':
            with zipfile.ZipFile(APK) as original:
                # Signing may add META-INF signatures, but must not alter any existing entry.
                for name in original.namelist():
                    require(name in names and archive.read(name) == original.read(name), 'Signing changed an original APK entry')
                require(all(name in original.namelist() or name.startswith('META-INF/') for name in names), 'Signing added non-signature payload')
    if mode == 'signed':
        signature = command(str(sdk / 'apksigner'), 'verify', '--verbose', '--print-certs', str(SIGNED))
        certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})', signature)
        require(len(certs) == 1, 'Exactly one verified signing certificate required')
        command(str(sdk / 'zipalign'), '-c', '-P', '16', '4', str(SIGNED))
        signed_receipt = {'schemaVersion': 1, 'source': source, 'identity': {'applicationId': 'io.github.nightshang.chache', 'appName': '货箱最后一格', 'versionName': '1.0.20', 'versionCode': 10}, 'apk': {'filename': SIGNED.name, 'sha256': sha(SIGNED), 'certificateSha256': certs[0].lower(), 'signing': 'observed owner-configured PKCS12 identity; official apksigner verified; original-generation certificate not independently matched', 'alignment': 'verified', 'bundledAssets': 'verified byte-exact', 'debuggable': False, 'testOnly': False}, 'unsignedApkSha256': sha(APK), 'unsignedReceiptSha256': sha(RECEIPT), 'verification': receipt['verification'], 'deliveryStatus': 'PRIVATE_CANDIDATE_PENDING_ROOT_REVIEW', 'publicationApproved': False, 'installWarning': 'Different signing identity cannot overwrite the old debug APK. Do not uninstall or clear data to bypass it; uninstall deletes app data.'}
        path = OUTPUT / 'signed-release-receipt.json'
        path.write_text(json.dumps(signed_receipt, ensure_ascii=False, indent=2) + '\n')
        (OUTPUT / 'SHA256SUMS').write_text(f'{sha(SIGNED)}  {SIGNED.name}\n{sha(path)}  {path.name}\n')
        print('Signed release vc10 identity, production bytes, certificate and alignment verified; phone/runtime acceptance remains unverified.')
    else:
        print('Immutable same-run unsigned release handoff verified before any signing secrets are supplied.')

if __name__ == '__main__':
    main()
