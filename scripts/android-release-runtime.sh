#!/usr/bin/env bash
# Disposable AOSP API36 runtime only; never modifies the delivered APK or host security.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/android-runtime-only"
mkdir -p "$OUT"
APK="$OUT/input/warehouse-last-slot-1.0.13-vc3-release-candidate.apk"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="$SDK/platform-tools/adb"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
EMULATOR="$SDK/emulator/emulator"
SERIAL=emulator-5554
PID=''; AVD_NAME=''; STAGE=preflight; STATUS=blocked; REASON='Runtime not completed'; MODE=not-selected
report() {
 python - "$OUT/runtime-result.json" "$STATUS" "$REASON" "$STAGE" "$MODE" <<'PY'
import json,sys,os
p,status,reason,stage,mode=sys.argv[1:]
json.dump({'status':status,'reason':reason,'stage':stage,'emulationMode':mode,'sourceApkSha256':'44fec43dbfb4afb77a326dde1e3db574ce82d40280029a3830012601f3264610','sourceRunId':'38279507392','runtimeRunId':os.environ.get('GITHUB_RUN_ID'),'runtimeCommit':os.environ.get('GITHUB_SHA'),'samePermanentSignatureUpgrade':'not-tested','nativeInstrumentation':'not-run-on-release','physicalPhone':'not-verified','audio':'not-verified','frameTiming':'not-measured','visualReview':'pending-if-screenshots-exist','hostSecurityChanges':False,'licenseChanges':False},open(p,'w'),indent=2)
PY
}
cleanup() {
 report
 if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  local target="$PID" sid=''
  sid="$(timeout 2 ps -o sid= -p "$PID" 2>/dev/null)" || sid=''
  sid="${sid//[[:space:]]/}"
  if [[ "$sid" = "$PID" ]];then target="-$PID";fi
  kill -TERM -- "$target" 2>/dev/null || true
  for _ in $(seq 1 30);do kill -0 -- "$target" 2>/dev/null || break;sleep .2;done
  kill -KILL -- "$target" 2>/dev/null || true
 fi
}
trap 'exit_code=$?;cleanup;exit "$exit_code"' EXIT
trap 'STATUS=blocked;REASON="Runtime timeout or cancellation; incomplete evidence is not a pass";exit 78' TERM INT
blocked(){ STATUS=blocked;REASON="$1";echo "$REASON" >&2;exit 78; }
failed(){ STATUS=failed;REASON="$1";echo "$REASON" >&2;exit 1; }
space(){
 python - "$OUT/space-$1.json" "$RUNNER_TEMP" "$ROOT" <<'PY'
import json,os,sys,time
p,path,root=sys.argv[1:];s=os.statvfs(path)
assert os.stat(path).st_dev==os.stat(root).st_dev
r={'path':path,'availableBytes':s.f_bavail*s.f_frsize,'measuredAtUnix':time.time(),'requiredBytes':8267812045}
json.dump(r,open(p,'w'),indent=2)
if r['availableBytes']<8267812045:sys.exit(78)
PY
}
owned(){
 local n
 n="$(timeout 5 "$ADB" -s "$SERIAL" emu avd name 2>/dev/null | tr -d '\r')" || return 1
 [[ "$n" = "$AVD_NAME"$'\nOK' ]]
}
owns_endpoint(){ owned || blocked 'Reserved endpoint no longer belongs to this task AVD'; }
[[ -x "$ADB" && -x "$SDKMANAGER" && -x "$AVDMANAGER" ]] || blocked 'Official SDK tools unavailable'
[[ -s "$SDK/licenses/android-sdk-license" ]] || blocked 'Existing SDK license unavailable; no new acceptance attempted'
timeout 10 "$ADB" devices > "$OUT/adb-before.txt" 2>&1 || blocked 'Cannot inspect reserved endpoint'
if awk -v serial="$SERIAL" '$1==serial{found=1}END{exit !found}' "$OUT/adb-before.txt";then blocked 'Reserved emulator endpoint already occupied';fi
space preinstall || blocked 'Actual preinstall disk below unchanged safety reserve'
STAGE=sdk-install
# Same API/ABI full AOSP system; not an ATD and not a reduced SystemUI image.
timeout 900 "$SDKMANAGER" --channel=0 'emulator' 'system-images;android-36;default;x86_64' </dev/null > "$OUT/sdk-install.txt" 2>&1 || blocked 'Official same-API AOSP installation failed or needs unaccepted license'
cp "$SDK/system-images/android-36/default/x86_64/source.properties" "$OUT/image-source.properties"
grep -Fx 'AndroidVersion.ApiLevel=36' "$OUT/image-source.properties" >/dev/null || blocked 'Unexpected image API'
grep -Fx 'SystemImage.Abi=x86_64' "$OUT/image-source.properties" >/dev/null || blocked 'Unexpected image ABI'
grep -Fx 'SystemImage.TagId=default' "$OUT/image-source.properties" >/dev/null || blocked 'Unexpected image flavor'
space postinstall || blocked 'Actual AOSP postinstall disk below unchanged8267812045-byte reserve'
STAGE=boot
AVD_DIR="$(mktemp -d "$RUNNER_TEMP/chache-v113-runtime.XXXXXXXX")"
export ANDROID_AVD_HOME="$AVD_DIR/avd"
mkdir -p "$ANDROID_AVD_HOME"
AVD_NAME="chache-v113-${AVD_DIR##*/}"
printf 'no\n' | timeout 120 "$AVDMANAGER" create avd --name "$AVD_NAME" --package 'system-images;android-36;default;x86_64' > "$OUT/avd-create.txt" 2>&1 || blocked 'Disposable AVD creation failed'
if timeout 20 "$EMULATOR" -accel-check > "$OUT/acceleration.txt" 2>&1;then MODE=hardware-accelerated;ACCEL=on;BOOT_BUDGET=360;else MODE=software-tcg;ACCEL=off;BOOT_BUDGET=900;export ANDROID_I_WANT_MY_TCG=yes;fi
setsid "$EMULATOR" -avd "$AVD_NAME" -port 5554 -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader -memory 2048 -accel "$ACCEL" > "$OUT/emulator-boot.txt" 2>&1 & PID=$!
deadline=$((SECONDS+BOOT_BUDGET));ready=false
boot_probe(){
 local remaining=$((deadline-SECONDS))
 ((remaining>0)) || return 1
 ((remaining>4)) && remaining=4
 timeout --kill-after=1s "${remaining}s" "$ADB" -s "$SERIAL" "$@"
}
while ((SECONDS<deadline));do
 kill -0 "$PID" 2>/dev/null || blocked 'Owned emulator exited before framework readiness'
 if [[ "$(boot_probe emu avd name 2>/dev/null | tr -d '\r')" = "$AVD_NAME"$'\nOK' ]];then
  if [[ "$(boot_probe shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]] && boot_probe shell cmd package path android > "$OUT/framework-package.txt" 2>&1 && grep -q '^package:/' "$OUT/framework-package.txt" && boot_probe shell settings get global device_provisioned > "$OUT/framework-settings.txt" 2>&1 && grep -Eq '^[01]' "$OUT/framework-settings.txt" && ((SECONDS<deadline));then ready=true;break;fi
 fi
 sleep 2
done
[[ "$ready" = true ]] || blocked 'Full AOSP framework did not become ready within unchanged bounded boot budget'
owns_endpoint
space postboot || blocked 'Actual postboot disk below unchanged safety reserve'
STAGE=platform-check
timeout 10 "$ADB" -s "$SERIAL" shell pm path com.android.systemui > "$OUT/systemui-package.txt" 2>&1 || blocked 'Full SystemUI package unavailable'
grep -q '^package:' "$OUT/systemui-package.txt" || blocked 'SystemUI not installed'
timeout 10 "$ADB" -s "$SERIAL" shell pidof com.android.systemui > "$OUT/systemui-pid.txt" 2>&1 || blocked 'SystemUI not running'
timeout 10 "$ADB" -s "$SERIAL" shell dumpsys webviewupdate > "$OUT/webview.txt" 2>&1 || blocked 'Cannot verify real WebView provider'
grep -E 'Current WebView package \(name, version\): \([A-Za-z0-9_.]+, [0-9][^)]+\)' "$OUT/webview.txt" >/dev/null || blocked 'No real current WebView provider; no extra provider will be installed'
timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.build.version.sdk > "$OUT/api.txt"
[[ "$(tr -d '\r' < "$OUT/api.txt")" = 36 ]] || blocked 'Booted API differs from36'
STAGE=install
owns_endpoint
timeout 120 "$ADB" -s "$SERIAL" install -r "$APK" > "$OUT/install.txt" 2>&1 || failed 'Exact delivered APK installation failed on verified disposable AVD'
launch(){
 local phase="$1"
 owns_endpoint
 timeout 30 "$ADB" -s "$SERIAL" shell am start -W -n io.github.nightshang.chache/.MainActivity > "$OUT/launch-$phase.txt" 2>&1 || failed "Activity launch failed: $phase"
 tr -d '\r' < "$OUT/launch-$phase.txt" | grep -Fx 'Status: ok' || failed "Activity manager did not report launch success: $phase"
 sleep 8
 timeout 10 "$ADB" -s "$SERIAL" shell pidof io.github.nightshang.chache > "$OUT/pid-$phase.txt" 2>&1 || failed "Product process absent: $phase"
 timeout 10 "$ADB" -s "$SERIAL" shell dumpsys window windows > "$OUT/window-$phase.txt" 2>&1 || failed "Cannot inspect foreground: $phase"
 grep -E 'mCurrentFocus.*io[.]github[.]nightshang[.]chache.*MainActivity' "$OUT/window-$phase.txt" >/dev/null || failed "Product Activity not focused: $phase"
 timeout 15 "$ADB" -s "$SERIAL" exec-out screencap -p > "$OUT/product-$phase.png" || failed "Screenshot unavailable: $phase"
 python - "$OUT/product-$phase.png" <<'PY'
import pathlib,sys,struct
b=pathlib.Path(sys.argv[1]).read_bytes();assert b[:8]==b'\x89PNG\r\n\x1a\n';assert len(b)>1024
w,h=struct.unpack('>II',b[16:24]);assert w>0 and h>0
PY
}
STAGE=cold-launch
launch cold-launch
STAGE=background-resume
owns_endpoint
timeout 10 "$ADB" -s "$SERIAL" shell input keyevent KEYCODE_HOME > "$OUT/home.txt" 2>&1 || failed 'Home action failed'
home_ready=false
for _ in $(seq 1 10);do
 timeout --kill-after=1s 4 "$ADB" -s "$SERIAL" shell dumpsys window windows > "$OUT/window-home.txt" 2>&1 || failed 'Cannot observe Home foreground'
 if grep -E 'mCurrentFocus=Window' "$OUT/window-home.txt" >/dev/null && ! grep -E 'mCurrentFocus.*io[.]github[.]nightshang[.]chache' "$OUT/window-home.txt" >/dev/null;then home_ready=true;break;fi
 sleep 1
done
[[ "$home_ready" = true ]] || failed 'Home did not move the product out of foreground'
timeout 10 "$ADB" -s "$SERIAL" shell pidof io.github.nightshang.chache > "$OUT/pid-home.txt" 2>&1 || failed 'Product process did not survive Home'
cmp -s "$OUT/pid-cold-launch.txt" "$OUT/pid-home.txt" || failed 'Product PID changed while backgrounded'
launch resume
cmp -s "$OUT/pid-home.txt" "$OUT/pid-resume.txt" || failed 'Resume did not retain the existing product process'
STAGE=process-restart
owns_endpoint
timeout 10 "$ADB" -s "$SERIAL" shell am force-stop io.github.nightshang.chache > "$OUT/force-stop.txt" 2>&1 || failed 'Product force-stop failed'
stopped=false
for _ in $(seq 1 10);do
 stop_status=0
 timeout --kill-after=1s 4 "$ADB" -s "$SERIAL" shell pidof io.github.nightshang.chache > "$OUT/pid-stopped.txt" 2>&1 || stop_status=$?
 if [[ "$stop_status" = 1 && ! -s "$OUT/pid-stopped.txt" ]];then stopped=true;break;fi
 sleep 1
done
[[ "$stopped" = true ]] || failed 'Force-stop did not observably remove the product process'
launch restart
STAGE=completed
STATUS=observed
REASON='Exact delivered release installed, cold-launched, resumed and restarted with live focused Activity and screenshots. Pixel review, phone, audio, performance and same-key upgrade remain separate.'
