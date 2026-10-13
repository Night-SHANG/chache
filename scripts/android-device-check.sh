#!/usr/bin/env bash
# This destructive fixture suite is ONLY for the explicitly selected disposable emulator.
# No uninstall, data-clear, SDK license or security-permission changes are performed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ANDROID_ACCEPTANCE_OUT:-$ROOT/build/android-ci/device-acceptance}"
mkdir -p "$OUT"
SCOPE="${ANDROID_ACCEPTANCE_SCOPE:-full}"
CERT1=''
NONCE_BASE=''
stage=preflight
instrument_pid=''
device_verified=false
finish() {
  status=$?
  if [ "$status" -ne 0 ]; then
    if [ -n "$instrument_pid" ]; then kill "$instrument_pid" >/dev/null 2>&1 || true; fi
    node "$ROOT/scripts/android-device-summary.mjs" "$OUT" "$SCOPE" "$status" "$stage" "$CERT1" "$NONCE_BASE" || true
    if [ "$device_verified" = true ]; then timeout 10 "$ADB" -s "$SERIAL" shell am force-stop io.github.nightshang.chache >/dev/null 2>&1 || true; fi
  fi
}
trap finish EXIT
trap 'exit 124' TERM
node --input-type=module -e 'import{writeFileSync}from"node:fs";writeFileSync(process.argv[1],JSON.stringify({schema:1,status:"running",physicalPhone:"not-verified"})+"\n")' "$OUT/summary.json"
fail() { echo "$*" >&2; exit 1; }
blocked() { echo "$*" >&2; exit 78; }
[[ "$SCOPE" = full || "$SCOPE" = functional-only ]] || fail 'Unknown acceptance scope'
[ "${1:-}" = --disposable-emulator ] || fail 'Required: --disposable-emulator <apk-vc1> <apk-vc2> [test-apk]; fixture reset is not allowed on a phone'
shift
[ "$#" -ge 2 ] && [ "$#" -le 3 ] || fail 'Expected vc1 APK, vc2 APK, and optional instrumentation APK'
APK1="$1"; APK2="$2"; TEST_APK="${3:-$ROOT/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk}"
SERIAL="${ANDROID_SERIAL:-}"
[ -n "$SERIAL" ] && [[ "$SERIAL" == emulator-* ]] || fail 'ANDROID_SERIAL must explicitly identify a disposable emulator'
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || blocked 'Android SDK path unavailable; native acceptance was not run'
ADB="$SDK/platform-tools/adb"; AAPT="$SDK/build-tools/35.0.0/aapt"; SIGNER="$SDK/build-tools/35.0.0/apksigner"
for tool in "$ADB" "$AAPT" "$SIGNER"; do [ -x "$tool" ] || blocked "Required official Android tool missing: $tool"; done
for file in "$APK1" "$APK2" "$TEST_APK"; do [ -f "$file" ] || fail "Required APK missing: $file"; done
adb() { "$ADB" -s "$SERIAL" "$@"; }
[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1 ] || fail 'Selected target did not confirm it is an emulator'
if [ -n "${ANDROID_EXPECTED_AVD_NAME:-}" ]; then
  identity="$(timeout 5 "$ADB" -s "$SERIAL" emu avd name | tr -d '\r')" || fail 'Unique AVD ownership probe failed before fixture reset'
  [ "$identity" = "$ANDROID_EXPECTED_AVD_NAME"$'\nOK' ] || fail 'Fixture target is not the unique owned runtime AVD'
