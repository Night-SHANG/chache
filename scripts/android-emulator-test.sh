#!/usr/bin/env bash
# Official SDK tools only. Exit 78 means an observed environment block, never a test pass.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/android-ci"
mkdir -p "$OUT"
SERIAL=emulator-5554
PID=''
MODE=not-selected
ACCEPTANCE_SCOPE=full
launch_attempts=0
AVD_NAME=''
HANDOFF="${ANDROID_CI_HANDOFF:-}"
owns_endpoint() {
  local identity
  identity="$(timeout --signal=TERM --kill-after=1s 5s "$ADB" -s "$SERIAL" emu avd name 2>>"$OUT/emulator-identity.log")" || return 1
  identity="$(printf '%s' "$identity" | tr -d '\r')"
  printf '%s\n' "$identity" >>"$OUT/emulator-identity.log"
  [ "$identity" = "$AVD_NAME"$'\nOK' ] || return 2
}
require_owned_endpoint() { owns_endpoint || blocked 'Reserved serial no longer identifies this unique task-owned AVD'; }
reject_existing_endpoint() {
  timeout 10 "$ADB" devices >"$OUT/emulator-endpoint.log" 2>&1 || blocked 'Reserved serial occupancy could not be inspected'
  grep -Fx 'List of devices attached' "$OUT/emulator-endpoint.log" >/dev/null || blocked 'Official adb device-list evidence is malformed'
  if awk -v serial="$SERIAL" '$1==serial {found=1} END {exit !found}' "$OUT/emulator-endpoint.log"; then blocked 'Reserved emulator-5554 endpoint is occupied; existing device untouched'; fi
}
report() {
  node --input-type=module -e 'import{readFileSync,writeFileSync}from"node:fs";let context={mode:"not-selected",phonePerformanceRepresentative:false};try{context=JSON.parse(readFileSync(process.argv[4],"utf8"))}catch{}writeFileSync(process.argv[1],JSON.stringify({...context,status:process.argv[2],reason:process.argv[3],launchAttempts:Number(process.argv[5]),acceptanceScope:process.argv[6],headless:true,audibleOutput:"not-verified",licenseChanges:false,securityPermissionChanges:false},null,2)+"\n")' "$OUT/emulator-report.json" "$1" "$2" "$OUT/emulator-mode.json" "$launch_attempts" "$ACCEPTANCE_SCOPE"
}
cleanup() {
  if [ "${booted:-false}" = true ] && owns_endpoint; then
    ANDROID_PRODUCT_APK="$HANDOFF/apks/warehouse-vc2-temporary-debug.apk" ANDROID_EXPECTED_AVD_NAME="$AVD_NAME" ANDROID_SERIAL="$SERIAL" timeout --signal=TERM --kill-after=5s 60s bash "$ROOT/scripts/android-product-smoke.sh" || true
  fi
  if [ -n "$PID" ]; then
    # No serial-based shutdown: emulator-5554 has no endpoint ownership proof.
    # Signal only our direct child; its verified setsid session is also ours.
    local sid='' target="$PID" deadline
    sid="$(timeout --signal=TERM --kill-after=1s 2s ps -o sid= -p "$PID" 2>/dev/null)" || sid=''
    sid="${sid//[[:space:]]/}"
    if [ "$sid" = "$PID" ]; then target="-$PID"; fi
    kill -TERM -- "$target" >/dev/null 2>&1 || true
    deadline=$((SECONDS+10))
    while kill -0 -- "$target" 2>/dev/null && [ "$SECONDS" -lt "$deadline" ]; do sleep .2; done
    kill -KILL -- "$target" >/dev/null 2>&1 || true
  fi
}
trap 'exit_status=$?; cleanup; exit "$exit_status"' EXIT
trap 'report failed "Runtime orchestration timed out; incomplete evidence cannot pass"; exit 124' TERM
blocked() { report blocked "$1"; echo "$1" >&2; exit 78; }
HOME_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$HOME_SDK" ] || blocked 'Android SDK path missing'
SDKMANAGER="$HOME_SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$HOME_SDK/cmdline-tools/latest/bin/avdmanager"
ADB="$HOME_SDK/platform-tools/adb"
EMULATOR="$HOME_SDK/emulator/emulator"
[ -x "$SDKMANAGER" ] && [ -x "$AVDMANAGER" ] && [ -x "$ADB" ] || blocked 'Official SDK CLI tools are missing'
[ -n "$HANDOFF" ] || blocked 'Immutable current-run APK handoff path missing'
node "$ROOT/scripts/android-ci-handoff.mjs" verify || blocked 'Immutable artifact/source/run/APK verification failed before runtime'
reject_existing_endpoint
[ -s "$HOME_SDK/licenses/android-sdk-license" ] || blocked 'No existing Android SDK license acceptance; no agreement was accepted'
node "$ROOT/scripts/android-ci-cache.mjs" space preinstall || blocked 'Actual preinstall resource inspection failed'
available_kb=$(df -Pk "$HOME_SDK" | awk 'NR==2 {print $4}')
[ "$available_kb" -ge 8000000 ] || blocked 'Less than 8GB free for emulator/image extraction'
if [ ! -x "$EMULATOR" ] || [ ! -f "$HOME_SDK/system-images/android-36/google_apis/x86_64/package.xml" ]; then
  if ! timeout 900 "$SDKMANAGER" --channel=0 'emulator' 'system-images;android-36;google_apis;x86_64' </dev/null >"$OUT/emulator-install.log" 2>&1; then
    blocked 'Official stable SDK package installation failed or requested an unaccepted license; see runner-local emulator-install.log'
  fi
