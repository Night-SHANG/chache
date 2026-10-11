#!/usr/bin/env bash
# Pure infrastructure diagnosis. Exit78 is an environment block, never product acceptance.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="$ROOT/build/android-ci/emulator-probe"
mkdir -p "$OUT"
PID=''
SERIAL=emulator-5554
AVD_NAME=''
endpoint_verified=false
observed_avd=''
booted=false
launch_attempts=0
status=blocked
reason='Infrastructure probe did not finish'
owns_endpoint() {
  endpoint_verified=false
  local identity
  identity="$(timeout 5 "$ADB" -s "$SERIAL" emu avd name 2>>"$OUT/emulator-probe-identity.log")" || return 1
  identity="$(printf '%s' "$identity" | tr -d '\r')"
  printf '%s\n' "$identity" >>"$OUT/emulator-probe-identity.log"
  observed_avd="${identity%%$'\n'*}"
  [ "$identity" = "$AVD_NAME"$'\nOK' ] || return 2
  endpoint_verified=true
}
require_owned_endpoint() { owns_endpoint || blocked 'Reserved serial no longer identifies this unique task-owned AVD'; }
reject_existing_endpoint() {
  timeout 10 "$ADB" devices >"$OUT/emulator-probe-endpoint.log" 2>&1 || blocked 'Reserved serial occupancy could not be inspected'
  grep -Fx 'List of devices attached' "$OUT/emulator-probe-endpoint.log" >/dev/null || blocked 'Official adb device-list evidence is malformed'
  if awk -v serial="$SERIAL" '$1==serial {found=1} END {exit !found}' "$OUT/emulator-probe-endpoint.log"; then blocked 'Reserved emulator-5554 endpoint is already occupied; existing device untouched'; fi
}
cleanup() {
  if [ -n "$PID" ]; then
    if kill -0 "$PID" 2>/dev/null && owns_endpoint; then timeout 10 "$ADB" -s "$SERIAL" emu kill >/dev/null 2>&1 || true; fi
    kill "$PID" >/dev/null 2>&1 || true
  fi
}
report() {
  node --input-type=module -e 'import{readFileSync,writeFileSync}from"node:fs";const o=process.argv[1],read=n=>{try{return JSON.parse(readFileSync(o+"/"+n,"utf8"))}catch{return null}};writeFileSync(o+"/emulator-probe-report.json",JSON.stringify({schema:1,scope:"infrastructure-only; product and acceptance matrix NOT RUN",status:process.argv[2],reason:process.argv[3],exitCode:Number(process.argv[4]),mode:"software-tcg",accelerationMode:"off",softwareModeUnsupported:true,softwareModeVerySlow:true,phonePerformanceRepresentative:false,bootTimeoutSeconds:900,launchAttempts:Number(process.argv[5]),bootCompleted:process.argv[6]==="true",expectedAvdName:process.argv[7]||null,endpointOwnershipVerified:process.argv[8]==="true",observedAvdName:process.argv[9]||null,spaceBeforeInstall:read("space-before-install.json"),spaceAfterInstall:read("space-after-install.json"),licenseChanges:false,securityPermissionChanges:false,productChecks:"not-run",physicalPhone:"not-verified",audibleOutput:"not-verified"},null,2)+"\n")' "$OUT" "$status" "$reason" "$1" "$launch_attempts" "$booted" "$AVD_NAME" "$endpoint_verified" "$observed_avd"
}
trap 'exit_status=$?; cleanup; report "$exit_status" || true; exit "$exit_status"' EXIT
blocked() { reason="$1"; echo "$reason" >&2; exit 78; }
HOME_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$HOME_SDK" ] || blocked 'Existing Android SDK path is missing'
SDKMANAGER="$HOME_SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$HOME_SDK/cmdline-tools/latest/bin/avdmanager"
ADB="$HOME_SDK/platform-tools/adb"
EMULATOR="$HOME_SDK/emulator/emulator"
[ -x "$SDKMANAGER" ] && [ -x "$AVDMANAGER" ] && [ -x "$ADB" ] || blocked 'Official SDK CLI tools are missing'
reject_existing_endpoint
command -v java >/dev/null || blocked 'Pinned Java runtime is unavailable'
timeout 10 java -version >"$OUT/java-version.log" 2>&1 || blocked 'Actual Java runtime inspection failed'
[ -s "$HOME_SDK/licenses/android-sdk-license" ] || blocked 'No existing matching SDK agreement; no license was accepted'
SELECTED="$(node scripts/android-emulator-probe-space.mjs "$OUT/space-before-install.json")"
[ -n "$SELECTED" ] || blocked 'No existing writable probe volume meets6GiB userdata ×1.2 plus512MiB headroom before installation'
if [ ! -x "$EMULATOR" ] || [ ! -f "$HOME_SDK/system-images/android-36/google_apis/x86_64/package.xml" ]; then
  available_kb=$(df -Pk "$HOME_SDK" | awk 'NR==2 {print $4}')
  [ "$available_kb" -ge 8000000 ] || blocked 'Existing SDK volume has less than8GB available for stable package extraction'
  if ! timeout 900 "$SDKMANAGER" --channel=0 'emulator' 'system-images;android-36;google_apis;x86_64' </dev/null >"$OUT/emulator-probe-install.log" 2>&1; then
    blocked 'Official stable SDK installation failed or required an unaccepted agreement; see emulator-probe-install.log'
  fi