fi
device_verified=true
PKG=io.github.nightshang.chache
TEST_COMPONENT="$PKG.test/androidx.test.runner.AndroidJUnitRunner"
TEST_CLASS=io.github.nightshang.chache.DeviceAcceptanceTest
for pair in "1:$APK1" "2:$APK2"; do
  code="${pair%%:*}"; file="${pair#*:}"
  "$AAPT" dump badging "$file" >"$OUT/apk-vc$code-badging.txt"
  grep -E "^package: name='$PKG' versionCode='$code' versionName='1[.]0[.]20'" "$OUT/apk-vc$code-badging.txt" >/dev/null || fail "APK vc$code identity/version mismatch"
  "$SIGNER" verify --print-certs "$file" >"$OUT/apk-vc$code-signature.txt"
  [ "$(grep -c '^Signer #[0-9][0-9]* certificate SHA-256 digest:' "$OUT/apk-vc$code-signature.txt")" = 1 ] || fail 'Product APK must have exactly one verified signer'
  unzip -Z1 "$file" >"$OUT/apk-vc$code-files.txt"
  if grep -E '(^|/)(acceptance[.]js|bundle-inputs[.]json)$' "$OUT/apk-vc$code-files.txt"; then fail 'Test fixture assets leaked into product APK'; fi
  unzip -p "$file" assets/public/app.js >"$OUT/product-vc$code-app.js"
  if grep -E 'WarehouseAcceptance(Control|Storage)|__ANDROID_ACCEPTANCE_' "$OUT/product-vc$code-app.js"; then fail 'Test controls leaked into product JavaScript'; fi
  while read -r dex; do
    unzip -p "$file" "$dex" | strings >"$OUT/dex-strings.txt"
    if grep -E 'WarehouseAcceptance(Control|Storage)|DeviceAcceptanceTest' "$OUT/dex-strings.txt"; then fail 'Test classes leaked into product APK'; fi
  done < <(grep -E '^classes[0-9]*[.]dex$' "$OUT/apk-vc$code-files.txt")
done
CERT1=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$OUT/apk-vc1-signature.txt")
CERT2=$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$OUT/apk-vc2-signature.txt")
[ -n "$CERT1" ] && [ "$CERT1" = "$CERT2" ] || fail 'Both APKs must use the exact same signing certificate'
cmp "$OUT/product-vc1-app.js" "$OUT/product-vc2-app.js" || fail 'vc1/vc2 product game bundles differ'
for code in 1 2; do grep '^assets/public/' "$OUT/apk-vc$code-files.txt" | sort >"$OUT/vc$code-asset-list.txt"; done
cmp "$OUT/vc1-asset-list.txt" "$OUT/vc2-asset-list.txt" || fail 'vc1/vc2 asset lists differ'
while read -r asset; do
  first=$(unzip -p "$APK1" "$asset" | sha256sum | cut -d' ' -f1)
  second=$(unzip -p "$APK2" "$asset" | sha256sum | cut -d' ' -f1)
  [ "$first" = "$second" ] || fail "vc1/vc2 offline asset differs: $asset"