fi
node "$ROOT/scripts/android-ci-cache.mjs" space postinstall || blocked 'Actual postinstall resource inspection failed'
node --input-type=module -e 'import{readFileSync,statSync}from"node:fs";const r=JSON.parse(readFileSync(process.argv[1]));if(statSync(r.path).dev!==statSync(process.argv[2]).dev||!Number.isSafeInteger(r.availableBytes)||r.availableBytes<8267812045)process.exit(1)' "$OUT/space-postinstall.json" "$ROOT" || blocked 'Actual disk after SDK install is below6GiB×1.2 plus512MiB unchanged headroom'
node "$ROOT/scripts/android-emulator-mode.mjs" "$EMULATOR" "$OUT/emulator-acceleration.log" "$OUT/emulator-mode.json" >"$OUT/emulator-mode-selection.txt" || blocked 'Official emulator mode probe failed; no permissions changed'
readarray -t selection <"$OUT/emulator-mode-selection.txt"
MODE="${selection[0]:-}"
boot_timeout="${selection[1]:-}"
[[ "$MODE" = hardware-accelerated && "$boot_timeout" = 360 || "$MODE" = software-tcg && "$boot_timeout" = 900 ]] || blocked 'Invalid bounded emulator mode selection'
if [ "$MODE" = software-tcg ]; then
  ACCEPTANCE_SCOPE=functional-only
  echo 'Official TCG software emulation is unsupported and very slow; phone performance is not represented.'
fi
AVD_DIR="$(mktemp -d "$OUT/warehouse-runtime.XXXXXX")"
AVD_NAME="warehouse-runtime-${AVD_DIR##*/}"
export ANDROID_AVD_HOME="$AVD_DIR/avd"
mkdir -p "$ANDROID_AVD_HOME"

printf 'no\n' | timeout 120 "$AVDMANAGER" create avd --name "$AVD_NAME" --package 'system-images;android-36;google_apis;x86_64' >"$OUT/emulator-avd.log" 2>&1 || blocked 'Official AVD creation failed'
command -v setsid >/dev/null || blocked 'Bounded owned-emulator process isolation tool is unavailable'
# Keep only our emulator session alive during orchestration TERM so cleanup can
# capture product evidence, then stop the exact PID we started.
reject_existing_endpoint
launch_attempts=1
if [ "$MODE" = hardware-accelerated ]; then
  setsid "$EMULATOR" -accel on -avd "$AVD_NAME" -port 5554 -no-window -no-snapshot -no-audio -gpu swiftshader -no-boot-anim >"$OUT/emulator-boot.log" 2>&1 &
else
  ANDROID_I_WANT_MY_TCG=yes setsid "$EMULATOR" -accel off -avd "$AVD_NAME" -port 5554 -no-window -no-snapshot -no-audio -gpu swiftshader -no-boot-anim >"$OUT/emulator-boot.log" 2>&1 &