else
  printf 'Same official stable emulator/API36 image already installed; package installation not required.\n' >"$OUT/emulator-probe-install.log"
fi
SELECTED="$(node scripts/android-emulator-probe-space.mjs "$OUT/space-after-install.json")"
[ -n "$SELECTED" ] || blocked 'No existing writable probe volume meets actual6GiB ×1.2 plus512MiB headroom after installation'
TASK_DIR="$(mktemp -d "$SELECTED/warehouse-emulator-probe.XXXXXX")"
AVD_NAME="warehouse-infra-${TASK_DIR##*/}"
export ANDROID_AVD_HOME="$TASK_DIR/avd"
mkdir -p "$ANDROID_AVD_HOME"
for properties in emulator/source.properties system-images/android-36/google_apis/x86_64/source.properties; do
  printf '\n%s\n' "$properties" >>"$OUT/official-package-versions.log"
  cat "$HOME_SDK/$properties" >>"$OUT/official-package-versions.log"
done
printf 'no\n' | timeout 120 "$AVDMANAGER" create avd --name "$AVD_NAME" --package 'system-images;android-36;google_apis;x86_64' >"$OUT/emulator-probe-avd.log" 2>&1 || blocked 'Official task-owned AVD creation failed'
reject_existing_endpoint
launch_attempts=1
ANDROID_I_WANT_MY_TCG=yes "$EMULATOR" -accel off -avd "$AVD_NAME" -port 5554 -no-window -no-snapshot -no-audio -gpu swiftshader -no-boot-anim >"$OUT/emulator-probe-boot.log" 2>&1 &
PID=$!
deadline=$((SECONDS+900))
while [ "$SECONDS" -lt "$deadline" ]; do
  if ! kill -0 "$PID" 2>/dev/null; then
    if wait "$PID"; then emulator_exit=0; else emulator_exit=$?; fi
    blocked "Official TCG emulator exited before boot (exit$emulator_exit); see emulator-probe-boot.log"
  fi
  if owns_endpoint; then
    if [ "$(timeout 10 "$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; then require_owned_endpoint; booted=true; break; fi
  else
    identity_status=$?
    [ "$identity_status" -ne 2 ] || blocked 'Reserved serial identifies an unrelated AVD; boot evidence rejected'
  fi
  sleep 5
done
[ "$booted" = true ] || blocked 'Official TCG cold boot did not complete within900seconds; unsupported software mode remains blocked'
require_owned_endpoint
timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.build.version.sdk >"$OUT/emulator-probe-api.txt" || blocked 'Booted emulator API observation failed'
[ "$(tr -d '\r\n' <"$OUT/emulator-probe-api.txt")" = 36 ] || blocked 'Observed emulator API differs from36'
require_owned_endpoint
timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.build.fingerprint >"$OUT/emulator-probe-build.txt" || blocked 'Booted emulator build observation failed'
require_owned_endpoint
timeout 10 "$ADB" -s "$SERIAL" shell dumpsys webviewupdate >"$OUT/emulator-probe-webview.txt" || blocked 'Booted emulator WebView observation failed'
require_owned_endpoint
status=booted
reason='Official API36 TCG infrastructure cold boot observed; product and acceptance matrix NOT RUN'
echo "$reason"