done <"$OUT/vc1-asset-list.txt"
rm "$OUT/product-vc1-app.js" "$OUT/product-vc2-app.js" "$OUT/dex-strings.txt"
"$SIGNER" verify --print-certs "$TEST_APK" >"$OUT/test-apk-signature.txt"
[ "$(grep -c '^Signer #[0-9][0-9]* certificate SHA-256 digest:' "$OUT/test-apk-signature.txt")" = 1 ] || fail 'Instrumentation APK must have exactly one verified signer'
[ "$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$OUT/test-apk-signature.txt")" = "$CERT1" ] || fail 'Instrumentation APK must use the same debug certificate'
adb shell getprop ro.build.version.sdk >"$OUT/android-api.txt"
adb shell getprop ro.build.version.release >"$OUT/android-release.txt"
adb shell getprop ro.build.fingerprint >"$OUT/android-build.txt"
adb shell dumpsys webviewupdate >"$OUT/webview.txt"
adb install -r "$APK1" | tee "$OUT/install-vc1.txt"
adb install -r -t "$TEST_APK" | tee "$OUT/install-test.txt"
adb logcat -d -b events -v threadtime -s am_anr >"$OUT/anr-before.txt"
NONCE_BASE="$(date +%s).$$"
run_action() {
  action="$1"; phase="$2"; name="$3"; stage="$name"; nonce="$NONCE_BASE.$name"
  adb shell am force-stop "$PKG"
  adb shell run-as "$PKG" rm -f files/android-acceptance-result.json files/android-acceptance-checkpoint.json
  timeout 780 "$ADB" -s "$SERIAL" shell am instrument -w -r -e class "$TEST_CLASS" \
    -e disposableEmulator true -e acceptanceAction "$action" -e acceptancePhase "$phase" -e acceptanceNonce "$nonce" "$TEST_COMPONENT" >"$OUT/$name-instrumentation.txt" 2>&1
  adb exec-out run-as "$PKG" cat files/android-acceptance-result.json >"$OUT/$name.json"
  node "$ROOT/scripts/android-acceptance-report.mjs" "$OUT/$name.json" "$action" "$phase" "$nonce"
  grep -E '^OK [(]1 test[)]' "$OUT/$name-instrumentation.txt" >/dev/null || fail "Instrumentation did not report one passing test: $name"
}
for phase in history-before history-mid b-after a-before a-after receipt-lost; do
  stage="crash-$phase"
  nonce="$NONCE_BASE.crash.$phase"
  adb shell am force-stop "$PKG"
  adb shell run-as "$PKG" rm -f files/android-acceptance-result.json files/android-acceptance-checkpoint.json
  timeout 180 "$ADB" -s "$SERIAL" shell am instrument -w -r -e class "$TEST_CLASS" \
    -e disposableEmulator true -e acceptanceAction seed-crash -e acceptancePhase "$phase" -e acceptanceNonce "$nonce" "$TEST_COMPONENT" >"$OUT/crash-$phase-instrumentation.txt" 2>&1 &
  instrument_pid=$!
  deadline=$((SECONDS+120)); reached=false
  while [ "$SECONDS" -lt "$deadline" ]; do
    if adb exec-out run-as "$PKG" cat files/android-acceptance-checkpoint.json >"$OUT/crash-$phase.json" 2>/dev/null \
      && node --input-type=module -e 'import{readFileSync}from"node:fs";const r=JSON.parse(readFileSync(process.argv[1]));if(r.schema!==1||r.status!=="checkpoint"||r.action!=="seed-crash"||r.phase!==process.argv[2]||r.reached!==process.argv[2]||r.nonce!==process.argv[3]||!Number.isInteger(r.pid))process.exit(1)' "$OUT/crash-$phase.json" "$phase" "$nonce" 2>/dev/null; then reached=true;break; fi
    kill -0 "$instrument_pid" 2>/dev/null || fail "Seed process ended before required checkpoint: $phase"
    sleep 0.2
  done
  [ "$reached" = true ] || fail "Required native checkpoint not reached: $phase"
  actual_pid="$(adb shell pidof "$PKG" | tr -d '\r')"
  node --input-type=module -e 'import{readFileSync}from"node:fs";if(String(JSON.parse(readFileSync(process.argv[1])).pid)!==process.argv[2])process.exit(1)' "$OUT/crash-$phase.json" "$actual_pid" || fail 'Checkpoint was not in the actual target process'
  adb shell am force-stop "$PKG"
  if adb shell pidof "$PKG" | grep -E '[0-9]'; then fail 'Target process survived force-stop'; fi
  wait "$instrument_pid" || true # A killed instrumentation process is expected only after its verified checkpoint.
  instrument_pid=''
  run_action verify-crash "$phase" "recover-$phase"
  node --input-type=module -e 'import{readFileSync}from"node:fs";const a=JSON.parse(readFileSync(process.argv[1])),b=JSON.parse(readFileSync(process.argv[2]));if(a.pid===b.pid)throw Error("Recovery reused the killed process")' "$OUT/crash-$phase.json" "$OUT/recover-$phase.json"
