#!/usr/bin/env bash
# A screenshot/foreground observation only; never phone, touch or audible-output acceptance.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERIAL="${ANDROID_SERIAL:-}"
[[ "$SERIAL" == emulator-* ]] || { echo 'Product capture requires an explicit disposable emulator' >&2; exit 1; }
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="$SDK/platform-tools/adb"
OUT="$ROOT/build/android-ci"
mkdir -p "$OUT"
status=not-verified
reason='Product cold-launch observation did not complete'
pid=''
finish() {
  node --input-type=module -e 'import{writeFileSync}from"node:fs";writeFileSync(process.argv[1],JSON.stringify({schema:1,status:process.argv[2],reason:process.argv[3],target:"disposable-emulator",activity:"io.github.nightshang.chache.MainActivity",pid:process.argv[4]||null,physicalPhone:"not-verified",touch:"not-verified",audibleOutput:"not-verified",frameTiming:"not-measured",screenshot:"product-cold-launch.png"},null,2)+"\n")' "$OUT/product-smoke-report.json" "$status" "$reason" "$pid"
}
trap finish EXIT
trap 'reason="Product capture reached its bounded timeout"; exit 124' TERM
[ -x "$ADB" ] || { reason='Official adb unavailable for product capture'; exit 1; }
[ "$(timeout 10 "$ADB" -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r')" = 1 ] || { reason='Target did not confirm disposable emulator'; exit 1; }
if [ -n "${ANDROID_PRODUCT_APK:-}" ]; then
  [ -f "$ANDROID_PRODUCT_APK" ] || { reason='Compiled product APK unavailable for independent capture'; exit 1; }
  if ! timeout 5 "$ADB" -s "$SERIAL" shell pm path io.github.nightshang.chache | grep -E '^package:' >/dev/null; then
    timeout 20 "$ADB" -s "$SERIAL" install -r "$ANDROID_PRODUCT_APK" >"$OUT/product-install.txt" 2>&1 || { reason='Compiled product install for independent capture failed'; exit 1; }
  fi
fi
timeout 10 "$ADB" -s "$SERIAL" shell am force-stop io.github.nightshang.chache
timeout 20 "$ADB" -s "$SERIAL" shell am start -W -n io.github.nightshang.chache/.MainActivity >"$OUT/product-launch.txt" 2>&1
deadline=$((SECONDS+20))
while [ "$SECONDS" -lt "$deadline" ]; do
  timeout 5 "$ADB" -s "$SERIAL" shell dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp' >"$OUT/product-window.txt" || true
  if grep -E 'mCurrentFocus.*io[.]github[.]nightshang[.]chache.*MainActivity' "$OUT/product-window.txt" >/dev/null; then break; fi
  sleep 1
done
grep -E 'mCurrentFocus.*io[.]github[.]nightshang[.]chache.*MainActivity' "$OUT/product-window.txt" >/dev/null || { reason='Product MainActivity was not observed focused'; exit 1; }
pid="$(timeout 5 "$ADB" -s "$SERIAL" shell pidof io.github.nightshang.chache | tr -d '\r')"
[[ "$pid" =~ ^[1-9][0-9]*$ ]] || { reason='Product process was not alive after cold launch'; exit 1; }
timeout 10 "$ADB" -s "$SERIAL" exec-out screencap -p >"$OUT/product-cold-launch.png"
node --input-type=module -e 'import{readFileSync}from"node:fs";const b=readFileSync(process.argv[1]);if(b.length<24||b.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw Error("Invalid screenshot PNG")' "$OUT/product-cold-launch.png"
status=observed
reason='Product MainActivity cold launched, remained alive/focused and produced a screenshot; visual, input, phone and audio acceptance remain unverified'