fi
PID=$!
deadline=$((SECONDS+boot_timeout))
booted=false
while [ "$SECONDS" -lt "$deadline" ]; do
  kill -0 "$PID" 2>/dev/null || blocked 'Emulator exited before boot'
  if owns_endpoint; then
    if [ "$(timeout 10 "$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then require_owned_endpoint; booted=true; break; fi
  else
    identity_status=$?
    [ "$identity_status" -ne 2 ] || blocked 'Reserved serial identifies an unrelated AVD; boot evidence rejected'
  fi
  sleep 5
done
[ "$booted" = true ] || blocked "Emulator did not complete cold boot within $boot_timeout seconds in $MODE mode"
require_owned_endpoint
node "$ROOT/scripts/android-ci-cache.mjs" space postboot || blocked 'Actual postboot resource inspection failed'
node --input-type=module -e 'import{readFileSync}from"node:fs";const r=JSON.parse(readFileSync(process.argv[1])),c=JSON.parse(readFileSync(process.argv[2]));if(!Number.isSafeInteger(r.availableBytes)||!Number.isSafeInteger(c.releasedAllocatedBytes)||r.availableBytes<c.releasedAllocatedBytes+536870912)process.exit(1)' "$OUT/space-postboot.json" "$HANDOFF/evidence/cache-report.json" || blocked 'Actual postboot disk cannot cover measured released cache allocation plus512MiB conservative working headroom; no runtime cache re-download dependency'
timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.build.version.sdk >"$OUT/emulator-api.txt"
timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.build.version.release >"$OUT/emulator-release.txt"
timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.build.fingerprint >"$OUT/emulator-build.txt"
timeout 10 "$ADB" -s "$SERIAL" shell dumpsys webviewupdate >"$OUT/emulator-webview.txt"
report running 'API36 cold-boot emulator is ready; instrumentation has not passed yet'
# Only immutable prebuilt APKs are installed; this runner cannot compile or regenerate assets.
require_owned_endpoint
timeout --signal=TERM --kill-after=5s 60s "$ADB" -s "$SERIAL" install -r "$HANDOFF/apks/warehouse-vc1-temporary-debug.apk" >"$OUT/native-install.txt" 2>&1
timeout --signal=TERM --kill-after=5s 60s "$ADB" -s "$SERIAL" install -r -t "$HANDOFF/apks/warehouse-androidTest.apk" >>"$OUT/native-install.txt" 2>&1
require_owned_endpoint
set +e
timeout --signal=TERM --kill-after=5s 1800s "$ADB" -s "$SERIAL" shell am instrument -w -r \
  io.github.nightshang.chache.test/androidx.test.runner.AndroidJUnitRunner >"$OUT/native-instrumentation.txt" 2>&1
native_status=$?
set -e
if node "$ROOT/scripts/android-native-instrumentation.mjs" "$OUT/native-instrumentation.txt" "$HANDOFF/manifest.json" "$OUT/native-instrumentation-report.json" "$native_status"; then
  report running 'Exact generic native test inventory passed; driver-only recovery and upgrade matrix is pending'
else
  parser_status=$?
  if [ "$parser_status" -eq 78 ]; then blocked 'Direct-adb native evidence is missing/malformed without an observed failure; raw partial status evidence is preserved'; fi
  report failed 'Direct-adb generic native tests had an observed test/process failure; raw individual status evidence is preserved'
  exit 1
fi
APK_DIR="$HANDOFF/apks"
require_owned_endpoint
if ANDROID_EXPECTED_AVD_NAME="$AVD_NAME" ANDROID_ACCEPTANCE_SCOPE="$ACCEPTANCE_SCOPE" ANDROID_SERIAL="$SERIAL" bash "$ROOT/scripts/android-device-check.sh" --disposable-emulator \
  "$APK_DIR/warehouse-vc1-temporary-debug.apk" "$APK_DIR/warehouse-vc2-temporary-debug.apk" "$APK_DIR/warehouse-androidTest.apk"; then
  if [ "$ACCEPTANCE_SCOPE" = functional-only ]; then
    report blocked 'Native functional, process-death recovery and same-key upgrade driver completed; all three performance categories NOT RUN; formal acceptance remains closed'
  else
    report passed 'Native instrumentation, actual process-death recovery, install -r upgrade and 100-transaction latency gate passed; phone and audible output unverified'
  fi
else
  status=$?
  if [ "$status" -eq 78 ]; then blocked 'Device acceptance encountered a verified tool/environment block; see device-acceptance/summary.json'; fi
  report failed 'Device acceptance failed or was incomplete; see device-acceptance/summary.json and per-action reports'
  exit 1
fi
node --input-type=module -e 'import{readFileSync,writeFileSync}from"node:fs";const p=process.argv[1],r=JSON.parse(readFileSync(p,"utf8"));for(const n of["api","release","build","webview"])r[n]=readFileSync(process.argv[2]+"/emulator-"+n+".txt","utf8").trim();for(const[n,p]of[["emulator","emulator/source.properties"],["systemImage","system-images/android-36/google_apis/x86_64/source.properties"]])r[n]=readFileSync(process.argv[3]+"/"+p,"utf8");writeFileSync(p,JSON.stringify(r,null,2)+"\n")' "$OUT/emulator-report.json" "$OUT" "$HOME_SDK"