done
run_action seed-upgrade none upgrade-before
adb shell am force-stop "$PKG"
adb install -r "$APK2" | tee "$OUT/install-vc2.txt"
adb shell dumpsys package "$PKG" >"$OUT/installed-package.txt"
grep -E 'versionCode=2([[:space:]]|$)' "$OUT/installed-package.txt" >/dev/null || fail 'Installed upgrade is not versionCode 2'
run_action verify-upgrade none upgrade-after
node --input-type=module -e 'import{readFileSync}from"node:fs";const a=JSON.parse(readFileSync(process.argv[1])).result.account,b=JSON.parse(readFileSync(process.argv[2])).result.account;if(JSON.stringify(a)!==JSON.stringify(b))throw Error("Upgrade changed account")' "$OUT/upgrade-before.json" "$OUT/upgrade-after.json"
# Continue all specified measurement categories even when a complete category misses its gate.
# Missing reports, incomplete transactions, or instrumentation errors still fail immediately.
if [ "$SCOPE" = full ]; then
for variant in normal realistic extreme; do
  stage="performance-$variant"; nonce="$NONCE_BASE.$stage"
  adb shell am force-stop "$PKG"
  adb shell run-as "$PKG" rm -f files/android-acceptance-result.json
  set +e
  timeout 1500 "$ADB" -s "$SERIAL" shell am instrument -w -r -e class "$TEST_CLASS" \
    -e disposableEmulator true -e acceptanceAction performance -e acceptancePhase "$variant" -e acceptanceNonce "$nonce" "$TEST_COMPONENT" >"$OUT/$stage-instrumentation.txt" 2>&1
  instrument_status=$?
  set -e
  [ "$instrument_status" -eq 0 ] || fail "Performance instrumentation command did not finish: $variant ($instrument_status)"
  adb exec-out run-as "$PKG" cat files/android-acceptance-result.json >"$OUT/$stage.json"
  node "$ROOT/scripts/android-acceptance-report.mjs" "$OUT/$stage.json" performance "$variant" "$nonce" --measurement
  if node --input-type=module -e 'import{readFileSync}from"node:fs";process.exit(JSON.parse(readFileSync(process.argv[1])).status==="passed"?0:1)' "$OUT/$stage.json"; then
    grep -E '^OK [(]1 test[)]' "$OUT/$stage-instrumentation.txt" >/dev/null || fail 'Passing timing report has no passing instrumentation result'
  else
    grep -F 'FAILURES!!!' "$OUT/$stage-instrumentation.txt" >/dev/null || fail 'Failed timing gate has no completed instrumentation assertion'
  fi
done
fi
adb logcat -d -b events -v threadtime -s am_anr >"$OUT/anr-after.txt"
node --input-type=module -e 'import{readFileSync,writeFileSync}from"node:fs";const out=process.argv[1],before=new Set(readFileSync(out+"/anr-before.txt","utf8").split("\n")),events=readFileSync(out+"/anr-after.txt","utf8").split("\n").filter(line=>!before.has(line)&&line.includes("io.github.nightshang.chache"));writeFileSync(out+"/anr-report.json",JSON.stringify({schema:1,status:events.length?"failed":"passed",observation:events.length?"target ANR event observed":"no target ANR event observed in events buffer during driver",observedEvents:events,frameTiming:"not-measured",eventBufferMayBeBounded:true},null,2)+"\n")' "$OUT"
stage=complete
node "$ROOT/scripts/android-device-summary.mjs" "$OUT" "$SCOPE" 0 "$stage" "$CERT1" "$NONCE_BASE"
if [ "$SCOPE" = functional-only ]; then
  node --input-type=module -e 'import{readFileSync}from"node:fs";const r=JSON.parse(readFileSync(process.argv[1]));if(r.status!=="blocked"||r.recovery!=="passed"||r.upgrade!=="passed"||r.anr.status!=="passed")throw Error("Functional evidence failed or incomplete")' "$OUT/summary.json"
  echo 'Functional recovery and same-key upgrade completed; all performance categories NOT RUN and formal acceptance BLOCKED.'
  exit 0
fi
node --input-type=module -e 'import{readFileSync}from"node:fs";if(JSON.parse(readFileSync(process.argv[1])).status!=="passed")throw Error("Complete native timing matrix did not meet acceptance gates")' "$OUT/summary.json"
echo 'Native recovery, same-key install -r upgrade, and all measured performance categories passed on the disposable emulator.'
