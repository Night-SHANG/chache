#!/usr/bin/env bash
# Only the isolated signing runner receives the existing signing secrets.
set +x
set -euo pipefail
[[ "$GITHUB_REPOSITORY" = Night-SHANG/chache && "$GITHUB_REF" = refs/heads/dev/android-v114-startup && "$GITHUB_EVENT_NAME" = push ]] || exit 1
[[ -n "${ANDROID_KEYSTORE_BASE64:-}" && -n "${ANDROID_KEYSTORE_PASSWORD:-}" ]] || { echo '::error::Required owner-managed Android signing Secrets are missing.'; exit 1; }
[[ -d "$RUNNER_TEMP" && ! -L "$RUNNER_TEMP" ]] || exit 1
umask 077
private="$(mktemp -d "$RUNNER_TEMP/chache-sign-v114.XXXXXXXX")"
cleanup() { rm -f -- "$private/release.p12" "$private/sign.log" "$private/aligned.apk"; rmdir -- "$private"; }
trap cleanup EXIT
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$private/release.p12" 2>/dev/null || { echo '::error::Configured keystore encoding is invalid.'; exit 1; }
unset ANDROID_KEYSTORE_BASE64
[[ -s "$private/release.p12" ]] || exit 1
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}/build-tools/35.0.0"
out=build/android-ci/signed-release
mkdir -p "$out"
"$sdk/zipalign" -P 16 -f 4 build/android-ci/release-unsigned/app-release-unsigned.apk "$private/aligned.apk"
if ! "$sdk/apksigner" sign --ks "$private/release.p12" --ks-type PKCS12 --ks-key-alias chache-release --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEYSTORE_PASSWORD --v4-signing-enabled false --out "$out/warehouse-last-slot-1.0.19-vc9-release-candidate.apk" "$private/aligned.apk" > "$private/sign.log" 2>&1; then
  echo '::error::Signing failed. Check the owner-managed keystore, alias and password; signing tool output is intentionally withheld.'
  exit 1
fi
unset ANDROID_KEYSTORE_PASSWORD
