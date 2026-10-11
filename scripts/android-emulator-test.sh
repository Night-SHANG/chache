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
report() {
  node --input-type=module -e 'import{readFileSync,writeFileSync}from"node:fs";let context={mode:"not-selected",phonePerformanceRepresentative:false};try{context=JSON.parse(readFileSync(process.argv[4],"utf8"))}catch{}writeFileSync(process.argv[1],JSON.stringify({...context,status:process.argv[2],reason:process.argv[3],launchAttempts:Number(process.argv[5]),acceptanceScope:process.argv[6],headless:true,audibleOutput:"not-verified",licenseChanges:false,securityPermissionChanges:false},null,2)+"\n")' "$OUT/emulator-report.json" "$1" "$2" "$OUT/emulator-mode.json" "$launch_attempts" "$ACCEPTANCE_SCOPE"
}
cleanup() {
  if [ "${booted:-false}" = true ]; then
    ANDROID_PRODUCT_APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" ANDROID_SERIAL="$SERIAL" timeout --signal=TERM --kill-after=5s 60s bash "$ROOT/scripts/android-product-smoke.sh" || true
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
export ANDROID_AVD_HOME="$OUT/avd"
mkdir -p "$ANDROID_AVD_HOME"
printf 'no\n' | timeout 120 "$AVDMANAGER" create avd --name warehouse-api36 --package 'system-images;android-36;google_apis;x86_64' >"$OUT/emulator-avd.log" 2>&1 || blocked 'Official AVD creation failed'
command -v setsid >/dev/null || blocked 'Bounded owned-emulator process isolation tool is unavailable'
# Keep only our emulator session alive during orchestration TERM so cleanup can
# capture product evidence, then stop the exact PID we started.
launch_attempts=1
if [ "$MODE" = hardware-accelerated ]; then
  setsid "$EMULATOR" -accel on -avd warehouse-api36 -port 5554 -no-window -no-snapshot -no-audio -gpu swiftshader -no-boot-anim >"$OUT/emulator-boot.log" 2>&1 &
else
  ANDROID_I_WANT_MY_TCG=yes setsid "$EMULATOR" -accel off -avd warehouse-api36 -port 5554 -no-window -no-snapshot -no-audio -gpu swiftshader -no-boot-anim >"$OUT/emulator-boot.log" 2>&1 &
fi
PID=$!
deadline=$((SECONDS+boot_timeout))
booted=false
while [ "$SECONDS" -lt "$deadline" ]; do
  kill -0 "$PID" 2>/dev/null || blocked 'Emulator exited before boot'
  if [ "$(timeout 10 "$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then booted=true; break; fi
  sleep 5
done
[ "$booted" = true ] || blocked "Emulator did not complete cold boot within $boot_timeout seconds in $MODE mode"
node "$ROOT/scripts/android-ci-cache.mjs" space postboot || blocked 'Actual postboot resource inspection failed'
node --input-type=module -e 'import{readFileSync}from"node:fs";const r=JSON.parse(readFileSync(process.argv[1])),c=JSON.parse(readFileSync(process.argv[2]));if(!Number.isSafeInteger(r.availableBytes)||!Number.isSafeInteger(c.releasedAllocatedBytes)||r.availableBytes<c.releasedAllocatedBytes+536870912)process.exit(1)' "$OUT/space-postboot.json" "$OUT/cache-report.json" || blocked 'Actual postboot disk cannot cover measured released cache allocation plus512MiB working headroom; resources blocked'
"$ADB" -s "$SERIAL" shell getprop ro.build.version.sdk >"$OUT/emulator-api.txt"
"$ADB" -s "$SERIAL" shell getprop ro.build.version.release >"$OUT/emulator-release.txt"
"$ADB" -s "$SERIAL" shell getprop ro.build.fingerprint >"$OUT/emulator-build.txt"
"$ADB" -s "$SERIAL" shell dumpsys webviewupdate >"$OUT/emulator-webview.txt"
report running 'API36 cold-boot emulator is ready; instrumentation has not passed yet'
node "$ROOT/scripts/build-android-acceptance.mjs"
if (cd "$ROOT/android" && ANDROID_SERIAL="$SERIAL" ./gradlew --no-daemon --console=plain :app:connectedDebugAndroidTest); then
  report running 'Connected native tests passed; driver-only recovery, upgrade and performance matrix is pending'
else
  report failed 'connectedDebugAndroidTest failed; this is a native test failure, not an environment skip'
  exit 1
fi
# Both APKs are built in this one job with the same conventional temporary debug key.
APK_DIR="$OUT/acceptance-apks"
mkdir -p "$APK_DIR"
cp "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$APK_DIR/warehouse-vc1-temporary-debug.apk"
cp "$ROOT/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" "$APK_DIR/warehouse-androidTest.apk"
if ! (cd "$ROOT/android" && ./gradlew --no-daemon --console=plain -PwarehouseAcceptanceVersionCode=2 :app:assembleDebug); then
  report failed 'Same-job vc2 build failed; upgrade acceptance is incomplete'
  exit 1
fi
cp "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$APK_DIR/warehouse-vc2-temporary-debug.apk"
if ANDROID_ACCEPTANCE_SCOPE="$ACCEPTANCE_SCOPE" ANDROID_SERIAL="$SERIAL" bash "$ROOT/scripts/android-device-check.sh" --disposable-emulator \
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
